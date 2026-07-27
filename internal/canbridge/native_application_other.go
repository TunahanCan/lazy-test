//go:build canbridge && !linux && !darwin

package canbridge

import "unsafe"

func prepareNativeApplication(_, _ string) {}

func applyNativeWindowIcon(_ unsafe.Pointer, _ []byte) error {
	return nil
}
