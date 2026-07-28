package mockserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

var (
	// ErrAlreadyRunning is returned when Start is called for a running server.
	ErrAlreadyRunning = errors.New("mock server is already running")
)

type compiledRoute struct {
	route           Route
	pathRE          *regexp.Regexp
	paramNames      []string
	literalSegments int
	literalBytes    int
}

const clientClosedRequestStatus = 499

// Server is a concurrency-safe, loopback-only mock HTTP server.
type Server struct {
	mu sync.RWMutex

	options Options
	routes  []compiledRoute
	hits    hitRing

	httpServer *http.Server
	listener   net.Listener
	startedAt  time.Time
	stopping   bool
	stopDone   chan struct{}
	lastError  string
}

// New creates an idle server. Routes can be installed before or after Start.
func New(options Options) *Server {
	if options.HitLimit < 1 {
		options.HitLimit = DefaultHitLimit
	}
	if options.HitLimit > MaxHitLimit {
		options.HitLimit = MaxHitLimit
	}
	return &Server{
		options: options,
		hits:    newHitRing(options.HitLimit),
	}
}

// Start binds the server to 127.0.0.1. A port of zero lets the operating
// system select an available port.
func (s *Server) Start(port int) (State, error) {
	if port < 0 || port > 65535 {
		return State{}, fmt.Errorf("port must be between 0 and 65535")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.httpServer != nil || s.stopping {
		return State{}, ErrAlreadyRunning
	}

	listener, err := net.Listen("tcp4", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
	if err != nil {
		return State{}, fmt.Errorf("start mock server: %w", err)
	}

	httpServer := &http.Server{
		Handler:           s,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}
	s.httpServer = httpServer
	s.listener = listener
	s.startedAt = time.Now().UTC()
	s.stopDone = make(chan struct{})
	s.lastError = ""

	go s.serve(httpServer, listener)
	return s.stateLocked(), nil
}

func (s *Server) serve(httpServer *http.Server, listener net.Listener) {
	err := httpServer.Serve(listener)
	if err == nil || errors.Is(err, http.ErrServerClosed) {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.httpServer != httpServer {
		return
	}
	s.lastError = err.Error()
	s.httpServer = nil
	s.listener = nil
	s.startedAt = time.Time{}
	s.stopping = false
	if s.stopDone != nil {
		close(s.stopDone)
		s.stopDone = nil
	}
}

// Stop gracefully stops the server. It is safe to call Stop on an idle server
// and safe for multiple callers to call it concurrently.
func (s *Server) Stop(ctx context.Context) error {
	if ctx == nil {
		return errors.New("stop context must not be nil")
	}

	s.mu.Lock()
	if s.httpServer == nil {
		s.mu.Unlock()
		return nil
	}
	if s.stopping {
		done := s.stopDone
		s.mu.Unlock()
		select {
		case <-done:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	s.stopping = true
	httpServer := s.httpServer
	done := s.stopDone
	s.mu.Unlock()

	err := httpServer.Shutdown(ctx)
	if err != nil {
		// Shutdown stops accepting new connections before waiting for handlers.
		// If its context expires, Close guarantees that Stop still leaves no
		// loopback listener behind.
		_ = httpServer.Close()
	}

	s.mu.Lock()
	if s.httpServer == httpServer {
		s.httpServer = nil
		s.listener = nil
		s.startedAt = time.Time{}
		s.stopping = false
		if done != nil {
			close(done)
		}
		s.stopDone = nil
	}
	s.mu.Unlock()
	return err
}

// Status returns a consistent point-in-time server snapshot.
func (s *Server) Status() State {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.stateLocked()
}

func (s *Server) stateLocked() State {
	state := State{
		Host:       "127.0.0.1",
		RouteCount: len(s.routes),
		HitCount:   s.hits.len(),
		TotalHits:  s.hits.total,
		LastError:  s.lastError,
	}
	for _, route := range s.routes {
		if route.route.Enabled {
			state.EnabledCount++
		}
	}
	if s.httpServer == nil || s.listener == nil || s.stopping {
		return state
	}
	state.Running = true
	state.StartedAt = s.startedAt
	if address, ok := s.listener.Addr().(*net.TCPAddr); ok {
		state.Port = address.Port
		state.BaseURL = "http://" + net.JoinHostPort(state.Host, strconv.Itoa(state.Port))
	}
	return state
}

// ReplaceRoutes atomically replaces the active route table. Invalid input
// leaves the existing table untouched.
func (s *Server) ReplaceRoutes(routes []Route) error {
	compiled, err := compileRoutes(routes)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.routes = compiled
	s.mu.Unlock()
	return nil
}

// ValidateRoutes validates and compiles routes without changing a server.
func ValidateRoutes(routes []Route) error {
	_, err := compileRoutes(routes)
	return err
}

// Routes returns a defensive copy of the installed routes.
func (s *Server) Routes() []Route {
	s.mu.RLock()
	defer s.mu.RUnlock()
	routes := make([]Route, len(s.routes))
	for i, route := range s.routes {
		routes[i] = cloneRoute(route.route)
	}
	return routes
}

// Hits returns retained hits from oldest to newest.
func (s *Server) Hits() []Hit {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.hits.list()
}

// ClearHits clears both the retained hit log and its total counter.
func (s *Server) ClearHits() {
	s.mu.Lock()
	s.hits.clear()
	s.mu.Unlock()
}

func (s *Server) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	started := time.Now()
	timestamp := started.UTC()
	if s.options.EnableCORS {
		applyCORS(writer.Header(), request)
		if request.Method == http.MethodOptions &&
			request.Header.Get("Access-Control-Request-Method") != "" {
			writer.WriteHeader(http.StatusNoContent)
			s.recordHit(Hit{
				Method:    request.Method,
				Path:      request.URL.Path,
				RawQuery:  request.URL.RawQuery,
				Status:    http.StatusNoContent,
				Timestamp: timestamp,
			}, started)
			return
		}
	}

	route, params, allowedMethods := s.match(request.Method, request.URL.Path)
	if route == nil {
		status := http.StatusNotFound
		message := "mock route not found"
		if len(allowedMethods) > 0 {
			status = http.StatusMethodNotAllowed
			message = "method not allowed for mock route"
			writer.Header().Set("Allow", strings.Join(allowedMethods, ", "))
		}
		writeJSON(writer, status, map[string]string{
			"error":  message,
			"method": request.Method,
			"path":   request.URL.Path,
		})
		s.recordHit(Hit{
			Method:    request.Method,
			Path:      request.URL.Path,
			RawQuery:  request.URL.RawQuery,
			Status:    status,
			Timestamp: timestamp,
		}, started)
		return
	}

	if route.DelayMS > 0 {
		timer := time.NewTimer(time.Duration(route.DelayMS) * time.Millisecond)
		select {
		case <-timer.C:
		case <-request.Context().Done():
			timer.Stop()
			s.recordHit(Hit{
				RouteID:    route.ID,
				Method:     request.Method,
				Path:       request.URL.Path,
				RawQuery:   request.URL.RawQuery,
				Status:     clientClosedRequestStatus,
				Matched:    true,
				PathParams: params,
				Timestamp:  timestamp,
			}, started)
			return
		}
	}

	for name, value := range route.Headers {
		writer.Header().Set(name, value)
	}
	if writer.Header().Get("Content-Type") == "" {
		writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	}
	writer.WriteHeader(route.Status)
	if responseAllowsBody(request.Method, route.Status) {
		body := route.Body
		if strings.TrimSpace(body) == "" {
			body = "{}"
		}
		_, _ = io.WriteString(writer, body)
	}

	s.recordHit(Hit{
		RouteID:    route.ID,
		Method:     request.Method,
		Path:       request.URL.Path,
		RawQuery:   request.URL.RawQuery,
		Status:     route.Status,
		Matched:    true,
		PathParams: params,
		Timestamp:  timestamp,
	}, started)
}

func applyCORS(headers http.Header, request *http.Request) {
	headers.Set("Access-Control-Allow-Origin", "*")
	headers.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE")
	requestedHeaders := request.Header.Get("Access-Control-Request-Headers")
	if requestedHeaders == "" {
		requestedHeaders = "Content-Type, Authorization"
	}
	headers.Set("Access-Control-Allow-Headers", requestedHeaders)
	headers.Set("Access-Control-Max-Age", "600")
}

func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}

func (s *Server) match(method, path string) (*Route, map[string]string, []string) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	method = strings.ToUpper(method)
	allowedSet := make(map[string]struct{})
	var best *compiledRoute
	var bestMatches []string
	for i := range s.routes {
		compiled := &s.routes[i]
		if !compiled.route.Enabled {
			continue
		}
		matches := compiled.pathRE.FindStringSubmatch(path)
		if matches == nil {
			continue
		}
		if compiled.route.Method != method {
			allowedSet[compiled.route.Method] = struct{}{}
			continue
		}
		if best == nil || moreSpecific(compiled, best) {
			best = compiled
			bestMatches = matches
		}
	}
	if best != nil {
		params := make(map[string]string, len(best.paramNames))
		for index, name := range best.paramNames {
			params[name] = bestMatches[index+1]
		}
		route := cloneRoute(best.route)
		return &route, params, nil
	}

	allowed := make([]string, 0, len(allowedSet))
	for method := range allowedSet {
		allowed = append(allowed, method)
	}
	sort.Strings(allowed)
	return nil, nil, allowed
}

func moreSpecific(candidate, current *compiledRoute) bool {
	if candidate.literalSegments != current.literalSegments {
		return candidate.literalSegments > current.literalSegments
	}
	if candidate.literalBytes != current.literalBytes {
		return candidate.literalBytes > current.literalBytes
	}
	if len(candidate.paramNames) != len(current.paramNames) {
		return len(candidate.paramNames) < len(current.paramNames)
	}
	if candidate.route.Path != current.route.Path {
		return candidate.route.Path < current.route.Path
	}
	return candidate.route.ID < current.route.ID
}

func responseAllowsBody(method string, status int) bool {
	return method != http.MethodHead &&
		status != http.StatusNoContent &&
		status != http.StatusResetContent &&
		status != http.StatusNotModified
}

func (s *Server) recordHit(hit Hit, started time.Time) {
	hit.DurationMS = time.Since(started).Milliseconds()
	s.mu.Lock()
	s.hits.add(hit)
	s.mu.Unlock()
}

func compileRoutes(routes []Route) ([]compiledRoute, error) {
	if len(routes) > MaxRoutes {
		return nil, fmt.Errorf(
			"route table has %d routes; maximum is %d",
			len(routes),
			MaxRoutes,
		)
	}
	compiled := make([]compiledRoute, 0, len(routes))
	ids := make(map[string]struct{}, len(routes))
	signatures := make(map[string]string, len(routes))
	var retainedBodyBytes int64

	for index, original := range routes {
		route := cloneRoute(original)
		route.ID = strings.TrimSpace(route.ID)
		route.Method = strings.ToUpper(strings.TrimSpace(route.Method))

		if route.ID == "" {
			return nil, fmt.Errorf("route %d: id is required", index+1)
		}
		if len(route.ID) > MaxRouteIDBytes {
			return nil, fmt.Errorf(
				"route %d: id exceeds %d bytes",
				index+1,
				MaxRouteIDBytes,
			)
		}
		if _, exists := ids[route.ID]; exists {
			return nil, fmt.Errorf("route %q: duplicate route id", route.ID)
		}
		ids[route.ID] = struct{}{}

		if !validToken(route.Method) {
			return nil, fmt.Errorf("route %q: invalid method %q", route.ID, route.Method)
		}
		if route.Status < 200 || route.Status > 599 {
			return nil, fmt.Errorf("route %q: status must be between 200 and 599", route.ID)
		}
		if route.DelayMS < 0 || route.DelayMS > MaxDelayMS {
			return nil, fmt.Errorf("route %q: delayMs must be between 0 and %d", route.ID, MaxDelayMS)
		}
		if len(route.Body) > MaxRouteBodyBytes {
			return nil, fmt.Errorf(
				"route %q: body exceeds %d bytes",
				route.ID,
				MaxRouteBodyBytes,
			)
		}
		retainedBodyBytes += int64(len(route.Body))
		if retainedBodyBytes > MaxRouteTableBodyBytes {
			return nil, fmt.Errorf(
				"route table bodies exceed %d bytes",
				MaxRouteTableBodyBytes,
			)
		}
		if body := strings.TrimSpace(route.Body); body != "" && !json.Valid([]byte(body)) {
			return nil, fmt.Errorf("route %q: body must be valid JSON", route.ID)
		}
		if len(route.Headers) > MaxRouteHeaders {
			return nil, fmt.Errorf(
				"route %q: headers exceed the %d entry limit",
				route.ID,
				MaxRouteHeaders,
			)
		}
		canonicalHeaders := make(map[string]string, len(route.Headers))
		headerBytes := 0
		for name, value := range route.Headers {
			if !validToken(name) {
				return nil, fmt.Errorf("route %q: invalid header name %q", route.ID, name)
			}
			canonicalName := http.CanonicalHeaderKey(name)
			if _, duplicate := canonicalHeaders[canonicalName]; duplicate {
				return nil, fmt.Errorf(
					"route %q: duplicate header name %q",
					route.ID,
					canonicalName,
				)
			}
			if forbiddenMockResponseHeader(canonicalName) {
				return nil, fmt.Errorf(
					"route %q: response header %q is managed by the HTTP server",
					route.ID,
					canonicalName,
				)
			}
			if strings.ContainsAny(value, "\r\n") {
				return nil, fmt.Errorf("route %q: header %q contains a newline", route.ID, name)
			}
			headerBytes += len(canonicalName) + len(value)
			if headerBytes > MaxRouteHeaderBytes {
				return nil, fmt.Errorf(
					"route %q: headers exceed %d bytes",
					route.ID,
					MaxRouteHeaderBytes,
				)
			}
			canonicalHeaders[canonicalName] = value
		}
		route.Headers = canonicalHeaders

		pathRE, params, err := compilePath(route.Path)
		if err != nil {
			return nil, fmt.Errorf("route %q: %w", route.ID, err)
		}
		signature := route.Method + " " + routeTemplateKey(route.Path)
		if conflictingID, exists := signatures[signature]; exists {
			return nil, fmt.Errorf(
				"route %q conflicts with route %q: duplicate method and path template",
				route.ID,
				conflictingID,
			)
		}
		signatures[signature] = route.ID
		literalSegments, literalBytes := pathSpecificity(route.Path)
		compiled = append(compiled, compiledRoute{
			route:           route,
			pathRE:          pathRE,
			paramNames:      params,
			literalSegments: literalSegments,
			literalBytes:    literalBytes,
		})
	}
	return compiled, nil
}

func routeTemplateKey(path string) string {
	segments := strings.Split(path, "/")
	for index, segment := range segments {
		if len(segment) >= 2 && segment[0] == '{' && segment[len(segment)-1] == '}' {
			segments[index] = "{}"
		}
	}
	return strings.Join(segments, "/")
}

func pathSpecificity(path string) (literalSegments, literalBytes int) {
	for _, segment := range strings.Split(path, "/") {
		if len(segment) >= 2 && segment[0] == '{' && segment[len(segment)-1] == '}' {
			continue
		}
		if segment != "" {
			literalSegments++
			literalBytes += len(segment)
		}
	}
	return literalSegments, literalBytes
}

func compilePath(path string) (*regexp.Regexp, []string, error) {
	if path == "" || path[0] != '/' {
		return nil, nil, errors.New("path must start with /")
	}
	if !utf8.ValidString(path) {
		return nil, nil, errors.New("path must be valid UTF-8")
	}
	if len(path) > MaxRoutePathBytes {
		return nil, nil, fmt.Errorf(
			"path exceeds %d bytes",
			MaxRoutePathBytes,
		)
	}
	if strings.ContainsAny(path, "?#") {
		return nil, nil, errors.New("path must not contain a query or fragment")
	}
	for _, char := range path {
		if unicode.IsControl(char) || unicode.IsSpace(char) {
			return nil, nil, errors.New("path must not contain whitespace or control characters")
		}
	}

	segments := strings.Split(path, "/")
	params := make([]string, 0)
	seenParams := make(map[string]struct{})
	var expression strings.Builder
	expression.WriteString("^")
	for index, segment := range segments {
		if index > 0 {
			expression.WriteString("/")
		}
		if strings.HasPrefix(segment, "{") || strings.HasSuffix(segment, "}") {
			if len(segment) < 3 || segment[0] != '{' || segment[len(segment)-1] != '}' ||
				strings.Count(segment, "{") != 1 || strings.Count(segment, "}") != 1 {
				return nil, nil, fmt.Errorf("invalid path template segment %q", segment)
			}
			name := segment[1 : len(segment)-1]
			if !validParameterName(name) {
				return nil, nil, fmt.Errorf("invalid path parameter %q", name)
			}
			if _, exists := seenParams[name]; exists {
				return nil, nil, fmt.Errorf("duplicate path parameter %q", name)
			}
			seenParams[name] = struct{}{}
			params = append(params, name)
			expression.WriteString("([^/]+)")
			continue
		}
		if strings.ContainsAny(segment, "{}") {
			return nil, nil, fmt.Errorf("invalid path template segment %q", segment)
		}
		expression.WriteString(regexp.QuoteMeta(segment))
	}
	expression.WriteString("$")
	compiled, err := regexp.Compile(expression.String())
	return compiled, params, err
}

func forbiddenMockResponseHeader(name string) bool {
	switch name {
	case "Connection",
		"Content-Length",
		"Keep-Alive",
		"Proxy-Authenticate",
		"Proxy-Authorization",
		"Te",
		"Trailer",
		"Transfer-Encoding",
		"Upgrade":
		return true
	default:
		return false
	}
}

func validParameterName(value string) bool {
	if value == "" {
		return false
	}
	for index, char := range value {
		if index == 0 && !(char == '_' || unicode.IsLetter(char)) {
			return false
		}
		if index > 0 && !(char == '_' || unicode.IsLetter(char) || unicode.IsDigit(char)) {
			return false
		}
	}
	return true
}

func validToken(value string) bool {
	if value == "" {
		return false
	}
	for _, char := range value {
		if char > 127 || !strings.ContainsRune("!#$%&'*+-.^_`|~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", char) {
			return false
		}
	}
	return true
}

func cloneRoute(route Route) Route {
	clone := route
	if route.Headers != nil {
		clone.Headers = make(map[string]string, len(route.Headers))
		for name, value := range route.Headers {
			clone.Headers[name] = value
		}
	}
	return clone
}

type hitRing struct {
	limit  int
	values []Hit
	next   int
	total  uint64
}

func newHitRing(limit int) hitRing {
	return hitRing{limit: limit, values: make([]Hit, 0, limit)}
}

func (ring *hitRing) add(hit Hit) {
	ring.total++
	hit.ID = ring.total
	hit.PathParams = cloneStringMap(hit.PathParams)
	if len(ring.values) < ring.limit {
		ring.values = append(ring.values, hit)
		return
	}
	ring.values[ring.next] = hit
	ring.next = (ring.next + 1) % ring.limit
}

func (ring *hitRing) len() int {
	return len(ring.values)
}

func (ring *hitRing) list() []Hit {
	hits := make([]Hit, 0, len(ring.values))
	appendHit := func(hit Hit) {
		hit.PathParams = cloneStringMap(hit.PathParams)
		hits = append(hits, hit)
	}
	if len(ring.values) < ring.limit {
		for _, hit := range ring.values {
			appendHit(hit)
		}
		return hits
	}
	for _, hit := range ring.values[ring.next:] {
		appendHit(hit)
	}
	for _, hit := range ring.values[:ring.next] {
		appendHit(hit)
	}
	return hits
}

func (ring *hitRing) clear() {
	ring.values = ring.values[:0]
	ring.next = 0
	ring.total = 0
}

func cloneStringMap(input map[string]string) map[string]string {
	if input == nil {
		return nil
	}
	output := make(map[string]string, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}
