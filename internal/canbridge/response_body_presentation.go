package canbridge

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"

	"validex/internal/httpmedia"
)

const (
	maxPrettyJSONBytes        = int64(32 << 20)
	maxPrettyJSONNestingDepth = 128
	maxPrettyXMLBytes         = int64(32 << 20)
	maxPrettyXMLNestingDepth  = 128
	maxPrettyXMLTokens        = 250_000
	// Leave room in the 64 MiB IPC envelope for headers and response metadata.
	// Base64 of the maximum 16 MiB body remains below this budget even though
	// Body and RawBody intentionally carry the same presentation.
	maxResponseBodyJSONBytes = int64(48 << 20)
)

type responseBodyPresentation struct {
	Body     string
	Raw      string
	Encoding ResponseBodyEncoding
}

func presentResponseBody(
	raw []byte,
	contentType string,
) responseBodyPresentation {
	if !responseBodyCanUseUTF8(raw, contentType) {
		return base64ResponseBody(raw)
	}
	rawBody := string(raw)
	body := prettyBody(raw, contentType)
	if !jsonStringsFitBudget(
		maxResponseBodyJSONBytes,
		body,
		rawBody,
	) {
		return base64ResponseBody(raw)
	}
	return responseBodyPresentation{
		Body:     body,
		Raw:      rawBody,
		Encoding: ResponseBodyUTF8,
	}
}

func base64ResponseBody(raw []byte) responseBodyPresentation {
	encoded := base64.StdEncoding.EncodeToString(raw)
	return responseBodyPresentation{
		Body:     encoded,
		Raw:      encoded,
		Encoding: ResponseBodyBase64,
	}
}

func responseBodyCanUseUTF8(raw []byte, contentType string) bool {
	if !utf8.Valid(raw) {
		return false
	}
	for _, character := range raw {
		if character == 0x7f ||
			character < 0x20 &&
				character != '\t' &&
				character != '\n' &&
				character != '\r' {
			return false
		}
	}
	declaredType := httpmedia.BaseType(contentType)
	return declaredType == "" || httpmedia.IsTextual(declaredType)
}

func jsonStringsFitBudget(maximumBytes int64, values ...string) bool {
	remaining := maximumBytes
	for _, value := range values {
		size, ok := jsonStringEncodedSize(value, remaining)
		if !ok {
			return false
		}
		remaining -= size
	}
	return true
}

// jsonStringEncodedSize calculates encoding/json's default string size without
// allocating the encoded representation. In addition to JSON control escapes,
// encoding/json escapes HTML-sensitive ASCII and the two JavaScript separator
// runes used by the native Eval transport.
func jsonStringEncodedSize(value string, maximumBytes int64) (int64, bool) {
	size := int64(2) // opening and closing quotes
	if size > maximumBytes {
		return 0, false
	}
	for index := 0; index < len(value); {
		character := value[index]
		increment := int64(1)
		if character < utf8.RuneSelf {
			switch character {
			case '"', '\\', '\b', '\f', '\n', '\r', '\t':
				increment = 2
			case '<', '>', '&':
				increment = 6
			default:
				if character < 0x20 {
					increment = 6
				}
			}
			index++
		} else {
			runeValue, runeBytes := utf8.DecodeRuneInString(value[index:])
			increment = int64(runeBytes)
			if runeValue == '\u2028' || runeValue == '\u2029' {
				increment = 6
			}
			index += runeBytes
		}
		if increment > maximumBytes-size {
			return 0, false
		}
		size += increment
	}
	return size, true
}

func decodePresentedResponseBody(
	body string,
	encoding ResponseBodyEncoding,
) ([]byte, error) {
	switch encoding {
	case "", ResponseBodyUTF8:
		return []byte(body), nil
	case ResponseBodyBase64:
		decoded, err := base64.StdEncoding.Strict().DecodeString(body)
		if err != nil {
			return nil, fmt.Errorf("decode base64 response body: %w", err)
		}
		return decoded, nil
	default:
		return nil, fmt.Errorf("unsupported response body encoding %q", encoding)
	}
}

type responseBodyFormatter interface {
	matches(raw []byte, contentType string) bool
	format(raw []byte) (string, bool)
}

type jsonResponseBodyFormatter struct{}

func (jsonResponseBodyFormatter) matches(
	raw []byte,
	contentType string,
) bool {
	return httpmedia.IsJSON(contentType) || json.Valid(raw)
}

func (jsonResponseBodyFormatter) format(raw []byte) (string, bool) {
	if !prettyJSONWithinBudget(raw) {
		return "", false
	}
	var formatted bytes.Buffer
	if err := json.Indent(&formatted, raw, "", "  "); err != nil {
		return "", false
	}
	return formatted.String(), true
}

type xmlResponseBodyFormatter struct{}

func (xmlResponseBodyFormatter) matches(
	raw []byte,
	contentType string,
) bool {
	if httpmedia.IsXML(contentType) {
		return true
	}
	trimmed := bytes.TrimSpace(raw)
	return len(trimmed) >= 3 && trimmed[0] == '<'
}

func (xmlResponseBodyFormatter) format(raw []byte) (string, bool) {
	document, ok := inspectXMLDocument(raw)
	if !ok {
		return "", false
	}
	return renderXMLDocument(raw, document)
}

var responseBodyFormatters = [...]responseBodyFormatter{
	jsonResponseBodyFormatter{},
	xmlResponseBodyFormatter{},
}

func prettyBody(raw []byte, contentType string) string {
	for _, formatter := range responseBodyFormatters {
		if !formatter.matches(raw, contentType) {
			continue
		}
		if formatted, ok := formatter.format(raw); ok {
			return formatted
		}
	}
	return string(raw)
}

type xmlPresentationTokenKind uint8

const (
	xmlPresentationText xmlPresentationTokenKind = iota
	xmlPresentationStart
	xmlPresentationEnd
	xmlPresentationMarkup
)

type xmlPresentationElement struct {
	hasStructuredContent bool
	hasText              bool
	hasInlineWhitespace  bool
}

type xmlPresentationToken struct {
	start        int
	end          int
	depth        int
	parentIndex  int
	elementIndex int
	kind         xmlPresentationTokenKind
}

type xmlPresentationDocument struct {
	elements []xmlPresentationElement
	tokens   []xmlPresentationToken
}

// inspectXMLDocument validates XML with the strict standard-library decoder
// and records lexical token spans. Formatting later copies those spans from
// the original response, preserving namespace prefixes, attribute quoting,
// entities, CDATA, comments, processing instructions, and directives.
func inspectXMLDocument(raw []byte) (xmlPresentationDocument, bool) {
	if len(raw) == 0 || int64(len(raw)) > maxPrettyXMLBytes {
		return xmlPresentationDocument{}, false
	}

	document := xmlPresentationDocument{
		elements: make([]xmlPresentationElement, 0, 64),
		tokens:   make([]xmlPresentationToken, 0, 128),
	}
	decoder := xml.NewDecoder(bytes.NewReader(raw))
	elementStack := make([]int, 0, 16)
	previousOffset := int64(0)
	rootSeen := false
	rootClosed := false

	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return xmlPresentationDocument{}, false
		}

		currentOffset := decoder.InputOffset()
		if currentOffset < previousOffset ||
			currentOffset > int64(len(raw)) ||
			len(document.tokens) >= maxPrettyXMLTokens {
			return xmlPresentationDocument{}, false
		}

		record := xmlPresentationToken{
			start:        int(previousOffset),
			end:          int(currentOffset),
			depth:        len(elementStack),
			parentIndex:  xmlParentIndex(elementStack),
			elementIndex: -1,
			kind:         xmlPresentationMarkup,
		}

		switch value := token.(type) {
		case xml.StartElement:
			if len(elementStack) == 0 {
				if rootSeen || rootClosed {
					return xmlPresentationDocument{}, false
				}
				rootSeen = true
			} else {
				document.elements[elementStack[len(elementStack)-1]].
					hasStructuredContent = true
			}
			if len(elementStack)+1 > maxPrettyXMLNestingDepth ||
				xmlElementPreservesSpace(value) {
				return xmlPresentationDocument{}, false
			}
			record.kind = xmlPresentationStart
			record.elementIndex = len(document.elements)
			document.elements = append(
				document.elements,
				xmlPresentationElement{},
			)
			elementStack = append(elementStack, record.elementIndex)

		case xml.EndElement:
			if len(elementStack) == 0 {
				return xmlPresentationDocument{}, false
			}
			record.kind = xmlPresentationEnd
			record.depth = len(elementStack) - 1
			record.elementIndex = elementStack[len(elementStack)-1]
			elementStack = elementStack[:len(elementStack)-1]
			record.parentIndex = xmlParentIndex(elementStack)
			if len(elementStack) == 0 {
				rootClosed = true
			}

		case xml.CharData:
			record.kind = xmlPresentationText
			lexeme := raw[record.start:record.end]
			if !xmlWhitespaceOnly(lexeme) {
				if len(elementStack) == 0 {
					return xmlPresentationDocument{}, false
				}
				document.elements[elementStack[len(elementStack)-1]].
					hasText = true
			} else if len(elementStack) > 0 &&
				len(lexeme) > 0 &&
				!bytes.ContainsAny(lexeme, "\r\n") {
				// A compact space between inline children is commonly data
				// (<b>Hello</b> <i>world</i>), not source indentation.
				document.elements[elementStack[len(elementStack)-1]].
					hasInlineWhitespace = true
			}

		case xml.Comment, xml.ProcInst, xml.Directive:
			if len(elementStack) > 0 {
				document.elements[elementStack[len(elementStack)-1]].
					hasStructuredContent = true
			}
		}

		document.tokens = append(document.tokens, record)
		previousOffset = currentOffset
	}

	if !rootSeen || !rootClosed || len(elementStack) != 0 ||
		previousOffset != int64(len(raw)) {
		return xmlPresentationDocument{}, false
	}
	for _, element := range document.elements {
		// Adding indentation to mixed content can change how its text reads.
		// RawBody remains available, but the formatted view stays conservative
		// and leaves the entire document untouched in this case.
		if element.hasStructuredContent &&
			(element.hasText || element.hasInlineWhitespace) {
			return xmlPresentationDocument{}, false
		}
	}
	return document, true
}

func xmlParentIndex(stack []int) int {
	if len(stack) == 0 {
		return -1
	}
	return stack[len(stack)-1]
}

func xmlElementPreservesSpace(element xml.StartElement) bool {
	const xmlNamespace = "http://www.w3.org/XML/1998/namespace"
	for _, attribute := range element.Attr {
		if attribute.Name.Local == "space" &&
			(attribute.Name.Space == "xml" ||
				attribute.Name.Space == xmlNamespace) &&
			strings.EqualFold(strings.TrimSpace(attribute.Value), "preserve") {
			return true
		}
	}
	return false
}

func xmlWhitespaceOnly(value []byte) bool {
	for _, character := range value {
		switch character {
		case ' ', '\t', '\n', '\r':
		default:
			return false
		}
	}
	return true
}

var errPrettyBodyBudgetExceeded = errors.New(
	"formatted response body exceeds presentation budget",
)

type boundedPrettyBodyBuffer struct {
	bytes.Buffer
	remaining int64
}

func newBoundedPrettyBodyBuffer(limit int64) *boundedPrettyBodyBuffer {
	return &boundedPrettyBodyBuffer{remaining: limit}
}

func (buffer *boundedPrettyBodyBuffer) Write(value []byte) (int, error) {
	if int64(len(value)) > buffer.remaining {
		return 0, errPrettyBodyBudgetExceeded
	}
	written, err := buffer.Buffer.Write(value)
	buffer.remaining -= int64(written)
	return written, err
}

func renderXMLDocument(
	raw []byte,
	document xmlPresentationDocument,
) (string, bool) {
	formatted := newBoundedPrettyBodyBuffer(maxPrettyXMLBytes)
	wroteContent := false

	for _, token := range document.tokens {
		lexeme := raw[token.start:token.end]
		if len(lexeme) == 0 {
			// encoding/xml emits a synthetic zero-width EndElement for <x/>.
			continue
		}

		switch token.kind {
		case xmlPresentationText:
			if xmlWhitespaceOnly(lexeme) &&
				(token.parentIndex < 0 ||
					document.elements[token.parentIndex].
						hasStructuredContent) {
				continue
			}

		case xmlPresentationStart:
			if token.parentIndex >= 0 {
				if document.elements[token.parentIndex].
					hasStructuredContent &&
					!writeXMLIndent(formatted, token.depth) {
					return "", false
				}
			} else if wroteContent &&
				!writeXMLIndent(formatted, token.depth) {
				return "", false
			}

		case xmlPresentationEnd:
			if document.elements[token.elementIndex].
				hasStructuredContent &&
				!writeXMLIndent(formatted, token.depth) {
				return "", false
			}

		case xmlPresentationMarkup:
			if token.parentIndex >= 0 {
				if !writeXMLIndent(formatted, token.depth) {
					return "", false
				}
			} else if wroteContent &&
				!writeXMLIndent(formatted, token.depth) {
				return "", false
			}
		}

		if _, err := formatted.Write(lexeme); err != nil {
			return "", false
		}
		wroteContent = true
	}

	return formatted.String(), wroteContent
}

func writeXMLIndent(
	output *boundedPrettyBodyBuffer,
	depth int,
) bool {
	if _, err := output.Write([]byte{'\n'}); err != nil {
		return false
	}
	if depth == 0 {
		return true
	}
	indent := bytes.Repeat([]byte{' '}, depth*2)
	_, err := output.Write(indent)
	return err == nil
}

// prettyJSONWithinBudget estimates json.Indent's expansion before allocating
// its destination. Structural characters inside JSON strings are ignored.
func prettyJSONWithinBudget(raw []byte) bool {
	if int64(len(raw)) > maxPrettyJSONBytes {
		return false
	}
	estimatedBytes := int64(len(raw))
	depth := 0
	inString := false
	escaped := false
	for _, character := range raw {
		if inString {
			switch {
			case escaped:
				escaped = false
			case character == '\\':
				escaped = true
			case character == '"':
				inString = false
			}
			continue
		}
		if character == '"' {
			inString = true
			continue
		}

		switch character {
		case '{', '[':
			depth++
			if depth > maxPrettyJSONNestingDepth {
				return false
			}
			estimatedBytes += 1 + int64(depth*2)
		case ',':
			estimatedBytes += 1 + int64(depth*2)
		case '}', ']':
			if depth > 0 {
				depth--
			}
			estimatedBytes += 1 + int64(depth*2)
		}
		if estimatedBytes > maxPrettyJSONBytes {
			return false
		}
	}
	return true
}
