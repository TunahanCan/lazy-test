package httpexec

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
)

func buildRequest(
	ctx context.Context,
	input Request,
	options Options,
) (*http.Request, bool, error) {
	requestLimit := normalizedLimit(
		options.RequestBodyLimit,
		DefaultMaxRequestBodyBytes,
	)
	if int64(len(input.Body)) > requestLimit {
		return nil, false, ErrRequestBodyTooLarge
	}

	var body io.Reader
	if len(input.Body) > 0 {
		body = bytes.NewReader(input.Body)
	}
	request, err := http.NewRequestWithContext(
		ctx,
		input.Method,
		input.URL,
		body,
	)
	if err != nil {
		return nil, false, fmt.Errorf("%w: %v", ErrInvalidRequest, err)
	}

	bodyLength := request.ContentLength
	hostSet := false
	contentLengthSet := false
	transferEncodingSet := false
	forceHTTP1 := false
	for _, header := range input.Headers {
		name := header.Name
		if !validHTTPToken(name) {
			return nil, false, &HeaderError{
				Name:   header.Name,
				Reason: HeaderNameInvalid,
			}
		}
		if !validHeaderValue(header.Value) {
			return nil, false, &HeaderError{
				Name:   name,
				Reason: HeaderValueInvalid,
			}
		}

		switch {
		case strings.EqualFold(name, "Host"):
			if hostSet {
				return nil, false, &HeaderError{
					Name:   "Host",
					Reason: HeaderHostDuplicate,
				}
			}
			if !ValidHostHeaderValue(header.Value) {
				return nil, false, &HeaderError{
					Name:   "Host",
					Reason: HeaderHostInvalid,
				}
			}
			request.Host = header.Value
			hostSet = true
		case strings.EqualFold(name, "Content-Length"):
			if contentLengthSet {
				return nil, false, &HeaderError{
					Name:   "Content-Length",
					Reason: HeaderContentLengthDuplicate,
				}
			}
			if transferEncodingSet {
				return nil, false, &HeaderError{
					Name:   "Content-Length",
					Reason: HeaderFramingConflict,
				}
			}
			normalizedValue, valid := normalizedSpecialHeaderValue(header.Value)
			parsedLength, parseErr := strconv.ParseUint(normalizedValue, 10, 63)
			if !valid || parseErr != nil {
				return nil, false, &HeaderError{
					Name:   "Content-Length",
					Reason: HeaderContentLengthInvalid,
				}
			}
			declaredLength := int64(parsedLength)
			if declaredLength != bodyLength {
				return nil, false, &HeaderError{
					Name:           "Content-Length",
					Reason:         HeaderContentLengthMismatch,
					DeclaredLength: declaredLength,
					BodyLength:     bodyLength,
				}
			}
			normalizedMethod := strings.ToUpper(strings.TrimSpace(input.Method))
			if declaredLength == 0 &&
				(normalizedMethod == http.MethodGet ||
					normalizedMethod == http.MethodHead) {
				return nil, false, &HeaderError{
					Name:   "Content-Length",
					Reason: HeaderContentLengthUnsupported,
				}
			}
			if declaredLength == 0 &&
				normalizedMethod != http.MethodPost &&
				normalizedMethod != http.MethodPut &&
				normalizedMethod != http.MethodPatch {
				request.Body = http.NoBody
				request.TransferEncoding = []string{"identity"}
				forceHTTP1 = true
			}
			contentLengthSet = true
		case strings.EqualFold(name, "Transfer-Encoding"):
			if transferEncodingSet {
				return nil, false, &HeaderError{
					Name:   "Transfer-Encoding",
					Reason: HeaderTransferDuplicate,
				}
			}
			if contentLengthSet {
				return nil, false, &HeaderError{
					Name:   "Transfer-Encoding",
					Reason: HeaderFramingConflict,
				}
			}
			normalizedValue, valid := normalizedSpecialHeaderValue(header.Value)
			if !valid || !strings.EqualFold(normalizedValue, "chunked") {
				return nil, false, &HeaderError{
					Name:   "Transfer-Encoding",
					Reason: HeaderTransferInvalid,
				}
			}
			if !MethodAllowsBody(input.Method) {
				return nil, false, &HeaderError{
					Name:   "Transfer-Encoding",
					Reason: HeaderTransferBodyUnsupported,
				}
			}
			if request.Body == nil {
				request.Body = io.NopCloser(strings.NewReader(""))
			}
			request.TransferEncoding = []string{"chunked"}
			request.ContentLength = -1
			transferEncodingSet = true
			forceHTTP1 = true
		case strings.EqualFold(name, "Trailer"):
			return nil, false, &HeaderError{
				Name:   "Trailer",
				Reason: HeaderTrailerUnsupported,
			}
		default:
			request.Header.Add(name, header.Value)
		}
	}
	if options.SuppressDefaultAgent {
		if _, explicitlySet := request.Header["User-Agent"]; !explicitlySet {
			request.Header["User-Agent"] = []string{""}
		}
	}
	return request, forceHTTP1, nil
}

// MethodAllowsBody matches the interactive request contract: HEAD and TRACE
// do not carry editor bodies; extension methods do.
func MethodAllowsBody(method string) bool {
	switch strings.ToUpper(strings.TrimSpace(method)) {
	case "", http.MethodHead, http.MethodTrace:
		return false
	default:
		return true
	}
}

// ValidHostHeaderValue validates an explicit Host override before it reaches
// net/http's separate Request.Host field.
func ValidHostHeaderValue(host string) bool {
	if host == "" || strings.TrimSpace(host) != host {
		return false
	}
	hostName := host
	port := ""
	if strings.HasPrefix(host, "[") {
		closingBracket := strings.IndexByte(host, ']')
		if closingBracket <= 1 {
			return false
		}
		literal := host[1:closingBracket]
		rest := host[closingBracket+1:]
		if rest != "" {
			if !strings.HasPrefix(rest, ":") || len(rest) == 1 {
				return false
			}
			port = rest[1:]
		}
		address := literal
		if zone := strings.LastIndexByte(address, '%'); zone >= 0 {
			if zone == len(address)-1 || !validHostZone(address[zone+1:]) {
				return false
			}
			address = address[:zone]
		}
		if parsed := net.ParseIP(address); parsed == nil ||
			!strings.Contains(address, ":") {
			return false
		}
	} else {
		if strings.ContainsAny(host, "[]") || strings.Count(host, ":") > 1 {
			return false
		}
		if separator := strings.LastIndexByte(host, ':'); separator >= 0 {
			if separator == 0 || separator == len(host)-1 {
				return false
			}
			hostName = host[:separator]
			port = host[separator+1:]
		}
		if !validRegisteredHost(hostName) {
			return false
		}
	}
	if port != "" {
		parsedPort, err := strconv.ParseUint(port, 10, 16)
		if err != nil || parsedPort > 65_535 {
			return false
		}
	}
	return true
}

func validRegisteredHost(host string) bool {
	if host == "" || strings.HasPrefix(host, ".") ||
		strings.Contains(host, "..") {
		return false
	}
	for index := 0; index < len(host); index++ {
		character := host[index]
		if character >= 'a' && character <= 'z' ||
			character >= 'A' && character <= 'Z' ||
			character >= '0' && character <= '9' ||
			character == '-' ||
			character == '.' ||
			character == '_' ||
			character == '~' {
			continue
		}
		return false
	}
	return true
}

func validHostZone(zone string) bool {
	for index := 0; index < len(zone); index++ {
		character := zone[index]
		if character >= 'a' && character <= 'z' ||
			character >= 'A' && character <= 'Z' ||
			character >= '0' && character <= '9' ||
			character == '-' ||
			character == '.' ||
			character == '_' ||
			character == '~' {
			continue
		}
		return false
	}
	return zone != ""
}

func normalizedSpecialHeaderValue(value string) (string, bool) {
	for index := 0; index < len(value); index++ {
		character := value[index]
		if character < ' ' && character != '\t' || character == 0x7f {
			return "", false
		}
	}
	return strings.Trim(value, " \t"), true
}

func validHeaderValue(value string) bool {
	for index := 0; index < len(value); index++ {
		character := value[index]
		if character < ' ' && character != '\t' || character == 0x7f {
			return false
		}
	}
	return true
}

func validHTTPToken(value string) bool {
	if value == "" {
		return false
	}
	for index := 0; index < len(value); index++ {
		character := value[index]
		switch {
		case character >= 'a' && character <= 'z':
		case character >= 'A' && character <= 'Z':
		case character >= '0' && character <= '9':
		case strings.ContainsRune("!#$%&'*+-.^_`|~", rune(character)):
		default:
			return false
		}
	}
	return true
}

func forceHTTP1Transport(transport *http.Transport) *http.Transport {
	cloned := transport.Clone()
	cloned.ForceAttemptHTTP2 = false
	cloned.TLSNextProto = map[string]func(string, *tls.Conn) http.RoundTripper{}
	return cloned
}
