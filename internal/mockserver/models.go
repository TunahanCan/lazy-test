// Package mockserver provides a loopback-only JSON mock HTTP server.
package mockserver

import "time"

const (
	// DefaultHitLimit is the number of recent requests retained when no limit is
	// supplied.
	DefaultHitLimit = 500

	// MaxDelayMS prevents an accidentally large route delay from leaving mock
	// requests hanging indefinitely.
	MaxDelayMS = 10 * 60 * 1000
)

// Options controls server-wide behavior.
type Options struct {
	// HitLimit bounds the in-memory request log. Values below one use
	// DefaultHitLimit.
	HitLimit int `json:"hitLimit"`
	// EnableCORS adds permissive development CORS headers and handles browser
	// preflight requests. The server is still bound exclusively to 127.0.0.1.
	EnableCORS bool `json:"enableCors"`
}

// Route describes one deterministic mock response.
type Route struct {
	ID      string            `json:"id"`
	Method  string            `json:"method"`
	Path    string            `json:"path"`
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    string            `json:"body"`
	DelayMS int               `json:"delayMs"`
	Enabled bool              `json:"enabled"`
}

// Hit is a retained record of a request handled by the mock server.
type Hit struct {
	ID         uint64            `json:"id"`
	RouteID    string            `json:"routeId,omitempty"`
	Method     string            `json:"method"`
	Path       string            `json:"path"`
	RawQuery   string            `json:"rawQuery,omitempty"`
	Status     int               `json:"status"`
	Matched    bool              `json:"matched"`
	PathParams map[string]string `json:"pathParams,omitempty"`
	Timestamp  time.Time         `json:"timestamp"`
	DurationMS int64             `json:"durationMs"`
}

// State is a point-in-time server status snapshot.
type State struct {
	Running      bool      `json:"running"`
	Host         string    `json:"host"`
	Port         int       `json:"port"`
	BaseURL      string    `json:"baseUrl"`
	RouteCount   int       `json:"routeCount"`
	EnabledCount int       `json:"enabledCount"`
	HitCount     int       `json:"hitCount"`
	TotalHits    uint64    `json:"totalHits"`
	StartedAt    time.Time `json:"startedAt,omitempty"`
	LastError    string    `json:"lastError,omitempty"`
}
