//go:build canbridge && cgo

// Package nativewebview owns the small native WebView surface used by Validex.
package nativewebview

/*
#cgo CFLAGS: -I${SRCDIR}/third_party/webview
#cgo CXXFLAGS: -I${SRCDIR}/third_party/webview -DWEBVIEW_STATIC

#cgo linux openbsd freebsd netbsd CXXFLAGS: -DWEBVIEW_GTK -std=c++11
#cgo linux openbsd freebsd netbsd LDFLAGS: -ldl
#cgo linux openbsd freebsd netbsd pkg-config: gtk+-3.0 webkit2gtk-4.1

#cgo darwin CXXFLAGS: -DWEBVIEW_COCOA -std=c++11
#cgo darwin LDFLAGS: -framework WebKit -ldl

#cgo windows CXXFLAGS: -DWEBVIEW_EDGE -std=c++14 -I${SRCDIR}/third_party/webview2
#cgo windows LDFLAGS: -static -ladvapi32 -lole32 -lshell32 -lshlwapi -luser32 -lversion

#include "webview.h"

#include <stdint.h>
#include <stdlib.h>

typedef struct nativewebview_binding_context nativewebview_binding_context;

void nativewebview_dispatch(webview_t view, uintptr_t handle);
nativewebview_binding_context *nativewebview_bind(
	webview_t view,
	const char *name,
	uintptr_t handle
);
void nativewebview_free_binding_context(
	nativewebview_binding_context *context
);
*/
import "C"

import (
	"encoding/json"
	"errors"
	"log"
	"runtime"
	"runtime/cgo"
	"sync"
	"unsafe"
)

func init() {
	// Native UI frameworks require main.main to remain on the initial OS thread.
	runtime.LockOSThread()
}

// Hint describes how SetSize should interpret the supplied dimensions.
type Hint uint8

const (
	// HintNone sets the current window size.
	HintNone Hint = iota
	// HintMin sets the minimum window size.
	HintMin
)

// BindingHandler handles the raw JSON argument array from a JavaScript call.
// A nil error resolves the JavaScript promise with null.
type BindingHandler func(requestJSON string) error

// WebView is the complete native-window surface used by Validex. Dispatch is
// background-safe; all other methods belong to the locked native UI thread,
// and Destroy must not overlap Run.
type WebView interface {
	Run()
	Dispatch(func())
	Destroy()
	Window() unsafe.Pointer
	SetTitle(string)
	SetSize(int, int, Hint)
	Navigate(string)
	Init(string)
	Eval(string)
	Bind(string, BindingHandler) error
}

type bindingRegistration struct {
	context *C.nativewebview_binding_context
	handle  cgo.Handle
}

type dispatchRegistration struct {
	owner    *view
	callback func()
}

type view struct {
	mu sync.Mutex

	native     C.webview_t
	destroyed  bool
	bindings   map[string]bindingRegistration
	dispatches map[cgo.Handle]struct{}
}

// New creates a top-level native window with an embedded system WebView.
func New(debug bool) WebView {
	native := C.webview_create(booleanInteger(debug), nil)
	if native == nil {
		return nil
	}
	return &view{
		native:     native,
		bindings:   make(map[string]bindingRegistration),
		dispatches: make(map[cgo.Handle]struct{}),
	}
}

func booleanInteger(value bool) C.int {
	if value {
		return 1
	}
	return 0
}

func (v *view) Run() {
	v.mu.Lock()
	if v.destroyed {
		v.mu.Unlock()
		return
	}
	native := v.native
	v.mu.Unlock()

	C.webview_run(native)
}

func (v *view) Dispatch(callback func()) {
	if callback == nil {
		return
	}

	handle := cgo.NewHandle(dispatchRegistration{
		owner:    v,
		callback: callback,
	})

	v.mu.Lock()
	if v.destroyed {
		v.mu.Unlock()
		handle.Delete()
		return
	}
	v.dispatches[handle] = struct{}{}
	C.nativewebview_dispatch(v.native, C.uintptr_t(handle))
	v.mu.Unlock()
}

func (v *view) Destroy() {
	v.mu.Lock()
	if v.destroyed {
		v.mu.Unlock()
		return
	}
	v.destroyed = true
	native := v.native
	v.native = nil
	v.mu.Unlock()

	// Destroying the platform view releases its C++ binding callbacks. Their
	// Go handles and small C contexts can then be released without dangling
	// native references.
	C.webview_destroy(native)

	v.mu.Lock()
	bindings := v.bindings
	dispatches := v.dispatches
	v.bindings = nil
	v.dispatches = nil
	v.mu.Unlock()

	for _, binding := range bindings {
		binding.handle.Delete()
		C.nativewebview_free_binding_context(binding.context)
	}
	for handle := range dispatches {
		handle.Delete()
	}
}

func (v *view) Window() unsafe.Pointer {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.destroyed {
		return nil
	}
	return C.webview_get_window(v.native)
}

func (v *view) SetTitle(title string) {
	nativeTitle := C.CString(title)
	defer C.free(unsafe.Pointer(nativeTitle))

	v.mu.Lock()
	defer v.mu.Unlock()
	if !v.destroyed {
		C.webview_set_title(v.native, nativeTitle)
	}
}

func (v *view) SetSize(width, height int, hint Hint) {
	nativeHint := C.webview_hint_t(C.WEBVIEW_HINT_NONE)
	if hint == HintMin {
		nativeHint = C.webview_hint_t(C.WEBVIEW_HINT_MIN)
	}

	v.mu.Lock()
	defer v.mu.Unlock()
	if !v.destroyed {
		C.webview_set_size(v.native, C.int(width), C.int(height), nativeHint)
	}
}

func (v *view) Navigate(url string) {
	nativeURL := C.CString(url)
	defer C.free(unsafe.Pointer(nativeURL))

	v.mu.Lock()
	defer v.mu.Unlock()
	if !v.destroyed {
		C.webview_navigate(v.native, nativeURL)
	}
}

func (v *view) Init(script string) {
	nativeScript := C.CString(script)
	defer C.free(unsafe.Pointer(nativeScript))

	v.mu.Lock()
	defer v.mu.Unlock()
	if !v.destroyed {
		C.webview_init(v.native, nativeScript)
	}
}

func (v *view) Eval(script string) {
	nativeScript := C.CString(script)
	defer C.free(unsafe.Pointer(nativeScript))

	v.mu.Lock()
	defer v.mu.Unlock()
	if !v.destroyed {
		C.webview_eval(v.native, nativeScript)
	}
}

func (v *view) Bind(name string, handler BindingHandler) error {
	if !validBindingName(name) {
		return errors.New(
			"native WebView binding name must be an ASCII JavaScript identifier",
		)
	}
	if handler == nil {
		return errors.New("native WebView binding handler is nil")
	}

	nativeName := C.CString(name)
	defer C.free(unsafe.Pointer(nativeName))
	handle := cgo.NewHandle(handler)

	v.mu.Lock()
	defer v.mu.Unlock()
	if v.destroyed {
		handle.Delete()
		return errors.New("native WebView is destroyed")
	}
	if _, exists := v.bindings[name]; exists {
		handle.Delete()
		return errors.New("native WebView binding already exists")
	}

	context := C.nativewebview_bind(
		v.native,
		nativeName,
		C.uintptr_t(handle),
	)
	if context == nil {
		handle.Delete()
		return errors.New("allocate native WebView binding context")
	}
	v.bindings[name] = bindingRegistration{
		context: context,
		handle:  handle,
	}
	return nil
}

func validBindingName(name string) bool {
	if name == "" || !validBindingNameCharacter(name[0], true) {
		return false
	}
	for index := 1; index < len(name); index++ {
		if !validBindingNameCharacter(name[index], false) {
			return false
		}
	}
	return true
}

func validBindingNameCharacter(character byte, first bool) bool {
	return character == '_' ||
		character == '$' ||
		character >= 'a' && character <= 'z' ||
		character >= 'A' && character <= 'Z' ||
		!first && character >= '0' && character <= '9'
}

//export nativewebviewDispatchGoCallback
func nativewebviewDispatchGoCallback(handleValue C.uintptr_t) {
	defer func() {
		if recovered := recover(); recovered != nil {
			log.Printf(
				"[nativewebview:error] dispatch callback panicked: %v",
				recovered,
			)
		}
	}()

	handle := cgo.Handle(handleValue)
	registration := handle.Value().(dispatchRegistration)

	registration.owner.mu.Lock()
	_, pending := registration.owner.dispatches[handle]
	if pending {
		delete(registration.owner.dispatches, handle)
	}
	registration.owner.mu.Unlock()
	if !pending {
		return
	}

	handle.Delete()
	registration.callback()
}

//export nativewebviewBindingGoCallback
func nativewebviewBindingGoCallback(
	native C.webview_t,
	sequence *C.char,
	request *C.char,
	handleValue C.uintptr_t,
) {
	result := "null"
	status := C.int(0)
	if err := invokeBindingHandler(
		cgo.Handle(handleValue),
		C.GoString(request),
	); err != nil {
		status = -1
		encodedError, _ := json.Marshal(err.Error())
		result = string(encodedError)
	}

	nativeResult := C.CString(result)
	defer C.free(unsafe.Pointer(nativeResult))
	C.webview_return(native, sequence, status, nativeResult)
}

func invokeBindingHandler(
	handle cgo.Handle,
	requestJSON string,
) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			log.Printf(
				"[nativewebview:error] binding callback panicked: %v",
				recovered,
			)
			err = errors.New("native WebView binding callback failed")
		}
	}()

	handler := handle.Value().(BindingHandler)
	return handler(requestJSON)
}
