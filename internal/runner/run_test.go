package runner

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"validex/internal/assertions"
)

type senderFunc func(context.Context, PreparedRequest) (Response, error)

func (function senderFunc) Send(ctx context.Context, request PreparedRequest) (Response, error) {
	return function(ctx, request)
}

func TestRunInterpolatesScopesExecutesSequentiallyAndEvaluatesAssertions(t *testing.T) {
	t.Parallel()
	var mutex sync.Mutex
	var received []PreparedRequest
	sender := senderFunc(func(_ context.Context, request PreparedRequest) (Response, error) {
		mutex.Lock()
		received = append(received, request)
		mutex.Unlock()
		switch request.ID {
		case "first":
			return Response{
				StatusCode: http.StatusCreated,
				Headers:    http.Header{"Content-Type": {"application/json"}},
				Body:       []byte(`{"ok":true,"source":"request"}`),
				DurationMS: 12,
			}, nil
		case "second":
			return Response{
				StatusCode: http.StatusNoContent,
				Headers:    http.Header{},
				Body:       []byte{},
				DurationMS: 3,
			}, nil
		default:
			return Response{}, errors.New("unexpected request")
		}
	})
	collection := Collection{
		Name: "sequential",
		Variables: map[string]string{
			"baseUrl": "https://example.test",
			"token":   "collection-token",
			"source":  "collection",
		},
		Requests: []Request{
			{
				ID: "first", Name: "Create", Method: " post ", URL: "{{baseUrl}}/items",
				Headers: []Header{
					{Enabled: true, Key: "Authorization", Value: "Bearer {{token}}"},
				},
				Body:      `{"source":"{{source}}"}`,
				Variables: map[string]string{"source": "request"},
				Assertions: []assertions.Assertion{
					{Target: assertions.TargetStatus, Operator: assertions.OperatorEquals, Expected: 201},
					{Target: assertions.TargetJSONPath, Path: "$.source", Operator: assertions.OperatorEquals, Expected: "request"},
					{Target: assertions.TargetDurationMS, Operator: assertions.OperatorLessThan, Expected: 20},
				},
			},
			{
				ID: "second", Name: "Delete", Method: "DELETE", URL: "{{baseUrl}}/items/1",
				Assertions: []assertions.Assertion{
					{Target: assertions.TargetStatus, Operator: assertions.OperatorEquals, Expected: 204},
				},
			},
		},
	}

	report, err := Run(context.Background(), collection, sender, Options{
		Variables: map[string]string{"token": "runtime-token", "source": "runtime"},
	})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if report.Passed != 2 || report.Failed != 0 || len(report.Results) != 2 {
		t.Fatalf("report summary = %#v", report)
	}
	if report.Results[0].DurationMS != 12 || report.Results[1].DurationMS != 3 {
		t.Fatalf("result durations = %#v", report.Results)
	}
	for _, result := range report.Results {
		if !result.Passed || result.Failure != nil {
			t.Fatalf("result = %#v, want pass", result)
		}
	}
	mutex.Lock()
	defer mutex.Unlock()
	if len(received) != 2 || received[0].ID != "first" || received[1].ID != "second" {
		t.Fatalf("sender order = %#v", received)
	}
	if received[0].Method != http.MethodPost ||
		len(received[0].Headers) != 1 ||
		received[0].Headers[0].Name != "Authorization" ||
		received[0].Headers[0].Value != "Bearer runtime-token" ||
		string(received[0].Body) != `{"source":"request"}` {
		t.Fatalf("prepared first request = %#v, body %q", received[0], received[0].Body)
	}
	if _, err := time.Parse(time.RFC3339Nano, report.StartedAt); err != nil {
		t.Fatalf("StartedAt = %q: %v", report.StartedAt, err)
	}
	encoded, err := json.Marshal(report)
	if err != nil {
		t.Fatalf("json.Marshal(Report) error = %v", err)
	}
	if !strings.Contains(string(encoded), `"durationMs":12`) ||
		strings.Contains(string(encoded), `"Duration"`) {
		t.Fatalf("report JSON has unstable duration representation: %s", encoded)
	}
}

func TestRunKeepsPerRequestFailuresAndContinues(t *testing.T) {
	t.Parallel()
	var calls []string
	sender := senderFunc(func(_ context.Context, request PreparedRequest) (Response, error) {
		calls = append(calls, request.ID)
		return Response{StatusCode: 200, Body: []byte(`{"ok":true}`)}, nil
	})
	collection := Collection{Requests: []Request{
		{
			ID: "missing", Method: "GET", URL: "{{baseUrl}}/{{z}}/{{a}}",
		},
		{
			ID: "valid", Method: "GET", URL: "https://example.test",
		},
	}}

	report, err := Run(context.Background(), collection, sender, Options{})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if !reflect.DeepEqual(calls, []string{"valid"}) {
		t.Fatalf("sender calls = %#v, want only valid request", calls)
	}
	if report.Passed != 1 || report.Failed != 1 {
		t.Fatalf("report summary = %#v", report)
	}
	failure := report.Results[0].Failure
	if failure == nil || failure.Code != FailureMissingVariables ||
		failure.Message != "Request has unresolved variables: a, baseUrl, z." {
		t.Fatalf("missing-variable failure = %#v", failure)
	}
	if !report.Results[1].Passed {
		t.Fatalf("second request = %#v, want pass", report.Results[1])
	}
}

func TestRunEnforcesInterpolatedBodyAndCustomSenderResponseLimits(t *testing.T) {
	t.Parallel()
	var calls int
	sender := senderFunc(func(_ context.Context, request PreparedRequest) (Response, error) {
		calls++
		return Response{StatusCode: 200, Body: []byte("12345")}, nil
	})
	limits := Limits{MaxRequestBodyBytes: 8, MaxResponseBodyBytes: 4}
	collection := Collection{
		Variables: map[string]string{"p": "123456789"},
		Requests: []Request{
			{ID: "request-large", Method: "POST", URL: "https://example.test", Body: "{{p}}"},
			{ID: "response-large", Method: "GET", URL: "https://example.test"},
		},
	}

	report, err := Run(context.Background(), collection, sender, Options{Limits: limits})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if calls != 1 || report.Passed != 0 || report.Failed != 2 {
		t.Fatalf("calls/report = %d/%#v", calls, report)
	}
	if got := report.Results[0].Failure; got == nil || got.Code != FailureRequestBodyTooLarge {
		t.Fatalf("request limit failure = %#v", got)
	}
	if got := report.Results[1].Failure; got == nil || got.Code != FailureResponseBodyTooLarge {
		t.Fatalf("response limit failure = %#v", got)
	}
}

func TestFailureFromSendErrorClassifiesSharedExecutorErrors(t *testing.T) {
	t.Parallel()
	tests := []struct {
		err  error
		code string
	}{
		{
			err:  ErrUnsupportedContentEncoding,
			code: FailureUnsupportedEncoding,
		},
		{
			err:  ErrTooManyContentEncodings,
			code: FailureTooManyEncodings,
		},
		{
			err:  ErrResponseDecodeFailed,
			code: FailureResponseDecodeFailed,
		},
	}
	for _, test := range tests {
		failure := failureFromSendError(
			test.err,
			nil,
			DefaultRequestTimeoutMS,
			DefaultLimits(),
		)
		if failure == nil || failure.Code != test.code {
			t.Fatalf("failureFromSendError(%v) = %#v", test.err, failure)
		}
	}
}

func TestRunAppliesPerRequestTimeoutAndContinues(t *testing.T) {
	t.Parallel()
	var calls []string
	sender := senderFunc(func(ctx context.Context, request PreparedRequest) (Response, error) {
		calls = append(calls, request.ID)
		if request.ID == "slow" {
			<-ctx.Done()
			return Response{}, ctx.Err()
		}
		return Response{StatusCode: 200}, nil
	})
	collection := Collection{Requests: []Request{
		{ID: "slow", Method: "GET", URL: "https://example.test/slow", TimeoutMS: 5},
		{ID: "next", Method: "GET", URL: "https://example.test/next", TimeoutMS: 100},
	}}

	report, err := Run(context.Background(), collection, sender, Options{})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if !reflect.DeepEqual(calls, []string{"slow", "next"}) {
		t.Fatalf("sender calls = %#v", calls)
	}
	if failure := report.Results[0].Failure; failure == nil || failure.Code != FailureRequestTimeout {
		t.Fatalf("timeout failure = %#v", failure)
	}
	if !report.Results[1].Passed {
		t.Fatalf("next result = %#v, want pass", report.Results[1])
	}
}

func TestRunReturnsPartialReportOnParentCancellation(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	sender := senderFunc(func(_ context.Context, request PreparedRequest) (Response, error) {
		cancel()
		return Response{StatusCode: 200}, nil
	})
	collection := Collection{Requests: []Request{
		{ID: "first", Method: "GET", URL: "https://example.test/first"},
		{ID: "second", Method: "GET", URL: "https://example.test/second"},
	}}

	report, err := Run(ctx, collection, sender, Options{})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %v, want context.Canceled", err)
	}
	if len(report.Results) != 1 ||
		report.Results[0].Passed ||
		report.Results[0].Failure == nil ||
		report.Results[0].Failure.Code != FailureRequestCanceled {
		t.Fatalf("partial report = %#v", report)
	}
}

func TestRunReturnsCancellationWhenSuccessfulFinalSendCancelsParent(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	sender := senderFunc(func(context.Context, PreparedRequest) (Response, error) {
		cancel()
		return Response{StatusCode: http.StatusOK, Body: []byte("partial")}, nil
	})

	report, err := Run(ctx, Collection{Requests: []Request{{
		ID: "only", Method: http.MethodGet, URL: "https://example.test",
	}}}, sender, Options{})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %v, want context.Canceled", err)
	}
	if len(report.Results) != 1 ||
		report.Results[0].Passed ||
		report.Results[0].Failure == nil ||
		report.Results[0].Failure.Code != FailureRequestCanceled {
		t.Fatalf("canceled final report = %#v", report)
	}
}

func TestRunReturnsCancellationWhenActiveFinalRequestIsCanceled(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	sender := senderFunc(func(requestContext context.Context, _ PreparedRequest) (Response, error) {
		cancel()
		<-requestContext.Done()
		return Response{}, requestContext.Err()
	})

	report, err := Run(ctx, Collection{Requests: []Request{{
		ID: "only", Method: "GET", URL: "https://example.test",
	}}}, sender, Options{})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %v, want context.Canceled", err)
	}
	if len(report.Results) != 1 ||
		report.Results[0].Failure == nil ||
		report.Results[0].Failure.Code != FailureRequestCanceled {
		t.Fatalf("canceled report = %#v", report)
	}
}

func TestRunBoundsRetainedReportBodiesAcrossRequests(t *testing.T) {
	t.Parallel()
	sender := senderFunc(func(context.Context, PreparedRequest) (Response, error) {
		return Response{StatusCode: 200, Body: []byte("1234")}, nil
	})
	collection := Collection{Requests: []Request{
		{Method: "GET", URL: "https://example.test/first"},
		{Method: "GET", URL: "https://example.test/second"},
	}}

	report, err := Run(context.Background(), collection, sender, Options{
		Limits: Limits{MaxReportBodyBytes: 9},
	})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if report.Results[0].Body != "1234" || report.Results[0].BodyTruncated {
		t.Fatalf("first retained body = %#v", report.Results[0])
	}
	if report.Results[1].Body != "1" || !report.Results[1].BodyTruncated {
		t.Fatalf("second retained body = %#v", report.Results[1])
	}
}

func TestRunBoundsResponseAndAggregateReportHeaders(t *testing.T) {
	t.Parallel()
	sender := senderFunc(func(context.Context, PreparedRequest) (Response, error) {
		return Response{
			StatusCode: 200,
			Headers:    http.Header{"X-Test": {"1234"}},
		}, nil
	})
	collection := Collection{Requests: []Request{
		{Method: "GET", URL: "https://example.test/first"},
		{Method: "GET", URL: "https://example.test/second"},
	}}

	report, err := Run(context.Background(), collection, sender, Options{
		Limits: Limits{MaxReportHeaderBytes: 19},
	})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if report.Results[0].Headers.Get("X-Test") != "1234" ||
		report.Results[0].HeadersTruncated {
		t.Fatalf("first retained headers = %#v", report.Results[0])
	}
	if !report.Results[1].HeadersTruncated ||
		report.Results[1].Headers.Get("X-Test") != "" {
		t.Fatalf("second retained headers = %#v", report.Results[1])
	}

	oversized, err := Run(
		context.Background(),
		Collection{Requests: []Request{{
			Method: "GET",
			URL:    "https://example.test/oversized",
		}}},
		sender,
		Options{Limits: Limits{MaxResponseHeaderBytes: 10}},
	)
	if err != nil {
		t.Fatalf("Run(oversized headers) error = %v", err)
	}
	if failure := oversized.Results[0].Failure; failure == nil ||
		failure.Code != FailureResponseHeadersTooLarge {
		t.Fatalf("oversized header failure = %#v", oversized.Results[0])
	}
}

func TestRunKeepsTemplateURLAndRedactsTransportErrors(t *testing.T) {
	t.Parallel()
	const secret = "http"
	sender := senderFunc(func(_ context.Context, request PreparedRequest) (Response, error) {
		if request.URL != "https://example.test/http?api_key=http" {
			t.Fatalf("prepared URL = %q, want exact interpolated URL", request.URL)
		}
		return Response{}, errors.New("request failed for " + request.URL)
	})
	templateURL := "https://example.test/{{key}}?api_key={{token}}"
	report, err := Run(context.Background(), Collection{
		Variables: map[string]string{"key": secret, "token": secret},
		Requests:  []Request{{Method: "GET", URL: templateURL}},
	}, sender, Options{})
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	result := report.Results[0]
	if result.URL != "https://example.test/REDACTED?api_key=REDACTED" ||
		result.Failure == nil ||
		result.Failure.Message != "Request could not be completed." {
		t.Fatalf("redacted result = %#v", result)
	}
}

func TestRunRejectsInvalidGlobalInputsWithoutCallingSender(t *testing.T) {
	t.Parallel()
	called := false
	sender := senderFunc(func(context.Context, PreparedRequest) (Response, error) {
		called = true
		return Response{}, nil
	})
	collection := Collection{Requests: []Request{
		{Method: "GET", URL: "https://example.test/1"},
		{Method: "GET", URL: "https://example.test/2"},
	}}
	_, err := Run(context.Background(), collection, sender, Options{Limits: Limits{MaxRequests: 1}})
	if err == nil || called {
		t.Fatalf("Run() error/called = %v/%t", err, called)
	}
	if _, err := Run(context.Background(), Collection{}, nil, Options{}); err == nil {
		t.Fatal("Run(nil sender) error = nil")
	}

	report, err := Run(
		context.Background(),
		Collection{Requests: []Request{{Method: "GET", URL: "https://example.test"}}},
		sender,
		Options{Variables: map[string]string{"bad key": "value"}},
	)
	if err == nil || report.Results == nil || report.StartedAt == "" {
		t.Fatalf("invalid-variable report/error = %#v/%v", report, err)
	}
}
