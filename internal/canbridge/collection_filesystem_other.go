//go:build !linux && !darwin && !windows

package canbridge

import (
	"context"
	"os"
)

type collectionLibraryFileLock struct{}

func lockCollectionLibraryFile(
	context.Context,
	*os.File,
) (collectionLibraryFileLock, error) {
	return collectionLibraryFileLock{}, errCollectionLibraryLockUnsupported
}

func unlockCollectionLibraryFile(
	*os.File,
	*collectionLibraryFileLock,
) error {
	return nil
}

func replaceCollectionLibraryFile(source string, target string) error {
	return os.Rename(source, target)
}

func syncCollectionLibraryDirectory(string) error {
	return nil
}
