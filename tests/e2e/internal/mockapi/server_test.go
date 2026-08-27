package mockapi

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func TestServerResponseContracts(t *testing.T) {
	t.Parallel()

	handler := New("test")
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	t.Run("order includes metadata and cookie", func(t *testing.T) {
		response, err := http.Get(server.URL + "/api/orders/42")
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()

		if response.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
		}
		if contentType := response.Header.Get("Content-Type"); !strings.HasPrefix(contentType, "application/json") {
			t.Fatalf("Content-Type = %q, want application/json", contentType)
		}
		if environment := response.Header.Get("X-Validex-Mock"); environment != "test" {
			t.Fatalf("X-Validex-Mock = %q, want test", environment)
		}
		if traceID := response.Header.Get("X-Trace-ID"); traceID != "live-trace-42" {
			t.Fatalf("X-Trace-ID = %q, want live-trace-42", traceID)
		}
		cookies := response.Cookies()
		if len(cookies) != 1 || cookies[0].Name != "validex_session" || !cookies[0].HttpOnly {
			t.Fatalf("cookies = %+v, want HttpOnly validex_session", cookies)
		}
		var payload struct {
			Environment string `json:"environment"`
			Order       struct {
				ID     string `json:"id"`
				Status string `json:"status"`
			} `json:"order"`
		}
		if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload.Environment != "test" || payload.Order.ID != "order-42" || payload.Order.Status != "READY" {
			t.Fatalf("payload = %+v", payload)
		}
	})

	t.Run("echo preserves request data", func(t *testing.T) {
		request, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api/echo?source=validex",
			strings.NewReader(`{"quantity":2}`),
		)
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Content-Type", "application/json")
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		var payload struct {
			Method      string              `json:"method"`
			Query       map[string][]string `json:"query"`
			Body        string              `json:"body"`
			ContentType string              `json:"contentType"`
		}
		if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload.Method != http.MethodPost || payload.Body != `{"quantity":2}` ||
			payload.ContentType != "application/json" || payload.Query["source"][0] != "validex" {
			t.Fatalf("echo payload = %+v", payload)
		}
	})

	for _, fixture := range []struct {
		path        string
		status      int
		contentType string
		body        string
	}{
		{"/api/xml", http.StatusOK, "application/xml", `<order id="42">`},
		{"/api/text", http.StatusOK, "text/plain", "second line"},
		{"/api/binary", http.StatusOK, "application/octet-stream", string([]byte{0x00, 0x01, 0x02})},
		{"/api/problem", http.StatusUnprocessableEntity, "application/problem+json", "quantity must be positive"},
		{"/missing", http.StatusNotFound, "application/problem+json", "Not found"},
	} {
		fixture := fixture
		t.Run(fixture.path, func(t *testing.T) {
			response, err := http.Get(server.URL + fixture.path)
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			body, err := io.ReadAll(response.Body)
			if err != nil {
				t.Fatal(err)
			}
			if response.StatusCode != fixture.status {
				t.Fatalf("status = %d, want %d", response.StatusCode, fixture.status)
			}
			if contentType := response.Header.Get("Content-Type"); !strings.HasPrefix(contentType, fixture.contentType) {
				t.Fatalf("Content-Type = %q, want %s", contentType, fixture.contentType)
			}
			if !strings.Contains(string(body), fixture.body) {
				t.Fatalf("body = %q, want fragment %q", body, fixture.body)
			}
		})
	}
}

func TestServerStatsResetAndConcurrency(t *testing.T) {
	t.Parallel()

	handler := New("load")
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	const requests = 6
	var waitGroup sync.WaitGroup
	errors := make(chan error, requests)
	for index := 0; index < requests; index++ {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			response, err := http.Get(server.URL + "/api/slow")
			if err == nil {
				_ = response.Body.Close()
			}
			errors <- err
		}()
	}
	waitGroup.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}

	stats := handler.Stats()
	if stats.Hits["/api/slow"] != requests {
		t.Fatalf("slow hits = %d, want %d", stats.Hits["/api/slow"], requests)
	}
	if stats.MaxConcurrent < 2 || stats.MaxConcurrent > requests {
		t.Fatalf("max concurrency = %d, want 2..%d", stats.MaxConcurrent, requests)
	}

	request, err := http.NewRequest(http.MethodPost, server.URL+"/__validex/reset", nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("reset status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	stats = handler.Stats()
	if len(stats.Hits) != 0 || stats.MaxConcurrent != 0 {
		t.Fatalf("stats after reset = %+v", stats)
	}
}
