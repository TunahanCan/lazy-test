package diagnostics

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	defaultHTTPTimeout      = 5 * time.Second
	maxAllowedHTTPTimeout   = 30 * time.Second
	defaultResponseLimit    = int64(2 << 20)
	maxAllowedResponseLimit = int64(16 << 20)
)

func boundedTimeout(value time.Duration) (time.Duration, error) {
	if value == 0 {
		return defaultHTTPTimeout, nil
	}
	if value < 0 || value > maxAllowedHTTPTimeout {
		return 0, invalidInput("The timeout is outside the supported range.", "Use a timeout between 1 millisecond and 30 seconds.")
	}
	return value, nil
}

func boundedResponseLimit(value int64) (int64, error) {
	if value == 0 {
		return defaultResponseLimit, nil
	}
	if value < 1 || value > maxAllowedResponseLimit {
		return 0, invalidInput("The response size limit is outside the supported range.", "Use a limit from 1 byte through 16 MiB.")
	}
	return value, nil
}

func parseHTTPBaseURL(raw string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, invalidInput("The base URL is not a valid HTTP or HTTPS URL.", "Enter a URL such as http://localhost:8080/actuator.")
	}
	if parsed.User != nil || parsed.Fragment != "" {
		return nil, invalidInput("The base URL contains unsupported credentials or a fragment.", "Provide credentials as request headers and remove the URL fragment.")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	parsed.RawQuery = ""
	return parsed, nil
}

func cloneHTTPClient(source *http.Client, timeout time.Duration) *http.Client {
	var client http.Client
	if source != nil {
		client = *source
	}
	if client.Timeout == 0 || client.Timeout > timeout {
		client.Timeout = timeout
	}
	previousRedirectCheck := client.CheckRedirect
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many redirects")
		}
		if len(via) > 0 {
			origin := via[0].URL
			if !strings.EqualFold(origin.Scheme, req.URL.Scheme) || !strings.EqualFold(origin.Host, req.URL.Host) {
				return errors.New("cross-origin redirect refused")
			}
		}
		if previousRedirectCheck != nil {
			return previousRedirectCheck(req, via)
		}
		return nil
	}
	return &client
}

func contextWithTimeout(parent context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	if parent == nil {
		parent = context.Background()
	}
	return context.WithTimeout(parent, timeout)
}

func readLimitedBody(body io.Reader, limit int64) ([]byte, bool, error) {
	data, err := io.ReadAll(io.LimitReader(body, limit+1))
	if err != nil {
		return nil, false, err
	}
	if int64(len(data)) > limit {
		return data[:limit], true, nil
	}
	return data, false, nil
}

func truncateUTF8(value string, maxBytes int) string {
	if maxBytes <= 0 || len(value) <= maxBytes {
		return value
	}
	cut := maxBytes
	for cut > 0 && !utf8.ValidString(value[:cut]) {
		cut--
	}
	return value[:cut] + "…"
}
