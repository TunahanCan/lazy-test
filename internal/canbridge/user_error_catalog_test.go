package canbridge

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestAnalyzeNetworkReturnsSemanticErrorInsteadOfInlineDisplayText(t *testing.T) {
	bridge := NewBridge()
	Startup(bridge)(context.Background())
	t.Cleanup(func() { Shutdown(bridge)(context.Background()) })

	_, finish, err := bridge.beginToolOperation("network-duplicate")
	if err != nil {
		t.Fatalf("begin first operation: %v", err)
	}
	t.Cleanup(finish)

	result := bridge.AnalyzeNetwork(NetworkInspectInput{
		OperationID: "network-duplicate",
		URL:         "https://example.test",
	})
	if result.Error == nil {
		t.Fatal("AnalyzeNetwork() error = nil")
	}
	if result.Error.Code != UserErrorNetworkOperationInvalid ||
		result.Error.MessageKey !=
			"backend.error.automation.network.operation_invalid" {
		t.Fatalf("AnalyzeNetwork() error identity = %#v", result.Error)
	}
	if result.Error.Technical == "" {
		t.Fatalf("AnalyzeNetwork() omitted technical cause: %#v", result.Error)
	}
}

func TestNewUserErrorCarriesLocalizationContractAndLegacyFallback(t *testing.T) {
	definition := userErrorDefinition{
		Code:       UserErrorRequestTimeout,
		MessageKey: "backend.error.test.timeout",
		Title:      "{operation} tamamlanamadı",
		Message:    "{timeoutMs} ms içinde yanıt alınamadı.",
		Hint:       "{operation} ayarını kontrol edin.",
	}
	params := UserErrorParams{
		"operation": "Request",
		"timeoutMs": "2500",
	}
	cause := errors.New("context deadline exceeded")

	result := newUserError(definition, params, cause)
	params["operation"] = "değiştirildi"

	if result.Code != UserErrorRequestTimeout ||
		result.MessageKey != definition.MessageKey {
		t.Fatalf("localization identity = %#v", result)
	}
	if result.Title != "Request tamamlanamadı" ||
		result.Message != "2500 ms içinde yanıt alınamadı." ||
		result.Hint != "Request ayarını kontrol edin." {
		t.Fatalf("legacy fallback was not rendered: %#v", result)
	}
	if result.Params["operation"] != "Request" {
		t.Fatalf("params were not copied: %#v", result.Params)
	}
	if result.Technical != cause.Error() {
		t.Fatalf("technical = %q, want %q", result.Technical, cause)
	}
}

func TestUserErrorJSONRemainsBackwardCompatible(t *testing.T) {
	result := newUserError(
		automationNetworkOperationInvalidError,
		UserErrorParams{"operationId": "network-1"},
		errors.New("operation already running"),
	)
	payload, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal UserError: %v", err)
	}
	serialized := string(payload)
	for _, field := range []string{
		`"code":"network_operation_invalid"`,
		`"messageKey":"backend.error.automation.network.operation_invalid"`,
		`"params":{"operationId":"network-1"}`,
		`"title":"Ağ analizi başlatılamadı"`,
		`"message":"DNS ve redirect işlemi başlatılamadı."`,
		`"technical":"operation already running"`,
	} {
		if !strings.Contains(serialized, field) {
			t.Fatalf("UserError JSON %s does not contain %s", serialized, field)
		}
	}
}
