package protocols

import (
	"bufio"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	defaultSSEMaxEvents        = 100
	hardSSEMaxEvents           = 10_000
	defaultSSEMaxResponseBytes = int64(8 << 20)
	hardSSEMaxResponseBytes    = int64(64 << 20)
	defaultSSEMaxEventBytes    = int64(1 << 20)
	maxSSERedirects            = 5
)

// SSERequest configures a bounded Server-Sent Events read.
type SSERequest struct {
	URL                string
	Headers            map[string]string
	Timeout            time.Duration
	MaxEvents          int
	MaxResponseBytes   int64
	MaxEventBytes      int64
	InsecureSkipVerify bool
}

// SSEEvent is one dispatched Server-Sent Event. RetryMillis is the most recent
// valid retry value observed in the stream; HasRetry distinguishes zero from an
// absent retry field.
type SSEEvent struct {
	Event       string
	ID          string
	Data        string
	RetryMillis int64
	HasRetry    bool
}

// SSEResult contains the HTTP handshake and all events read before the stream
// closed or MaxEvents was reached.
type SSEResult struct {
	StatusCode int
	Headers    http.Header
	Events     []SSEEvent
	Duration   time.Duration
}

// ReadSSE connects to an HTTP(S) SSE endpoint and reads at most MaxEvents.
func ReadSSE(parent context.Context, input SSERequest) (SSEResult, error) {
	started := time.Now()
	var result SSEResult

	parsedURL, err := validateSSEURL(input.URL)
	if err != nil {
		return result, err
	}
	maxEvents, maxResponseBytes, maxEventBytes, err := normalizeSSELimits(input)
	if err != nil {
		return result, err
	}
	headers, err := validatedHeaders(input.Headers)
	if err != nil {
		return result, err
	}
	if headers.Get("Accept") == "" {
		headers.Set("Accept", "text/event-stream")
	}
	if headers.Get("Cache-Control") == "" {
		headers.Set("Cache-Control", "no-cache")
	}

	ctx, cancel, err := boundedContext(parent, input.Timeout)
	if err != nil {
		return result, err
	}
	defer cancel()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsedURL.String(), nil)
	if err != nil {
		return result, fmt.Errorf("create SSE request: %w", err)
	}
	request.Header = headers

	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		TLSClientConfig: &tls.Config{
			MinVersion:         tls.VersionTLS12,
			InsecureSkipVerify: input.InsecureSkipVerify, //nolint:gosec // Explicit opt-in for local development.
		},
	}
	defer transport.CloseIdleConnections()
	client := &http.Client{
		Transport: transport,
		CheckRedirect: func(request *http.Request, via []*http.Request) error {
			if len(via) >= maxSSERedirects {
				return fmt.Errorf("SSE redirect limit exceeded after %d redirects", maxSSERedirects)
			}
			if !strings.EqualFold(request.URL.Scheme, parsedURL.Scheme) ||
				!strings.EqualFold(request.URL.Host, parsedURL.Host) {
				return errors.New("SSE redirects must keep the same scheme and host")
			}
			return nil
		},
	}
	response, err := client.Do(request)
	if err != nil {
		return result, fmt.Errorf("connect to SSE endpoint: %w", err)
	}
	defer response.Body.Close()

	result.StatusCode = response.StatusCode
	result.Headers = cloneHeader(response.Header)
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		excerpt, _ := io.ReadAll(io.LimitReader(response.Body, 8<<10))
		return result, &HTTPStatusError{
			StatusCode: response.StatusCode,
			Status:     response.Status,
			Body:       strings.TrimSpace(string(excerpt)),
		}
	}

	events, err := parseSSE(ctx, response.Body, maxEvents, maxResponseBytes, maxEventBytes)
	result.Events = events
	result.Duration = time.Since(started)
	if err != nil {
		return result, err
	}
	return result, nil
}

func validateSSEURL(raw string) (*url.URL, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil, errors.New("SSE URL is required")
	}
	parsed, err := url.ParseRequestURI(value)
	if err != nil {
		return nil, fmt.Errorf("invalid SSE URL: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, errors.New("SSE URL must use http or https")
	}
	if parsed.Host == "" {
		return nil, errors.New("SSE URL must include a host")
	}
	if parsed.User != nil {
		return nil, errors.New("SSE URL cannot contain user information")
	}
	return parsed, nil
}

func normalizeSSELimits(input SSERequest) (int, int64, int64, error) {
	maxEvents := input.MaxEvents
	if maxEvents == 0 {
		maxEvents = defaultSSEMaxEvents
	}
	if maxEvents < 0 || maxEvents > hardSSEMaxEvents {
		return 0, 0, 0, fmt.Errorf("max events must be between 1 and %d", hardSSEMaxEvents)
	}

	maxResponseBytes := input.MaxResponseBytes
	if maxResponseBytes == 0 {
		maxResponseBytes = defaultSSEMaxResponseBytes
	}
	if maxResponseBytes < 1 || maxResponseBytes > hardSSEMaxResponseBytes {
		return 0, 0, 0, fmt.Errorf("max response bytes must be between 1 and %d", hardSSEMaxResponseBytes)
	}

	maxEventBytes := input.MaxEventBytes
	if maxEventBytes == 0 {
		maxEventBytes = defaultSSEMaxEventBytes
	}
	if maxEventBytes < 1 || maxEventBytes > maxResponseBytes {
		return 0, 0, 0, errors.New("max event bytes must be positive and no larger than max response bytes")
	}
	return maxEvents, maxResponseBytes, maxEventBytes, nil
}

func parseSSE(
	ctx context.Context,
	body io.Reader,
	maxEvents int,
	maxResponseBytes int64,
	maxEventBytes int64,
) ([]SSEEvent, error) {
	reader := bufio.NewReader(io.LimitReader(body, maxResponseBytes+1))
	events := make([]SSEEvent, 0, min(maxEvents, 16))
	var (
		totalBytes  int64
		eventBytes  int64
		data        []string
		eventName   string
		currentID   string
		retryMillis int64
		hasRetry    bool
		firstLine   = true
	)

	dispatch := func() {
		if len(data) == 0 {
			eventName = ""
			eventBytes = 0
			return
		}
		name := eventName
		if name == "" {
			name = "message"
		}
		events = append(events, SSEEvent{
			Event:       name,
			ID:          currentID,
			Data:        strings.Join(data, "\n"),
			RetryMillis: retryMillis,
			HasRetry:    hasRetry,
		})
		data = nil
		eventName = ""
		eventBytes = 0
	}

	for len(events) < maxEvents {
		if err := ctx.Err(); err != nil {
			return events, err
		}
		line, readErr := reader.ReadString('\n')
		totalBytes += int64(len(line))
		if totalBytes > maxResponseBytes {
			return events, fmt.Errorf("%w: SSE response exceeds %d bytes", ErrLimitExceeded, maxResponseBytes)
		}
		eventBytes += int64(len(line))
		if eventBytes > maxEventBytes {
			return events, fmt.Errorf("%w: SSE event exceeds %d bytes", ErrLimitExceeded, maxEventBytes)
		}

		line = strings.TrimSuffix(line, "\n")
		line = strings.TrimSuffix(line, "\r")
		if firstLine {
			line = strings.TrimPrefix(line, "\uFEFF")
			firstLine = false
		}

		if line == "" {
			dispatch()
		} else if line[0] != ':' {
			field, value, found := strings.Cut(line, ":")
			if !found {
				value = ""
			} else {
				value = strings.TrimPrefix(value, " ")
			}
			switch field {
			case "event":
				eventName = value
			case "data":
				data = append(data, value)
			case "id":
				if !strings.ContainsRune(value, '\x00') {
					currentID = value
				}
			case "retry":
				if value != "" && allASCIIDigits(value) {
					if retry, err := strconv.ParseInt(value, 10, 64); err == nil {
						retryMillis = retry
						hasRetry = true
					}
				}
			}
		}

		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				dispatch()
				return events, nil
			}
			return events, fmt.Errorf("read SSE stream: %w", readErr)
		}
	}
	return events, nil
}

func allASCIIDigits(value string) bool {
	for _, char := range value {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}
