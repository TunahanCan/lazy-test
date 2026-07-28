package runner

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"time"

	"validex/internal/assertions"
	"validex/internal/httpexec"
)

// Run executes requests sequentially. Transport and assertion failures are
// retained in Report; invalid options/collections and parent cancellation are
// returned as errors alongside the report completed so far.
func Run(
	ctx context.Context,
	collection Collection,
	sender Sender,
	options Options,
) (Report, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if sender == nil {
		return Report{}, fmt.Errorf("runner sender is required")
	}
	limits, err := normalizeLimits(options.Limits)
	if err != nil {
		return Report{}, err
	}
	started := time.Now()
	report := Report{
		Name:      collection.Name,
		StartedAt: started.UTC().Format(time.RFC3339Nano),
		Results:   make([]RequestResult, 0, len(collection.Requests)),
	}
	if err := validateCollection(collection, limits); err != nil {
		finishReport(&report, started)
		return report, err
	}
	if err := validateVariables("runtime", options.Variables); err != nil {
		finishReport(&report, started)
		return report, err
	}

	baseVariables := mergeVariables(collection.Variables, options.Variables)
	remainingReportBodyBytes := limits.MaxReportBodyBytes
	remainingReportHeaderBytes := limits.MaxReportHeaderBytes

	for _, request := range collection.Requests {
		if err := ctx.Err(); err != nil {
			finishReport(&report, started)
			return report, err
		}
		result := RequestResult{
			ID:         request.ID,
			Name:       request.Name,
			Method:     request.Method,
			URL:        request.URL,
			Assertions: []assertions.Result{},
		}

		prepared, prepareErr := prepareRequest(request, baseVariables, limits)
		if prepareErr != nil {
			result.Failure = failureFromPreparation(prepareErr)
			appendResult(&report, result)
			continue
		}
		result.Method = prepared.Method
		result.URL = prepared.ReportURL

		timeoutMS := request.TimeoutMS
		if timeoutMS == 0 {
			timeoutMS = limits.DefaultTimeoutMS
		}
		if timeoutMS < 1 || timeoutMS > limits.MaxTimeoutMS {
			result.Failure = &Failure{
				Code:    FailureInvalidRequest,
				Message: fmt.Sprintf("Request timeout must be between 1 and %d ms.", limits.MaxTimeoutMS),
				Hint:    "Set timeoutMs to a supported value.",
			}
			appendResult(&report, result)
			continue
		}

		requestContext, cancel := context.WithTimeout(ctx, time.Duration(timeoutMS)*time.Millisecond)
		requestStarted := time.Now()
		response, sendErr := sender.Send(requestContext, prepared)
		elapsedMS := time.Since(requestStarted).Milliseconds()
		contextErr := requestContext.Err()
		cancel()
		if response.DurationMS < 0 || response.DurationMS == 0 && elapsedMS > 0 {
			response.DurationMS = elapsedMS
		}
		result.DurationMS = response.DurationMS
		result.StatusCode = response.StatusCode
		result.Headers, result.HeadersTruncated = retainHeaders(
			response.Headers,
			&remainingReportHeaderBytes,
		)

		if parentErr := ctx.Err(); sendErr == nil && parentErr != nil {
			result.Body, result.BodyTruncated = retainBody(
				response.Body,
				&remainingReportBodyBytes,
			)
			result.Failure = failureFromSendError(
				parentErr,
				parentErr,
				timeoutMS,
				limits,
			)
			appendResult(&report, result)
			finishReport(&report, started)
			return report, parentErr
		}
		if sendErr != nil {
			result.Body, result.BodyTruncated = retainBody(
				response.Body,
				&remainingReportBodyBytes,
			)
			result.Failure = failureFromSendError(sendErr, contextErr, timeoutMS, limits)
			appendResult(&report, result)
			if err := ctx.Err(); err != nil {
				finishReport(&report, started)
				return report, err
			}
			continue
		}
		if httpexec.ResponseHeadersExceed(
			response.Headers,
			limits.MaxResponseHeaderBytes,
		) {
			result.Failure = &Failure{
				Code: FailureResponseHeadersTooLarge,
				Message: fmt.Sprintf(
					"Response headers exceed %d bytes.",
					limits.MaxResponseHeaderBytes,
				),
				Hint: "Reduce the response headers or increase the configured limit within the safe maximum.",
			}
			appendResult(&report, result)
			continue
		}
		if int64(len(response.Body)) > limits.MaxResponseBodyBytes {
			result.Body, result.BodyTruncated = retainBody(
				response.Body,
				&remainingReportBodyBytes,
			)
			result.Failure = &Failure{
				Code:    FailureResponseBodyTooLarge,
				Message: fmt.Sprintf("Response body exceeds %d bytes.", limits.MaxResponseBodyBytes),
				Hint:    "Reduce the response or increase the configured limit within the safe maximum.",
			}
			appendResult(&report, result)
			continue
		}

		result.Body, result.BodyTruncated = retainBody(
			response.Body,
			&remainingReportBodyBytes,
		)
		result.Assertions = assertions.Evaluate(assertions.Input{
			StatusCode: response.StatusCode,
			Headers:    response.Headers,
			Body:       response.Body,
			Duration:   time.Duration(response.DurationMS) * time.Millisecond,
		}, request.Assertions)
		result.Passed = allAssertionsPassed(result.Assertions)
		appendResult(&report, result)
	}

	finishReport(&report, started)
	return report, nil
}

func appendResult(report *Report, result RequestResult) {
	if result.Failure == nil && result.Passed {
		report.Passed++
	} else {
		report.Failed++
	}
	report.Results = append(report.Results, result)
}

func finishReport(report *Report, started time.Time) {
	report.DurationMS = time.Since(started).Milliseconds()
}

func allAssertionsPassed(results []assertions.Result) bool {
	for _, result := range results {
		if !result.Passed {
			return false
		}
	}
	return true
}

func failureFromPreparation(err error) *Failure {
	var preparationErr *preparationError
	if errors.As(err, &preparationErr) {
		failure := preparationErr.failure
		return &failure
	}
	return &Failure{Code: FailureInvalidRequest, Message: err.Error()}
}

func failureFromSendError(err, contextErr error, timeoutMS int, limits Limits) *Failure {
	switch {
	case errors.Is(err, httpexec.ErrInvalidRequest):
		return &Failure{
			Code:    FailureInvalidRequest,
			Message: "Request definition is not valid.",
			Hint:    "Check the method, URL, headers, and body framing.",
		}
	case errors.Is(err, ErrRequestBodyTooLarge):
		return &Failure{
			Code:    FailureRequestBodyTooLarge,
			Message: fmt.Sprintf("Request body exceeds %d bytes.", limits.MaxRequestBodyBytes),
		}
	case errors.Is(err, ErrResponseBodyTooLarge):
		return &Failure{
			Code:    FailureResponseBodyTooLarge,
			Message: fmt.Sprintf("Response body exceeds %d bytes.", limits.MaxResponseBodyBytes),
		}
	case errors.Is(err, ErrResponseHeadersTooLarge):
		return &Failure{
			Code:    FailureResponseHeadersTooLarge,
			Message: fmt.Sprintf("Response headers exceed %d bytes.", limits.MaxResponseHeaderBytes),
		}
	case errors.Is(contextErr, context.DeadlineExceeded) || errors.Is(err, context.DeadlineExceeded):
		return &Failure{
			Code:    FailureRequestTimeout,
			Message: fmt.Sprintf("Request did not complete within %d ms.", timeoutMS),
			Hint:    "Increase timeoutMs or check the target service.",
		}
	case errors.Is(contextErr, context.Canceled) || errors.Is(err, context.Canceled):
		return &Failure{
			Code:    FailureRequestCanceled,
			Message: "Request was canceled.",
		}
	case errors.Is(err, ErrUnsupportedContentEncoding):
		return &Failure{
			Code:    FailureUnsupportedEncoding,
			Message: "Response uses an unsupported Content-Encoding.",
			Hint:    "Request gzip or deflate, or update the target service response.",
		}
	case errors.Is(err, ErrTooManyContentEncodings):
		return &Failure{
			Code:    FailureTooManyEncodings,
			Message: "Response uses too many Content-Encoding layers.",
			Hint:    "Reduce the number of response compression layers.",
		}
	case errors.Is(err, ErrResponseDecodeFailed):
		return &Failure{
			Code:    FailureResponseDecodeFailed,
			Message: "Response body could not be decoded.",
			Hint:    "Check that Content-Encoding matches the response body.",
		}
	default:
		return &Failure{
			Code:    FailureSendFailed,
			Message: "Request could not be completed.",
			Hint:    "Check the URL, network, and target service.",
		}
	}
}

func retainBody(body []byte, remaining *int64) (string, bool) {
	if len(body) == 0 {
		return "", false
	}
	if remaining == nil || *remaining <= jsonStringDelimiterBytes {
		return "", true
	}
	retained, encodedBytes := jsonEscapedPrefix(
		body,
		*remaining-jsonStringDelimiterBytes,
	)
	if retained == 0 {
		return "", true
	}
	*remaining -= jsonStringDelimiterBytes + encodedBytes
	return string(body[:retained]), retained < len(body)
}

func retainHeaders(
	header http.Header,
	remaining *int64,
) (http.Header, bool) {
	if len(header) == 0 {
		return nil, false
	}
	if remaining == nil {
		return header.Clone(), false
	}
	if *remaining <= 0 {
		return nil, true
	}

	keys := make([]string, 0, len(header))
	for name := range header {
		keys = append(keys, name)
	}
	sort.Strings(keys)
	retained := make(http.Header)
	for _, name := range keys {
		for _, value := range header[name] {
			canonicalName := http.CanonicalHeaderKey(name)
			amount := jsonHeaderAdditionBytes(retained, canonicalName, value)
			if amount > *remaining {
				return retained, true
			}
			retained.Add(canonicalName, value)
			*remaining -= amount
		}
	}
	return retained, false
}

// jsonHeaderAdditionBytes is the exact increase in encoding/json output for
// adding one value to the retained http.Header map.
func jsonHeaderAdditionBytes(
	retained http.Header,
	name string,
	value string,
) int64 {
	valueBytes := jsonQuotedStringBytes(value)
	if values, exists := retained[name]; exists && len(values) > 0 {
		return 1 + valueBytes // comma + quoted value
	}

	amount := jsonQuotedStringBytes(name) + valueBytes
	if len(retained) == 0 {
		return amount + 5 // braces + colon + array brackets
	}
	return amount + 4 // object comma + colon + array brackets
}
