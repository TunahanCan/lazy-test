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

func TestInvokePreservesArgumentLimitAndPanicRecovery(t *testing.T) {
	oversized := strings.Repeat("x", maxBridgeArgumentsBytes+1)
	if _, err := NewBridge().Invoke(bridgeMethodBootstrap, oversized); err == nil ||
		err.Error() != "canbridge arguments exceed 33554432 bytes" {
		t.Fatalf("unexpected argument-limit error: %v", err)
	}

	var nilBridge *Bridge
	if _, err := nilBridge.Invoke(bridgeMethodGetMockServer, "[]"); err == nil ||
		err.Error() != "canbridge method GetMockServer panicked" {
		t.Fatalf("unexpected panic recovery error: %v", err)
	}
}

func TestTypedBridgeMethodAdaptersDecodeAndDispatch(t *testing.T) {
	zeroCalls := 0
	zero := registerBridgeMethod0(
		"Zero",
		func(bridge *Bridge) string {
			if bridge == nil {
				t.Fatal("zero-argument handler received a nil Bridge")
			}
			zeroCalls++
			return "zero-result"
		},
	)
	result, err := zero.invoke(NewBridge(), "[]")
	if err != nil {
		t.Fatal(err)
	}
	if result != "zero-result" || zeroCalls != 1 {
		t.Fatalf("zero-argument dispatch = %#v, calls = %d", result, zeroCalls)
	}
	if _, err := zero.invoke(NewBridge(), `[1]`); err == nil {
		t.Fatal("zero-argument adapter accepted an argument")
	}

	type typedArgument struct {
		Value string `json:"value"`
	}
	one := registerBridgeMethod1(
		"One",
		func(bridge *Bridge, argument typedArgument) string {
			if bridge == nil {
				t.Fatal("single-argument handler received a nil Bridge")
			}
			return argument.Value
		},
	)
	result, err = one.invoke(NewBridge(), `[{"value":"typed-result"}]`)
	if err != nil {
		t.Fatal(err)
	}
	if result != "typed-result" {
		t.Fatalf("single-argument dispatch = %#v, want typed-result", result)
	}
	if _, err := one.invoke(NewBridge(), `["wrong-type"]`); err == nil ||
		!strings.Contains(err.Error(), "decode canbridge argument 1") {
		t.Fatalf("unexpected typed decode error: %v", err)
	}
}

func TestBridgeMethodCatalogValidation(t *testing.T) {
	valid := registerBridgeMethod0(
		"Valid",
		func(*Bridge) bool { return true },
	)
	missingHandler := valid
	missingHandler.Name = "MissingHandler"
	missingHandler.invoke = nil
	serialWithoutBusy := valid
	serialWithoutBusy.Name = "SerialWithoutBusy"
	serialWithoutBusy.Policy = bridgeExecutionCollectionLibrarySerial
	concurrentWithBusy := valid
	concurrentWithBusy.Name = "ConcurrentWithBusy"
	concurrentWithBusy.BusyResult = func() any { return false }
	invalidPolicy := valid
	invalidPolicy.Name = "InvalidPolicy"
	invalidPolicy.Policy = bridgeExecutionPolicy(255)

	tests := []struct {
		name    string
		methods []bridgeMethodDescriptor
		want    string
	}{
		{
			name: "empty name",
			methods: []bridgeMethodDescriptor{
				registerBridgeMethod0("", func(*Bridge) bool { return true }),
			},
			want: "name is required",
		},
		{
			name: "surrounding whitespace",
			methods: []bridgeMethodDescriptor{
				registerBridgeMethod0(" Invalid", func(*Bridge) bool { return true }),
			},
			want: "surrounding whitespace",
		},
		{
			name:    "missing handler",
			methods: []bridgeMethodDescriptor{missingHandler},
			want:    "no invocation handler",
		},
		{
			name:    "duplicate name",
			methods: []bridgeMethodDescriptor{valid, valid},
			want:    "duplicate bridge method",
		},
		{
			name:    "serial missing busy result",
			methods: []bridgeMethodDescriptor{serialWithoutBusy},
			want:    "no typed busy result",
		},
		{
			name:    "concurrent busy result",
			methods: []bridgeMethodDescriptor{concurrentWithBusy},
			want:    "unused busy result",
		},
		{
			name:    "unsupported policy",
			methods: []bridgeMethodDescriptor{invalidPolicy},
			want:    "unsupported execution policy",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := newBridgeMethodCatalog(test.methods...); err == nil ||
				!strings.Contains(err.Error(), test.want) {
				t.Fatalf("catalog error = %v, want text %q", err, test.want)
			}
		})
	}
}

func TestBridgeMethodRegistryHasUniqueNamesAndCollectionPolicy(t *testing.T) {
	if len(bridgeMethodNames) != len(bridgeMethodRegistry.methods) {
		t.Fatalf(
			"advertised names = %d, registry entries = %d",
			len(bridgeMethodNames),
			len(bridgeMethodRegistry.methods),
		)
	}
	seen := make(map[string]struct{}, len(bridgeMethodRegistry.methods))
	for index, method := range bridgeMethodRegistry.methods {
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
		if method.invoke == nil {
			t.Fatalf("method %q has no typed invocation handler", method.Name)
		}
		registered, ok := bridgeMethodForName(method.Name)
		if !ok {
			t.Fatalf("method %q is advertised but not indexed", method.Name)
		}
		if registered.Name != method.Name || registered.Policy != method.Policy {
			t.Fatalf(
				"indexed method = %#v, want name %q and policy %d",
				registered,
				method.Name,
				method.Policy,
			)
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
	if _, ok := bridgeMethodForName("NotRegistered"); ok {
		t.Fatal("unknown method exists in registry index")
	}
}
