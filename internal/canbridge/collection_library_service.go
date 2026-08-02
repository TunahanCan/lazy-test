package canbridge

import (
	"context"
	"errors"
	"log"
	"sync"
)

var errCollectionLibraryCommitInvariant = errors.New(
	"collection library repository returned an invalid commit",
)

// collectionLibraryService is the application-service boundary for the saved
// request library. It owns the current optimistic-concurrency revision and
// serializes repository operations. The repository remains an infrastructure
// detail and Bridge stays a thin transport facade.
type collectionLibraryService struct {
	repository collectionLibraryRepository

	operationMu   sync.Mutex
	revision      collectionLibraryRevision
	revisionKnown bool

	lifecycleMu     sync.RWMutex
	lifecycleCtx    context.Context
	lifecycleCancel context.CancelFunc
}

func newCollectionLibraryService(
	repository collectionLibraryRepository,
) *collectionLibraryService {
	lifecycleCtx, lifecycleCancel := context.WithCancel(context.Background())
	return &collectionLibraryService{
		repository:      repository,
		lifecycleCtx:    lifecycleCtx,
		lifecycleCancel: lifecycleCancel,
	}
}

// Start replaces the persistence context and CAS observation for a new native
// runtime session. Canceling the previous context also releases any old lock
// waiter. The lifecycle write lock prevents a new operation from observing the
// next context before the prior session revision has been forgotten.
func (service *collectionLibraryService) Start(parent context.Context) {
	if service == nil {
		return
	}
	if parent == nil {
		parent = context.Background()
	}
	nextContext, nextCancel := context.WithCancel(parent)

	service.lifecycleMu.Lock()
	previousCancel := service.lifecycleCancel
	if previousCancel != nil {
		previousCancel()
	}
	service.operationMu.Lock()
	service.revision = ""
	service.revisionKnown = false
	service.lifecycleCtx = nextContext
	service.lifecycleCancel = nextCancel
	service.operationMu.Unlock()
	service.lifecycleMu.Unlock()
}

// Stop is idempotent and makes context-aware repository work return promptly.
func (service *collectionLibraryService) Stop() {
	if service == nil {
		return
	}
	service.lifecycleMu.RLock()
	cancel := service.lifecycleCancel
	service.lifecycleMu.RUnlock()
	if cancel != nil {
		cancel()
	}
}

func (service *collectionLibraryService) Load() CollectionLibraryLoadResult {
	if service == nil || service.repository == nil {
		return collectionLibraryLoadFailed()
	}
	ctx := service.persistenceContext()

	service.operationMu.Lock()
	defer service.operationMu.Unlock()

	snapshot, err := service.repository.Load(ctx)
	if err == nil {
		service.rememberRevisionLocked(snapshot.Revision)
		return CollectionLibraryLoadResult{
			Data:  snapshot.Document,
			Found: snapshot.Found,
		}
	}
	if errors.Is(err, errCorruptCollectionLibraryDocument) {
		logCollectionLibraryRepositoryFailure("load corrupt document", err)
		return CollectionLibraryLoadResult{Error: collectionLibraryCorruptError()}
	}
	logCollectionLibraryRepositoryFailure("load", err)
	return collectionLibraryLoadFailed()
}

func (service *collectionLibraryService) Save(
	document string,
) CollectionLibrarySaveResult {
	if service == nil || service.repository == nil {
		return collectionLibrarySaveFailed()
	}
	ctx := service.persistenceContext()

	service.operationMu.Lock()
	defer service.operationMu.Unlock()
	if err := ctx.Err(); err != nil {
		return collectionLibrarySaveFailed()
	}
	// Validate at the application boundary so invalid frontend input cannot be
	// confused with a corrupt document discovered later in the repository.
	// Validation stays under operationMu so direct Go callers cannot parse
	// multiple maximum-size snapshots in parallel.
	validatedDocument, err := newCollectionLibraryDocument(document)
	if err != nil {
		return CollectionLibrarySaveResult{Error: collectionLibraryInvalidError()}
	}

	if !service.revisionKnown {
		snapshot, err := service.repository.Load(ctx)
		if err != nil {
			if errors.Is(err, errCorruptCollectionLibraryDocument) {
				logCollectionLibraryRepositoryFailure(
					"prepare save corrupt document",
					err,
				)
				return CollectionLibrarySaveResult{Error: collectionLibraryCorruptError()}
			}
			logCollectionLibraryRepositoryFailure("prepare save", err)
			return collectionLibrarySaveFailed()
		}
		if snapshot.Found {
			// A caller must observe an existing snapshot before it may mutate
			// it. Silently adopting the current head would turn a blind first
			// write into last-write-wins and bypass the CAS contract.
			return CollectionLibrarySaveResult{
				Error: collectionLibraryNotLoadedError(),
			}
		}
		service.rememberRevisionLocked(snapshot.Revision)
	}

	commit, err := service.repository.Save(
		ctx,
		validatedDocument,
		service.revision,
	)
	if !validCollectionLibraryCommit(commit, err) {
		logCollectionLibraryRepositoryFailure(
			"save contract",
			errCollectionLibraryCommitInvariant,
		)
		return collectionLibrarySaveFailed()
	}
	if commit.Published {
		// Atomic replacement already changed the file even if a following
		// directory durability barrier failed. Advancing the revision prevents
		// a retry from conflicting with this service's own committed snapshot.
		service.rememberRevisionLocked(commit.Revision)
	}
	if err == nil {
		return CollectionLibrarySaveResult{Saved: true}
	}

	switch {
	case errors.Is(err, errCollectionLibraryConflict):
		return CollectionLibrarySaveResult{Error: collectionLibraryConflictError()}
	case errors.Is(err, errCorruptCollectionLibraryDocument):
		logCollectionLibraryRepositoryFailure("save corrupt document", err)
		return CollectionLibrarySaveResult{Error: collectionLibraryCorruptError()}
	case errors.Is(err, errInvalidCollectionLibraryDocument):
		return CollectionLibrarySaveResult{Error: collectionLibraryInvalidError()}
	default:
		logCollectionLibraryRepositoryFailure("save", err)
		return collectionLibrarySaveFailed()
	}
}

func (service *collectionLibraryService) persistenceContext() context.Context {
	service.lifecycleMu.RLock()
	defer service.lifecycleMu.RUnlock()
	if service.lifecycleCtx == nil {
		return context.Background()
	}
	return service.lifecycleCtx
}

// rememberRevisionLocked mutates CAS state and requires operationMu.
func (service *collectionLibraryService) rememberRevisionLocked(
	revision collectionLibraryRevision,
) {
	service.revision = revision
	service.revisionKnown = true
}

func logCollectionLibraryRepositoryFailure(operation string, err error) {
	if err == nil || errors.Is(err, context.Canceled) {
		return
	}
	log.Printf("[canbridge:collection] repository %s failed: %v", operation, err)
}

func collectionLibraryConflictError() *UserError {
	return newUserError(errorCollectionLibraryConflict, nil, nil)
}

func collectionLibraryInvalidError() *UserError {
	return newUserError(errorCollectionLibraryInvalid, nil, nil)
}

func collectionLibraryCorruptError() *UserError {
	return newUserError(errorCollectionLibraryCorrupt, nil, nil)
}

func collectionLibraryBusyError() *UserError {
	return newUserError(errorCollectionLibraryBusy, nil, nil)
}

func collectionLibraryNotLoadedError() *UserError {
	return newUserError(errorCollectionLibraryNotLoaded, nil, nil)
}

func validCollectionLibraryCommit(
	commit collectionLibraryCommit,
	err error,
) bool {
	if commit.Published {
		return commit.Revision != ""
	}
	return commit.Revision == "" && err != nil
}

func collectionLibraryLoadFailed() CollectionLibraryLoadResult {
	return CollectionLibraryLoadResult{
		Error: newUserError(errorCollectionLibraryReadFailed, nil, nil),
	}
}

func collectionLibrarySaveFailed() CollectionLibrarySaveResult {
	return CollectionLibrarySaveResult{
		Error: newUserError(errorCollectionLibraryWriteFailed, nil, nil),
	}
}
