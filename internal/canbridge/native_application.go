//go:build canbridge

package canbridge

import (
	"strings"
	"unsafe"
)

func nativeApplicationMetadata(appID, title string) (string, string) {
	return strings.TrimSpace(appID), strings.TrimSpace(title)
}

func hasNativeWindowIcon(window unsafe.Pointer, pngData []byte) bool {
	return window != nil && len(pngData) > 0
}
