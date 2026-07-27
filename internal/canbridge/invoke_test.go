package canbridge

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestInvokeDispatchesRegisteredMethod(t *testing.T) {
	result, err := NewBridge().Invoke("Bootstrap", "[]")
	if err != nil {
		t.Fatal(err)
	}
	bootstrap, ok := result.(BootstrapData)
	if !ok {
		t.Fatalf("result type = %T, want BootstrapData", result)
	}
	if bootstrap.WorkspaceID != "validex-workspace" {
		t.Fatalf("unexpected workspace ID: %q", bootstrap.WorkspaceID)
	}
}

func TestInvokeDecodesTypedArguments(t *testing.T) {
	encoded, err := json.Marshal([]any{"missing-request"})
	if err != nil {
		t.Fatal(err)
	}
	result, err := NewBridge().Invoke("CancelRequest", string(encoded))
	if err != nil {
		t.Fatal(err)
	}
	canceled, ok := result.(bool)
	if !ok || canceled {
		t.Fatalf("result = %#v, want false", result)
	}
}

func TestInvokeRejectsUnknownMethodsAndInvalidArguments(t *testing.T) {
	bridge := NewBridge()
	if _, err := bridge.Invoke("ResetEndpointCoverage", "[]"); err == nil ||
		!strings.Contains(err.Error(), "not registered") {
		t.Fatalf("unexpected unknown-method error: %v", err)
	}
	if _, err := bridge.Invoke("Bootstrap", `[1]`); err == nil {
		t.Fatal("Bootstrap accepted unexpected arguments")
	}
	if _, err := bridge.Invoke("CancelRequest", `["one","two"]`); err == nil {
		t.Fatal("CancelRequest accepted an invalid argument count")
	}
}
