package httpexec

import (
	"bytes"
	"compress/flate"
	"compress/gzip"
	"compress/zlib"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
)

func responseCanHaveBody(
	method string,
	statusCode int,
	contentLength int64,
) bool {
	if strings.EqualFold(strings.TrimSpace(method), http.MethodHead) ||
		contentLength == 0 ||
		statusCode >= 100 && statusCode <= 199 ||
		statusCode == http.StatusNoContent ||
		statusCode == http.StatusResetContent ||
		statusCode == http.StatusNotModified {
		return false
	}
	return true
}

func contentEncodings(
	header http.Header,
	maxLayers int,
) ([]string, error) {
	encodings := make([]string, 0, maxLayers)
	count := 0
	for _, value := range header.Values("Content-Encoding") {
		for _, rawEncoding := range strings.Split(value, ",") {
			encoding := strings.ToLower(strings.TrimSpace(rawEncoding))
			if encoding == "" {
				continue
			}
			count++
			if count > maxLayers {
				return nil, &ContentEncodingError{
					Kind: ErrTooManyContentEncodings,
				}
			}
			switch encoding {
			case "identity":
				continue
			case "gzip", "x-gzip", "deflate":
				encodings = append(encodings, encoding)
			default:
				return nil, &ContentEncodingError{
					Encoding: encoding,
					Kind:     ErrUnsupportedContentEncoding,
				}
			}
		}
	}
	return encodings, nil
}

func decodeContentEncodedBody(
	ctx context.Context,
	encoded []byte,
	encodings []string,
	limit int64,
) ([]byte, error) {
	decoded := encoded
	for index := len(encodings) - 1; index >= 0; index-- {
		encoding := encodings[index]
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		next, err := decodeContentEncodingLayer(
			ctx,
			decoded,
			encoding,
			limit,
		)
		if err != nil {
			if err == ErrResponseBodyTooLarge {
				return nil, err
			}
			return nil, &ContentEncodingError{
				Encoding: encoding,
				Kind:     ErrResponseDecodeFailed,
				Err:      err,
			}
		}
		decoded = next
	}
	return decoded, nil
}

func decodeContentEncodingLayer(
	ctx context.Context,
	encoded []byte,
	encoding string,
	limit int64,
) ([]byte, error) {
	var (
		reader io.ReadCloser
		err    error
	)
	switch encoding {
	case "gzip", "x-gzip":
		reader, err = gzip.NewReader(bytes.NewReader(encoded))
	case "deflate":
		reader, err = zlib.NewReader(bytes.NewReader(encoded))
		if err != nil {
			reader = flate.NewReader(bytes.NewReader(encoded))
			err = nil
		}
	default:
		return nil, fmt.Errorf("unsupported content encoding %q", encoding)
	}
	if err != nil {
		return nil, err
	}

	decoded, err := readBounded(
		&contextCheckingReader{ctx: ctx, reader: reader},
		limit,
	)
	closeErr := reader.Close()
	if err != nil {
		return nil, err
	}
	if closeErr != nil {
		return nil, closeErr
	}
	return decoded, nil
}

func readBounded(reader io.Reader, limit int64) ([]byte, error) {
	body, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > limit {
		return nil, ErrResponseBodyTooLarge
	}
	return body, nil
}

// ResponseHeadersExceed reports whether canonical response headers exceed the
// same accounting budget used by Execute. Runner also applies it to custom
// Sender implementations.
func ResponseHeadersExceed(header http.Header, limit int64) bool {
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

type contextCheckingReader struct {
	ctx    context.Context
	reader io.Reader
}

func (reader *contextCheckingReader) Read(buffer []byte) (int, error) {
	if err := reader.ctx.Err(); err != nil {
		return 0, err
	}
	return reader.reader.Read(buffer)
}
