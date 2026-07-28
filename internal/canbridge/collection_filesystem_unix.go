//go:build linux || darwin

package canbridge

import (
	"context"
	"errors"
	"fmt"
	"os"

	"golang.org/x/sys/unix"
)

type collectionLibraryFileLock struct{}

func lockCollectionLibraryFile(
	ctx context.Context,
	file *os.File,
) (collectionLibraryFileLock, error) {
	for {
		err := unix.Flock(int(file.Fd()), unix.LOCK_EX|unix.LOCK_NB)
		switch {
		case err == nil:
			return collectionLibraryFileLock{}, nil
		case errors.Is(err, unix.EINTR):
			continue
		case errors.Is(err, unix.EWOULDBLOCK), errors.Is(err, unix.EAGAIN):
			if waitErr := waitForCollectionLibraryLock(ctx); waitErr != nil {
				return collectionLibraryFileLock{}, waitErr
			}
		default:
			return collectionLibraryFileLock{}, err
		}
	}
}

func unlockCollectionLibraryFile(
	file *os.File,
	_ *collectionLibraryFileLock,
) error {
	return unix.Flock(int(file.Fd()), unix.LOCK_UN)
}

func replaceCollectionLibraryFile(source string, target string) error {
	return os.Rename(source, target)
}

func syncCollectionLibraryDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open directory: %w", err)
	}
	if err := directory.Sync(); err != nil {
		_ = directory.Close()
		return fmt.Errorf("fsync directory: %w", err)
	}
	if err := directory.Close(); err != nil {
		return fmt.Errorf("close directory: %w", err)
	}
	return nil
}
