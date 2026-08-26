package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"validex/internal/canbridge"
)

func TestFrameRoundTripUsesBigEndianLengthPrefix(t *testing.T) {
	var output bytes.Buffer
	if err := writeFrame(&output, []byte("test"), 16); err != nil {
		t.Fatalf("writeFrame() error = %v", err)
	}
	if got := output.Bytes()[:4]; !bytes.Equal(got, []byte{0, 0, 0, 4}) {
		t.Fatalf("frame header = %v", got)
	}
	payload, err := readFrame(&output, 16)
	if err != nil {
		t.Fatalf("readFrame() error = %v", err)
	}
	if string(payload) != "test" {
		t.Fatalf("payload = %q", payload)
	}
}

func TestFrameCodecRejectsInvalidLengthsAndTruncation(t *testing.T) {
	for _, test := range []struct {
		name      string
		input     []byte
		maximum   uint32
		wantError string
	}{
		{
			name:      "empty",
			input:     []byte{0, 0, 0, 0},
			maximum:   4,
			wantError: "empty protocol frame",
		},
		{
			name:      "oversized",
			input:     []byte{0, 0, 0, 5},
			maximum:   4,
			wantError: "exceeds 4 bytes",
		},
		{
			name:      "truncated header",
			input:     []byte{0, 0},
			maximum:   4,
			wantError: "unexpected EOF",
		},
		{
			name:      "truncated payload",
			input:     []byte{0, 0, 0, 2, 1},
			maximum:   4,
			wantError: "unexpected EOF",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, err := readFrame(bytes.NewReader(test.input), test.maximum)
			if err == nil || !strings.Contains(err.Error(), test.wantError) {
				t.Fatalf("readFrame() error = %v", err)
			}
		})
	}
}

func TestWriteFrameCompletesShortWrites(t *testing.T) {
	writer := &shortWriter{maximum: 2}
	if err := writeFrame(writer, []byte("payload"), 32); err != nil {
		t.Fatalf("writeFrame() error = %v", err)
	}
	frame := writer.Bytes()
	if binary.BigEndian.Uint32(frame[:4]) != 7 ||
		string(frame[4:]) != "payload" {
		t.Fatalf("frame = %v", frame)
	}
}

func TestDecodeProtocolRequestValidatesEnvelope(t *testing.T) {
	request, err := decodeProtocolRequest([]byte(
		`{"id":"request-1","method":"Bootstrap","args":"[]"}`,
	))
	if err != nil {
		t.Fatalf("decodeProtocolRequest() error = %v", err)
	}
	if request.ID != "request-1" ||
		request.Method != "Bootstrap" ||
		request.Args != "[]" {
		t.Fatalf("request = %#v", request)
	}

	for _, test := range []struct {
		name      string
		payload   string
		wantID    string
		wantError string
	}{
		{
			name:      "missing ID",
			payload:   `{"method":"Bootstrap","args":"[]"}`,
			wantError: "request id",
		},
		{
			name:      "unknown field",
			payload:   `{"id":"known","method":"Bootstrap","args":"[]","extra":true}`,
			wantID:    "known",
			wantError: "unknown field",
		},
		{
			name:      "invalid arguments",
			payload:   `{"id":"known","method":"Bootstrap","args":"{}"}`,
			wantID:    "known",
			wantError: "JSON array string",
		},
		{
			name:      "trailing JSON",
			payload:   `{"id":"known","method":"Bootstrap","args":"[]"} {}`,
			wantID:    "known",
			wantError: "one JSON object",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			request, err := decodeProtocolRequest([]byte(test.payload))
			if err == nil || !strings.Contains(err.Error(), test.wantError) {
				t.Fatalf("decodeProtocolRequest() error = %v", err)
			}
			if request.ID != test.wantID {
				t.Fatalf("recovered ID = %q, want %q", request.ID, test.wantID)
			}
		})
	}
}

func TestWriteProtocolResponseReplacesJSONEncodingFailure(t *testing.T) {
	unencodable := any(make(chan struct{}))
	var output bytes.Buffer
	if err := writeProtocolResponse(&output, protocolResponse{
		ID:     "bad-result",
		Result: &unencodable,
	}); err != nil {
		t.Fatalf("writeProtocolResponse() error = %v", err)
	}
	payload, err := readFrame(&output, maxProtocolFrameBytes)
	if err != nil {
		t.Fatalf("readFrame() error = %v", err)
	}
	var response protocolResponse
	if err := json.Unmarshal(payload, &response); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if response.ID != "bad-result" ||
		response.Error != "encode canbridge response" {
		t.Fatalf("response = %#v", response)
	}
}

func TestWriteProtocolResponsePreservesLargeCollectionDocument(t *testing.T) {
	const bodyBytes = 12 << 20
	document := `{"version":1,"state":{"collections":[],"requests":[{"body":"` +
		strings.Repeat("<", bodyBytes) + `"}]}}`
	result := any(canbridge.CollectionLibraryLoadResult{
		Data:  document,
		Found: true,
	})

	var output bytes.Buffer
	if err := writeProtocolResponse(&output, protocolResponse{
		ID:     "collection-load",
		Result: &result,
	}); err != nil {
		t.Fatalf("writeProtocolResponse() error = %v", err)
	}
	payload, err := readFrame(&output, maxProtocolFrameBytes)
	if err != nil {
		t.Fatalf("readFrame() error = %v", err)
	}
	if bytes.Contains(payload, []byte(`\u003c`)) {
		t.Fatal("protocol response HTML-escaped collection content")
	}

	var response struct {
		Error  string                                `json:"error"`
		Result canbridge.CollectionLibraryLoadResult `json:"result"`
	}
	if err := json.Unmarshal(payload, &response); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if response.Error != "" ||
		!response.Result.Found ||
		response.Result.Data != document {
		t.Fatalf(
			"response error = %q, document bytes = %d",
			response.Error,
			len(response.Result.Data),
		)
	}
}

func TestInvocationProtocolResponseCompactsDuplicateRequestBody(t *testing.T) {
	body := strings.Repeat("response-body-", 32_768)
	original := canbridge.SendResult{Response: &canbridge.ResponseEnvelope{
		RequestID: "request-1",
		Body:      body,
		RawBody:   body,
	}}
	response := invocationProtocolResponse(canbridge.InvocationResponse{
		ID:     "send-request",
		Result: original,
	})
	payload, err := encodeProtocolResponse(response)
	if err != nil {
		t.Fatalf("encodeProtocolResponse() error = %v", err)
	}
	if bytes.Contains(payload, []byte(`"rawBody"`)) {
		t.Fatal("duplicate raw response body remained in the protocol frame")
	}
	if original.Response == nil || original.Response.RawBody != body {
		t.Fatal("protocol compaction mutated the bridge result")
	}

	formatted := canbridge.SendResult{Response: &canbridge.ResponseEnvelope{
		RequestID: "request-2",
		Body:      "{\n  \"ok\": true\n}",
		RawBody:   `{"ok":true}`,
	}}
	formattedResponse := invocationProtocolResponse(canbridge.InvocationResponse{
		ID:     "formatted-request",
		Result: formatted,
	})
	formattedPayload, err := encodeProtocolResponse(formattedResponse)
	if err != nil {
		t.Fatalf("encode formatted protocol response: %v", err)
	}
	if !bytes.Contains(formattedPayload, []byte(`"rawBody":"{\"ok\":true}"`)) {
		t.Fatalf("formatted response lost its distinct raw body: %s", formattedPayload)
	}
}

func TestServeDispatchesBridgeCallsAndShutsDownOnEOF(t *testing.T) {
	inputReader, inputWriter := io.Pipe()
	outputReader, outputWriter := io.Pipe()
	serveDone := make(chan error, 1)
	go func() {
		serveDone <- serve(
			context.Background(),
			inputReader,
			outputWriter,
			canbridge.NewBridge(),
		)
		_ = outputWriter.Close()
	}()

	requestPayload := []byte(
		`{"id":"bootstrap","method":"Bootstrap","args":"[]"}`,
	)
	if err := writeFrame(inputWriter, requestPayload, maxProtocolFrameBytes); err != nil {
		t.Fatalf("writeFrame() error = %v", err)
	}
	responsePayload, err := readFrame(outputReader, maxProtocolFrameBytes)
	if err != nil {
		t.Fatalf("readFrame() error = %v", err)
	}
	var response struct {
		ID     string          `json:"id"`
		Result json.RawMessage `json:"result"`
		Error  string          `json:"error"`
	}
	if err := json.Unmarshal(responsePayload, &response); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if response.ID != "bootstrap" ||
		response.Error != "" ||
		!bytes.Contains(response.Result, []byte(`"validex-workspace"`)) {
		t.Fatalf("response = %s", responsePayload)
	}

	if err := inputWriter.Close(); err != nil {
		t.Fatalf("input Close() error = %v", err)
	}
	select {
	case err := <-serveDone:
		if err != nil {
			t.Fatalf("serve() error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("serve did not shut down after stdin EOF")
	}
}

func TestServeReturnsCorrelatedValidationErrorAndContinues(t *testing.T) {
	inputReader, inputWriter := io.Pipe()
	outputReader, outputWriter := io.Pipe()
	serveDone := make(chan error, 1)
	go func() {
		serveDone <- serve(
			context.Background(),
			inputReader,
			outputWriter,
			canbridge.NewBridge(),
		)
		_ = outputWriter.Close()
	}()

	for _, requestPayload := range []string{
		`{"id":"invalid","method":"Bootstrap","args":"{}"}`,
		`{"id":"valid","method":"Bootstrap","args":"[]"}`,
	} {
		if err := writeFrame(
			inputWriter,
			[]byte(requestPayload),
			maxProtocolFrameBytes,
		); err != nil {
			t.Fatalf("writeFrame() error = %v", err)
		}
	}

	responses := map[string]protocolResponse{}
	for len(responses) < 2 {
		payload, err := readFrame(outputReader, maxProtocolFrameBytes)
		if err != nil {
			t.Fatalf("readFrame() error = %v", err)
		}
		var response protocolResponse
		if err := json.Unmarshal(payload, &response); err != nil {
			t.Fatalf("json.Unmarshal() error = %v", err)
		}
		responses[response.ID] = response
	}
	if !strings.Contains(responses["invalid"].Error, "JSON array string") {
		t.Fatalf("invalid response = %#v", responses["invalid"])
	}
	if responses["valid"].Error != "" || responses["valid"].Result == nil {
		t.Fatalf("valid response = %#v", responses["valid"])
	}

	_ = inputWriter.Close()
	select {
	case err := <-serveDone:
		if err != nil {
			t.Fatalf("serve() error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("serve did not shut down")
	}
}

func TestServeBoundsAStalledResponseWriterDuringShutdown(t *testing.T) {
	inputReader, inputWriter := io.Pipe()
	output := &blockingWriter{
		started: make(chan struct{}),
		release: make(chan struct{}),
	}
	defer close(output.release)

	serveDone := make(chan error, 1)
	go func() {
		serveDone <- serve(
			context.Background(),
			inputReader,
			output,
			canbridge.NewBridge(),
		)
	}()

	requestPayload := []byte(
		`{"id":"bootstrap","method":"Bootstrap","args":"[]"}`,
	)
	if err := writeFrame(inputWriter, requestPayload, maxProtocolFrameBytes); err != nil {
		t.Fatalf("writeFrame() error = %v", err)
	}
	select {
	case <-output.started:
	case <-time.After(time.Second):
		t.Fatal("response writer did not start")
	}
	if err := inputWriter.Close(); err != nil {
		t.Fatalf("input Close() error = %v", err)
	}

	select {
	case err := <-serveDone:
		if err == nil || !strings.Contains(err.Error(), "writer did not stop") {
			t.Fatalf("serve() error = %v", err)
		}
	case <-time.After(writerShutdownPeriod + time.Second):
		t.Fatal("serve did not bound the stalled response writer")
	}
}

type shortWriter struct {
	bytes.Buffer
	maximum int
}

func (writer *shortWriter) Write(payload []byte) (int, error) {
	if len(payload) > writer.maximum {
		payload = payload[:writer.maximum]
	}
	return writer.Buffer.Write(payload)
}

type blockingWriter struct {
	once    sync.Once
	started chan struct{}
	release chan struct{}
}

func (writer *blockingWriter) Write(payload []byte) (int, error) {
	writer.once.Do(func() {
		close(writer.started)
	})
	<-writer.release
	return len(payload), nil
}
