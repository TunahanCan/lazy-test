package canbridge

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestInvokeDispatchesRegisteredMethod(t *testing.T) {
	result, err := NewBridge().Invoke(bridgeMethodBootstrap, "[]")
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
	result, err := NewBridge().Invoke(bridgeMethodCancelRequest, string(encoded))
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
	if _, err := bridge.Invoke(bridgeMethodBootstrap, `[1]`); err == nil {
		t.Fatal("Bootstrap accepted unexpected arguments")
	}
	if _, err := bridge.Invoke(
		bridgeMethodCancelRequest,
		`["one","two"]`,
	); err == nil {
		t.Fatal("CancelRequest accepted an invalid argument count")
	}
}

func TestBridgeMethodRegistryHasUniqueNamesAndCollectionPolicy(t *testing.T) {
	if len(bridgeMethodNames) != len(bridgeMethodRegistry) {
		t.Fatalf(
			"advertised names = %d, registry entries = %d",
			len(bridgeMethodNames),
			len(bridgeMethodRegistry),
		)
	}
	seen := make(map[string]struct{}, len(bridgeMethodRegistry))
	for index, method := range bridgeMethodRegistry {
		if method.Name == "" {
			t.Fatalf("registry entry %d has an empty name", index)
		}
		if _, duplicate := seen[method.Name]; duplicate {
			t.Fatalf("registry contains duplicate method %q", method.Name)
		}
		seen[method.Name] = struct{}{}
		if bridgeMethodNames[index] != method.Name {
			t.Fatalf(
				"advertised method %d = %q, want %q",
				index,
				bridgeMethodNames[index],
				method.Name,
			)
		}
		if method.Policy == bridgeExecutionCollectionLibrarySerial &&
			method.BusyResult == nil {
			t.Fatalf("serial method %q has no typed busy result", method.Name)
		}
	}

	for _, method := range []string{
		bridgeMethodLoadCollectionLibrary,
		bridgeMethodSaveCollectionLibrary,
	} {
		if policy := executionPolicyForBridgeMethod(method); policy !=
			bridgeExecutionCollectionLibrarySerial {
			t.Fatalf("%s policy = %d, want collection serial", method, policy)
		}
	}
	if policy := executionPolicyForBridgeMethod(bridgeMethodBootstrap); policy !=
		bridgeExecutionConcurrent {
		t.Fatalf("Bootstrap policy = %d, want concurrent", policy)
	}
}
