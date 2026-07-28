package canbridge

// Collection library error codes are stable API contract values. Keep UI
// branching on these constants instead of storage or transport error text.
const (
	CollectionLibraryErrorConflict    UserErrorCode = "collection_library_conflict"
	CollectionLibraryErrorInvalid     UserErrorCode = "collection_library_invalid"
	CollectionLibraryErrorCorrupt     UserErrorCode = "collection_library_corrupt"
	CollectionLibraryErrorBusy        UserErrorCode = "collection_library_busy"
	CollectionLibraryErrorNotLoaded   UserErrorCode = "collection_library_not_loaded"
	CollectionLibraryErrorReadFailed  UserErrorCode = "collection_library_read_failed"
	CollectionLibraryErrorWriteFailed UserErrorCode = "collection_library_write_failed"
)

// CollectionLibraryLoadResult is deliberately string-based. The frontend owns
// migration and sanitization of the versioned legacy frontend schema. Native code owns
// only the durability, concurrency and outer-document validation boundaries.
//
// This separation is intentional: the native repository is not a secret
// sanitizer and must not interpret request fields inside state.
type CollectionLibraryLoadResult struct {
	Data  string     `json:"data"`
	Found bool       `json:"found"`
	Error *UserError `json:"error,omitempty"`
}

// CollectionLibrarySaveResult acknowledges that the native snapshot reached
// the repository's publish boundary, or returns a stable user-facing error.
type CollectionLibrarySaveResult struct {
	Saved bool       `json:"saved"`
	Error *UserError `json:"error,omitempty"`
}

// LoadCollectionLibrary is the Bridge facade for the collection application
// service. Persistence policy and mutable revision state stay out of Bridge.
func (b *Bridge) LoadCollectionLibrary() CollectionLibraryLoadResult {
	if b == nil || b.collectionLibrary == nil {
		return collectionLibraryLoadFailed()
	}
	return b.collectionLibrary.Load()
}

// SaveCollectionLibrary is the Bridge facade for the collection application
// service. Calls are serialized inside the service as a second line of defense;
// the native IPC runtime also preserves browser acceptance order.
func (b *Bridge) SaveCollectionLibrary(data string) CollectionLibrarySaveResult {
	if b == nil || b.collectionLibrary == nil {
		return collectionLibrarySaveFailed()
	}
	return b.collectionLibrary.Save(data)
}

func (b *Bridge) cancelCollectionPersistence() {
	if b != nil && b.collectionLibrary != nil {
		b.collectionLibrary.Stop()
	}
}
