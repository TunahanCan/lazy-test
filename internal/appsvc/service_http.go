package appsvc

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

// SendRequest executes a single HTTP call and normalizes response for UI/CLI.
//
// Java analogy: similar to a RestTemplate/WebClient call wrapped in a service method.
func (s *Service) SendRequest(req RequestDTO) (ResponseDTO, error) {
	start := s.clk.Now()

	var body io.Reader
	if req.Body != "" && shouldHaveBody(req.Method) {
		body = bytes.NewReader([]byte(req.Body))
	}

	hreq, err := http.NewRequest(req.Method, req.URL, body)
	if err != nil {
		return ResponseDTO{}, err
	}
	for k, v := range req.Headers {
		hreq.Header.Set(k, v)
	}

	timeout := 15 * time.Second
	if req.TimeoutMS > 0 {
		timeout = time.Duration(req.TimeoutMS) * time.Millisecond
	}
	client := &http.Client{Timeout: timeout}

	resp, err := client.Do(hreq)
	if err != nil {
		lat := s.clk.Now().Sub(start).Milliseconds()
		return ResponseDTO{Error: err.Error(), Err: err.Error(), LatencyMS: lat}, err
	}
	defer resp.Body.Close()

	rawBody, _ := io.ReadAll(resp.Body)
	prettyBody := prettyJSONOrRaw(rawBody)

	headers := map[string][]string{}
	for k, v := range resp.Header {
		headers[k] = append([]string(nil), v...)
	}

	lat := s.clk.Now().Sub(start).Milliseconds()
	return ResponseDTO{
		StatusCode: resp.StatusCode,
		Status:     resp.StatusCode,
		Headers:    headers,
		Body:       prettyBody,
		LatencyMS:  lat,
	}, nil
}

func shouldHaveBody(method string) bool {
	switch strings.ToUpper(strings.TrimSpace(method)) {
	case http.MethodPost, http.MethodPut, http.MethodPatch:
		return true
	default:
		return false
	}
}

func prettyJSONOrRaw(payload []byte) string {
	if !json.Valid(payload) {
		return string(payload)
	}
	var tmp interface{}
	_ = json.Unmarshal(payload, &tmp)
	pretty, err := json.MarshalIndent(tmp, "", "  ")
	if err != nil {
		return string(payload)
	}
	return string(pretty)
}
