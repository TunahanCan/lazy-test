package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"validex/internal/canbridge"
)

const (
	maxProtocolFrameBytes = 64 << 20
	responseQueueSize     = 256
	sidecarShutdownPeriod = 10 * time.Second
	writerShutdownPeriod  = time.Second
)

type protocolRequest struct {
	ID     string `json:"id"`
	Method string `json:"method"`
	Args   string `json:"args"`
}

type protocolResponse struct {
	ID     string `json:"id"`
	Result *any   `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

type frameRead struct {
	payload []byte
	err     error
}

func serve(
	ctx context.Context,
	input io.Reader,
	output io.Writer,
	bridge *canbridge.Bridge,
) error {
	if ctx == nil {
		ctx = context.Background()
	}
	serverContext, cancelServer := context.WithCancel(ctx)
	defer cancelServer()

	responses := make(chan protocolResponse, responseQueueSize)
	writerDone := make(chan error, 1)
	go func() {
		writerDone <- writeResponses(serverContext, output, responses)
		cancelServer()
	}()

	runtime, err := canbridge.NewInvocationRuntime(
		serverContext,
		bridge,
		func(response canbridge.InvocationResponse) {
			enqueueResponse(
				serverContext,
				responses,
				invocationProtocolResponse(response),
			)
		},
	)
	if err != nil {
		cancelServer()
		<-writerDone
		return err
	}

	frames := make(chan frameRead)
	go readFrames(serverContext, input, frames)

	var serveErr error
	writerCompleted := false
running:
	for {
		select {
		case <-ctx.Done():
			break running
		case writerErr := <-writerDone:
			writerCompleted = true
			if writerErr != nil {
				serveErr = fmt.Errorf("write sidecar response: %w", writerErr)
			}
			break running
		case frame := <-frames:
			if frame.err != nil {
				if !errors.Is(frame.err, io.EOF) {
					serveErr = fmt.Errorf("read sidecar request: %w", frame.err)
				}
				break running
			}
			request, decodeErr := decodeProtocolRequest(frame.payload)
			if decodeErr != nil {
				if validProtocolID(request.ID) {
					enqueueResponse(serverContext, responses, errorResponse(
						request.ID,
						decodeErr,
					))
					continue
				}
				serveErr = fmt.Errorf("decode sidecar request: %w", decodeErr)
				break running
			}
			dispatchErr := runtime.Dispatch(canbridge.Invocation{
				ID:        request.ID,
				Method:    request.Method,
				Arguments: request.Args,
			})
			if dispatchErr != nil {
				enqueueResponse(
					serverContext,
					responses,
					errorResponse(request.ID, dispatchErr),
				)
			}
		}
	}

	shutdownContext, cancelShutdown := context.WithTimeout(
		context.Background(),
		sidecarShutdownPeriod,
	)
	closeErr := runtime.Close(shutdownContext)
	cancelShutdown()

	cancelServer()
	if !writerCompleted {
		select {
		case writerErr := <-writerDone:
			if writerErr != nil && serveErr == nil {
				serveErr = fmt.Errorf("write sidecar response: %w", writerErr)
			}
		case <-time.After(writerShutdownPeriod):
			if serveErr == nil {
				serveErr = errors.New("sidecar response writer did not stop")
			}
		}
	}
	if closeErr != nil && serveErr == nil {
		serveErr = fmt.Errorf("close canbridge runtime: %w", closeErr)
	}
	return serveErr
}

func readFrames(
	ctx context.Context,
	input io.Reader,
	frames chan<- frameRead,
) {
	for {
		payload, err := readFrame(input, maxProtocolFrameBytes)
		select {
		case frames <- frameRead{payload: payload, err: err}:
		case <-ctx.Done():
			return
		}
		if err != nil {
			return
		}
	}
}

func writeResponses(
	ctx context.Context,
	output io.Writer,
	responses <-chan protocolResponse,
) error {
	for {
		select {
		case response := <-responses:
			if err := writeProtocolResponse(output, response); err != nil {
				return err
			}
		case <-ctx.Done():
			// InvocationRuntime has already stopped accepting delivery on the
			// normal EOF path. Flush everything it queued before cancellation.
			for {
				select {
				case response := <-responses:
					if err := writeProtocolResponse(output, response); err != nil {
						return err
					}
				default:
					return nil
				}
			}
		}
	}
}

func enqueueResponse(
	ctx context.Context,
	responses chan<- protocolResponse,
	response protocolResponse,
) {
	select {
	case responses <- response:
	case <-ctx.Done():
	}
}

func invocationProtocolResponse(
	response canbridge.InvocationResponse,
) protocolResponse {
	if response.Error != "" {
		return protocolResponse{ID: response.ID, Error: response.Error}
	}
	result := response.Result
	return protocolResponse{ID: response.ID, Result: &result}
}

func errorResponse(id string, err error) protocolResponse {
	return protocolResponse{ID: id, Error: err.Error()}
}

func decodeProtocolRequest(payload []byte) (protocolRequest, error) {
	var request protocolRequest
	// Recover a valid ID even when strict decoding later rejects another field,
	// allowing the caller to return one correlated error response.
	var identity struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(payload, &identity)
	request.ID = identity.ID

	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return request, fmt.Errorf("decode request JSON: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return request, errors.New("request must contain one JSON object")
		}
		return request, fmt.Errorf("decode trailing request JSON: %w", err)
	}
	if !validProtocolID(request.ID) {
		return request, errors.New("request id must contain 1 to 256 bytes")
	}
	if request.Method == "" || len(request.Method) > 128 {
		return request, errors.New("request method must contain 1 to 128 bytes")
	}
	if len(request.Args) > 32<<20 {
		return request, fmt.Errorf(
			"request args exceed %d bytes",
			32<<20,
		)
	}
	trimmedArguments := strings.TrimSpace(request.Args)
	if trimmedArguments == "" ||
		trimmedArguments[0] != '[' ||
		!json.Valid([]byte(trimmedArguments)) {
		return request, errors.New("request args must be a valid JSON array string")
	}
	return request, nil
}

func validProtocolID(id string) bool {
	return id != "" && len(id) <= 256
}

func readFrame(input io.Reader, maximumBytes uint32) ([]byte, error) {
	var header [4]byte
	if _, err := io.ReadFull(input, header[:]); err != nil {
		return nil, err
	}
	frameBytes := binary.BigEndian.Uint32(header[:])
	if frameBytes == 0 {
		return nil, errors.New("empty protocol frame")
	}
	if frameBytes > maximumBytes {
		return nil, fmt.Errorf(
			"protocol frame exceeds %d bytes",
			maximumBytes,
		)
	}
	payload := make([]byte, int(frameBytes))
	if _, err := io.ReadFull(input, payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func writeProtocolResponse(
	output io.Writer,
	response protocolResponse,
) error {
	payload, err := json.Marshal(response)
	if err != nil {
		payload, _ = json.Marshal(errorResponse(
			response.ID,
			errors.New("encode canbridge response"),
		))
	}
	if len(payload) > maxProtocolFrameBytes {
		payload, _ = json.Marshal(errorResponse(
			response.ID,
			fmt.Errorf(
				"canbridge response exceeds %d byte transport limit",
				maxProtocolFrameBytes,
			),
		))
	}
	return writeFrame(output, payload, maxProtocolFrameBytes)
}

func writeFrame(
	output io.Writer,
	payload []byte,
	maximumBytes uint32,
) error {
	if len(payload) == 0 {
		return errors.New("cannot write an empty protocol frame")
	}
	if uint64(len(payload)) > uint64(maximumBytes) {
		return fmt.Errorf(
			"protocol frame exceeds %d bytes",
			maximumBytes,
		)
	}
	var header [4]byte
	binary.BigEndian.PutUint32(header[:], uint32(len(payload)))
	if err := writeAll(output, header[:]); err != nil {
		return err
	}
	return writeAll(output, payload)
}

func writeAll(output io.Writer, payload []byte) error {
	for len(payload) > 0 {
		written, err := output.Write(payload)
		if err != nil {
			return err
		}
		if written <= 0 {
			return io.ErrShortWrite
		}
		payload = payload[written:]
	}
	return nil
}
