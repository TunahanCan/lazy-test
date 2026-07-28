//go:build !aix && !darwin && !dragonfly && !freebsd && !linux && !netbsd && !openbsd && !solaris

package cli

import "io"

func unblockNamedPipeOpen(string) io.Closer {
	return nil
}
