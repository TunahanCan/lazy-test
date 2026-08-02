package canbridge

import (
	"sort"
	"strings"
)

// userErrorDefinition keeps legacy Turkish fallbacks in one backend catalog.
// Current clients render MessageKey and Params from their locale catalog;
// Title, Message, and Hint remain populated for backward compatibility.
type userErrorDefinition struct {
	Code       UserErrorCode
	MessageKey string
	Title      string
	Message    string
	Hint       string
}

func newUserError(
	definition userErrorDefinition,
	params UserErrorParams,
	err error,
) *UserError {
	result := &UserError{
		Code:       definition.Code,
		MessageKey: definition.MessageKey,
		Params:     cloneUserErrorParams(params),
		Title:      renderUserErrorText(definition.Title, params),
		Message:    renderUserErrorText(definition.Message, params),
		Hint:       renderUserErrorText(definition.Hint, params),
	}
	if err != nil {
		result.Technical = err.Error()
	}
	return result
}

func cloneUserErrorParams(params UserErrorParams) UserErrorParams {
	if len(params) == 0 {
		return nil
	}
	cloned := make(UserErrorParams, len(params))
	for key, value := range params {
		cloned[key] = value
	}
	return cloned
}

func renderUserErrorText(template string, params UserErrorParams) string {
	if template == "" || len(params) == 0 {
		return template
	}
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys)*2)
	for _, key := range keys {
		parts = append(parts, "{"+key+"}", params[key])
	}
	return strings.NewReplacer(parts...).Replace(template)
}
