package runner

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
)

func TestJSONEscapedPrefixMatchesEncodingJSON(t *testing.T) {
	t.Parallel()

	inputs := [][]byte{
		[]byte("plain ASCII"),
		[]byte{0, '\b', '\f', '\n', '\r', '\t', 0x1f},
		[]byte(`"<script>&\path`),
		[]byte("Türkçe \u2028 \u2029 😀"),
		{0xff, 0xc0, 0xaf, 0xe2, 0x82},
	}
	for _, input := range inputs {
		input := input
		t.Run(string(input), func(t *testing.T) {
			t.Parallel()
			for budget := int64(0); budget <= int64(len(input))*6; budget++ {
				retained, charged := jsonEscapedPrefix(input, budget)
				encoded, err := json.Marshal(string(input[:retained]))
				if err != nil {
					t.Fatalf("json.Marshal() error = %v", err)
				}
				actual := int64(len(encoded) - int(jsonStringDelimiterBytes))
				if charged != actual {
					t.Fatalf(
						"budget %d retained %d: charged %d, encoding/json used %d (%q)",
						budget,
						retained,
						charged,
						actual,
						encoded,
					)
				}
				if charged > budget {
					t.Fatalf("budget %d retained encoded size %d", budget, charged)
				}
			}
		})
	}
}

func TestRunBudgetsJSONEscapedReportBodies(t *testing.T) {
	t.Parallel()

	sender := senderFunc(func(context.Context, PreparedRequest) (Response, error) {
		return Response{StatusCode: http.StatusOK, Body: []byte{0, 0}}, nil
	})
	report, err := Run(
		context.Background(),
		Collection{Requests: []Request{
			{Method: http.MethodGet, URL: "https://example.test/first"},
			{Method: http.MethodGet, URL: "https://example.test/second"},
		}},
		sender,
		Options{Limits: Limits{MaxReportBodyBytes: 16}},
	)
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if report.Results[0].Body != "\x00\x00" ||
		report.Results[0].BodyTruncated ||
		report.Results[1].Body != "" ||
		!report.Results[1].BodyTruncated {
		t.Fatalf("escaped body retention = %#v", report.Results)
	}

	var encodedBytes int
	for _, result := range report.Results {
		if result.Body == "" {
			continue
		}
		encoded, marshalErr := json.Marshal(result.Body)
		if marshalErr != nil {
			t.Fatalf("json.Marshal(body) error = %v", marshalErr)
		}
		encodedBytes += len(encoded)
	}
	if encodedBytes > 16 {
		t.Fatalf("retained JSON body values use %d bytes, limit is 16", encodedBytes)
	}
}

func TestRunBudgetsJSONEncodedReportHeaders(t *testing.T) {
	t.Parallel()

	sender := senderFunc(func(context.Context, PreparedRequest) (Response, error) {
		return Response{
			StatusCode: http.StatusOK,
			Headers:    http.Header{"X-Control": {"\x00"}},
		}, nil
	})
	report, err := Run(
		context.Background(),
		Collection{Requests: []Request{
			{Method: http.MethodGet, URL: "https://example.test/first"},
			{Method: http.MethodGet, URL: "https://example.test/second"},
		}},
		sender,
		Options{Limits: Limits{MaxReportHeaderBytes: 30}},
	)
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if report.Results[0].Headers.Get("X-Control") != "\x00" ||
		report.Results[0].HeadersTruncated ||
		len(report.Results[1].Headers) != 0 ||
		!report.Results[1].HeadersTruncated {
		t.Fatalf("escaped header retention = %#v", report.Results)
	}

	encoded, err := json.Marshal(report.Results[0].Headers)
	if err != nil {
		t.Fatalf("json.Marshal(headers) error = %v", err)
	}
	if len(encoded) > 30 {
		t.Fatalf("retained JSON header value uses %d bytes, limit is 30", len(encoded))
	}
}
