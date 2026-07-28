package openapilint

import (
	"fmt"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
)

type operationRuleID string

const (
	ruleOperationID       operationRuleID = "operation-id"
	ruleOperationSummary  operationRuleID = "operation-summary"
	ruleOperationTags     operationRuleID = "operation-tags"
	ruleOperationResponse operationRuleID = "operation-responses"
	ruleSuccessResponse   operationRuleID = "success-response"
	ruleJSONResponse      operationRuleID = "json-response"
)

type operationRuleContext struct {
	operationPath string
	displayName   string
	operation     *openapi3.Operation
	operationIDs  map[string]string
}

type operationRuleDefinition struct {
	id   operationRuleID
	lint func(operationRuleContext, *issueCollector)
}

type operationRuleCatalog struct {
	ordered []operationRuleDefinition
}

func newOperationRuleCatalog(
	rules ...operationRuleDefinition,
) (operationRuleCatalog, error) {
	catalog := operationRuleCatalog{
		ordered: append([]operationRuleDefinition(nil), rules...),
	}
	seen := make(map[operationRuleID]struct{}, len(rules))
	for index, rule := range catalog.ordered {
		if strings.TrimSpace(string(rule.id)) == "" {
			return operationRuleCatalog{}, fmt.Errorf(
				"operation rule %d has no id",
				index,
			)
		}
		if rule.lint == nil {
			return operationRuleCatalog{}, fmt.Errorf(
				"operation rule %q has no strategy",
				rule.id,
			)
		}
		if _, duplicate := seen[rule.id]; duplicate {
			return operationRuleCatalog{}, fmt.Errorf(
				"duplicate operation rule %q",
				rule.id,
			)
		}
		seen[rule.id] = struct{}{}
	}
	return catalog, nil
}

func mustOperationRuleCatalog(
	rules ...operationRuleDefinition,
) operationRuleCatalog {
	catalog, err := newOperationRuleCatalog(rules...)
	if err != nil {
		panic("invalid OpenAPI lint rule registry: " + err.Error())
	}
	return catalog
}

// defaultOperationRules is ordered deliberately so reports stay deterministic.
// Adding an operation rule requires one descriptor here; traversal, counting,
// truncation, and cancellation remain engine responsibilities.
var defaultOperationRules = mustOperationRuleCatalog(
	operationRuleDefinition{id: ruleOperationID, lint: lintOperationID},
	operationRuleDefinition{id: ruleOperationSummary, lint: lintOperationSummary},
	operationRuleDefinition{id: ruleOperationTags, lint: lintOperationTags},
	operationRuleDefinition{id: ruleOperationResponse, lint: lintOperationResponses},
	operationRuleDefinition{id: ruleSuccessResponse, lint: lintOperationSuccessResponse},
	operationRuleDefinition{id: ruleJSONResponse, lint: lintOperationJSONResponses},
)

func lintOperationID(
	context operationRuleContext,
	collector *issueCollector,
) {
	operationID := strings.TrimSpace(context.operation.OperationID)
	if operationID == "" {
		collector.add(Issue{
			Code:     CodeOperationIDMissing,
			Severity: SeverityWarning,
			Path:     context.operationPath + "/operationId",
			Message:  context.displayName + " işlemi operationId tanımlamıyor.",
			Hint:     "SDK ve istemci üretimi için benzersiz, kararlı bir operationId ekleyin.",
		})
		return
	}
	if firstPath, exists := context.operationIDs[operationID]; exists {
		collector.add(Issue{
			Code:     CodeOperationIDDuplicate,
			Severity: SeverityError,
			Path:     context.operationPath + "/operationId",
			Message: fmt.Sprintf(
				"operationId %q birden fazla işlemde kullanılıyor.",
				operationID,
			),
			Hint: "Benzersiz bir operationId kullanın. İlk kullanım: " +
				firstPath + ".",
		})
		return
	}
	context.operationIDs[operationID] =
		context.operationPath + "/operationId"
}

func lintOperationSummary(
	context operationRuleContext,
	collector *issueCollector,
) {
	if strings.TrimSpace(context.operation.Summary) != "" {
		return
	}
	collector.add(Issue{
		Code:     CodeOperationSummaryMissing,
		Severity: SeverityWarning,
		Path:     context.operationPath + "/summary",
		Message:  context.displayName + " işlemi kısa bir summary tanımlamıyor.",
		Hint:     "İşlemin amacını tek cümlede anlatan kısa bir summary ekleyin.",
	})
}

func lintOperationTags(
	context operationRuleContext,
	collector *issueCollector,
) {
	if hasNonBlankTag(context.operation.Tags) {
		return
	}
	collector.add(Issue{
		Code:     CodeOperationTagsMissing,
		Severity: SeverityWarning,
		Path:     context.operationPath + "/tags",
		Message:  context.displayName + " işlemi bir tag ile gruplandırılmamış.",
		Hint:     "API tarayıcılarında tutarlı gruplama için en az bir tag ekleyin.",
	})
}

func lintOperationResponses(
	context operationRuleContext,
	collector *issueCollector,
) {
	responses := context.operation.Responses
	if responses != nil && responses.Len() > 0 {
		return
	}
	collector.add(Issue{
		Code:     CodeOperationResponsesMissing,
		Severity: SeverityError,
		Path:     context.operationPath + "/responses",
		Message:  context.displayName + " işlemi response tanımlamıyor.",
		Hint:     "En az bir HTTP response kodu ve açıklaması ekleyin.",
	})
}

func lintOperationSuccessResponse(
	context operationRuleContext,
	collector *issueCollector,
) {
	responses := context.operation.Responses
	if responses == nil || responses.Len() == 0 ||
		hasSuccessResponse(responses) {
		return
	}
	collector.add(Issue{
		Code:     CodeOperationSuccessMissing,
		Severity: SeverityWarning,
		Path:     context.operationPath + "/responses",
		Message:  context.displayName + " yanıtlarında 2xx başarı response’u yok.",
		Hint:     "Başarılı akışı belgeleyen açık bir 2xx veya 2XX response ekleyin.",
	})
}

func lintOperationJSONResponses(
	context operationRuleContext,
	collector *issueCollector,
) {
	responses := context.operation.Responses
	if responses == nil || responses.Len() == 0 {
		return
	}
	lintJSONResponses(
		context.operationPath,
		context.displayName,
		responses,
		collector,
	)
}
