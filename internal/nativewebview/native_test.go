//go:build canbridge && cgo

package nativewebview

import (
	"errors"
	"runtime/cgo"
	"testing"
)

func TestValidBindingName(t *testing.T) {
	t.Parallel()

	for _, name := range []string{
		"__canbridgeNativeDispatch",
		"_binding",
		"$binding2",
		"binding_3",
	} {
		if !validBindingName(name) {
			t.Errorf("validBindingName(%q) = false, want true", name)
		}
	}
	for _, name := range []string{
		"",
		"2binding",
		"binding-name",
		"binding.name",
		"binding'",
		"bağlama",
	} {
		if validBindingName(name) {
			t.Errorf("validBindingName(%q) = true, want false", name)
		}
	}
}

func TestInvokeBindingHandler(t *testing.T) {
	t.Parallel()

	handlerError := errors.New("handler rejected request")
	var received string
	handle := cgo.NewHandle(BindingHandler(func(requestJSON string) error {
		received = requestJSON
		return handlerError
	}))
	defer handle.Delete()

	err := invokeBindingHandler(handle, `["request"]`)
	if !errors.Is(err, handlerError) {
		t.Fatalf("invokeBindingHandler() error = %v, want %v", err, handlerError)
	}
	if received != `["request"]` {
		t.Fatalf("handler request = %q, want %q", received, `["request"]`)
	}
}

func TestInvokeBindingHandlerRecoversPanic(t *testing.T) {
	t.Parallel()

	handle := cgo.NewHandle(BindingHandler(func(string) error {
		panic("test panic")
	}))
	defer handle.Delete()

	if err := invokeBindingHandler(handle, `[]`); err == nil {
		t.Fatal("invokeBindingHandler() accepted a panicking handler")
	}
}
