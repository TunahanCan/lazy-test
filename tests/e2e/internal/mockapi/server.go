package mockapi

import (
	"encoding/json"
	"io"
	"net/http"
	"sync"
	"time"
)

const maximumEchoBodyBytes = 64 * 1024

type Stats struct {
	Environment   string         `json:"environment"`
	Hits          map[string]int `json:"hits"`
	MaxConcurrent int            `json:"maxConcurrent"`
}

type Server struct {
	environment string

	mu            sync.Mutex
	hits          map[string]int
	activeSlow    int
	maximumActive int
}

func New(environment string) *Server {
	return &Server{
		environment: environment,
		hits:        make(map[string]int),
	}
}

func (server *Server) HitCount(path string) int {
	server.mu.Lock()
	defer server.mu.Unlock()
	return server.hits[path]
}

func (server *Server) MaxConcurrent() int {
	server.mu.Lock()
	defer server.mu.Unlock()
	return server.maximumActive
}

func (server *Server) Stats() Stats {
	server.mu.Lock()
	defer server.mu.Unlock()
	hits := make(map[string]int, len(server.hits))
	for path, count := range server.hits {
		hits[path] = count
	}
	return Stats{
		Environment:   server.environment,
		Hits:          hits,
		MaxConcurrent: server.maximumActive,
	}
}

func (server *Server) Reset() {
	server.mu.Lock()
	defer server.mu.Unlock()
	server.hits = make(map[string]int)
	server.maximumActive = server.activeSlow
}

func (server *Server) record(path string) {
	server.mu.Lock()
	defer server.mu.Unlock()
	server.hits[path]++
}

func (server *Server) beginSlow() {
	server.mu.Lock()
	defer server.mu.Unlock()
	server.activeSlow++
	if server.activeSlow > server.maximumActive {
		server.maximumActive = server.activeSlow
	}
}

func (server *Server) endSlow() {
	server.mu.Lock()
	defer server.mu.Unlock()
	server.activeSlow--
}

func (server *Server) ServeHTTP(
	response http.ResponseWriter,
	request *http.Request,
) {
	server.record(request.URL.Path)
	response.Header().Set("Cache-Control", "no-store")
	response.Header().Set("X-Validex-Mock", server.environment)

	switch request.URL.Path {
	case "/__validex/health":
		writeJSON(response, http.StatusOK, map[string]string{"status": "ready"})
	case "/__validex/stats":
		writeJSON(response, http.StatusOK, server.Stats())
	case "/__validex/reset":
		if request.Method != http.MethodPost {
			response.Header().Set("Allow", http.MethodPost)
			writeProblem(response, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}
		server.Reset()
		writeJSON(response, http.StatusOK, map[string]string{"status": "reset"})
	case "/api/orders/42":
		response.Header().Set("X-Trace-ID", "live-trace-42")
		http.SetCookie(response, &http.Cookie{
			Name:     "validex_session",
			Value:    "live-42",
			Path:     "/",
			HttpOnly: true,
		})
		writeJSON(response, http.StatusOK, map[string]any{
			"environment": server.environment,
			"order": map[string]any{
				"id":     "order-42",
				"status": "READY",
			},
			"items": []map[string]any{{"sku": "SKU-1", "quantity": 2}},
		})
	case "/api/echo":
		body, _ := io.ReadAll(io.LimitReader(request.Body, maximumEchoBodyBytes))
		writeJSON(response, http.StatusOK, map[string]any{
			"method":      request.Method,
			"query":       request.URL.Query(),
			"body":        string(body),
			"contentType": request.Header.Get("Content-Type"),
		})
	case "/api/xml":
		response.Header().Set("Content-Type", "application/xml; charset=utf-8")
		_, _ = io.WriteString(response, `<?xml version="1.0"?><order id="42"><status>READY</status></order>`)
	case "/api/text":
		response.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = io.WriteString(response, "Validex live API text response\nsecond line")
	case "/api/binary":
		response.Header().Set("Content-Type", "application/octet-stream")
		_, _ = response.Write([]byte{0x00, 0x01, 0x02, 0x7f, 0x80, 0xff})
	case "/api/problem":
		response.Header().Set("X-Trace-ID", "live-problem-422")
		writeEncodedJSON(response, http.StatusUnprocessableEntity, "application/problem+json; charset=utf-8", map[string]any{
			"type":    "https://validex.test/problems/validation",
			"title":   "Validation failed",
			"status":  http.StatusUnprocessableEntity,
			"detail":  "quantity must be positive",
			"traceId": "live-problem-422",
		})
	case "/api/slow":
		server.beginSlow()
		defer server.endSlow()
		select {
		case <-time.After(350 * time.Millisecond):
		case <-request.Context().Done():
			return
		}
		writeJSON(response, http.StatusOK, map[string]string{"status": "complete"})
	case "/api/redirect":
		http.Redirect(response, request, "/api/orders/42", http.StatusFound)
	case "/api/drop":
		hijacker, ok := response.(http.Hijacker)
		if !ok {
			writeProblem(response, http.StatusInternalServerError, "Connection hijacking unavailable")
			return
		}
		connection, _, err := hijacker.Hijack()
		if err == nil {
			_ = connection.Close()
		}
	case "/events":
		response.Header().Set("Content-Type", "text/event-stream")
		response.Header().Set("X-Stream", "live-orders")
		response.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(response, "id: event-1\nevent: order.updated\nretry: 1250\ndata: {\"id\":\"order-42\"}\n\n")
		_, _ = io.WriteString(response, "id: event-2\nevent: heartbeat\ndata: alive\n\n")
		if flusher, ok := response.(http.Flusher); ok {
			flusher.Flush()
		}
	case "/actuator/health":
		writeJSON(response, http.StatusOK, map[string]any{
			"status": "UP",
			"groups": []string{"readiness"},
			"components": map[string]any{
				"db":    map[string]string{"status": "UP"},
				"cache": map[string]string{"status": "UP"},
			},
		})
	case "/actuator/mappings":
		writeJSON(response, http.StatusOK, map[string]any{
			"contexts": map[string]any{
				"application": map[string]any{
					"mappings": map[string]any{"dispatcherServlets": map[string]any{}},
				},
			},
		})
	case "/actuator/metrics/jvm.memory.used":
		writeJSON(response, http.StatusOK, map[string]any{
			"name":        "jvm.memory.used",
			"description": "Memory used",
			"baseUnit":    "bytes",
			"measurements": []map[string]any{{
				"statistic": "VALUE",
				"value":     1048576,
			}},
			"availableTags": []map[string]any{{
				"tag":    "area",
				"values": []string{"heap"},
			}},
		})
	case "/environment":
		writeJSON(response, http.StatusOK, map[string]any{
			"environment": server.environment,
			"ready":       server.environment != "candidate",
			"traceId":     "volatile-" + server.environment,
		})
	default:
		writeProblem(response, http.StatusNotFound, "Not found")
	}
}

func writeJSON(response http.ResponseWriter, status int, value any) {
	writeEncodedJSON(response, status, "application/json; charset=utf-8", value)
}

func writeEncodedJSON(
	response http.ResponseWriter,
	status int,
	contentType string,
	value any,
) {
	response.Header().Set("Content-Type", contentType)
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(value)
}

func writeProblem(response http.ResponseWriter, status int, title string) {
	writeEncodedJSON(response, status, "application/problem+json; charset=utf-8", map[string]any{
		"title":  title,
		"status": status,
	})
}
