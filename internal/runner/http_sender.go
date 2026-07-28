package runner

import (
	"context"
	"net/http"

	"validex/internal/httpexec"
)

var (
	// ErrRequestBodyTooLarge and ErrResponseBodyTooLarge let Runner classify
	// transport limit failures without parsing messages.
	ErrRequestBodyTooLarge        = httpexec.ErrRequestBodyTooLarge
	ErrResponseBodyTooLarge       = httpexec.ErrResponseBodyTooLarge
	ErrResponseHeadersTooLarge    = httpexec.ErrResponseHeadersTooLarge
	ErrUnsupportedContentEncoding = httpexec.ErrUnsupportedContentEncoding
	ErrTooManyContentEncodings    = httpexec.ErrTooManyContentEncodings
	ErrResponseDecodeFailed       = httpexec.ErrResponseDecodeFailed
)

// HTTPSender sends PreparedRequest values with the standard library.
type HTTPSender struct {
	client               *http.Client
	executor             *httpexec.Executor
	closeIdleConnections func()
}

// NewHTTPSender creates a shared-executor adapter. A nil client creates owned
// default transport clones. An injected standard Transport is cloned for
// deterministic compression/header behavior; the supplied client and its
// original transport remain caller-owned.
func NewHTTPSender(client *http.Client) *HTTPSender {
	executor := httpexec.NewExecutor(httpexec.ExecutorConfig{
		Client:                 client,
		MaxResponseHeaderBytes: hardMaxResponseHeaderBytes,
	})
	return &HTTPSender{
		client:               client,
		executor:             executor,
		closeIdleConnections: executor.CloseIdleConnections,
	}
}

// CloseIdleConnections releases only executor-owned transport clones.
// Injected clients and their original transports remain owned by their caller.
func (s *HTTPSender) CloseIdleConnections() {
	if s != nil && s.closeIdleConnections != nil {
		s.closeIdleConnections()
	}
}

// Send implements Sender.
func (s *HTTPSender) Send(ctx context.Context, input PreparedRequest) (Response, error) {
	executor := (*httpexec.Executor)(nil)
	if s != nil {
		executor = s.executor
	}
	if executor == nil {
		executor = httpexec.NewExecutor(httpexec.ExecutorConfig{})
		defer executor.CloseIdleConnections()
	}
	response, err := executor.Execute(ctx, httpexec.Request{
		Method:  input.Method,
		URL:     input.URL,
		Headers: input.Headers,
		Body:    input.Body,
	}, httpexec.Options{
		RequestBodyLimit:     input.RequestBodyLimit,
		ResponseBodyLimit:    input.ResponseBodyLimit,
		ResponseHeaderLimit:  input.ResponseHeaderLimit,
		MaxContentEncodings:  httpexec.DefaultMaxContentEncoding,
		RedirectPolicy:       httpexec.FollowRedirects,
		SuppressDefaultAgent: true,
	})
	result := Response{
		StatusCode: response.StatusCode,
		Headers:    response.Headers,
		Body:       response.Body,
		DurationMS: response.Duration.Milliseconds(),
	}
	if err != nil {
		return result, err
	}
	return result, nil
}
