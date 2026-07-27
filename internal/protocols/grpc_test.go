package protocols

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"errors"
	"math/big"
	"net"
	"slices"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
)

func TestListGRPCServicesOverPlaintext(t *testing.T) {
	t.Parallel()

	address := startGRPCTestServer(t, nil, true)
	result, err := ListGRPCServices(context.Background(), GRPCReflectionRequest{
		Address: address,
		Timeout: 2 * time.Second,
	})
	if err != nil {
		t.Fatalf("ListGRPCServices returned an error: %v", err)
	}
	assertReflectedHealthService(t, result)
}

func TestListGRPCServicesOverTLS(t *testing.T) {
	t.Parallel()

	certificate := selfSignedCertificate(t)
	serverCredentials := credentials.NewTLS(&tls.Config{
		Certificates: []tls.Certificate{certificate},
		MinVersion:   tls.VersionTLS12,
	})
	address := startGRPCTestServer(t, serverCredentials, true)
	result, err := ListGRPCServices(context.Background(), GRPCReflectionRequest{
		Address:            address,
		Timeout:            2 * time.Second,
		UseTLS:             true,
		InsecureSkipVerify: true,
	})
	if err != nil {
		t.Fatalf("ListGRPCServices returned an error: %v", err)
	}
	assertReflectedHealthService(t, result)
}

func TestListGRPCServicesRequiresReflection(t *testing.T) {
	t.Parallel()

	address := startGRPCTestServer(t, nil, false)
	_, err := ListGRPCServices(context.Background(), GRPCReflectionRequest{
		Address: address,
		Timeout: 2 * time.Second,
	})
	if err == nil {
		t.Fatal("ListGRPCServices returned nil error")
	}
}

func TestListGRPCServicesAppliesServiceLimit(t *testing.T) {
	t.Parallel()

	address := startGRPCTestServer(t, nil, true)
	_, err := ListGRPCServices(context.Background(), GRPCReflectionRequest{
		Address:     address,
		Timeout:     2 * time.Second,
		MaxServices: 1,
	})
	if !errors.Is(err, ErrLimitExceeded) {
		t.Fatalf("error = %v, want ErrLimitExceeded", err)
	}
}

func TestListGRPCServicesValidatesInput(t *testing.T) {
	t.Parallel()

	for name, input := range map[string]GRPCReflectionRequest{
		"missing address": {},
		"missing port":    {Address: "localhost"},
		"URL address":     {Address: "grpc://localhost:9090"},
		"binary metadata": {
			Address:  "localhost:9090",
			Metadata: map[string]string{"trace-bin": "value"},
		},
		"metadata line break": {
			Address:  "localhost:9090",
			Metadata: map[string]string{"trace-id": "one\ntwo"},
		},
		"invalid max services": {
			Address:     "localhost:9090",
			MaxServices: -1,
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, err := ListGRPCServices(context.Background(), input); err == nil {
				t.Fatal("ListGRPCServices returned nil error")
			}
		})
	}
}

func assertReflectedHealthService(t *testing.T, result GRPCReflectionResult) {
	t.Helper()
	if !slices.Contains(result.Services, "grpc.health.v1.Health") {
		t.Fatalf("services = %v, want grpc.health.v1.Health", result.Services)
	}
	if result.ReflectionVersion != "v1" && result.ReflectionVersion != "v1alpha" {
		t.Fatalf("reflection version = %q", result.ReflectionVersion)
	}
	if result.ConnectionState != "READY" {
		t.Fatalf("connection state = %q, want READY", result.ConnectionState)
	}
}

func startGRPCTestServer(
	t *testing.T,
	transportCredentials credentials.TransportCredentials,
	enableReflection bool,
) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	options := make([]grpc.ServerOption, 0, 1)
	if transportCredentials != nil {
		options = append(options, grpc.Creds(transportCredentials))
	}
	server := grpc.NewServer(options...)
	healthpb.RegisterHealthServer(server, health.NewServer())
	if enableReflection {
		reflection.Register(server)
	}
	go func() {
		_ = server.Serve(listener)
	}()
	t.Cleanup(func() {
		server.Stop()
		_ = listener.Close()
	})
	return listener.Addr().String()
}

func selfSignedCertificate(t *testing.T) tls.Certificate {
	t.Helper()
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		t.Fatalf("generate serial: %v", err)
	}
	template := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: "127.0.0.1"},
		NotBefore:    time.Now().Add(-time.Minute),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1")},
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, publicKey, privateKey)
	if err != nil {
		t.Fatalf("create certificate: %v", err)
	}
	return tls.Certificate{
		Certificate: [][]byte{der},
		PrivateKey:  privateKey,
		Leaf:        template,
	}
}
