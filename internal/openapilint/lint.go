// Package openapilint performs bounded, deterministic linting for OpenAPI
// documents without requiring callers to construct an OpenAPI model.
package openapilint

import (
	"context"
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/getkin/kin-openapi/openapi3"

	"validex/internal/httpmedia"
)

const (
	// MaxDocumentBytes is the largest document accepted by LintBytes and
	// LintFile.
	MaxDocumentBytes = 16 << 20
	// DefaultMaxIssues is used when Options.MaxIssues is not positive.
	DefaultMaxIssues = 200
	// MaxIssueLimit bounds retained issues even when a caller asks for more.
	MaxIssueLimit = 1_000
	// DefaultMaxIssueBytes bounds aggregate retained issue text.
	DefaultMaxIssueBytes = 4 << 20
	// MaxIssueBytes is the hard aggregate text budget accepted from callers.
	MaxIssueBytes = 16 << 20

	maxIssuePathBytes    = 8 << 10
	maxIssueMessageBytes = 16 << 10
	maxIssueHintBytes    = 16 << 10
	maxIssueDisplayBytes = 4 << 10
)

// Code is the stable machine-readable identity of a lint rule or document
// failure. JSON representation remains a string.
type Code string

const (
	CodeDocumentTooLarge           Code = "document.too_large"
	CodeDocumentParse              Code = "document.parse"
	CodeDocumentInvalid            Code = "document.invalid"
	CodeOperationIDMissing         Code = "operation.operation_id.missing"
	CodeOperationIDDuplicate       Code = "operation.operation_id.duplicate"
	CodeOperationSummaryMissing    Code = "operation.summary.missing"
	CodeOperationTagsMissing       Code = "operation.tags.missing"
	CodeOperationResponsesMissing  Code = "operation.responses.missing"
	CodeOperationSuccessMissing    Code = "operation.responses.2xx_missing"
	CodeJSONResponseSchemaMissing  Code = "response.json.schema_missing"
	CodeJSONResponseExampleMissing Code = "response.json.example_missing"
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
	// MaxIssueBytes limits aggregate retained issue text. Values above
	// MaxIssueBytes are clamped; zero and negative values use the default.
	MaxIssueBytes int `json:"maxIssueBytes,omitempty"`
}

// Issue is one deterministic lint finding. Path uses JSON Pointer fragment
// notation, with "#" representing the document root.
type Issue struct {
	Code     Code     `json:"code"`
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
	return LintFileContext(context.Background(), path, options)
}

// LintFileContext is LintFile with cooperative cancellation between bounded
// read, parse, validation, traversal, and rule phases.
func LintFileContext(
	ctx context.Context,
	path string,
	options Options,
) (Report, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return Report{}, err
	}
	file, err := os.Open(path)
	if err != nil {
		return Report{}, fmt.Errorf("open OpenAPI document: %w", err)
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, MaxDocumentBytes+1))
	if err != nil {
		return Report{}, fmt.Errorf("read OpenAPI document: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return Report{}, err
	}
	return LintBytesContext(ctx, data, options)
}

// LintBytes lints one YAML or JSON OpenAPI document. All document failures are
// represented in the returned report.
func LintBytes(data []byte, options Options) Report {
	report, _ := LintBytesContext(context.Background(), data, options)
	return report
}

// LintBytesContext executes the deterministic lint engine in the caller's
// goroutine. Cancellation is returned as an operational error; syntax and
// OpenAPI validation failures remain structured issues.
func LintBytesContext(
	ctx context.Context,
	data []byte,
	options Options,
) (Report, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return Report{}, err
	}
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
		return collector.report, nil
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
		return collector.report, nil
	}
	if err := ctx.Err(); err != nil {
		return Report{}, err
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
	if err := ctx.Err(); err != nil {
		return Report{}, err
	}

	if err := lintDocument(ctx, document, collector); err != nil {
		return Report{}, err
	}
	return collector.report, nil
}

type issueCollector struct {
	limit         int
	byteLimit     int
	retainedBytes int
	report        Report
}

func newIssueCollector(options Options) *issueCollector {
	limit := options.MaxIssues
	if limit <= 0 {
		limit = DefaultMaxIssues
	}
	if limit > MaxIssueLimit {
		limit = MaxIssueLimit
	}
	byteLimit := options.MaxIssueBytes
	if byteLimit <= 0 {
		byteLimit = DefaultMaxIssueBytes
	}
	if byteLimit > MaxIssueBytes {
		byteLimit = MaxIssueBytes
	}
	return &issueCollector{
		limit:     limit,
		byteLimit: byteLimit,
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
	issue.Path = truncateIssueText(issue.Path, maxIssuePathBytes)
	issue.Message = truncateIssueText(issue.Message, maxIssueMessageBytes)
	issue.Hint = truncateIssueText(issue.Hint, maxIssueHintBytes)
	retainedBytes := len(issue.Code) + len(issue.Severity) +
		len(issue.Path) + len(issue.Message) + len(issue.Hint)
	if len(collector.report.Issues) < collector.limit &&
		retainedBytes <= collector.byteLimit-collector.retainedBytes {
		collector.report.Issues = append(collector.report.Issues, issue)
		collector.retainedBytes += retainedBytes
		return
	}
	collector.report.Truncated = true
}

func lintDocument(
	ctx context.Context,
	document *openapi3.T,
	collector *issueCollector,
) error {
	if document == nil || document.Paths == nil {
		return nil
	}
	paths := document.Paths.Map()
	pathNames := sortedKeys(paths)
	collector.report.Summary.Paths = len(pathNames)
	operationIDs := make(map[string]string)

	for _, pathName := range pathNames {
		if err := ctx.Err(); err != nil {
			return err
		}
		pathItem := paths[pathName]
		if pathItem == nil {
			continue
		}
		operations := pathItem.Operations()
		methods := sortedKeys(operations)
		for _, method := range methods {
			if err := ctx.Err(); err != nil {
				return err
			}
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
	return nil
}

func lintOperation(
	method string,
	pathName string,
	operation *openapi3.Operation,
	operationIDs map[string]string,
	collector *issueCollector,
) {
	operationPath := jsonPointer("paths", pathName, method)
	displayName := truncateIssueText(
		strings.ToUpper(method)+" "+pathName,
		maxIssueDisplayBytes,
	)
	context := operationRuleContext{
		operationPath: operationPath,
		displayName:   displayName,
		operation:     operation,
		operationIDs:  operationIDs,
	}
	for _, rule := range defaultOperationRules.ordered {
		rule.lint(context, collector)
	}
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
	return httpmedia.IsJSON(value)
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
	return strings.Join(
		strings.Fields(
			truncateIssueText(err.Error(), maxIssueMessageBytes),
		),
		" ",
	)
}

func truncateIssueText(value string, maximumBytes int) string {
	if maximumBytes < 1 {
		return ""
	}
	if len(value) <= maximumBytes {
		return value
	}
	const suffix = "…"
	limit := maximumBytes - len(suffix)
	for limit > 0 && !utf8.RuneStart(value[limit]) {
		limit--
	}
	return value[:limit] + suffix
}
