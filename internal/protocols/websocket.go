package protocols

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

const (
	WebSocketTextMessage   = "text"
	WebSocketBinaryMessage = "binary"

	defaultWebSocketMaxMessages     = 10
	hardWebSocketMaxMessages        = 10_000
	defaultWebSocketMaxSendMessages = 100
	hardWebSocketMaxSendMessages    = 1_000
	defaultWebSocketMaxMessageBytes = int64(1 << 20)
	hardWebSocketMaxMessageBytes    = int64(16 << 20)
	defaultWebSocketMaxSendBytes    = int64(8 << 20)
	defaultWebSocketMaxReceiveBytes = int64(16 << 20)
	hardWebSocketMaxTotalBytes      = int64(64 << 20)
)

// WebSocketMessage is one text or binary WebSocket message.
type WebSocketMessage struct {
	Type string
	Data []byte
}

// WebSocketRequest configures one bounded connect-send-read exchange.
type WebSocketRequest struct {
	URL                string
	Headers            map[string]string
	Subprotocols       []string
	Send               []WebSocketMessage
	Timeout            time.Duration
	MaxMessages        int
	MaxSendMessages    int
	MaxMessageBytes    int64
	MaxSendBytes       int64
	MaxReceiveBytes    int64
	InsecureSkipVerify bool
}

// WebSocketResult contains the opening handshake and received messages.
type WebSocketResult struct {
	StatusCode int
	Headers    http.Header
	Protocol   string
	Messages   []WebSocketMessage
	Duration   time.Duration
}

// ExchangeWebSocket connects, sends every configured message, then reads until
// the peer closes the connection or MaxMessages is reached.
func ExchangeWebSocket(parent context.Context, input WebSocketRequest) (WebSocketResult, error) {
	started := time.Now()
	var result WebSocketResult

	parsedURL, err := validateWebSocketURL(input.URL)
	if err != nil {
		return result, err
	}
	maxMessages, maxMessageBytes, maxSendBytes, maxReceiveBytes, err := normalizeWebSocketLimits(input)
	if err != nil {
		return result, err
	}
	maxSendMessages, err := normalizeWebSocketSendMessageLimit(input.MaxSendMessages)
	if err != nil {
		return result, err
	}
	headers, err := validatedHeaders(input.Headers)
	if err != nil {
		return result, err
	}
	if err := validateWebSocketHeaders(headers); err != nil {
		return result, err
	}
	if err := validateSubprotocols(input.Subprotocols); err != nil {
		return result, err
	}
	if len(input.Send) > maxSendMessages {
		return result, fmt.Errorf(
			"%w: WebSocket send frame count exceeds %d",
			ErrLimitExceeded,
			maxSendMessages,
		)
	}
	var totalSendBytes int64
	for index, message := range input.Send {
		if _, err := webSocketMessageType(message.Type); err != nil {
			return result, fmt.Errorf("send message %d: %w", index+1, err)
		}
		if int64(len(message.Data)) > maxMessageBytes {
			return result, fmt.Errorf(
				"%w: send message %d exceeds %d bytes",
				ErrLimitExceeded,
				index+1,
				maxMessageBytes,
			)
		}
		messageBytes := int64(len(message.Data))
		if messageBytes > maxSendBytes-totalSendBytes {
			return result, fmt.Errorf(
				"%w: WebSocket send payloads exceed %d bytes in total",
				ErrLimitExceeded,
				maxSendBytes,
			)
		}
		totalSendBytes += messageBytes
	}

	ctx, cancel, err := boundedContext(parent, input.Timeout)
	if err != nil {
		return result, err
	}
	defer cancel()

	dialer := websocket.Dialer{
		HandshakeTimeout: input.Timeout,
		Subprotocols:     append([]string(nil), input.Subprotocols...),
		TLSClientConfig: &tls.Config{
			MinVersion:         tls.VersionTLS12,
			InsecureSkipVerify: input.InsecureSkipVerify, //nolint:gosec // Explicit opt-in for local development.
		},
	}
	if dialer.HandshakeTimeout == 0 {
		dialer.HandshakeTimeout = defaultTimeout
	}
	connection, response, err := dialer.DialContext(ctx, parsedURL.String(), headers)
	if response != nil {
		result.StatusCode = response.StatusCode
		result.Headers = cloneHeader(response.Header)
		_ = response.Body.Close()
	}
	if err != nil {
		return result, fmt.Errorf("connect WebSocket: %w", err)
	}
	defer connection.Close()

	result.StatusCode = http.StatusSwitchingProtocols
	result.Protocol = connection.Subprotocol()
	connection.SetReadLimit(maxMessageBytes)
	if deadline, ok := ctx.Deadline(); ok {
		if err := connection.SetReadDeadline(deadline); err != nil {
			return result, fmt.Errorf("set WebSocket read deadline: %w", err)
		}
		if err := connection.SetWriteDeadline(deadline); err != nil {
			return result, fmt.Errorf("set WebSocket write deadline: %w", err)
		}
	}

	watchDone := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			_ = connection.Close()
		case <-watchDone:
		}
	}()
	defer close(watchDone)

	for index, message := range input.Send {
		wireType, _ := webSocketMessageType(message.Type)
		if err := connection.WriteMessage(wireType, message.Data); err != nil {
			return result, fmt.Errorf("send WebSocket message %d: %w", index+1, contextAwareError(ctx, err))
		}
	}

	result.Messages = make([]WebSocketMessage, 0, min(maxMessages, 16))
	var totalReceiveBytes int64
	for len(result.Messages) < maxMessages {
		wireType, data, err := connection.ReadMessage()
		if err != nil {
			result.Duration = time.Since(started)
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				return result, nil
			}
			if strings.Contains(err.Error(), "read limit exceeded") ||
				websocket.IsCloseError(err, websocket.CloseMessageTooBig) {
				return result, fmt.Errorf("%w: WebSocket message exceeds %d bytes", ErrLimitExceeded, maxMessageBytes)
			}
			return result, fmt.Errorf("read WebSocket message: %w", contextAwareError(ctx, err))
		}
		messageType, ok := receivedWebSocketMessageType(wireType)
		if !ok {
			continue
		}
		messageBytes := int64(len(data))
		if messageBytes > maxReceiveBytes-totalReceiveBytes {
			result.Duration = time.Since(started)
			return result, fmt.Errorf(
				"%w: WebSocket received payloads exceed %d bytes in total",
				ErrLimitExceeded,
				maxReceiveBytes,
			)
		}
		totalReceiveBytes += messageBytes
		result.Messages = append(result.Messages, WebSocketMessage{
			Type: messageType,
			Data: append([]byte(nil), data...),
		})
	}

	result.Duration = time.Since(started)
	_ = connection.WriteControl(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
		time.Now().Add(time.Second),
	)
	return result, nil
}

func validateWebSocketURL(raw string) (*url.URL, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil, errors.New("WebSocket URL is required")
	}
	parsed, err := url.ParseRequestURI(value)
	if err != nil {
		return nil, fmt.Errorf("invalid WebSocket URL: %w", err)
	}
	if parsed.Scheme != "ws" && parsed.Scheme != "wss" {
		return nil, errors.New("WebSocket URL must use ws or wss")
	}
	if parsed.Host == "" {
		return nil, errors.New("WebSocket URL must include a host")
	}
	if parsed.User != nil {
		return nil, errors.New("WebSocket URL cannot contain user information")
	}
	return parsed, nil
}

func normalizeWebSocketLimits(input WebSocketRequest) (int, int64, int64, int64, error) {
	maxMessages := input.MaxMessages
	if maxMessages == 0 {
		maxMessages = defaultWebSocketMaxMessages
	}
	if maxMessages < 1 || maxMessages > hardWebSocketMaxMessages {
		return 0, 0, 0, 0, fmt.Errorf(
			"max messages must be between 1 and %d",
			hardWebSocketMaxMessages,
		)
	}
	maxMessageBytes := input.MaxMessageBytes
	if maxMessageBytes == 0 {
		maxMessageBytes = defaultWebSocketMaxMessageBytes
	}
	if maxMessageBytes < 1 || maxMessageBytes > hardWebSocketMaxMessageBytes {
		return 0, 0, 0, 0, fmt.Errorf(
			"max message bytes must be between 1 and %d",
			hardWebSocketMaxMessageBytes,
		)
	}
	maxSendBytes := input.MaxSendBytes
	if maxSendBytes == 0 {
		maxSendBytes = defaultWebSocketMaxSendBytes
	}
	if maxSendBytes < 1 || maxSendBytes > hardWebSocketMaxTotalBytes {
		return 0, 0, 0, 0, fmt.Errorf(
			"max send bytes must be between 1 and %d",
			hardWebSocketMaxTotalBytes,
		)
	}
	maxReceiveBytes := input.MaxReceiveBytes
	if maxReceiveBytes == 0 {
		maxReceiveBytes = defaultWebSocketMaxReceiveBytes
	}
	if maxReceiveBytes < 1 || maxReceiveBytes > hardWebSocketMaxTotalBytes {
		return 0, 0, 0, 0, fmt.Errorf(
			"max receive bytes must be between 1 and %d",
			hardWebSocketMaxTotalBytes,
		)
	}
	return maxMessages, maxMessageBytes, maxSendBytes, maxReceiveBytes, nil
}

func normalizeWebSocketSendMessageLimit(value int) (int, error) {
	if value == 0 {
		return defaultWebSocketMaxSendMessages, nil
	}
	if value < 1 || value > hardWebSocketMaxSendMessages {
		return 0, fmt.Errorf(
			"max send messages must be between 1 and %d",
			hardWebSocketMaxSendMessages,
		)
	}
	return value, nil
}

func validateWebSocketHeaders(headers http.Header) error {
	for _, name := range []string{
		"Connection",
		"Sec-Websocket-Extensions",
		"Sec-Websocket-Key",
		"Sec-Websocket-Version",
		"Upgrade",
	} {
		if headers.Get(name) != "" {
			return fmt.Errorf("WebSocket header %q is managed by the client", name)
		}
	}
	return nil
}

func validateSubprotocols(protocols []string) error {
	for _, protocol := range protocols {
		if protocol == "" {
			return errors.New("WebSocket subprotocol cannot be empty")
		}
		for _, char := range protocol {
			if !isHTTPTokenRune(char) {
				return fmt.Errorf("invalid WebSocket subprotocol %q", protocol)
			}
		}
	}
	return nil
}

func webSocketMessageType(messageType string) (int, error) {
	switch strings.ToLower(strings.TrimSpace(messageType)) {
	case WebSocketTextMessage:
		return websocket.TextMessage, nil
	case WebSocketBinaryMessage:
		return websocket.BinaryMessage, nil
	default:
		return 0, errors.New("WebSocket message type must be text or binary")
	}
}

func receivedWebSocketMessageType(wireType int) (string, bool) {
	switch wireType {
	case websocket.TextMessage:
		return WebSocketTextMessage, true
	case websocket.BinaryMessage:
		return WebSocketBinaryMessage, true
	default:
		return "", false
	}
}

func contextAwareError(ctx context.Context, err error) error {
	if contextErr := ctx.Err(); contextErr != nil {
		return contextErr
	}
	var networkError net.Error
	if errors.As(err, &networkError) && networkError.Timeout() {
		return context.DeadlineExceeded
	}
	return err
}
