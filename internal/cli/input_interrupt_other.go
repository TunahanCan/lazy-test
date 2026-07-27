//go:build !linux

package cli

import "io"

func unblockNamedPipeOpen(string) io.Closer {
	return nil
}
