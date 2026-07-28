package httpexec

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Executor owns any transport clones it creates and is safe for sequential or
// concurrent Execute calls. CloseIdleConnections may be called repeatedly.
type Executor struct {
	client      *http.Client
	http1Client *http.Client
	closeIdle   []func()
}

// NewExecutor creates the shared transport adapter. When config.Client is nil,
// the executor owns cloned default transports with automatic compression
// disabled. A standard Transport on an injected client is cloned so this
// package can apply deterministic compression and header-limit behavior
// without mutating or closing caller-owned resources. Custom RoundTrippers are
// used as-is.
func NewExecutor(config ExecutorConfig) *Executor {
	headerLimit := config.MaxResponseHeaderBytes
	if headerLimit <= 0 {
		headerLimit = DefaultMaxResponseHeaderBytes
	}
	if config.Client == nil {
		transport := cloneDefaultTransport()
		transport.DisableCompression = true
		transport.MaxResponseHeaderBytes = headerLimit
		http1Transport := forceHTTP1Transport(transport)
		return &Executor{
			client:      &http.Client{Transport: transport},
			http1Client: &http.Client{Transport: http1Transport},
			closeIdle: []func(){
				transport.CloseIdleConnections,
				http1Transport.CloseIdleConnections,
			},
		}
	}

	executor := &Executor{client: config.Client}
	if transport, ok := effectiveTransport(config.Client).(*http.Transport); ok {
		normalTransport := transport.Clone()
		normalTransport.DisableCompression = true
		if normalTransport.MaxResponseHeaderBytes <= 0 ||
			normalTransport.MaxResponseHeaderBytes > headerLimit {
			normalTransport.MaxResponseHeaderBytes = headerLimit
		}
		normalClient := *config.Client
		normalClient.Transport = normalTransport
		http1Transport := forceHTTP1Transport(normalTransport)
		http1Client := normalClient
		http1Client.Transport = http1Transport
		executor.client = &normalClient
		executor.http1Client = &http1Client
		executor.closeIdle = []func(){
			normalTransport.CloseIdleConnections,
			http1Transport.CloseIdleConnections,
		}
	}
	return executor
}

// CloseIdleConnections releases only transport clones owned by this executor.
func (executor *Executor) CloseIdleConnections() {
	if executor == nil {
		return
	}
	for _, closeIdle := range executor.closeIdle {
		closeIdle()
	}
}

// Execute builds and sends one bounded HTTP request.
func (executor *Executor) Execute(
	ctx context.Context,
	input Request,
	options Options,
) (result Response, err error) {
	started := time.Now()
	defer func() {
		result.Duration = time.Since(started)
	}()
	if ctx == nil {
		ctx = context.Background()
	}
	request, forceHTTP1, err := buildRequest(ctx, input, options)
	if err != nil {
		return result, fmt.Errorf("build HTTP request: %w", err)
	}

	client := executor.clientFor(forceHTTP1, options.RedirectPolicy)
	response, err := client.Do(request)
	if err != nil {
		if response != nil && response.Body != nil {
			_ = response.Body.Close()
		}
		if responseHeaderLimitExceeded(err) {
			return result, fmt.Errorf(
				"send HTTP request: %w: %v",
				ErrResponseHeadersTooLarge,
				err,
			)
		}
		return result, fmt.Errorf("send HTTP request: %w", err)
	}
	defer response.Body.Close()

	result.StatusCode = response.StatusCode
	result.Status = response.Status
	result.Protocol = response.Proto
	result.Headers = response.Header.Clone()
	result.Cookies = response.Cookies()
	if response.TLS != nil {
		state := *response.TLS
		result.TLS = &state
	}

	headerLimit := normalizedLimit(
		options.ResponseHeaderLimit,
		DefaultMaxResponseHeaderBytes,
	)
	if ResponseHeadersExceed(response.Header, headerLimit) {
		return result, fmt.Errorf(
			"%w: maximum is %d bytes",
			ErrResponseHeadersTooLarge,
			headerLimit,
		)
	}
	if !responseCanHaveBody(
		input.Method,
		response.StatusCode,
		response.ContentLength,
	) {
		return result, nil
	}

	responseLimit := normalizedLimit(
		options.ResponseBodyLimit,
		DefaultMaxResponseBodyBytes,
	)
	if response.ContentLength > responseLimit {
		return result, fmt.Errorf(
			"%w: maximum is %d bytes",
			ErrResponseBodyTooLarge,
			responseLimit,
		)
	}
	encoded, err := readBounded(response.Body, responseLimit)
	if err != nil {
		if err == ErrResponseBodyTooLarge {
			return result, fmt.Errorf(
				"%w: maximum is %d bytes",
				ErrResponseBodyTooLarge,
				responseLimit,
			)
		}
		return result, fmt.Errorf("read HTTP response: %w", err)
	}
	if options.DisableContentDecoding {
		result.Body = encoded
		return result, nil
	}

	maxEncodings := options.MaxContentEncodings
	if maxEncodings <= 0 {
		maxEncodings = DefaultMaxContentEncoding
	}
	encodings, err := contentEncodings(response.Header, maxEncodings)
	if err != nil {
		return result, err
	}
	decoded, err := decodeContentEncodedBody(
		ctx,
		encoded,
		encodings,
		responseLimit,
	)
	if err != nil {
		if err == ErrResponseBodyTooLarge {
			return result, fmt.Errorf(
				"%w: maximum is %d bytes",
				ErrResponseBodyTooLarge,
				responseLimit,
			)
		}
		return result, err
	}
	result.Body = decoded
	return result, nil
}

func (executor *Executor) clientFor(
	forceHTTP1 bool,
	redirectPolicy RedirectPolicy,
) *http.Client {
	base := http.DefaultClient
	if executor != nil && executor.client != nil {
		base = executor.client
	}
	if forceHTTP1 && executor != nil && executor.http1Client != nil {
		base = executor.http1Client
	}
	client := *base
	if redirectPolicy == StopAtFirstResponse {
		client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		}
	}
	return &client
}

func cloneDefaultTransport() *http.Transport {
	if transport, ok := http.DefaultTransport.(*http.Transport); ok {
		return transport.Clone()
	}
	return &http.Transport{Proxy: http.ProxyFromEnvironment}
}

func effectiveTransport(client *http.Client) http.RoundTripper {
	if client != nil && client.Transport != nil {
		return client.Transport
	}
	return http.DefaultTransport
}

func normalizedLimit(value, fallback int64) int64 {
	if value <= 0 {
		return fallback
	}
	return value
}

func responseHeaderLimitExceeded(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "server response headers exceeded") ||
		strings.Contains(message, "header list too large") ||
		(strings.Contains(message, "read limit of ") &&
			strings.Contains(message, " bytes exhausted"))
}
