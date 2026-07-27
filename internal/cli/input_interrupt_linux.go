package cli

import (
	"io"
	"os"
	"syscall"
)

// unblockNamedPipeOpen connects both ends of a FIFO without waiting for a peer.
// Keeping this descriptor open until the pending reader returns prevents a
// cancellation race between scheduling os.Open and connecting the FIFO.
func unblockNamedPipeOpen(path string) io.Closer {
	info, err := os.Stat(path)
	if err != nil || info.Mode()&os.ModeNamedPipe == 0 {
		return nil
	}
	descriptor, err := syscall.Open(
		path,
		syscall.O_RDWR|syscall.O_NONBLOCK,
		0,
	)
	if err != nil {
		return nil
	}
	return os.NewFile(uintptr(descriptor), path)
}
