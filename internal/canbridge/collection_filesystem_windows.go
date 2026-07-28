//go:build windows

package canbridge

import (
	"context"
	"errors"
	"os"

	"golang.org/x/sys/windows"
)

type collectionLibraryFileLock struct {
	overlapped windows.Overlapped
}

func lockCollectionLibraryFile(
	ctx context.Context,
	file *os.File,
) (collectionLibraryFileLock, error) {
	lock := collectionLibraryFileLock{}
	for {
		err := windows.LockFileEx(
			windows.Handle(file.Fd()),
			windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY,
			0,
			1,
			0,
			&lock.overlapped,
		)
		switch {
		case err == nil:
			return lock, nil
		case errors.Is(err, windows.ERROR_LOCK_VIOLATION):
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
	lock *collectionLibraryFileLock,
) error {
	return windows.UnlockFileEx(
		windows.Handle(file.Fd()),
		0,
		1,
		0,
		&lock.overlapped,
	)
}

func replaceCollectionLibraryFile(source string, target string) error {
	sourcePath, err := windows.UTF16PtrFromString(source)
	if err != nil {
		return err
	}
	targetPath, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	return windows.MoveFileEx(
		sourcePath,
		targetPath,
		windows.MOVEFILE_REPLACE_EXISTING|windows.MOVEFILE_WRITE_THROUGH,
	)
}

func syncCollectionLibraryDirectory(string) error {
	// Windows does not support opening a directory with os.Open and flushing
	// its metadata like Unix fsync. The payload file is flushed first, and
	// replacement uses MoveFileEx with MOVEFILE_WRITE_THROUGH instead.
	return nil
}
