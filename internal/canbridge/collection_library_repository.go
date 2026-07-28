package canbridge

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	collectionLibraryFilename      = "collection-library.json"
	collectionLibraryLockFilename  = ".collection-library.lock"
	collectionLibraryDirectoryName = "Validex"
	// A JSON string can approximately double in size when encoded as an IPC
	// argument. This ceiling keeps the worst case below the bridge limit.
	maxCollectionLibraryDocumentBytes = 15 << 20
	collectionLibraryLockPollInterval = 25 * time.Millisecond
	collectionLibraryLockTimeout      = 5 * time.Second
)

type collectionLibraryRevision string

const missingCollectionLibraryRevision collectionLibraryRevision = "missing"

var (
	errCollectionLibraryConflict        = errors.New("collection library revision conflict")
	errCollectionLibraryLockUnsupported = errors.New("collection library file locking is unsupported")
	errInvalidCollectionLibraryDocument = errors.New("invalid collection library document")
	errCorruptCollectionLibraryDocument = errors.New("corrupt collection library document")
)

// collectionLibrarySnapshot and collectionLibraryCommit are value objects.
// They make the repository's missing-file and partial-commit semantics explicit
// instead of hiding them in positional return values.
type collectionLibrarySnapshot struct {
	Document string
	Revision collectionLibraryRevision
	Found    bool
}

type collectionLibraryCommit struct {
	Revision  collectionLibraryRevision
	Published bool
}

// collectionLibraryDocument is a validated value object. Its fields are
// private so the application service cannot accidentally pass unvalidated JSON
// to a repository implementation.
type collectionLibraryDocument struct {
	payload  []byte
	revision collectionLibraryRevision
}

// collectionLibraryRepository is the persistence port used by the application
// service. Implementations must perform compare-and-swap while holding their
// cross-process lock. Save receives a prevalidated document value object. Load
// may create/secure the app-data and lock directories.
type collectionLibraryRepository interface {
	Load(context.Context) (collectionLibrarySnapshot, error)
	Save(
		ctx context.Context,
		document collectionLibraryDocument,
		expectedRevision collectionLibraryRevision,
	) (collectionLibraryCommit, error)
}

// fileCollectionLibraryRepository is the filesystem adapter for the repository
// port. Platform-specific lock, replace and directory-sync strategies live in
// collection_filesystem_*.go.
type fileCollectionLibraryRepository struct {
	mu               sync.Mutex
	resolveDirectory func() (string, error)
}

type collectionLibraryDocumentHeader struct {
	Version int             `json:"version"`
	State   json.RawMessage `json:"state"`
}

func newDefaultCollectionLibraryRepository() collectionLibraryRepository {
	return &fileCollectionLibraryRepository{
		resolveDirectory: func() (string, error) {
			configDirectory, err := os.UserConfigDir()
			if err != nil {
				return "", fmt.Errorf("resolve user config directory: %w", err)
			}
			if strings.TrimSpace(configDirectory) == "" {
				return "", errors.New("user config directory is empty")
			}
			return filepath.Join(configDirectory, collectionLibraryDirectoryName), nil
		},
	}
}

func newCollectionLibraryRepository(dataDir string) collectionLibraryRepository {
	return &fileCollectionLibraryRepository{
		resolveDirectory: func() (string, error) {
			if strings.TrimSpace(dataDir) == "" {
				return "", errors.New("collection library data directory is empty")
			}
			cleaned := filepath.Clean(dataDir)
			if !filepath.IsAbs(cleaned) {
				return "", errors.New("collection library data directory must be absolute")
			}
			volumeRoot := filepath.Clean(filepath.VolumeName(cleaned) + string(os.PathSeparator))
			if cleaned == volumeRoot {
				return "", errors.New("collection library data directory cannot be a filesystem root")
			}
			return cleaned, nil
		},
	}
}

func (repository *fileCollectionLibraryRepository) Load(
	ctx context.Context,
) (snapshot collectionLibrarySnapshot, err error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()

	err = repository.withExclusiveLock(ctx, func(dataDirectory string) error {
		var readErr error
		snapshot, readErr = readCollectionLibraryFile(dataDirectory)
		return readErr
	})
	return snapshot, err
}

func (repository *fileCollectionLibraryRepository) Save(
	ctx context.Context,
	document collectionLibraryDocument,
	expectedRevision collectionLibraryRevision,
) (commit collectionLibraryCommit, err error) {
	if err := ctx.Err(); err != nil {
		return commit, fmt.Errorf("save collection library canceled: %w", err)
	}
	if len(document.payload) == 0 || document.revision == "" {
		return commit, errInvalidCollectionLibraryDocument
	}

	repository.mu.Lock()
	defer repository.mu.Unlock()

	err = repository.withExclusiveLock(ctx, func(dataDirectory string) error {
		current, readErr := readCollectionLibraryFile(dataDirectory)
		if readErr != nil {
			return readErr
		}
		if current.Revision != expectedRevision {
			return errCollectionLibraryConflict
		}
		if err := ctx.Err(); err != nil {
			return err
		}

		published, writeErr := writeCollectionLibraryFile(
			dataDirectory,
			document.payload,
		)
		if published {
			commit = collectionLibraryCommit{
				Revision:  document.revision,
				Published: true,
			}
		}
		return writeErr
	})
	return commit, err
}

func readCollectionLibraryFile(
	dataDirectory string,
) (collectionLibrarySnapshot, error) {
	path := filepath.Join(dataDirectory, collectionLibraryFilename)
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return collectionLibrarySnapshot{
			Revision: missingCollectionLibraryRevision,
		}, nil
	}
	if err != nil {
		return collectionLibrarySnapshot{}, fmt.Errorf("inspect collection library: %w", err)
	}
	if !info.Mode().IsRegular() {
		return collectionLibrarySnapshot{}, corruptCollectionLibraryDocument(
			"storage path is not a regular file",
		)
	}
	if info.Size() > maxCollectionLibraryDocumentBytes {
		return collectionLibrarySnapshot{}, corruptCollectionLibraryDocument(
			"document exceeds size limit",
		)
	}

	file, err := os.Open(path)
	if err != nil {
		return collectionLibrarySnapshot{}, fmt.Errorf("open collection library: %w", err)
	}
	payload, err := io.ReadAll(io.LimitReader(file, maxCollectionLibraryDocumentBytes+1))
	if err != nil {
		_ = file.Close()
		return collectionLibrarySnapshot{}, fmt.Errorf("read collection library: %w", err)
	}
	if err := file.Close(); err != nil {
		return collectionLibrarySnapshot{}, fmt.Errorf("close collection library: %w", err)
	}
	if len(payload) > maxCollectionLibraryDocumentBytes {
		return collectionLibrarySnapshot{}, corruptCollectionLibraryDocument(
			"document exceeds size limit",
		)
	}
	if err := validateCollectionLibraryDocument(payload); err != nil {
		// Do not wrap the input-validation sentinel: callers must distinguish a
		// corrupt stored file from an invalid document supplied by the frontend.
		return collectionLibrarySnapshot{}, corruptCollectionLibraryDocument(err.Error())
	}
	return collectionLibrarySnapshot{
		Document: string(payload),
		Revision: calculateCollectionLibraryRevision(payload),
		Found:    true,
	}, nil
}

func (repository *fileCollectionLibraryRepository) withExclusiveLock(
	ctx context.Context,
	operation func(dataDirectory string) error,
) (err error) {
	if err := ctx.Err(); err != nil {
		return err
	}
	dataDirectory, err := repository.resolveDirectory()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dataDirectory, 0o700); err != nil {
		return fmt.Errorf("create collection library directory: %w", err)
	}
	if err := os.Chmod(dataDirectory, 0o700); err != nil {
		return fmt.Errorf("secure collection library directory: %w", err)
	}
	if err := syncCollectionLibraryDirectory(filepath.Dir(dataDirectory)); err != nil {
		return fmt.Errorf("sync collection library parent directory: %w", err)
	}

	lockFile, err := os.OpenFile(
		filepath.Join(dataDirectory, collectionLibraryLockFilename),
		os.O_CREATE|os.O_RDWR,
		0o600,
	)
	if err != nil {
		return fmt.Errorf("open collection library lock: %w", err)
	}
	if err := lockFile.Chmod(0o600); err != nil {
		_ = lockFile.Close()
		return fmt.Errorf("secure collection library lock: %w", err)
	}
	lockContext, cancelLock := context.WithTimeout(ctx, collectionLibraryLockTimeout)
	defer cancelLock()
	lock, err := lockCollectionLibraryFile(lockContext, lockFile)
	if err != nil {
		_ = lockFile.Close()
		return fmt.Errorf("lock collection library: %w", err)
	}
	defer func() {
		if unlockErr := unlockCollectionLibraryFile(lockFile, &lock); unlockErr != nil {
			err = errors.Join(err, fmt.Errorf("unlock collection library: %w", unlockErr))
		}
		if closeErr := lockFile.Close(); closeErr != nil {
			err = errors.Join(err, fmt.Errorf("close collection library lock: %w", closeErr))
		}
	}()
	if err := ctx.Err(); err != nil {
		return err
	}
	return operation(dataDirectory)
}

func writeCollectionLibraryFile(
	dataDirectory string,
	payload []byte,
) (published bool, err error) {
	temporary, err := os.CreateTemp(dataDirectory, ".collection-library-*.tmp")
	if err != nil {
		return false, fmt.Errorf("create collection library temporary file: %w", err)
	}
	temporaryPath := temporary.Name()
	removeTemporary := true
	defer func() {
		if removeTemporary {
			_ = os.Remove(temporaryPath)
		}
	}()

	if err := temporary.Chmod(0o600); err != nil {
		_ = temporary.Close()
		return false, fmt.Errorf("secure collection library temporary file: %w", err)
	}
	if _, err := temporary.Write(payload); err != nil {
		_ = temporary.Close()
		return false, fmt.Errorf("write collection library temporary file: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return false, fmt.Errorf("sync collection library temporary file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return false, fmt.Errorf("close collection library temporary file: %w", err)
	}

	path := filepath.Join(dataDirectory, collectionLibraryFilename)
	if err := replaceCollectionLibraryFile(temporaryPath, path); err != nil {
		return false, fmt.Errorf("replace collection library: %w", err)
	}
	removeTemporary = false
	if err := syncCollectionLibraryDirectory(dataDirectory); err != nil {
		return true, fmt.Errorf("sync collection library directory: %w", err)
	}
	return true, nil
}

func calculateCollectionLibraryRevision(
	payload []byte,
) collectionLibraryRevision {
	sum := sha256.Sum256(payload)
	return collectionLibraryRevision("sha256:" + hex.EncodeToString(sum[:]))
}

func newCollectionLibraryDocument(
	document string,
) (collectionLibraryDocument, error) {
	payload := []byte(document)
	if err := validateCollectionLibraryDocument(payload); err != nil {
		return collectionLibraryDocument{}, err
	}
	return collectionLibraryDocument{
		payload:  payload,
		revision: calculateCollectionLibraryRevision(payload),
	}, nil
}

func validateCollectionLibraryDocument(payload []byte) error {
	if len(payload) > maxCollectionLibraryDocumentBytes {
		return fmt.Errorf("%w: document exceeds size limit", errInvalidCollectionLibraryDocument)
	}
	if len(payload) == 0 || !json.Valid(payload) {
		return fmt.Errorf("%w: malformed JSON", errInvalidCollectionLibraryDocument)
	}
	var header collectionLibraryDocumentHeader
	if err := json.Unmarshal(payload, &header); err != nil {
		return fmt.Errorf("%w: decode versioned document", errInvalidCollectionLibraryDocument)
	}
	if header.Version < 1 {
		return fmt.Errorf("%w: version must be a positive integer", errInvalidCollectionLibraryDocument)
	}
	state := bytes.TrimSpace(header.State)
	if len(state) == 0 || state[0] != '{' {
		return fmt.Errorf("%w: state must be an object", errInvalidCollectionLibraryDocument)
	}
	return nil
}

func corruptCollectionLibraryDocument(reason string) error {
	return fmt.Errorf("%w: %s", errCorruptCollectionLibraryDocument, reason)
}

func waitForCollectionLibraryLock(ctx context.Context) error {
	timer := time.NewTimer(collectionLibraryLockPollInterval)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
