// Package netinspector performs bounded DNS and HTTP reachability inspections.
package netinspector

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	// MaxTimeout is the longest supported end-to-end inspection timeout.
	MaxTimeout = 5 * time.Minute

	defaultTimeout                = 10 * time.Second
	defaultMaxRedirects           = 10
	defaultMaxBodyBytes           = int64(64 << 10)
	defaultMaxResponseHeaderBytes = int64(1 << 20)
	defaultMaxIPAddresses         = 64

	maxAllowedTimeout             = MaxTimeout
	maxAllowedRedirects           = 50
	maxAllowedBodyBytes           = int64(16 << 20)
	maxAllowedResponseHeaderBytes = int64(8 << 20)
	maxAllowedIPAddresses         = 256
	maxURLBytes                   = 16 << 10
)

var (
	// ErrInvalidOptions reports an invalid or unsafe inspector configuration.
	ErrInvalidOptions = errors.New("invalid netinspector options")
	// ErrNilContext reports that Inspect was called with a nil context.
	ErrNilContext = errors.New("netinspector context must not be nil")
	// ErrInvalidURL reports a malformed, unsupported, or unsafe HTTP URL.
	ErrInvalidURL = errors.New("invalid inspection URL")
	// ErrRedirectLoop reports that a redirect points to an already visited URL.
	ErrRedirectLoop = errors.New("redirect loop detected")
	// ErrTooManyRedirects reports that following the next redirect would exceed
	// Options.MaxRedirects.
	ErrTooManyRedirects = errors.New("maximum redirect count exceeded")
	// ErrResponseBodyTooLarge reports a response body over Options.MaxBodyBytes.
	ErrResponseBodyTooLarge = errors.New("response body exceeds inspection limit")
	// ErrResponseHeadersTooLarge reports response headers over
	// Options.MaxResponseHeaderBytes.
	ErrResponseHeadersTooLarge = errors.New("response headers exceed inspection limit")
	// ErrTooManyIPAddresses reports a DNS response over Options.MaxIPAddresses.
	ErrTooManyIPAddresses = errors.New("DNS response exceeds address limit")
)

// Resolver is the DNS capability needed by Inspector. *net.Resolver implements
// this interface.
type Resolver interface {
	LookupIPAddr(context.Context, string) ([]net.IPAddr, error)
}

// HTTPDoer executes one HTTP request. Implementations must return the response
// for that request without automatically following redirects.
type HTTPDoer interface {
	Do(*http.Request) (*http.Response, error)
}

// Options configures an Inspector. Zero values select bounded defaults.
type Options struct {
	Timeout                time.Duration
	MaxRedirects           int
	MaxBodyBytes           int64
	MaxResponseHeaderBytes int64
	MaxIPAddresses         int
	// InsecureSkipVerify permits self-signed HTTPS targets when Inspector builds
	// its default HTTP client. It has no effect on an injected HTTPClient.
	InsecureSkipVerify bool
	Resolver           Resolver
	HTTPClient         HTTPDoer
}

// DNSLookup describes one unique hostname lookup in first-seen order.
type DNSLookup struct {
	Host       string   `json:"host"`
	IPs        []string `json:"ips"`
	DurationMS int64    `json:"durationMs"`
}

// Hop describes one HTTP exchange. A HEAD response followed by a GET fallback
// appears as two hops with the same URL and different methods.
type Hop struct {
	URL        string `json:"url"`
	Method     string `json:"method"`
	StatusCode int    `json:"statusCode"`
	Location   string `json:"location,omitempty"`
	DurationMS int64  `json:"durationMs"`
}

// Report is the JSON-safe result of an inspection. Hops includes the final
// response as well as redirect and fallback responses. On error, Inspect
// returns the observations completed before the failure.
type Report struct {
	InputURL        string      `json:"inputUrl"`
	DNSLookups      []DNSLookup `json:"dnsLookups"`
	Hops            []Hop       `json:"hops"`
	FinalURL        string      `json:"finalUrl,omitempty"`
	FinalStatusCode int         `json:"finalStatusCode,omitempty"`
	TotalDurationMS int64       `json:"totalDurationMs"`
	UsedGETFallback bool        `json:"usedGetFallback"`
}

// Inspector performs repeatable inspections with shared resolver and HTTP
// dependencies.
type Inspector struct {
	timeout                time.Duration
	maxRedirects           int
	maxBodyBytes           int64
	maxResponseHeaderBytes int64
	maxIPAddresses         int
	resolver               Resolver
	httpClient             HTTPDoer
	closeIdleConnections   func()
}

// New validates options and creates an Inspector.
func New(options Options) (*Inspector, error) {
	timeout := options.Timeout
	if timeout == 0 {
		timeout = defaultTimeout
	}
	if timeout < 0 || timeout > maxAllowedTimeout {
		return nil, fmt.Errorf(
			"%w: timeout must be positive and at most %s",
			ErrInvalidOptions,
			maxAllowedTimeout,
		)
	}

	maxRedirects := options.MaxRedirects
	if maxRedirects == 0 {
		maxRedirects = defaultMaxRedirects
	}
	if maxRedirects < 0 || maxRedirects > maxAllowedRedirects {
		return nil, fmt.Errorf(
			"%w: max redirects must be between 1 and %d",
			ErrInvalidOptions,
			maxAllowedRedirects,
		)
	}

	maxBodyBytes := options.MaxBodyBytes
	if maxBodyBytes == 0 {
		maxBodyBytes = defaultMaxBodyBytes
	}
	if maxBodyBytes < 0 || maxBodyBytes > maxAllowedBodyBytes {
		return nil, fmt.Errorf(
			"%w: max body bytes must be between 1 and %d",
			ErrInvalidOptions,
			maxAllowedBodyBytes,
		)
	}

	maxResponseHeaderBytes := options.MaxResponseHeaderBytes
	if maxResponseHeaderBytes == 0 {
		maxResponseHeaderBytes = defaultMaxResponseHeaderBytes
	}
	if maxResponseHeaderBytes < 0 ||
		maxResponseHeaderBytes > maxAllowedResponseHeaderBytes {
		return nil, fmt.Errorf(
			"%w: max response header bytes must be between 1 and %d",
			ErrInvalidOptions,
			maxAllowedResponseHeaderBytes,
		)
	}

	maxIPAddresses := options.MaxIPAddresses
	if maxIPAddresses == 0 {
		maxIPAddresses = defaultMaxIPAddresses
	}
	if maxIPAddresses < 0 || maxIPAddresses > maxAllowedIPAddresses {
		return nil, fmt.Errorf(
			"%w: max IP addresses must be between 1 and %d",
			ErrInvalidOptions,
			maxAllowedIPAddresses,
		)
	}

	resolver := options.Resolver
	if resolver == nil {
		resolver = net.DefaultResolver
	}
	httpClient := options.HTTPClient
	var closeIdleConnections func()
	if httpClient == nil {
		transport := http.DefaultTransport.(*http.Transport).Clone()
		transport.DisableCompression = true
		transport.MaxResponseHeaderBytes = maxResponseHeaderBytes
		tlsConfig := transport.TLSClientConfig
		if tlsConfig == nil {
			tlsConfig = &tls.Config{}
		} else {
			tlsConfig = tlsConfig.Clone()
		}
		if tlsConfig.MinVersion < tls.VersionTLS12 {
			tlsConfig.MinVersion = tls.VersionTLS12
		}
		// This is an explicit opt-in for inspecting local development targets
		// that use self-signed certificates.
		tlsConfig.InsecureSkipVerify = options.InsecureSkipVerify //nolint:gosec
		transport.TLSClientConfig = tlsConfig
		httpClient = &http.Client{
			Transport: transport,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
		closeIdleConnections = transport.CloseIdleConnections
	}

	return &Inspector{
		timeout:                timeout,
		maxRedirects:           maxRedirects,
		maxBodyBytes:           maxBodyBytes,
		maxResponseHeaderBytes: maxResponseHeaderBytes,
		maxIPAddresses:         maxIPAddresses,
		resolver:               resolver,
		httpClient:             httpClient,
		closeIdleConnections:   closeIdleConnections,
	}, nil
}

// CloseIdleConnections releases connections owned by an Inspector that built
// its own HTTP transport. Injected HTTP clients remain caller-owned.
func (inspector *Inspector) CloseIdleConnections() {
	if inspector != nil && inspector.closeIdleConnections != nil {
		inspector.closeIdleConnections()
	}
}

// Inspect creates an Inspector for one call and returns its report.
func Inspect(
	ctx context.Context,
	rawURL string,
	options Options,
) (Report, error) {
	inspector, err := New(options)
	if err != nil {
		return Report{
			InputURL:   strings.TrimSpace(rawURL),
			DNSLookups: []DNSLookup{},
			Hops:       []Hop{},
		}, err
	}
	defer inspector.CloseIdleConnections()
	return inspector.Inspect(ctx, rawURL)
}

// Inspect resolves each unique redirect hostname, follows redirects manually,
// and returns a bounded HTTP inspection report.
func (inspector *Inspector) Inspect(
	parent context.Context,
	rawURL string,
) (report Report, err error) {
	started := time.Now()
	report = Report{
		InputURL:   strings.TrimSpace(rawURL),
		DNSLookups: []DNSLookup{},
		Hops:       []Hop{},
	}
	defer func() {
		report.TotalDurationMS = elapsedMilliseconds(started)
	}()

	if parent == nil {
		return report, ErrNilContext
	}
	current, err := parseHTTPURL(rawURL)
	if err != nil {
		return report, err
	}
	report.InputURL = current.String()

	ctx, cancel := context.WithTimeout(parent, inspector.timeout)
	defer cancel()

	visited := map[string]struct{}{canonicalURL(current): {}}
	resolvedHosts := make(map[string]struct{})
	redirects := 0
	method := http.MethodHead

	for {
		if err := ctx.Err(); err != nil {
			return report, err
		}

		hostKey := canonicalHostname(current.Hostname())
		if _, exists := resolvedHosts[hostKey]; !exists {
			lookup, lookupErr := inspector.resolve(ctx, current.Hostname())
			report.DNSLookups = append(report.DNSLookups, lookup)
			if lookupErr != nil {
				return report, lookupErr
			}
			resolvedHosts[hostKey] = struct{}{}
		}

		hop, requestErr := inspector.execute(ctx, method, current)
		report.Hops = append(report.Hops, hop)
		if requestErr != nil {
			return report, requestErr
		}

		if method == http.MethodHead && needsGETFallback(hop.StatusCode) {
			method = http.MethodGet
			report.UsedGETFallback = true
			continue
		}

		if !isRedirectStatus(hop.StatusCode) ||
			strings.TrimSpace(hop.Location) == "" {
			report.FinalURL = current.String()
			report.FinalStatusCode = hop.StatusCode
			return report, nil
		}

		next, targetErr := redirectTarget(current, hop.Location)
		if targetErr != nil {
			return report, targetErr
		}
		key := canonicalURL(next)
		if _, exists := visited[key]; exists {
			return report, fmt.Errorf(
				"%w: %s redirects to %s",
				ErrRedirectLoop,
				current.String(),
				next.String(),
			)
		}
		if redirects >= inspector.maxRedirects {
			return report, fmt.Errorf(
				"%w: limit is %d",
				ErrTooManyRedirects,
				inspector.maxRedirects,
			)
		}

		redirects++
		visited[key] = struct{}{}
		current = next
	}
}

func (inspector *Inspector) resolve(
	ctx context.Context,
	host string,
) (lookup DNSLookup, err error) {
	started := time.Now()
	lookup = DNSLookup{Host: host, IPs: []string{}}
	defer func() {
		lookup.DurationMS = elapsedMilliseconds(started)
	}()

	if parsed := net.ParseIP(host); parsed != nil {
		lookup.IPs = append(lookup.IPs, parsed.String())
		return lookup, nil
	}

	addresses, err := inspector.resolver.LookupIPAddr(ctx, host)
	if err != nil {
		return lookup, fmt.Errorf("resolve host %q: %w", host, err)
	}
	seen := make(map[string]struct{}, len(addresses))
	for _, address := range addresses {
		if address.IP == nil {
			continue
		}
		value := address.IP.String()
		if address.Zone != "" {
			value += "%" + address.Zone
		}
		if _, exists := seen[value]; exists {
			continue
		}
		if len(lookup.IPs) >= inspector.maxIPAddresses {
			return lookup, fmt.Errorf(
				"%w: host %q returned more than %d unique addresses",
				ErrTooManyIPAddresses,
				host,
				inspector.maxIPAddresses,
			)
		}
		seen[value] = struct{}{}
		lookup.IPs = append(lookup.IPs, value)
	}
	if len(lookup.IPs) == 0 {
		return lookup, fmt.Errorf("resolve host %q: no IP addresses returned", host)
	}
	return lookup, nil
}

func (inspector *Inspector) execute(
	ctx context.Context,
	method string,
	target *url.URL,
) (hop Hop, err error) {
	started := time.Now()
	hop = Hop{URL: target.String(), Method: method}
	defer func() {
		hop.DurationMS = elapsedMilliseconds(started)
	}()

	request, err := http.NewRequestWithContext(ctx, method, target.String(), nil)
	if err != nil {
		return hop, fmt.Errorf("%w: create request for %q: %v", ErrInvalidURL, target, err)
	}
	request.Header.Set("Accept-Encoding", "identity")

	response, err := inspector.httpClient.Do(request)
	if err != nil {
		if response != nil && response.Body != nil {
			_ = response.Body.Close()
		}
		return hop, fmt.Errorf("execute %s %s: %w", method, target, err)
	}
	if response == nil {
		return hop, errors.New("execute HTTP request: client returned a nil response")
	}
	body := response.Body
	if body == nil {
		body = http.NoBody
	}
	defer body.Close()

	hop.StatusCode = response.StatusCode
	hop.Location = response.Header.Get("Location")
	if responseHeadersExceed(response.Header, inspector.maxResponseHeaderBytes) {
		return hop, fmt.Errorf(
			"%w: %s %s",
			ErrResponseHeadersTooLarge,
			method,
			target,
		)
	}
	if method != http.MethodHead &&
		response.ContentLength > inspector.maxBodyBytes {
		return hop, fmt.Errorf(
			"%w: declared %d bytes, limit is %d",
			ErrResponseBodyTooLarge,
			response.ContentLength,
			inspector.maxBodyBytes,
		)
	}

	readBytes, readErr := io.Copy(
		io.Discard,
		io.LimitReader(body, inspector.maxBodyBytes+1),
	)
	if readErr != nil {
		return hop, fmt.Errorf("read %s %s response body: %w", method, target, readErr)
	}
	if readBytes > inspector.maxBodyBytes {
		return hop, fmt.Errorf(
			"%w: read more than %d bytes",
			ErrResponseBodyTooLarge,
			inspector.maxBodyBytes,
		)
	}
	return hop, nil
}

func parseHTTPURL(raw string) (*url.URL, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil, fmt.Errorf("%w: URL is empty", ErrInvalidURL)
	}
	if len(value) > maxURLBytes {
		return nil, fmt.Errorf(
			"%w: URL exceeds %d bytes",
			ErrInvalidURL,
			maxURLBytes,
		)
	}
	if strings.ContainsAny(value, "\r\n") {
		return nil, fmt.Errorf("%w: URL contains a line break", ErrInvalidURL)
	}

	parsed, err := url.Parse(value)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidURL, err)
	}
	parsed.Scheme = strings.ToLower(parsed.Scheme)
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, fmt.Errorf("%w: URL must use http or https", ErrInvalidURL)
	}
	if parsed.Opaque != "" || parsed.Host == "" || parsed.Hostname() == "" {
		return nil, fmt.Errorf("%w: URL must include a host", ErrInvalidURL)
	}
	if parsed.User != nil {
		return nil, fmt.Errorf("%w: URL must not contain user information", ErrInvalidURL)
	}
	if parsed.Fragment != "" {
		return nil, fmt.Errorf("%w: URL must not contain a fragment", ErrInvalidURL)
	}
	if err := validatePort(parsed); err != nil {
		return nil, err
	}
	if parsed.Path == "" {
		parsed.Path = "/"
		parsed.RawPath = ""
	}
	return parsed, nil
}

func validatePort(parsed *url.URL) error {
	rawHost := parsed.Host
	port := parsed.Port()
	if strings.HasPrefix(rawHost, "[") {
		closeBracket := strings.LastIndex(rawHost, "]")
		if closeBracket < 0 {
			return fmt.Errorf("%w: malformed IPv6 host", ErrInvalidURL)
		}
		suffix := rawHost[closeBracket+1:]
		if suffix != "" && (port == "" || suffix != ":"+port) {
			return fmt.Errorf("%w: malformed port", ErrInvalidURL)
		}
	} else {
		if strings.Count(rawHost, ":") > 1 {
			return fmt.Errorf("%w: IPv6 hosts must use brackets", ErrInvalidURL)
		}
		if strings.Contains(rawHost, ":") && port == "" {
			return fmt.Errorf("%w: malformed port", ErrInvalidURL)
		}
	}
	if port == "" {
		return nil
	}
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 {
		return fmt.Errorf("%w: port must be between 1 and 65535", ErrInvalidURL)
	}
	return nil
}

func redirectTarget(current *url.URL, location string) (*url.URL, error) {
	value := strings.TrimSpace(location)
	if len(value) > maxURLBytes {
		return nil, fmt.Errorf(
			"%w: redirect location exceeds %d bytes",
			ErrInvalidURL,
			maxURLBytes,
		)
	}
	reference, err := url.Parse(value)
	if err != nil {
		return nil, fmt.Errorf("%w: parse redirect location: %v", ErrInvalidURL, err)
	}
	target := current.ResolveReference(reference)
	// URL fragments are client-side only and must not create another network
	// identity or evade redirect-loop detection.
	target.Fragment = ""
	return parseHTTPURL(target.String())
}

func canonicalURL(parsed *url.URL) string {
	canonical := *parsed
	canonical.Scheme = strings.ToLower(canonical.Scheme)
	host := strings.ToLower(strings.TrimSuffix(canonical.Hostname(), "."))
	port := canonical.Port()
	if (canonical.Scheme == "http" && port == "80") ||
		(canonical.Scheme == "https" && port == "443") {
		port = ""
	}
	if strings.Contains(host, ":") {
		if port == "" {
			canonical.Host = "[" + host + "]"
		} else {
			canonical.Host = net.JoinHostPort(host, port)
		}
	} else if port == "" {
		canonical.Host = host
	} else {
		canonical.Host = net.JoinHostPort(host, port)
	}
	if canonical.Path == "" {
		canonical.Path = "/"
		canonical.RawPath = ""
	}
	canonical.Fragment = ""
	return canonical.String()
}

func canonicalHostname(host string) string {
	return strings.ToLower(strings.TrimSuffix(host, "."))
}

func needsGETFallback(status int) bool {
	return status == http.StatusMethodNotAllowed ||
		status == http.StatusNotImplemented
}

func isRedirectStatus(status int) bool {
	switch status {
	case http.StatusMovedPermanently,
		http.StatusFound,
		http.StatusSeeOther,
		http.StatusTemporaryRedirect,
		http.StatusPermanentRedirect:
		return true
	default:
		return false
	}
}

func responseHeadersExceed(headers http.Header, limit int64) bool {
	var size int64
	for name, values := range headers {
		if addExceeds(&size, int64(len(name))+4, limit) {
			return true
		}
		for _, value := range values {
			if addExceeds(&size, int64(len(value))+2, limit) {
				return true
			}
		}
	}
	return false
}

func addExceeds(total *int64, amount, limit int64) bool {
	if amount > limit-*total {
		return true
	}
	*total += amount
	return false
}

func elapsedMilliseconds(started time.Time) int64 {
	elapsed := time.Since(started)
	if elapsed < 0 {
		return 0
	}
	return elapsed.Milliseconds()
}
