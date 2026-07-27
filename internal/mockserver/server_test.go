package mockserver

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sync"
	"testing"
	"time"
)

func TestServerLifecycleReplaceAndBoundedHits(t *testing.T) {
	server := New(Options{HitLimit: 5, EnableCORS: true})
	err := server.ReplaceRoutes([]Route{{
		ID:      "get-user",
		Method:  "get",
		Path:    "/users/{id}",
		Status:  http.StatusOK,
		Headers: map[string]string{"X-Mock": "validex"},
		Body:    `{"name":"Ada"}`,
		DelayMS: 2,
		Enabled: true,
	}})
	if err != nil {
		t.Fatalf("ReplaceRoutes() error = %v", err)
	}

	state, err := server.Start(0)
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	if !state.Running || state.Port == 0 || state.BaseURL == "" {
		t.Fatalf("Start() state = %#v", state)
	}
	if _, err := server.Start(0); !errors.Is(err, ErrAlreadyRunning) {
		t.Fatalf("second Start() error = %v, want ErrAlreadyRunning", err)
	}
	t.Cleanup(func() {
		_ = server.Stop(context.Background())
	})

	response, err := http.Get(state.BaseURL + "/users/42?view=short")
	if err != nil {
		t.Fatalf("GET route: %v", err)
	}
	body, _ := io.ReadAll(response.Body)
	_ = response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("GET status = %d, body = %s", response.StatusCode, body)
	}
	if response.Header.Get("X-Mock") != "validex" {
		t.Fatalf("X-Mock = %q", response.Header.Get("X-Mock"))
	}
	if response.Header.Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("CORS origin = %q", response.Header.Get("Access-Control-Allow-Origin"))
	}
	var payload map[string]string
	if err := json.Unmarshal(body, &payload); err != nil || payload["name"] != "Ada" {
		t.Fatalf("response body = %s, error = %v", body, err)
	}

	request, _ := http.NewRequest(http.MethodPost, state.BaseURL+"/users/42", nil)
	response, err = http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("POST wrong method: %v", err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("wrong method status = %d", response.StatusCode)
	}
	if response.Header.Get("Allow") != http.MethodGet {
		t.Fatalf("Allow = %q", response.Header.Get("Allow"))
	}

	const concurrentRequests = 12
	var waitGroup sync.WaitGroup
	waitGroup.Add(concurrentRequests)
	for index := 0; index < concurrentRequests; index++ {
		go func() {
			defer waitGroup.Done()
			response, requestErr := http.Get(state.BaseURL + "/users/concurrent")
			if requestErr == nil {
				_ = response.Body.Close()
			}
		}()
	}
	waitGroup.Wait()

	hits := server.Hits()
	if len(hits) != 5 {
		t.Fatalf("len(Hits()) = %d, want bounded length 5", len(hits))
	}
	status := server.Status()
	if status.TotalHits != concurrentRequests+2 {
		t.Fatalf("TotalHits = %d, want %d", status.TotalHits, concurrentRequests+2)
	}
	if hits[len(hits)-1].RouteID != "get-user" ||
		hits[len(hits)-1].PathParams["id"] != "concurrent" {
		t.Fatalf("last hit = %#v", hits[len(hits)-1])
	}
	for index := 1; index < len(hits); index++ {
		if hits[index].ID <= hits[index-1].ID {
			t.Fatalf("hits are not chronological: %#v", hits)
		}
	}

	err = server.ReplaceRoutes([]Route{{
		ID:      "create-order",
		Method:  http.MethodPost,
		Path:    "/orders",
		Status:  http.StatusCreated,
		Body:    `{"id":7}`,
		Enabled: true,
	}})
	if err != nil {
		t.Fatalf("ReplaceRoutes() while running error = %v", err)
	}
	response, err = http.Get(state.BaseURL + "/users/42")
	if err != nil {
		t.Fatalf("GET replaced route: %v", err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("replaced route status = %d", response.StatusCode)
	}
	request, _ = http.NewRequest(http.MethodPost, state.BaseURL+"/orders", nil)
	response, err = http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("POST replacement route: %v", err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("replacement status = %d", response.StatusCode)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := server.Stop(ctx); err != nil {
		t.Fatalf("Stop() error = %v", err)
	}
	if server.Status().Running {
		t.Fatal("server is still running after Stop")
	}
	_, err = http.Get(state.BaseURL + "/orders")
	if err == nil {
		t.Fatal("request unexpectedly succeeded after Stop")
	}
	if err := server.Stop(context.Background()); err != nil {
		t.Fatalf("second Stop() error = %v", err)
	}
}

func TestCORSPreflight(t *testing.T) {
	server := New(Options{EnableCORS: true})
	state, err := server.Start(0)
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	defer server.Stop(context.Background()) //nolint:errcheck

	request, _ := http.NewRequest(http.MethodOptions, state.BaseURL+"/anything", nil)
	request.Header.Set("Origin", "http://localhost:5173")
	request.Header.Set("Access-Control-Request-Method", http.MethodPost)
	request.Header.Set("Access-Control-Request-Headers", "X-Trace-ID")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("preflight request: %v", err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("preflight status = %d", response.StatusCode)
	}
	if response.Header.Get("Access-Control-Allow-Headers") != "X-Trace-ID" {
		t.Fatalf("preflight allow headers = %q", response.Header.Get("Access-Control-Allow-Headers"))
	}
}

func TestValidateRoutes(t *testing.T) {
	valid := Route{
		ID:      "route",
		Method:  http.MethodGet,
		Path:    "/items/{id}",
		Status:  http.StatusOK,
		Body:    `{}`,
		Enabled: true,
	}
	tests := []struct {
		name   string
		routes []Route
	}{
		{
			name:   "duplicate id",
			routes: []Route{valid, valid},
		},
		{
			name: "invalid status",
			routes: []Route{func() Route {
				route := valid
				route.Status = 700
				return route
			}()},
		},
		{
			name: "invalid delay",
			routes: []Route{func() Route {
				route := valid
				route.DelayMS = -1
				return route
			}()},
		},
		{
			name: "invalid path",
			routes: []Route{func() Route {
				route := valid
				route.Path = "items/{id}"
				return route
			}()},
		},
		{
			name: "invalid json",
			routes: []Route{func() Route {
				route := valid
				route.Body = `{`
				return route
			}()},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := ValidateRoutes(test.routes); err == nil {
				t.Fatal("ValidateRoutes() error = nil")
			}
		})
	}

	server := New(Options{})
	if err := server.ReplaceRoutes([]Route{valid}); err != nil {
		t.Fatalf("initial ReplaceRoutes() error = %v", err)
	}
	invalid := valid
	invalid.Status = 0
	if err := server.ReplaceRoutes([]Route{invalid}); err == nil {
		t.Fatal("invalid ReplaceRoutes() error = nil")
	}
	if routes := server.Routes(); len(routes) != 1 || routes[0].Status != http.StatusOK {
		t.Fatalf("invalid replacement changed routes: %#v", routes)
	}

	_, err := server.Start(-1)
	if err == nil || errors.Is(err, ErrAlreadyRunning) {
		t.Fatalf("Start(-1) error = %v", err)
	}
}
