package runner

import (
	"fmt"
	"net/url"
	"sort"
	"strings"

	"validex/internal/httpexec"
	"validex/internal/requesttemplate"
)

type preparationError struct {
	failure Failure
}

func (e *preparationError) Error() string {
	return e.failure.Message
}

func prepareRequest(request Request, variables map[string]string, limits Limits) (PreparedRequest, error) {
	scopedVariables := mergeVariables(variables, request.Variables)
	if err := validateVariables("request", scopedVariables); err != nil {
		return PreparedRequest{}, invalidRequest(err.Error())
	}

	method := strings.ToUpper(strings.TrimSpace(request.Method))
	if len(method) > maxMethodBytes || !validHTTPToken(method) {
		return PreparedRequest{}, invalidRequest("HTTP method is invalid")
	}

	missing := make(map[string]struct{})
	resolvedURL := request.URL
	var err error
	if !request.LiteralValues {
		var urlMissing []string
		resolvedURL, urlMissing, err = requesttemplate.Resolve(
			request.URL,
			scopedVariables,
			requesttemplate.Options{MaxBytes: maxURLBytes},
		)
		if err != nil {
			return PreparedRequest{}, invalidRequest("request URL " + err.Error())
		}
		addMissing(missing, urlMissing)
	} else if int64(len(resolvedURL)) > maxURLBytes {
		return PreparedRequest{}, invalidRequest(
			fmt.Sprintf("request URL exceeds %d bytes", maxURLBytes),
		)
	}

	resolvedBody := request.Body
	if !request.LiteralValues {
		var bodyMissing []string
		resolvedBody, bodyMissing, err = requesttemplate.Resolve(
			request.Body,
			scopedVariables,
			requesttemplate.Options{MaxBytes: limits.MaxRequestBodyBytes},
		)
		if err != nil {
			return PreparedRequest{}, &preparationError{failure: Failure{
				Code:    FailureRequestBodyTooLarge,
				Message: fmt.Sprintf("Request body exceeds %d bytes after variable interpolation.", limits.MaxRequestBodyBytes),
				Hint:    "Reduce the body or interpolated variable values.",
			}}
		}
		addMissing(missing, bodyMissing)
	} else if int64(len(resolvedBody)) > limits.MaxRequestBodyBytes {
		return PreparedRequest{}, &preparationError{failure: Failure{
			Code:    FailureRequestBodyTooLarge,
			Message: fmt.Sprintf("Request body exceeds %d bytes.", limits.MaxRequestBodyBytes),
			Hint:    "Reduce the body.",
		}}
	}

	headers := make([]httpexec.HeaderField, 0, len(request.Headers))
	for _, header := range request.Headers {
		if !header.Enabled {
			continue
		}
		name := header.Key
		if !validHTTPToken(name) {
			return PreparedRequest{}, invalidRequest(fmt.Sprintf("header name %q is invalid", name))
		}
		value := header.Value
		if !request.LiteralValues {
			var headerMissing []string
			value, headerMissing, err = requesttemplate.Resolve(
				header.Value,
				scopedVariables,
				requesttemplate.Options{MaxBytes: maxHeaderValueBytes},
			)
			if err != nil {
				return PreparedRequest{}, invalidRequest(fmt.Sprintf("header %q exceeds %d bytes", name, maxHeaderValueBytes))
			}
			addMissing(missing, headerMissing)
		} else if len(value) > maxHeaderValueBytes {
			return PreparedRequest{}, invalidRequest(
				fmt.Sprintf("header %q exceeds %d bytes", name, maxHeaderValueBytes),
			)
		}
		if strings.ContainsAny(value, "\r\n") {
			return PreparedRequest{}, invalidRequest(fmt.Sprintf("header %q contains a line break", name))
		}
		headers = append(headers, httpexec.HeaderField{
			Name:  name,
			Value: value,
		})
	}

	if len(missing) > 0 {
		names := make([]string, 0, len(missing))
		for name := range missing {
			names = append(names, name)
		}
		sort.Strings(names)
		return PreparedRequest{}, &preparationError{failure: Failure{
			Code:    FailureMissingVariables,
			Message: "Request has unresolved variables: " + strings.Join(names, ", ") + ".",
			Hint:    "Define them in collection, runtime, or request variables.",
		}}
	}
	parsedURL, err := url.ParseRequestURI(resolvedURL)
	if err != nil || parsedURL.Host == "" || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		return PreparedRequest{}, invalidRequest("request URL must be an absolute http:// or https:// address")
	}
	if parsedURL.User != nil {
		return PreparedRequest{}, invalidRequest("request URL cannot contain user information")
	}
	if parsedURL.Fragment != "" || strings.Contains(resolvedURL, "#") {
		return PreparedRequest{}, invalidRequest(
			"request URL cannot contain a fragment",
		)
	}
	if !httpexec.MethodAllowsBody(method) {
		resolvedBody = ""
	}
	reportURL := redactReportURL(request.URL, scopedVariables)
	if request.LiteralValues {
		reportURL = redactRawQuery(resolvedURL)
	}

	return PreparedRequest{
		ID:                  request.ID,
		Name:                request.Name,
		Method:              method,
		URL:                 resolvedURL,
		ReportURL:           reportURL,
		Headers:             headers,
		Body:                []byte(resolvedBody),
		RequestBodyLimit:    limits.MaxRequestBodyBytes,
		ResponseBodyLimit:   limits.MaxResponseBodyBytes,
		ResponseHeaderLimit: limits.MaxResponseHeaderBytes,
	}, nil
}

func redactReportURL(templateURL string, variables map[string]string) string {
	redactedVariables := make(map[string]string, len(variables))
	for name := range variables {
		// Variable names are user-defined, so every URL substitution is treated
		// as potentially sensitive instead of relying on naming heuristics.
		redactedVariables[name] = "REDACTED"
	}
	redacted, missing, err := requesttemplate.Resolve(
		templateURL,
		redactedVariables,
		requesttemplate.Options{MaxBytes: maxURLBytes},
	)
	if err != nil || len(missing) > 0 {
		redacted = templateURL
	}

	parsed, err := url.Parse(redacted)
	if err != nil {
		return redactRawQuery(redacted)
	}
	parsed.RawQuery = redactRawQueryValues(parsed.RawQuery)
	return parsed.String()
}

func redactRawQuery(rawURL string) string {
	queryStart := strings.IndexByte(rawURL, '?')
	if queryStart < 0 {
		return rawURL
	}
	fragmentStart := strings.IndexByte(rawURL[queryStart+1:], '#')
	if fragmentStart < 0 {
		return rawURL[:queryStart+1] + redactRawQueryValues(rawURL[queryStart+1:])
	}
	fragmentStart += queryStart + 1
	return rawURL[:queryStart+1] +
		redactRawQueryValues(rawURL[queryStart+1:fragmentStart]) +
		rawURL[fragmentStart:]
}

func redactRawQueryValues(rawQuery string) string {
	if rawQuery == "" {
		return ""
	}
	parts := strings.Split(rawQuery, "&")
	for index, part := range parts {
		name, _, found := strings.Cut(part, "=")
		if found {
			parts[index] = name + "=REDACTED"
			continue
		}
		parts[index] = part + "=REDACTED"
	}
	return strings.Join(parts, "&")
}

func mergeVariables(scopes ...map[string]string) map[string]string {
	size := 0
	for _, scope := range scopes {
		size += len(scope)
	}
	result := make(map[string]string, size)
	for _, scope := range scopes {
		for name, value := range scope {
			result[name] = value
		}
	}
	return result
}

func validateVariables(scope string, variables map[string]string) error {
	if len(variables) > maxVariables {
		return fmt.Errorf("%s has %d variables; maximum is %d", scope, len(variables), maxVariables)
	}
	names := make([]string, 0, len(variables))
	for name := range variables {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		if !validVariableName(name) {
			return fmt.Errorf("%s variable name %q is invalid", scope, name)
		}
	}
	return nil
}

func validVariableName(name string) bool {
	if name == "" || len(name) > 128 {
		return false
	}
	for index, character := range name {
		if index == 0 {
			if !(character >= 'a' && character <= 'z' ||
				character >= 'A' && character <= 'Z' ||
				character == '_') {
				return false
			}
			continue
		}
		if !(character >= 'a' && character <= 'z' ||
			character >= 'A' && character <= 'Z' ||
			character >= '0' && character <= '9' ||
			character == '_' || character == '.' || character == '-') {
			return false
		}
	}
	return true
}

func validHTTPToken(value string) bool {
	if value == "" {
		return false
	}
	for _, character := range value {
		if character >= 'a' && character <= 'z' ||
			character >= 'A' && character <= 'Z' ||
			character >= '0' && character <= '9' ||
			strings.ContainsRune("!#$%&'*+-.^_`|~", character) {
			continue
		}
		return false
	}
	return true
}

func addMissing(destination map[string]struct{}, names []string) {
	for _, name := range names {
		destination[name] = struct{}{}
	}
}

func invalidRequest(message string) error {
	return &preparationError{failure: Failure{
		Code:    FailureInvalidRequest,
		Message: message + ".",
		Hint:    "Check the request method, URL, headers, and variables.",
	}}
}
