// Package openapilint performs bounded, deterministic linting for OpenAPI
// documents without requiring callers to construct an OpenAPI model.
package openapilint

import (
	"fmt"
	"io"
	"mime"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
)

const (
	// MaxDocumentBytes is the largest document accepted by LintBytes and
	// LintFile.
	MaxDocumentBytes = 16 << 20
	// DefaultMaxIssues is used when Options.MaxIssues is not positive.
	DefaultMaxIssues = 200
	// MaxIssueLimit bounds retained issues even when a caller asks for more.
	MaxIssueLimit = 1_000
)

const (
	CodeDocumentTooLarge           = "document.too_large"
	CodeDocumentParse              = "document.parse"
	CodeDocumentInvalid            = "document.invalid"
	CodeOperationIDMissing         = "operation.operation_id.missing"
	CodeOperationIDDuplicate       = "operation.operation_id.duplicate"
	CodeOperationSummaryMissing    = "operation.summary.missing"
	CodeOperationTagsMissing       = "operation.tags.missing"
	CodeOperationResponsesMissing  = "operation.responses.missing"
	CodeOperationSuccessMissing    = "operation.responses.2xx_missing"
	CodeJSONResponseSchemaMissing  = "response.json.schema_missing"
	CodeJSONResponseExampleMissing = "response.json.example_missing"
)

// Severity describes the impact of a lint issue.
type Severity string

const (
	SeverityError   Severity = "error"
	SeverityWarning Severity = "warning"
	SeverityInfo    Severity = "info"
)

// Options controls bounded report generation.
type Options struct {
	// MaxIssues limits retained issues. Values above MaxIssueLimit are clamped;
	// zero and negative values use DefaultMaxIssues.
	MaxIssues int `json:"maxIssues,omitempty"`
}

// Issue is one deterministic lint finding. Path uses JSON Pointer fragment
// notation, with "#" representing the document root.
type Issue struct {
	Code     string   `json:"code"`
	Severity Severity `json:"severity"`
	Path     string   `json:"path"`
	Message  string   `json:"message"`
	Hint     string   `json:"hint,omitempty"`
}

// Summary contains document and severity counts. Total counts every detected
// issue, including issues omitted from a truncated report.
type Summary struct {
	Paths      int `json:"paths"`
	Operations int `json:"operations"`
	Total      int `json:"total"`
	Errors     int `json:"errors"`
	Warnings   int `json:"warnings"`
	Infos      int `json:"infos"`
}

// Report is the bounded result of one lint run.
type Report struct {
	Issues    []Issue `json:"issues"`
	Summary   Summary `json:"summary"`
	Truncated bool    `json:"truncated"`
}

// LintFile reads and lints one YAML or JSON OpenAPI document. Parsing,
// validation, and size failures are returned as structured issues. The error
// result is reserved for file-system read failures.
func LintFile(path string, options Options) (Report, error) {
	file, err := os.Open(path)
	if err != nil {
		return Report{}, fmt.Errorf("open OpenAPI document: %w", err)
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, MaxDocumentBytes+1))
	if err != nil {
		return Report{}, fmt.Errorf("read OpenAPI document: %w", err)
	}
	return LintBytes(data, options), nil
}

// LintBytes lints one YAML or JSON OpenAPI document. All document failures are
// represented in the returned report.
func LintBytes(data []byte, options Options) Report {
	collector := newIssueCollector(options)
	if len(data) > MaxDocumentBytes {
		collector.add(Issue{
			Code:     CodeDocumentTooLarge,
			Severity: SeverityError,
			Path:     "#",
			Message: fmt.Sprintf(
				"OpenAPI belgesi %d byte sınırını aşıyor.",
				MaxDocumentBytes,
			),
			Hint: "Dosyayı küçültün veya yalnız gerekli path ve component tanımlarını bırakın.",
		})
		return collector.report
	}

	loader := openapi3.NewLoader()
	document, err := loader.LoadFromData(data)
	if err != nil {
		collector.add(Issue{
			Code:     CodeDocumentParse,
			Severity: SeverityError,
			Path:     "#",
			Message:  "OpenAPI YAML/JSON belgesi ayrıştırılamadı: " + compactError(err),
			Hint:     "YAML/JSON sözdizimini ve $ref hedeflerini kontrol edin.",
		})
		return collector.report
	}
	if err := document.Validate(loader.Context); err != nil {
		collector.add(Issue{
			Code:     CodeDocumentInvalid,
			Severity: SeverityError,
			Path:     "#",
			Message:  "OpenAPI belgesi doğrulanamadı: " + compactError(err),
			Hint:     "OpenAPI sürümünün zorunlu alanlarını ve referanslarını kontrol edin.",
		})
	}

	lintDocument(document, collector)
	return collector.report
}

type issueCollector struct {
	limit  int
	report Report
}

func newIssueCollector(options Options) *issueCollector {
	limit := options.MaxIssues
	if limit <= 0 {
		limit = DefaultMaxIssues
	}
	if limit > MaxIssueLimit {
		limit = MaxIssueLimit
	}
	return &issueCollector{
		limit: limit,
		report: Report{
			Issues: make([]Issue, 0, min(limit, 32)),
		},
	}
}

func (collector *issueCollector) add(issue Issue) {
	collector.report.Summary.Total++
	switch issue.Severity {
	case SeverityError:
		collector.report.Summary.Errors++
	case SeverityWarning:
		collector.report.Summary.Warnings++
	case SeverityInfo:
		collector.report.Summary.Infos++
	}
	if len(collector.report.Issues) < collector.limit {
		collector.report.Issues = append(collector.report.Issues, issue)
		return
	}
	collector.report.Truncated = true
}

func lintDocument(document *openapi3.T, collector *issueCollector) {
	if document == nil || document.Paths == nil {
		return
	}
	paths := document.Paths.Map()
	pathNames := sortedKeys(paths)
	collector.report.Summary.Paths = len(pathNames)
	operationIDs := make(map[string]string)

	for _, pathName := range pathNames {
		pathItem := paths[pathName]
		if pathItem == nil {
			continue
		}
		operations := pathItem.Operations()
		methods := sortedKeys(operations)
		for _, method := range methods {
			operation := operations[method]
			if operation == nil {
				continue
			}
			collector.report.Summary.Operations++
			lintOperation(
				strings.ToLower(method),
				pathName,
				operation,
				operationIDs,
				collector,
			)
		}
	}
}

func lintOperation(
	method string,
	pathName string,
	operation *openapi3.Operation,
	operationIDs map[string]string,
	collector *issueCollector,
) {
	operationPath := jsonPointer("paths", pathName, method)
	displayName := strings.ToUpper(method) + " " + pathName
	operationID := strings.TrimSpace(operation.OperationID)
	if operationID == "" {
		collector.add(Issue{
			Code:     CodeOperationIDMissing,
			Severity: SeverityWarning,
			Path:     operationPath + "/operationId",
			Message:  displayName + " işlemi operationId tanımlamıyor.",
			Hint:     "SDK ve istemci üretimi için benzersiz, kararlı bir operationId ekleyin.",
		})
	} else if firstPath, exists := operationIDs[operationID]; exists {
		collector.add(Issue{
			Code:     CodeOperationIDDuplicate,
			Severity: SeverityError,
			Path:     operationPath + "/operationId",
			Message: fmt.Sprintf(
				"operationId %q birden fazla işlemde kullanılıyor.",
				operationID,
			),
			Hint: "Benzersiz bir operationId kullanın. İlk kullanım: " + firstPath + ".",
		})
	} else {
		operationIDs[operationID] = operationPath + "/operationId"
	}

	if strings.TrimSpace(operation.Summary) == "" {
		collector.add(Issue{
			Code:     CodeOperationSummaryMissing,
			Severity: SeverityWarning,
			Path:     operationPath + "/summary",
			Message:  displayName + " işlemi kısa bir summary tanımlamıyor.",
			Hint:     "İşlemin amacını tek cümlede anlatan kısa bir summary ekleyin.",
		})
	}
	if !hasNonBlankTag(operation.Tags) {
		collector.add(Issue{
			Code:     CodeOperationTagsMissing,
			Severity: SeverityWarning,
			Path:     operationPath + "/tags",
			Message:  displayName + " işlemi bir tag ile gruplandırılmamış.",
			Hint:     "API tarayıcılarında tutarlı gruplama için en az bir tag ekleyin.",
		})
	}

	responses := operation.Responses
	if responses == nil || responses.Len() == 0 {
		collector.add(Issue{
			Code:     CodeOperationResponsesMissing,
			Severity: SeverityError,
			Path:     operationPath + "/responses",
			Message:  displayName + " işlemi response tanımlamıyor.",
			Hint:     "En az bir HTTP response kodu ve açıklaması ekleyin.",
		})
		return
	}
	if !hasSuccessResponse(responses) {
		collector.add(Issue{
			Code:     CodeOperationSuccessMissing,
			Severity: SeverityWarning,
			Path:     operationPath + "/responses",
			Message:  displayName + " yanıtlarında 2xx başarı response’u yok.",
			Hint:     "Başarılı akışı belgeleyen açık bir 2xx veya 2XX response ekleyin.",
		})
	}
	lintJSONResponses(operationPath, displayName, responses, collector)
}

func lintJSONResponses(
	operationPath string,
	displayName string,
	responses *openapi3.Responses,
	collector *issueCollector,
) {
	responseMap := responses.Map()
	for _, status := range sortedKeys(responseMap) {
		responseRef := responseMap[status]
		if responseRef == nil || responseRef.Value == nil {
			continue
		}
		content := responseRef.Value.Content
		for _, contentType := range sortedKeys(content) {
			if !isJSONContentType(contentType) {
				continue
			}
			media := content[contentType]
			contentPath := operationPath + jsonPointerTail(
				"responses",
				status,
				"content",
				contentType,
			)
			var schema *openapi3.SchemaRef
			if media != nil {
				schema = media.Schema
			}
			if !hasSchema(schema) {
				collector.add(Issue{
					Code:     CodeJSONResponseSchemaMissing,
					Severity: SeverityWarning,
					Path:     contentPath + "/schema",
					Message: fmt.Sprintf(
						"%s %s %s response’u schema tanımlamıyor.",
						displayName,
						status,
						contentType,
					),
					Hint: "JSON response gövdesinin tipini ve alanlarını açıklayan bir schema ekleyin.",
				})
			}
			if media == nil || !hasExample(media) {
				collector.add(Issue{
					Code:     CodeJSONResponseExampleMissing,
					Severity: SeverityInfo,
					Path:     contentPath + "/example",
					Message: fmt.Sprintf(
						"%s %s %s response’u örnek değer içermiyor.",
						displayName,
						status,
						contentType,
					),
					Hint: "Media type veya schema üzerinde gerçekçi bir example tanımlayın.",
				})
			}
		}
	}
}

func hasNonBlankTag(tags []string) bool {
	for _, tag := range tags {
		if strings.TrimSpace(tag) != "" {
			return true
		}
	}
	return false
}

func hasSuccessResponse(responses *openapi3.Responses) bool {
	for status := range responses.Map() {
		normalized := strings.ToUpper(strings.TrimSpace(status))
		if normalized == "2XX" {
			return true
		}
		code, err := strconv.Atoi(normalized)
		if err == nil && code >= 200 && code <= 299 {
			return true
		}
	}
	return false
}

func isJSONContentType(value string) bool {
	contentType, _, err := mime.ParseMediaType(strings.TrimSpace(value))
	if err != nil {
		contentType = strings.TrimSpace(strings.SplitN(value, ";", 2)[0])
	}
	contentType = strings.ToLower(contentType)
	return contentType == "application/json" || strings.HasSuffix(contentType, "+json")
}

func hasSchema(schema *openapi3.SchemaRef) bool {
	return schema != nil && (schema.Value != nil || strings.TrimSpace(schema.Ref) != "")
}

func hasExample(media *openapi3.MediaType) bool {
	if media.Example != nil || len(media.Examples) > 0 {
		return true
	}
	return media.Schema != nil &&
		media.Schema.Value != nil &&
		media.Schema.Value.Example != nil
}

func sortedKeys[T any](values map[string]T) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func jsonPointer(parts ...string) string {
	return "#" + jsonPointerTail(parts...)
}

func jsonPointerTail(parts ...string) string {
	var builder strings.Builder
	for _, part := range parts {
		builder.WriteByte('/')
		builder.WriteString(
			strings.ReplaceAll(
				strings.ReplaceAll(part, "~", "~0"),
				"/",
				"~1",
			),
		)
	}
	return builder.String()
}

func compactError(err error) string {
	return strings.Join(strings.Fields(err.Error()), " ")
}
