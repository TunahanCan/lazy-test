package protocols

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"sort"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	reflectv1 "google.golang.org/grpc/reflection/grpc_reflection_v1"
	reflectv1alpha "google.golang.org/grpc/reflection/grpc_reflection_v1alpha"
	"google.golang.org/grpc/status"
)

const (
	defaultGRPCMaxServices     = 1_000
	hardGRPCMaxServices        = 10_000
	defaultGRPCMaxMessageBytes = 4 << 20
	hardGRPCMaxMessageBytes    = 64 << 20
)

// GRPCReflectionRequest configures a real connection to a gRPC server and a
// server-reflection list-services request.
type GRPCReflectionRequest struct {
	Address            string
	Metadata           map[string]string
	Timeout            time.Duration
	UseTLS             bool
	ServerName         string
	InsecureSkipVerify bool
	MaxServices        int
	MaxMessageBytes    int
}

// GRPCReflectionResult contains the reflected service names. ReflectionVersion
// is "v1" or "v1alpha", depending on the protocol exposed by the server.
type GRPCReflectionResult struct {
	Services          []string
	ReflectionVersion string
	ConnectionState   string
	Duration          time.Duration
}

// ListGRPCServices connects to a gRPC server and requests its real service list
// through the standard server reflection protocol.
func ListGRPCServices(
	parent context.Context,
	input GRPCReflectionRequest,
) (GRPCReflectionResult, error) {
	started := time.Now()
	var result GRPCReflectionResult

	address, err := validateGRPCAddress(input.Address)
	if err != nil {
		return result, err
	}
	maxServices, maxMessageBytes, err := normalizeGRPCLimits(input)
	if err != nil {
		return result, err
	}
	outgoingMetadata, err := validatedGRPCMetadata(input.Metadata)
	if err != nil {
		return result, err
	}

	ctx, cancel, err := boundedContext(parent, input.Timeout)
	if err != nil {
		return result, err
	}
	defer cancel()
	if len(outgoingMetadata) > 0 {
		ctx = metadata.NewOutgoingContext(ctx, outgoingMetadata)
	}

	var transportCredentials credentials.TransportCredentials
	if input.UseTLS {
		transportCredentials = credentials.NewTLS(&tls.Config{
			MinVersion:         tls.VersionTLS12,
			ServerName:         strings.TrimSpace(input.ServerName),
			InsecureSkipVerify: input.InsecureSkipVerify, //nolint:gosec // Explicit opt-in for local development.
		})
	} else {
		transportCredentials = insecure.NewCredentials()
	}

	connection, err := grpc.DialContext( //nolint:staticcheck // Blocking dial is required before reflection.
		ctx,
		address,
		grpc.WithBlock(),
		grpc.WithTransportCredentials(transportCredentials),
		grpc.WithDefaultCallOptions(
			grpc.MaxCallRecvMsgSize(maxMessageBytes),
			grpc.MaxCallSendMsgSize(maxMessageBytes),
		),
	)
	if err != nil {
		return result, fmt.Errorf("connect gRPC server: %w", err)
	}
	defer connection.Close()

	result.ConnectionState = connection.GetState().String()
	services, err := listGRPCServicesV1(ctx, connection)
	if err == nil {
		result.ReflectionVersion = "v1"
	} else if status.Code(err) == codes.Unimplemented {
		services, err = listGRPCServicesV1Alpha(ctx, connection)
		if err == nil {
			result.ReflectionVersion = "v1alpha"
		}
	}
	if err != nil {
		return result, fmt.Errorf("list gRPC services through reflection: %w", err)
	}
	if len(services) > maxServices {
		return result, fmt.Errorf(
			"%w: gRPC server exposes %d services, configured maximum is %d",
			ErrLimitExceeded,
			len(services),
			maxServices,
		)
	}
	sort.Strings(services)
	result.Services = services
	result.Duration = time.Since(started)
	return result, nil
}

func validateGRPCAddress(raw string) (string, error) {
	address := strings.TrimSpace(raw)
	if address == "" {
		return "", errors.New("gRPC address is required")
	}
	if strings.Contains(address, "://") {
		return "", errors.New("gRPC address must use host:port format")
	}
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return "", fmt.Errorf("gRPC address must use host:port format: %w", err)
	}
	if strings.TrimSpace(host) == "" {
		return "", errors.New("gRPC address must include a host")
	}
	if strings.TrimSpace(port) == "" {
		return "", errors.New("gRPC address must include a port")
	}
	return address, nil
}

func normalizeGRPCLimits(input GRPCReflectionRequest) (int, int, error) {
	maxServices := input.MaxServices
	if maxServices == 0 {
		maxServices = defaultGRPCMaxServices
	}
	if maxServices < 1 || maxServices > hardGRPCMaxServices {
		return 0, 0, fmt.Errorf("max services must be between 1 and %d", hardGRPCMaxServices)
	}
	maxMessageBytes := input.MaxMessageBytes
	if maxMessageBytes == 0 {
		maxMessageBytes = defaultGRPCMaxMessageBytes
	}
	if maxMessageBytes < 1 || maxMessageBytes > hardGRPCMaxMessageBytes {
		return 0, 0, fmt.Errorf("max message bytes must be between 1 and %d", hardGRPCMaxMessageBytes)
	}
	return maxServices, maxMessageBytes, nil
}

func validatedGRPCMetadata(input map[string]string) (metadata.MD, error) {
	result := make(metadata.MD, len(input))
	for rawKey, value := range input {
		key := strings.ToLower(strings.TrimSpace(rawKey))
		if key == "" {
			return nil, errors.New("gRPC metadata key cannot be empty")
		}
		if strings.HasSuffix(key, "-bin") {
			return nil, fmt.Errorf("binary gRPC metadata %q is not supported by the text metadata input", rawKey)
		}
		for _, char := range key {
			if !(char >= 'a' && char <= 'z' ||
				char >= '0' && char <= '9' ||
				char == '-' || char == '_' || char == '.') {
				return nil, fmt.Errorf("invalid gRPC metadata key %q", rawKey)
			}
		}
		for _, char := range value {
			if char < 0x20 || char > 0x7e {
				return nil, fmt.Errorf("gRPC metadata %q contains a non-printable value", rawKey)
			}
		}
		result.Set(key, value)
	}
	return result, nil
}

func listGRPCServicesV1(ctx context.Context, connection *grpc.ClientConn) ([]string, error) {
	stream, err := reflectv1.NewServerReflectionClient(connection).ServerReflectionInfo(ctx)
	if err != nil {
		return nil, err
	}
	defer stream.CloseSend()
	if err := stream.Send(&reflectv1.ServerReflectionRequest{
		MessageRequest: &reflectv1.ServerReflectionRequest_ListServices{ListServices: ""},
	}); err != nil {
		return nil, err
	}
	response, err := stream.Recv()
	if err != nil {
		return nil, err
	}
	if reflectionError := response.GetErrorResponse(); reflectionError != nil {
		return nil, status.Error(codes.Code(reflectionError.ErrorCode), reflectionError.ErrorMessage)
	}
	list := response.GetListServicesResponse()
	if list == nil {
		return nil, errors.New("gRPC reflection returned no service list")
	}
	services := make([]string, 0, len(list.Service))
	for _, service := range list.Service {
		services = append(services, service.Name)
	}
	return services, nil
}

func listGRPCServicesV1Alpha(ctx context.Context, connection *grpc.ClientConn) ([]string, error) {
	stream, err := reflectv1alpha.NewServerReflectionClient(connection).ServerReflectionInfo(ctx)
	if err != nil {
		return nil, err
	}
	defer stream.CloseSend()
	if err := stream.Send(&reflectv1alpha.ServerReflectionRequest{
		MessageRequest: &reflectv1alpha.ServerReflectionRequest_ListServices{ListServices: ""},
	}); err != nil {
		return nil, err
	}
	response, err := stream.Recv()
	if err != nil {
		return nil, err
	}
	if reflectionError := response.GetErrorResponse(); reflectionError != nil {
		return nil, status.Error(codes.Code(reflectionError.ErrorCode), reflectionError.ErrorMessage)
	}
	list := response.GetListServicesResponse()
	if list == nil {
		return nil, errors.New("gRPC reflection returned no service list")
	}
	services := make([]string, 0, len(list.Service))
	for _, service := range list.Service {
		services = append(services, service.Name)
	}
	return services, nil
}
