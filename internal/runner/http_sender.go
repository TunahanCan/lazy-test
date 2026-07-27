package runner

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

var (
	// ErrRequestBodyTooLarge and ErrResponseBodyTooLarge let Runner classify
	// transport limit failures without parsing messages.
	ErrRequestBodyTooLarge     = errors.New("runner request body limit exceeded")
	ErrResponseBodyTooLarge    = errors.New("runner response body limit exceeded")
	ErrResponseHeadersTooLarge = errors.New("runner response header limit exceeded")
)

// HTTPSender sends PreparedRequest values with the standard library.
type HTTPSender struct {
	client *http.Client
}

// NewHTTPSender creates a standard-library HTTP sender. A nil client uses
// http.DefaultClient.
func NewHTTPSender(client *http.Client) *HTTPSender {
	if client == nil {
		transport := http.DefaultTransport
		if defaultTransport, ok := http.DefaultTransport.(*http.Transport); ok {
			cloned := defaultTransport.Clone()
			cloned.MaxResponseHeaderBytes = hardMaxResponseHeaderBytes
			transport = cloned
		}
		client = &http.Client{Transport: transport}
	}
	return &HTTPSender{client: client}
}

// Send implements Sender.
func (s *HTTPSender) Send(ctx context.Context, input PreparedRequest) (Response, error) {
	started := time.Now()
	var result Response
	requestLimit := input.RequestBodyLimit
	if requestLimit <= 0 {
		requestLimit = DefaultMaxRequestBodyBytes
	}
	responseLimit := input.ResponseBodyLimit
	if responseLimit <= 0 {
		responseLimit = DefaultMaxResponseBodyBytes
	}
	headerLimit := input.ResponseHeaderLimit
	if headerLimit <= 0 {
		headerLimit = DefaultMaxResponseHeaderBytes
	}
	if int64(len(input.Body)) > requestLimit {
		return result, fmt.Errorf("%w: maximum is %d bytes", ErrRequestBodyTooLarge, requestLimit)
	}

	request, err := http.NewRequestWithContext(ctx, input.Method, input.URL, bytes.NewReader(input.Body))
	if err != nil {
		return result, fmt.Errorf("create HTTP request: %w", err)
	}
	request.Header = input.Headers.Clone()
	client := http.DefaultClient
	if s != nil && s.client != nil {
		client = s.client
	}
	response, err := client.Do(request)
	result.DurationMS = time.Since(started).Milliseconds()
	if err != nil {
		if response != nil && response.Body != nil {
			_ = response.Body.Close()
		}
		return result, fmt.Errorf("send HTTP request: %w", err)
	}
	defer response.Body.Close()

	result.StatusCode = response.StatusCode
	if responseHeadersExceed(response.Header, headerLimit) {
		return result, fmt.Errorf(
			"%w: maximum is %d bytes",
			ErrResponseHeadersTooLarge,
			headerLimit,
		)
	}
	result.Headers = response.Header.Clone()
	if response.ContentLength > responseLimit {
		return result, fmt.Errorf("%w: maximum is %d bytes", ErrResponseBodyTooLarge, responseLimit)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, responseLimit+1))
	result.DurationMS = time.Since(started).Milliseconds()
	if err != nil {
		return result, fmt.Errorf("read HTTP response: %w", err)
	}
	if int64(len(body)) > responseLimit {
		return result, fmt.Errorf("%w: maximum is %d bytes", ErrResponseBodyTooLarge, responseLimit)
	}
	result.Body = body
	return result, nil
}

func responseHeadersExceed(header http.Header, limit int64) bool {
	var total int64
	for name, values := range header {
		for _, value := range values {
			amount := int64(len(name)) + int64(len(value)) + 4
			if amount > limit-total {
				return true
			}
			total += amount
		}
	}
	return false
}
