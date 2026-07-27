//go:build canbridge

package canbridge

import (
	"testing"
	"unsafe"
)

func TestNativeApplicationMetadataTrimsHostValues(t *testing.T) {
	appID, title := nativeApplicationMetadata(
		"  dev.validex.app  ",
		"  Validex  ",
	)
	if appID != "dev.validex.app" {
		t.Fatalf("unexpected application ID %q", appID)
	}
	if title != "Validex" {
		t.Fatalf("unexpected application title %q", title)
	}
}

func TestHasNativeWindowIconRequiresWindowAndPNGData(t *testing.T) {
	var nativeWindow byte
	window := unsafe.Pointer(&nativeWindow)

	tests := []struct {
		name    string
		window  unsafe.Pointer
		pngData []byte
		want    bool
	}{
		{name: "complete", window: window, pngData: []byte{1}, want: true},
		{name: "missing window", pngData: []byte{1}},
		{name: "missing data", window: window},
		{name: "empty", window: nil, pngData: nil},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := hasNativeWindowIcon(test.window, test.pngData); got != test.want {
				t.Fatalf("hasNativeWindowIcon() = %t, want %t", got, test.want)
			}
		})
	}
}
