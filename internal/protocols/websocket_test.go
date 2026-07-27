package protocols

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestExchangeWebSocketSendsAndReceivesTextAndBinary(t *testing.T) {
	t.Parallel()

	upgrader := websocket.Upgrader{
		CheckOrigin:  func(*http.Request) bool { return true },
		Subprotocols: []string{"validex.v1"},
	}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if got := request.Header.Get("X-Validex-Test"); got != "enabled" {
			http.Error(writer, "missing test header", http.StatusBadRequest)
			return
		}
		connection, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			return
		}
		defer connection.Close()
		for index := 0; index < 2; index++ {
			messageType, payload, readErr := connection.ReadMessage()
			if readErr != nil {
				return
			}
			if writeErr := connection.WriteMessage(messageType, payload); writeErr != nil {
				return
			}
		}
	}))
	t.Cleanup(server.Close)

	result, err := ExchangeWebSocket(context.Background(), WebSocketRequest{
		URL:          websocketURL(server.URL),
		Headers:      map[string]string{"X-Validex-Test": "enabled"},
		Subprotocols: []string{"validex.v1"},
		Send: []WebSocketMessage{
			{Type: WebSocketTextMessage, Data: []byte("hello")},
			{Type: WebSocketBinaryMessage, Data: []byte{0x00, 0x01, 0x02}},
		},
		Timeout:     time.Second,
		MaxMessages: 2,
	})
	if err != nil {
		t.Fatalf("ExchangeWebSocket returned an error: %v", err)
	}
	if result.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("status = %d, want %d", result.StatusCode, http.StatusSwitchingProtocols)
	}
	if result.Protocol != "validex.v1" {
		t.Fatalf("protocol = %q, want validex.v1", result.Protocol)
	}
	if len(result.Messages) != 2 {
		t.Fatalf("messages = %d, want 2", len(result.Messages))
	}
	if result.Messages[0].Type != WebSocketTextMessage ||
		string(result.Messages[0].Data) != "hello" {
		t.Fatalf("text message = %#v", result.Messages[0])
	}
	if result.Messages[1].Type != WebSocketBinaryMessage ||
		string(result.Messages[1].Data) != string([]byte{0x00, 0x01, 0x02}) {
		t.Fatalf("binary message = %#v", result.Messages[1])
	}
}

func TestExchangeWebSocketReturnsNormalClose(t *testing.T) {
	t.Parallel()

	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		connection, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			return
		}
		defer connection.Close()
		_ = connection.WriteControl(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, "complete"),
			time.Now().Add(time.Second),
		)
	}))
	t.Cleanup(server.Close)

	result, err := ExchangeWebSocket(context.Background(), WebSocketRequest{
		URL:         websocketURL(server.URL),
		Timeout:     time.Second,
		MaxMessages: 2,
	})
	if err != nil {
		t.Fatalf("ExchangeWebSocket returned an error: %v", err)
	}
	if len(result.Messages) != 0 {
		t.Fatalf("messages = %d, want 0", len(result.Messages))
	}
}

func TestExchangeWebSocketOverTLS(t *testing.T) {
	t.Parallel()

	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		connection, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			return
		}
		defer connection.Close()
		messageType, payload, err := connection.ReadMessage()
		if err != nil {
			return
		}
		_ = connection.WriteMessage(messageType, payload)
	}))
	t.Cleanup(server.Close)

	result, err := ExchangeWebSocket(context.Background(), WebSocketRequest{
		URL:                secureWebSocketURL(server.URL),
		Send:               []WebSocketMessage{{Type: WebSocketTextMessage, Data: []byte("secure")}},
		Timeout:            time.Second,
		MaxMessages:        1,
		InsecureSkipVerify: true,
	})
	if err != nil {
		t.Fatalf("ExchangeWebSocket returned an error: %v", err)
	}
	if len(result.Messages) != 1 || string(result.Messages[0].Data) != "secure" {
		t.Fatalf("messages = %#v, want one secure message", result.Messages)
	}
}

func TestExchangeWebSocketHonorsTimeout(t *testing.T) {
	t.Parallel()

	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		connection, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			return
		}
		defer connection.Close()
		<-request.Context().Done()
	}))
	t.Cleanup(server.Close)

	_, err := ExchangeWebSocket(context.Background(), WebSocketRequest{
		URL:         websocketURL(server.URL),
		Timeout:     100 * time.Millisecond,
		MaxMessages: 1,
	})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("error = %v, want context.DeadlineExceeded", err)
	}
}

func TestExchangeWebSocketRejectsOversizedSend(t *testing.T) {
	t.Parallel()

	_, err := ExchangeWebSocket(context.Background(), WebSocketRequest{
		URL:             "ws://example.test/socket",
		MaxMessageBytes: 4,
		Send: []WebSocketMessage{
			{Type: WebSocketTextMessage, Data: []byte("12345")},
		},
	})
	if !errors.Is(err, ErrLimitExceeded) {
		t.Fatalf("error = %v, want ErrLimitExceeded", err)
	}
}

func TestExchangeWebSocketRejectsOversizedAggregateSend(t *testing.T) {
	t.Parallel()

	_, err := ExchangeWebSocket(context.Background(), WebSocketRequest{
		URL:             "ws://example.test/socket",
		MaxMessageBytes: 4,
		MaxSendBytes:    5,
		Send: []WebSocketMessage{
			{Type: WebSocketTextMessage, Data: []byte("123")},
			{Type: WebSocketBinaryMessage, Data: []byte("456")},
		},
	})
	if !errors.Is(err, ErrLimitExceeded) {
		t.Fatalf("error = %v, want aggregate ErrLimitExceeded", err)
	}
}

func TestExchangeWebSocketBoundsSendFrameCount(t *testing.T) {
	t.Parallel()

	tests := map[string]WebSocketRequest{
		"default limit": {
			URL:  "ws://example.test/socket",
			Send: make([]WebSocketMessage, defaultWebSocketMaxSendMessages+1),
		},
		"configured lower limit": {
			URL:             "ws://example.test/socket",
			MaxSendMessages: 1,
			Send: []WebSocketMessage{
				{Type: WebSocketTextMessage},
				{Type: WebSocketBinaryMessage},
			},
		},
	}
	for name, input := range tests {
		input := input
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			for index := range input.Send {
				input.Send[index].Type = WebSocketTextMessage
			}
			_, err := ExchangeWebSocket(context.Background(), input)
			if !errors.Is(err, ErrLimitExceeded) {
				t.Fatalf("error = %v, want send-frame ErrLimitExceeded", err)
			}
		})
	}
}

func TestExchangeWebSocketPreservesMessagesBeforeAggregateReceiveLimit(t *testing.T) {
	t.Parallel()

	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		connection, err := upgrader.Upgrade(writer, request, nil)
		if err != nil {
			return
		}
		defer connection.Close()
		if err := connection.WriteMessage(websocket.TextMessage, []byte("1234")); err != nil {
			return
		}
		_ = connection.WriteMessage(websocket.BinaryMessage, []byte("5678"))
	}))
	t.Cleanup(server.Close)

	result, err := ExchangeWebSocket(context.Background(), WebSocketRequest{
		URL:             websocketURL(server.URL),
		Timeout:         time.Second,
		MaxMessages:     2,
		MaxMessageBytes: 4,
		MaxReceiveBytes: 6,
	})
	if !errors.Is(err, ErrLimitExceeded) {
		t.Fatalf("error = %v, want aggregate ErrLimitExceeded", err)
	}
	if len(result.Messages) != 1 ||
		result.Messages[0].Type != WebSocketTextMessage ||
		string(result.Messages[0].Data) != "1234" {
		t.Fatalf("messages before limit = %#v, want first text message", result.Messages)
	}
}

func TestExchangeWebSocketValidatesInput(t *testing.T) {
	t.Parallel()

	for name, input := range map[string]WebSocketRequest{
		"missing URL":        {},
		"unsupported scheme": {URL: "https://example.test/socket"},
		"managed header": {
			URL:     "ws://example.test/socket",
			Headers: map[string]string{"Upgrade": "websocket"},
		},
		"invalid subprotocol": {
			URL:          "ws://example.test/socket",
			Subprotocols: []string{"invalid protocol"},
		},
		"invalid message type": {
			URL:  "ws://example.test/socket",
			Send: []WebSocketMessage{{Type: "json", Data: []byte("{}")}},
		},
		"invalid send byte limit": {
			URL:          "ws://example.test/socket",
			MaxSendBytes: hardWebSocketMaxTotalBytes + 1,
		},
		"invalid receive byte limit": {
			URL:             "ws://example.test/socket",
			MaxReceiveBytes: hardWebSocketMaxTotalBytes + 1,
		},
		"invalid send frame limit": {
			URL:             "ws://example.test/socket",
			MaxSendMessages: hardWebSocketMaxSendMessages + 1,
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, err := ExchangeWebSocket(context.Background(), input); err == nil {
				t.Fatal("ExchangeWebSocket returned nil error")
			}
		})
	}
}

func websocketURL(serverURL string) string {
	return "ws" + strings.TrimPrefix(serverURL, "http")
}

func secureWebSocketURL(serverURL string) string {
	return "wss" + strings.TrimPrefix(serverURL, "https")
}
