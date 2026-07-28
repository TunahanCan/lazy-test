package netinspector

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type resolverFunc func(context.Context, string) ([]net.IPAddr, error)

func (function resolverFunc) LookupIPAddr(
	ctx context.Context,
	host string,
) ([]net.IPAddr, error) {
	return function(ctx, host)
}

type doerFunc func(*http.Request) (*http.Response, error)

func (function doerFunc) Do(request *http.Request) (*http.Response, error) {
	return function(request)
}

type trackedBody struct {
	reader io.Reader
	closed atomic.Bool
}

func (body *trackedBody) Read(buffer []byte) (int, error) {
	return body.reader.Read(buffer)
}

func (body *trackedBody) Close() error {
	body.closed.Store(true)
	return nil
}

func TestInspectorOwnsOnlyItsDefaultTransport(t *testing.T) {
	t.Parallel()

	owned, err := New(Options{})
	if err != nil {
		t.Fatalf("New(defaults) error = %v", err)
	}
	if owned.closeIdleConnections == nil {
		t.Fatal("default inspector must own a close-idle-connections hook")
	}
	owned.CloseIdleConnections()

	injectedClient := doerFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("not called")
	})
	injected, err := New(Options{HTTPClient: injectedClient})
	if err != nil {
		t.Fatalf("New(injected client) error = %v", err)
	}
	if injected.closeIdleConnections != nil {
		t.Fatal("inspector must not take ownership of an injected client")
	}
	injected.CloseIdleConnections()
	(*Inspector)(nil).CloseIdleConnections()
}

func TestInspectReportsDNSFinalHopAndJSONMilliseconds(t *testing.T) {
	t.Parallel()

	var resolverCalls atomic.Int32
	resolver := resolverFunc(func(
		_ context.Context,
		host string,
	) ([]net.IPAddr, error) {
		resolverCalls.Add(1)
		if host != "example.test" {
			t.Fatalf("resolver host = %q", host)
		}
		return []net.IPAddr{
			{IP: net.ParseIP("192.0.2.10")},
			{IP: net.ParseIP("192.0.2.10")},
			{IP: net.ParseIP("2001:db8::10")},
		}, nil
	})
	httpClient := doerFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodHead {
			t.Fatalf("method = %s, want HEAD", request.Method)
		}
		if request.URL.String() != "https://example.test/resource" {
			t.Fatalf("URL = %s", request.URL)
		}
		if request.Header.Get("Accept-Encoding") != "identity" {
			t.Fatalf("Accept-Encoding = %q", request.Header.Get("Accept-Encoding"))
		}
		return response(http.StatusNoContent, "", http.NoBody, 0), nil
	})

	report, err := Inspect(
		context.Background(),
		"https://example.test/resource",
		Options{Resolver: resolver, HTTPClient: httpClient},
	)
	if err != nil {
		t.Fatal(err)
	}
	if resolverCalls.Load() != 1 {
		t.Fatalf("resolver calls = %d, want 1", resolverCalls.Load())
	}
	if report.InputURL != "https://example.test/resource" ||
		report.FinalURL != "https://example.test/resource" ||
		report.FinalStatusCode != http.StatusNoContent {
		t.Fatalf("unexpected report endpoints: %#v", report)
	}
	if report.UsedGETFallback {
		t.Fatal("GET fallback was unexpectedly used")
	}
	if len(report.DNSLookups) != 1 {
		t.Fatalf("DNS lookups = %#v", report.DNSLookups)
	}
	if got := strings.Join(report.DNSLookups[0].IPs, ","); got !=
		"192.0.2.10,2001:db8::10" {
		t.Fatalf("IPs = %q", got)
	}
	if len(report.Hops) != 1 {
		t.Fatalf("hops = %#v", report.Hops)
	}
	hop := report.Hops[0]
	if hop.Method != http.MethodHead ||
		hop.StatusCode != http.StatusNoContent ||
		hop.Location != "" {
		t.Fatalf("hop = %#v", hop)
	}

	encoded, err := json.Marshal(report)
	if err != nil {
		t.Fatal(err)
	}
	jsonText := string(encoded)
	for _, expected := range []string{
		`"durationMs":`,
		`"totalDurationMs":`,
		`"usedGetFallback":false`,
	} {
		if !strings.Contains(jsonText, expected) {
			t.Fatalf("JSON %s does not contain %s", jsonText, expected)
		}
	}
	for _, forbidden := range []string{`"duration":`, `"totalDuration":`} {
		if strings.Contains(jsonText, forbidden) {
			t.Fatalf("JSON leaked a time.Duration field: %s", jsonText)
		}
	}
}

func TestInspectFollowsRelativeRedirectChain(t *testing.T) {
	t.Parallel()

	var methodsMu sync.Mutex
	var methods []string
	server := httptest.NewServer(http.HandlerFunc(func(
		responseWriter http.ResponseWriter,
		request *http.Request,
	) {
		methodsMu.Lock()
		methods = append(methods, request.Method+" "+request.URL.RequestURI())
		methodsMu.Unlock()
		switch request.URL.Path {
		case "/start":
			responseWriter.Header().Set("Location", "/middle")
			responseWriter.WriteHeader(http.StatusFound)
		case "/middle":
			responseWriter.Header().Set("Location", "/final?ready=1")
			responseWriter.WriteHeader(http.StatusTemporaryRedirect)
		case "/final":
			responseWriter.WriteHeader(http.StatusNoContent)
		default:
			responseWriter.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	report, err := Inspect(
		context.Background(),
		server.URL+"/start",
		Options{MaxRedirects: 5},
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Hops) != 3 {
		t.Fatalf("hops = %#v", report.Hops)
	}
	wantStatuses := []int{
		http.StatusFound,
		http.StatusTemporaryRedirect,
		http.StatusNoContent,
	}
	for index, status := range wantStatuses {
		if report.Hops[index].StatusCode != status ||
			report.Hops[index].Method != http.MethodHead {
			t.Fatalf("hop %d = %#v", index, report.Hops[index])
		}
	}
	if report.Hops[0].Location != "/middle" ||
		report.Hops[1].Location != "/final?ready=1" {
		t.Fatalf("redirect locations = %#v", report.Hops)
	}
	if report.FinalURL != server.URL+"/final?ready=1" ||
		report.FinalStatusCode != http.StatusNoContent {
		t.Fatalf("final result = %#v", report)
	}
	if len(report.DNSLookups) != 1 ||
		len(report.DNSLookups[0].IPs) != 1 ||
		report.DNSLookups[0].IPs[0] != "127.0.0.1" {
		t.Fatalf("literal DNS result = %#v", report.DNSLookups)
	}

	methodsMu.Lock()
	defer methodsMu.Unlock()
	if got := strings.Join(methods, ","); got !=
		"HEAD /start,HEAD /middle,HEAD /final?ready=1" {
		t.Fatalf("server requests = %q", got)
	}
}

func TestInspectRequiresExplicitOptInForSelfSignedTLS(t *testing.T) {
	t.Parallel()

	server := httptest.NewTLSServer(http.HandlerFunc(func(
		responseWriter http.ResponseWriter,
		_ *http.Request,
	) {
		responseWriter.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	server.Config.ErrorLog = log.New(io.Discard, "", 0)

	defaultReport, err := Inspect(
		context.Background(),
		server.URL,
		Options{},
	)
	if err == nil {
		t.Fatalf("default inspection unexpectedly trusted self-signed TLS: %#v", defaultReport)
	}
	if defaultReport.FinalStatusCode != 0 || len(defaultReport.Hops) != 1 {
		t.Fatalf("default partial report = %#v", defaultReport)
	}

	insecureReport, err := Inspect(
		context.Background(),
		server.URL,
		Options{InsecureSkipVerify: true},
	)
	if err != nil {
		t.Fatalf("explicit self-signed TLS opt-in failed: %v", err)
	}
	if insecureReport.FinalURL != server.URL+"/" ||
		insecureReport.FinalStatusCode != http.StatusNoContent {
		t.Fatalf("insecure report = %#v", insecureReport)
	}
	if len(insecureReport.Hops) != 1 ||
		insecureReport.Hops[0].Method != http.MethodHead {
		t.Fatalf("insecure hops = %#v", insecureReport.Hops)
	}
}

func TestInspectFallsBackToGETAndKeepsGETAcrossRedirects(t *testing.T) {
	t.Parallel()

	var methodsMu sync.Mutex
	var methods []string
	server := httptest.NewServer(http.HandlerFunc(func(
		responseWriter http.ResponseWriter,
		request *http.Request,
	) {
		methodsMu.Lock()
		methods = append(methods, request.Method+" "+request.URL.Path)
		methodsMu.Unlock()
		if request.URL.Path == "/start" && request.Method == http.MethodHead {
			responseWriter.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if request.URL.Path == "/start" {
			responseWriter.Header().Set("Location", "/final")
			responseWriter.WriteHeader(http.StatusSeeOther)
			return
		}
		_, _ = io.WriteString(responseWriter, "ok")
	}))
	defer server.Close()

	report, err := Inspect(
		context.Background(),
		server.URL+"/start",
		Options{MaxBodyBytes: 32},
	)
	if err != nil {
		t.Fatal(err)
	}
	if !report.UsedGETFallback {
		t.Fatal("GET fallback was not reported")
	}
	if len(report.Hops) != 3 {
		t.Fatalf("hops = %#v", report.Hops)
	}
	wantMethods := []string{http.MethodHead, http.MethodGet, http.MethodGet}
	wantStatuses := []int{
		http.StatusMethodNotAllowed,
		http.StatusSeeOther,
		http.StatusOK,
	}
	for index := range wantMethods {
		if report.Hops[index].Method != wantMethods[index] ||
			report.Hops[index].StatusCode != wantStatuses[index] {
			t.Fatalf("hop %d = %#v", index, report.Hops[index])
		}
	}
	if report.FinalURL != server.URL+"/final" ||
		report.FinalStatusCode != http.StatusOK {
		t.Fatalf("final result = %#v", report)
	}

	methodsMu.Lock()
	defer methodsMu.Unlock()
	if got := strings.Join(methods, ","); got !=
		"HEAD /start,GET /start,GET /final" {
		t.Fatalf("server requests = %q", got)
	}
}

func TestInspectFallsBackForNotImplementedHEAD(t *testing.T) {
	t.Parallel()

	var calls atomic.Int32
	httpClient := doerFunc(func(request *http.Request) (*http.Response, error) {
		switch calls.Add(1) {
		case 1:
			if request.Method != http.MethodHead {
				t.Fatalf("first method = %s", request.Method)
			}
			return response(http.StatusNotImplemented, "", http.NoBody, 0), nil
		case 2:
			if request.Method != http.MethodGet {
				t.Fatalf("second method = %s", request.Method)
			}
			return response(http.StatusOK, "", http.NoBody, 0), nil
		default:
			t.Fatal("unexpected extra request")
			return nil, nil
		}
	})

	report, err := Inspect(
		context.Background(),
		"https://fallback.test/",
		Options{Resolver: fixedResolver(), HTTPClient: httpClient},
	)
	if err != nil {
		t.Fatal(err)
	}
	if !report.UsedGETFallback || report.FinalStatusCode != http.StatusOK {
		t.Fatalf("report = %#v", report)
	}
}

func TestInspectDoesNotFallbackForOtherHEADErrors(t *testing.T) {
	t.Parallel()

	var calls atomic.Int32
	report, err := Inspect(
		context.Background(),
		"https://forbidden.test/",
		Options{
			Resolver: fixedResolver(),
			HTTPClient: doerFunc(func(*http.Request) (*http.Response, error) {
				calls.Add(1)
				return response(http.StatusForbidden, "", http.NoBody, 0), nil
			}),
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 1 || report.UsedGETFallback ||
		report.FinalStatusCode != http.StatusForbidden {
		t.Fatalf("report = %#v, calls = %d", report, calls.Load())
	}
}

func TestInspectDetectsCanonicalRedirectLoop(t *testing.T) {
	t.Parallel()

	var resolverCalls atomic.Int32
	httpClient := doerFunc(func(request *http.Request) (*http.Response, error) {
		switch request.URL.Path {
		case "/a":
			return response(http.StatusFound, "/b", http.NoBody, 0), nil
		case "/b":
			return response(
				http.StatusMovedPermanently,
				"https://LOOP.test:443/a#client-fragment",
				http.NoBody,
				0,
			), nil
		default:
			t.Fatalf("unexpected URL %s", request.URL)
			return nil, nil
		}
	})
	report, err := Inspect(
		context.Background(),
		"https://loop.test/a",
		Options{
			Resolver: resolverFunc(func(
				_ context.Context,
				_ string,
			) ([]net.IPAddr, error) {
				resolverCalls.Add(1)
				return []net.IPAddr{{IP: net.ParseIP("192.0.2.1")}}, nil
			}),
			HTTPClient: httpClient,
		},
	)
	if !errors.Is(err, ErrRedirectLoop) {
		t.Fatalf("error = %v, want redirect loop", err)
	}
	if len(report.Hops) != 2 {
		t.Fatalf("partial hops = %#v", report.Hops)
	}
	if report.FinalURL != "" || report.FinalStatusCode != 0 {
		t.Fatalf("loop unexpectedly produced a final response: %#v", report)
	}
	if resolverCalls.Load() != 1 {
		t.Fatalf("resolver calls = %d, want 1", resolverCalls.Load())
	}
}

func TestInspectEnforcesMaximumRedirects(t *testing.T) {
	t.Parallel()

	httpClient := doerFunc(func(request *http.Request) (*http.Response, error) {
		index, err := strconv.Atoi(strings.TrimPrefix(request.URL.Path, "/"))
		if err != nil {
			t.Fatal(err)
		}
		return response(
			http.StatusFound,
			fmt.Sprintf("/%d", index+1),
			http.NoBody,
			0,
		), nil
	})
	report, err := Inspect(
		context.Background(),
		"https://redirect.test/0",
		Options{
			MaxRedirects: 2,
			Resolver:     fixedResolver(),
			HTTPClient:   httpClient,
		},
	)
	if !errors.Is(err, ErrTooManyRedirects) {
		t.Fatalf("error = %v, want max redirects", err)
	}
	if len(report.Hops) != 3 {
		t.Fatalf("partial hops = %d, want 3", len(report.Hops))
	}
	if report.FinalURL != "" {
		t.Fatalf("final URL = %q", report.FinalURL)
	}
}

func TestInspectResolvesEachRedirectHostnameOnce(t *testing.T) {
	t.Parallel()

	var mu sync.Mutex
	var resolved []string
	resolver := resolverFunc(func(
		_ context.Context,
		host string,
	) ([]net.IPAddr, error) {
		mu.Lock()
		resolved = append(resolved, host)
		mu.Unlock()
		return []net.IPAddr{{IP: net.ParseIP("192.0.2.55")}}, nil
	})
	httpClient := doerFunc(func(request *http.Request) (*http.Response, error) {
		switch request.URL.Hostname() + request.URL.Path {
		case "one.test/start":
			return response(
				http.StatusFound,
				"https://two.test/middle",
				http.NoBody,
				0,
			), nil
		case "two.test/middle":
			return response(
				http.StatusTemporaryRedirect,
				"https://one.test/final",
				http.NoBody,
				0,
			), nil
		case "one.test/final":
			return response(http.StatusNoContent, "", http.NoBody, 0), nil
		default:
			t.Fatalf("unexpected URL %s", request.URL)
			return nil, nil
		}
	})

	report, err := Inspect(
		context.Background(),
		"https://one.test/start",
		Options{Resolver: resolver, HTTPClient: httpClient},
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(report.DNSLookups) != 2 {
		t.Fatalf("DNS lookups = %#v", report.DNSLookups)
	}
	mu.Lock()
	defer mu.Unlock()
	if got := strings.Join(resolved, ","); got != "one.test,two.test" {
		t.Fatalf("resolved hosts = %q", got)
	}
}

func TestInspectRejectsInvalidInputWithoutIO(t *testing.T) {
	t.Parallel()

	invalidURLs := []string{
		"",
		"example.test/path",
		"ftp://example.test/path",
		"http://",
		"http://user:secret@example.test/",
		"http://example.test/path#fragment",
		"http://example.test:invalid/",
		"http://example.test:70000/",
		"http://example.test/\nnext",
		"http://2001:db8::1/",
	}
	for _, rawURL := range invalidURLs {
		rawURL := rawURL
		t.Run(rawURL, func(t *testing.T) {
			var calls atomic.Int32
			report, err := Inspect(
				context.Background(),
				rawURL,
				Options{
					Resolver: resolverFunc(func(
						context.Context,
						string,
					) ([]net.IPAddr, error) {
						calls.Add(1)
						return nil, nil
					}),
					HTTPClient: doerFunc(func(
						*http.Request,
					) (*http.Response, error) {
						calls.Add(1)
						return nil, nil
					}),
				},
			)
			if !errors.Is(err, ErrInvalidURL) {
				t.Fatalf("error = %v, want invalid URL", err)
			}
			if calls.Load() != 0 {
				t.Fatalf("I/O calls = %d", calls.Load())
			}
			if len(report.DNSLookups) != 0 || len(report.Hops) != 0 {
				t.Fatalf("partial report = %#v", report)
			}
		})
	}
}

func TestInspectRejectsInvalidRedirectTarget(t *testing.T) {
	t.Parallel()

	report, err := Inspect(
		context.Background(),
		"https://redirect.test/start",
		Options{
			Resolver: fixedResolver(),
			HTTPClient: doerFunc(func(*http.Request) (*http.Response, error) {
				return response(
					http.StatusFound,
					"file:///tmp/secret",
					http.NoBody,
					0,
				), nil
			}),
		},
	)
	if !errors.Is(err, ErrInvalidURL) {
		t.Fatalf("error = %v, want invalid URL", err)
	}
	if len(report.Hops) != 1 ||
		report.Hops[0].StatusCode != http.StatusFound {
		t.Fatalf("partial report = %#v", report)
	}
}

func TestRedirectWithoutLocationIsFinal(t *testing.T) {
	t.Parallel()

	report, err := Inspect(
		context.Background(),
		"https://redirect.test/no-location",
		Options{
			Resolver: fixedResolver(),
			HTTPClient: doerFunc(func(*http.Request) (*http.Response, error) {
				return response(http.StatusFound, "", http.NoBody, 0), nil
			}),
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if report.FinalStatusCode != http.StatusFound ||
		report.FinalURL != "https://redirect.test/no-location" {
		t.Fatalf("report = %#v", report)
	}
}

func TestInspectEnforcesDNSAddressLimit(t *testing.T) {
	t.Parallel()

	var httpCalls atomic.Int32
	report, err := Inspect(
		context.Background(),
		"https://many-addresses.test/",
		Options{
			MaxIPAddresses: 2,
			Resolver: resolverFunc(func(
				context.Context,
				string,
			) ([]net.IPAddr, error) {
				return []net.IPAddr{
					{IP: net.ParseIP("192.0.2.1")},
					{IP: net.ParseIP("192.0.2.2")},
					{IP: net.ParseIP("192.0.2.3")},
				}, nil
			}),
			HTTPClient: doerFunc(func(*http.Request) (*http.Response, error) {
				httpCalls.Add(1)
				return nil, nil
			}),
		},
	)
	if !errors.Is(err, ErrTooManyIPAddresses) {
		t.Fatalf("error = %v, want DNS limit", err)
	}
	if len(report.DNSLookups) != 1 ||
		len(report.DNSLookups[0].IPs) != 2 {
		t.Fatalf("partial DNS report = %#v", report.DNSLookups)
	}
	if httpCalls.Load() != 0 {
		t.Fatalf("HTTP calls = %d", httpCalls.Load())
	}
}

func TestInspectRejectsEmptyDNSResult(t *testing.T) {
	t.Parallel()

	report, err := Inspect(
		context.Background(),
		"https://empty-dns.test/",
		Options{
			Resolver: resolverFunc(func(
				context.Context,
				string,
			) ([]net.IPAddr, error) {
				return nil, nil
			}),
			HTTPClient: doerFunc(func(*http.Request) (*http.Response, error) {
				t.Fatal("HTTP must not run after an empty DNS result")
				return nil, nil
			}),
		},
	)
	if err == nil || !strings.Contains(err.Error(), "no IP addresses") {
		t.Fatalf("error = %v", err)
	}
	if len(report.DNSLookups) != 1 {
		t.Fatalf("DNS report = %#v", report.DNSLookups)
	}
}

func TestInspectSkipsResolverForIPLiteral(t *testing.T) {
	t.Parallel()

	var resolverCalls atomic.Int32
	report, err := Inspect(
		context.Background(),
		"http://192.0.2.44/path",
		Options{
			Resolver: resolverFunc(func(
				context.Context,
				string,
			) ([]net.IPAddr, error) {
				resolverCalls.Add(1)
				return nil, errors.New("must not be called")
			}),
			HTTPClient: doerFunc(func(*http.Request) (*http.Response, error) {
				return response(http.StatusNoContent, "", http.NoBody, 0), nil
			}),
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if resolverCalls.Load() != 0 {
		t.Fatalf("resolver calls = %d", resolverCalls.Load())
	}
	if got := report.DNSLookups[0].IPs; len(got) != 1 ||
		got[0] != "192.0.2.44" {
		t.Fatalf("literal IPs = %#v", got)
	}
}

func TestInspectTimeoutCancelsDNS(t *testing.T) {
	t.Parallel()

	var httpCalls atomic.Int32
	report, err := Inspect(
		context.Background(),
		"https://slow-dns.test/",
		Options{
			Timeout: 20 * time.Millisecond,
			Resolver: resolverFunc(func(
				ctx context.Context,
				_ string,
			) ([]net.IPAddr, error) {
				<-ctx.Done()
				return nil, ctx.Err()
			}),
			HTTPClient: doerFunc(func(*http.Request) (*http.Response, error) {
				httpCalls.Add(1)
				return nil, nil
			}),
		},
	)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("error = %v, want deadline", err)
	}
	if httpCalls.Load() != 0 || len(report.DNSLookups) != 1 {
		t.Fatalf("partial report = %#v, HTTP calls = %d", report, httpCalls.Load())
	}
	if report.TotalDurationMS < 10 {
		t.Fatalf("total duration = %dms", report.TotalDurationMS)
	}
}

func TestInspectTimeoutCancelsHTTP(t *testing.T) {
	t.Parallel()

	report, err := Inspect(
		context.Background(),
		"https://slow-http.test/",
		Options{
			Timeout:  20 * time.Millisecond,
			Resolver: fixedResolver(),
			HTTPClient: doerFunc(func(request *http.Request) (*http.Response, error) {
				<-request.Context().Done()
				return nil, request.Context().Err()
			}),
		},
	)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("error = %v, want deadline", err)
	}
	if len(report.Hops) != 1 ||
		report.Hops[0].StatusCode != 0 ||
		report.Hops[0].Method != http.MethodHead {
		t.Fatalf("partial hops = %#v", report.Hops)
	}
}

func TestInspectHonorsCanceledParentContextBeforeIO(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	var calls atomic.Int32
	_, err := Inspect(
		ctx,
		"https://canceled.test/",
		Options{
			Resolver: resolverFunc(func(
				context.Context,
				string,
			) ([]net.IPAddr, error) {
				calls.Add(1)
				return nil, nil
			}),
			HTTPClient: doerFunc(func(*http.Request) (*http.Response, error) {
				calls.Add(1)
				return nil, nil
			}),
		},
	)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want canceled", err)
	}
	if calls.Load() != 0 {
		t.Fatalf("I/O calls = %d", calls.Load())
	}
}

func TestInspectRejectsNilContext(t *testing.T) {
	t.Parallel()

	report, err := Inspect(
		nil,
		"https://nil-context.test/",
		Options{Resolver: fixedResolver()},
	)
	if !errors.Is(err, ErrNilContext) {
		t.Fatalf("error = %v, want nil context", err)
	}
	if report.InputURL != "https://nil-context.test/" {
		t.Fatalf("input URL = %q", report.InputURL)
	}
}

func TestInspectEnforcesUnknownLengthBodyLimitAndClosesBody(t *testing.T) {
	t.Parallel()

	largeBody := &trackedBody{reader: strings.NewReader("12345")}
	var calls atomic.Int32
	report, err := Inspect(
		context.Background(),
		"https://large-body.test/",
		Options{
			MaxBodyBytes: 4,
			Resolver:     fixedResolver(),
			HTTPClient: doerFunc(func(request *http.Request) (*http.Response, error) {
				if calls.Add(1) == 1 {
					return response(
						http.StatusMethodNotAllowed,
						"",
						http.NoBody,
						0,
					), nil
				}
				return response(http.StatusOK, "", largeBody, -1), nil
			}),
		},
	)
	if !errors.Is(err, ErrResponseBodyTooLarge) {
		t.Fatalf("error = %v, want body limit", err)
	}
	if !largeBody.closed.Load() {
		t.Fatal("oversized response body was not closed")
	}
	if !report.UsedGETFallback || len(report.Hops) != 2 ||
		report.Hops[1].StatusCode != http.StatusOK {
		t.Fatalf("partial report = %#v", report)
	}
}

func TestInspectRejectsDeclaredOversizedBodyWithoutReading(t *testing.T) {
	t.Parallel()

	body := &trackedBody{reader: strings.NewReader("unused")}
	var calls atomic.Int32
	_, err := Inspect(
		context.Background(),
		"https://declared-large.test/",
		Options{
			MaxBodyBytes: 4,
			Resolver:     fixedResolver(),
			HTTPClient: doerFunc(func(*http.Request) (*http.Response, error) {
				if calls.Add(1) == 1 {
					return response(
						http.StatusMethodNotAllowed,
						"",
						http.NoBody,
						0,
					), nil
				}
				return response(http.StatusOK, "", body, 1024), nil
			}),
		},
	)
	if !errors.Is(err, ErrResponseBodyTooLarge) {
		t.Fatalf("error = %v, want body limit", err)
	}
	if !body.closed.Load() {
		t.Fatal("declared oversized response body was not closed")
	}
}

func TestInspectEnforcesResponseHeaderLimit(t *testing.T) {
	t.Parallel()

	body := &trackedBody{reader: strings.NewReader("")}
	report, err := Inspect(
		context.Background(),
		"https://large-header.test/",
		Options{
			MaxResponseHeaderBytes: 32,
			Resolver:               fixedResolver(),
			HTTPClient: doerFunc(func(*http.Request) (*http.Response, error) {
				result := response(http.StatusOK, "", body, 0)
				result.Header.Set("X-Large", strings.Repeat("x", 64))
				return result, nil
			}),
		},
	)
	if !errors.Is(err, ErrResponseHeadersTooLarge) {
		t.Fatalf("error = %v, want header limit", err)
	}
	if !body.closed.Load() {
		t.Fatal("response body was not closed after header rejection")
	}
	if len(report.Hops) != 1 ||
		report.Hops[0].StatusCode != http.StatusOK {
		t.Fatalf("partial hops = %#v", report.Hops)
	}
}

func TestInspectClosesResponseReturnedWithHTTPError(t *testing.T) {
	t.Parallel()

	body := &trackedBody{reader: strings.NewReader("error")}
	report, err := Inspect(
		context.Background(),
		"https://client-error.test/",
		Options{
			Resolver: fixedResolver(),
			HTTPClient: doerFunc(func(*http.Request) (*http.Response, error) {
				return response(http.StatusBadGateway, "", body, 5),
					errors.New("transport failed")
			}),
		},
	)
	if err == nil || !strings.Contains(err.Error(), "transport failed") {
		t.Fatalf("error = %v", err)
	}
	if !body.closed.Load() {
		t.Fatal("response returned with error was not closed")
	}
	if len(report.Hops) != 1 || report.Hops[0].StatusCode != 0 {
		t.Fatalf("partial hops = %#v", report.Hops)
	}
}

func TestInspectRejectsNilHTTPResponse(t *testing.T) {
	t.Parallel()

	_, err := Inspect(
		context.Background(),
		"https://nil-response.test/",
		Options{
			Resolver: fixedResolver(),
			HTTPClient: doerFunc(func(*http.Request) (*http.Response, error) {
				return nil, nil
			}),
		},
	)
	if err == nil || !strings.Contains(err.Error(), "nil response") {
		t.Fatalf("error = %v", err)
	}
}

func TestNewRejectsUnsafeOptions(t *testing.T) {
	t.Parallel()

	tests := []Options{
		{Timeout: -time.Second},
		{Timeout: maxAllowedTimeout + time.Nanosecond},
		{MaxRedirects: -1},
		{MaxRedirects: maxAllowedRedirects + 1},
		{MaxBodyBytes: -1},
		{MaxBodyBytes: maxAllowedBodyBytes + 1},
		{MaxResponseHeaderBytes: -1},
		{MaxResponseHeaderBytes: maxAllowedResponseHeaderBytes + 1},
		{MaxIPAddresses: -1},
		{MaxIPAddresses: maxAllowedIPAddresses + 1},
	}
	for index, options := range tests {
		_, err := New(options)
		if !errors.Is(err, ErrInvalidOptions) {
			t.Fatalf("case %d error = %v, want invalid options", index, err)
		}
	}
}

func TestInspectConvenienceReturnsJSONSafeEmptySlicesForInvalidOptions(
	t *testing.T,
) {
	t.Parallel()

	report, err := Inspect(
		context.Background(),
		"https://example.test/",
		Options{MaxRedirects: maxAllowedRedirects + 1},
	)
	if !errors.Is(err, ErrInvalidOptions) {
		t.Fatalf("error = %v", err)
	}
	encoded, err := json.Marshal(report)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(encoded), `"dnsLookups":[]`) ||
		!strings.Contains(string(encoded), `"hops":[]`) {
		t.Fatalf("JSON contains null collections: %s", encoded)
	}
}

func fixedResolver() Resolver {
	return resolverFunc(func(
		context.Context,
		string,
	) ([]net.IPAddr, error) {
		return []net.IPAddr{{IP: net.ParseIP("192.0.2.20")}}, nil
	})
}

func response(
	status int,
	location string,
	body io.ReadCloser,
	contentLength int64,
) *http.Response {
	header := make(http.Header)
	if location != "" {
		header.Set("Location", location)
	}
	return &http.Response{
		StatusCode:    status,
		Status:        fmt.Sprintf("%d %s", status, http.StatusText(status)),
		Header:        header,
		Body:          body,
		ContentLength: contentLength,
	}
}
