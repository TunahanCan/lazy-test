package canbridge

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

const initialCollectionLibraryDocument = `{"state":{"collections":[],"requests":[]},"version":1}`

func TestCollectionLibraryRawLimitFitsEscapedIPCEnvelope(t *testing.T) {
	// A valid JSON document can at worst double when it is encoded as the
	// string argument inside the bridge's JSON argument array.
	worstCaseEncodedBytes := 2*maxCollectionLibraryDocumentBytes + len(`[""]`)
	if worstCaseEncodedBytes > maxBridgeArgumentsBytes {
		t.Fatalf(
			"worst-case encoded document = %d bytes, bridge limit = %d",
			worstCaseEncodedBytes,
			maxBridgeArgumentsBytes,
		)
	}
}

func TestCollectionLibrarySaveAndLoadRoundTrip(t *testing.T) {
	dataDirectory := filepath.Join(t.TempDir(), "app-data")
	bridge := newBridgeWithCollectionLibraryDir(dataDirectory)

	save := bridge.SaveCollectionLibrary(initialCollectionLibraryDocument)
	if !save.Saved || save.Error != nil {
		t.Fatalf("SaveCollectionLibrary() = %#v", save)
	}

	load := bridge.LoadCollectionLibrary()
	if load.Error != nil || !load.Found {
		t.Fatalf("LoadCollectionLibrary() = %#v", load)
	}
	if load.Data != initialCollectionLibraryDocument {
		t.Fatalf("loaded document changed:\n got %s\nwant %s", load.Data, initialCollectionLibraryDocument)
	}

	if runtime.GOOS != "windows" {
		directoryInfo, err := os.Stat(dataDirectory)
		if err != nil {
			t.Fatal(err)
		}
		if permissions := directoryInfo.Mode().Perm(); permissions != 0o700 {
			t.Fatalf("data directory permissions = %o, want 700", permissions)
		}
		fileInfo, err := os.Stat(filepath.Join(dataDirectory, collectionLibraryFilename))
		if err != nil {
			t.Fatal(err)
		}
		if permissions := fileInfo.Mode().Perm(); permissions != 0o600 {
			t.Fatalf("collection file permissions = %o, want 600", permissions)
		}
		lockInfo, err := os.Stat(filepath.Join(dataDirectory, collectionLibraryLockFilename))
		if err != nil {
			t.Fatal(err)
		}
		if permissions := lockInfo.Mode().Perm(); permissions != 0o600 {
			t.Fatalf("collection lock permissions = %o, want 600", permissions)
		}
	}
}

func TestCollectionLibraryReportsMissingFileWithoutError(t *testing.T) {
	result := newBridgeWithCollectionLibraryDir(filepath.Join(t.TempDir(), "missing")).
		LoadCollectionLibrary()
	if result.Found || result.Data != "" || result.Error != nil {
		t.Fatalf("LoadCollectionLibrary() = %#v, want an empty not-found result", result)
	}
}

func TestCollectionLibraryAtomicallyReplacesExistingDocument(t *testing.T) {
	dataDirectory := filepath.Join(t.TempDir(), "app-data")
	bridge := newBridgeWithCollectionLibraryDir(dataDirectory)
	if result := bridge.SaveCollectionLibrary(initialCollectionLibraryDocument); !result.Saved {
		t.Fatalf("initial save failed: %#v", result)
	}

	updated := `{"version":1,"state":{"collections":[{"id":"collection-1"}],"requests":[]}}`
	if result := bridge.SaveCollectionLibrary(updated); !result.Saved {
		t.Fatalf("replacement save failed: %#v", result)
	}
	result := bridge.LoadCollectionLibrary()
	if result.Error != nil || !result.Found || result.Data != updated {
		t.Fatalf("replacement load = %#v", result)
	}

	temporaryFiles, err := filepath.Glob(filepath.Join(dataDirectory, ".collection-library-*.tmp"))
	if err != nil {
		t.Fatal(err)
	}
	if len(temporaryFiles) != 0 {
		t.Fatalf("temporary files were not cleaned up: %#v", temporaryFiles)
	}
}

func TestCollectionLibraryRejectsStaleWriterAcrossBridges(t *testing.T) {
	dataDirectory := filepath.Join(t.TempDir(), "app-data")
	first := newBridgeWithCollectionLibraryDir(dataDirectory)
	second := newBridgeWithCollectionLibraryDir(dataDirectory)
	if result := first.SaveCollectionLibrary(initialCollectionLibraryDocument); !result.Saved {
		t.Fatalf("seed save failed: %#v", result)
	}
	if result := first.LoadCollectionLibrary(); result.Error != nil || !result.Found {
		t.Fatalf("first load failed: %#v", result)
	}
	if result := second.LoadCollectionLibrary(); result.Error != nil || !result.Found {
		t.Fatalf("second load failed: %#v", result)
	}

	firstUpdate := `{"version":1,"state":{"collections":[{"id":"first"}],"requests":[],"expandedCollectionIds":[]}}`
	if result := first.SaveCollectionLibrary(firstUpdate); !result.Saved {
		t.Fatalf("first update failed: %#v", result)
	}
	staleUpdate := `{"version":1,"state":{"collections":[{"id":"stale"}],"requests":[],"expandedCollectionIds":[]}}`
	conflict := second.SaveCollectionLibrary(staleUpdate)
	if conflict.Saved || conflict.Error == nil ||
		conflict.Error.Code != CollectionLibraryErrorConflict ||
		conflict.Error.Technical != "" {
		t.Fatalf("stale save = %#v, want a safe conflict", conflict)
	}

	reloaded := second.LoadCollectionLibrary()
	if reloaded.Error != nil || reloaded.Data != firstUpdate {
		t.Fatalf("reload after conflict = %#v", reloaded)
	}
	if result := second.SaveCollectionLibrary(staleUpdate); !result.Saved {
		t.Fatalf("save after refresh failed: %#v", result)
	}
}

func TestCollectionLibraryRejectsBlindSaveOverExistingSnapshot(t *testing.T) {
	dataDirectory := t.TempDir()
	seed := newBridgeWithCollectionLibraryDir(dataDirectory)
	if result := seed.SaveCollectionLibrary(initialCollectionLibraryDocument); !result.Saved {
		t.Fatalf("seed save failed: %#v", result)
	}

	blindWriter := newBridgeWithCollectionLibraryDir(dataDirectory)
	update := `{"version":1,"state":{"collections":[{"id":"blind"}]}}`
	result := blindWriter.SaveCollectionLibrary(update)
	if result.Saved || result.Error == nil ||
		result.Error.Code != CollectionLibraryErrorNotLoaded {
		t.Fatalf("blind SaveCollectionLibrary() = %#v", result)
	}
	persisted := seed.LoadCollectionLibrary()
	if persisted.Error != nil ||
		persisted.Data != initialCollectionLibraryDocument {
		t.Fatalf("blind save changed persisted data: %#v", persisted)
	}

	if loaded := blindWriter.LoadCollectionLibrary(); loaded.Error != nil {
		t.Fatalf("LoadCollectionLibrary() = %#v", loaded)
	}
	if saved := blindWriter.SaveCollectionLibrary(update); !saved.Saved {
		t.Fatalf("save after load failed: %#v", saved)
	}
}

func TestCollectionLibraryLockAllowsOnlyOneConcurrentCASWriter(t *testing.T) {
	dataDirectory := filepath.Join(t.TempDir(), "app-data")
	seed := newBridgeWithCollectionLibraryDir(dataDirectory)
	if result := seed.SaveCollectionLibrary(initialCollectionLibraryDocument); !result.Saved {
		t.Fatalf("seed save failed: %#v", result)
	}
	first := newBridgeWithCollectionLibraryDir(dataDirectory)
	second := newBridgeWithCollectionLibraryDir(dataDirectory)
	if result := first.LoadCollectionLibrary(); result.Error != nil {
		t.Fatalf("first load failed: %#v", result)
	}
	if result := second.LoadCollectionLibrary(); result.Error != nil {
		t.Fatalf("second load failed: %#v", result)
	}

	documents := []string{
		`{"version":1,"state":{"collections":[{"id":"first"}]}}`,
		`{"version":1,"state":{"collections":[{"id":"second"}]}}`,
	}
	bridges := []*Bridge{first, second}
	start := make(chan struct{})
	results := make(chan CollectionLibrarySaveResult, len(bridges))
	var writers sync.WaitGroup
	for index, bridge := range bridges {
		writers.Add(1)
		go func() {
			defer writers.Done()
			<-start
			results <- bridge.SaveCollectionLibrary(documents[index])
		}()
	}
	close(start)
	writers.Wait()
	close(results)

	saved := 0
	conflicts := 0
	for result := range results {
		if result.Saved {
			saved++
		} else if result.Error != nil &&
			result.Error.Code == CollectionLibraryErrorConflict {
			conflicts++
		} else {
			t.Fatalf("unexpected concurrent save result: %#v", result)
		}
	}
	if saved != 1 || conflicts != 1 {
		t.Fatalf("saved=%d conflicts=%d, want 1/1", saved, conflicts)
	}
}

func TestCollectionLibraryRejectsInvalidDocumentsWithSafeErrors(t *testing.T) {
	dataDirectory := filepath.Join(t.TempDir(), "private-path")
	bridge := newBridgeWithCollectionLibraryDir(dataDirectory)

	for name, document := range map[string]string{
		"malformed JSON":     "{",
		"missing version":    `{"state":{}}`,
		"fractional version": `{"version":1.5,"state":{}}`,
		"non-object state":   `{"version":1,"state":[]}`,
	} {
		t.Run(name, func(t *testing.T) {
			result := bridge.SaveCollectionLibrary(document)
			if result.Saved || result.Error == nil {
				t.Fatalf("SaveCollectionLibrary(%q) = %#v", document, result)
			}
			if result.Error.Code != CollectionLibraryErrorInvalid {
				t.Fatalf("error code = %q", result.Error.Code)
			}
			if result.Error.Technical != "" ||
				strings.Contains(result.Error.Message, dataDirectory) ||
				strings.Contains(result.Error.Hint, dataDirectory) {
				t.Fatalf("unsafe filesystem detail escaped: %#v", result.Error)
			}
		})
	}
	if _, err := os.Stat(filepath.Join(dataDirectory, collectionLibraryFilename)); !os.IsNotExist(err) {
		t.Fatalf("invalid document created a storage file: %v", err)
	}
}

func TestCollectionLibraryRejectsUnsafeInjectedDirectories(t *testing.T) {
	for name, dataDirectory := range map[string]string{
		"empty":    "",
		"relative": "relative/app-data",
		"root":     filepath.Clean(filepath.VolumeName(t.TempDir()) + string(os.PathSeparator)),
	} {
		t.Run(name, func(t *testing.T) {
			result := newBridgeWithCollectionLibraryDir(dataDirectory).
				SaveCollectionLibrary(initialCollectionLibraryDocument)
			if result.Saved || result.Error == nil ||
				result.Error.Code != CollectionLibraryErrorWriteFailed ||
				result.Error.Technical != "" {
				t.Fatalf("SaveCollectionLibrary() = %#v", result)
			}
		})
	}
}

func TestCollectionLibraryLoadRejectsCorruptOrNonRegularStorage(t *testing.T) {
	t.Run("corrupt", func(t *testing.T) {
		dataDirectory := t.TempDir()
		corruptDocument := []byte(`{"version":1,"state":null}`)
		if err := os.WriteFile(
			filepath.Join(dataDirectory, collectionLibraryFilename),
			corruptDocument,
			0o600,
		); err != nil {
			t.Fatal(err)
		}

		bridge := newBridgeWithCollectionLibraryDir(dataDirectory)
		result := bridge.LoadCollectionLibrary()
		if result.Found || result.Error == nil ||
			result.Error.Code != CollectionLibraryErrorCorrupt ||
			result.Error.Technical != "" {
			t.Fatalf("LoadCollectionLibrary() = %#v", result)
		}
		save := bridge.SaveCollectionLibrary(initialCollectionLibraryDocument)
		if save.Saved || save.Error == nil ||
			save.Error.Code != CollectionLibraryErrorCorrupt {
			t.Fatalf("save over corrupt storage = %#v", save)
		}
		persisted, err := os.ReadFile(filepath.Join(dataDirectory, collectionLibraryFilename))
		if err != nil {
			t.Fatal(err)
		}
		if string(persisted) != string(corruptDocument) {
			t.Fatalf("corrupt source was overwritten: %s", persisted)
		}
	})

	t.Run("directory", func(t *testing.T) {
		dataDirectory := t.TempDir()
		if err := os.Mkdir(filepath.Join(dataDirectory, collectionLibraryFilename), 0o700); err != nil {
			t.Fatal(err)
		}
		result := newBridgeWithCollectionLibraryDir(dataDirectory).LoadCollectionLibrary()
		if result.Found || result.Error == nil ||
			result.Error.Code != CollectionLibraryErrorCorrupt {
			t.Fatalf("LoadCollectionLibrary() = %#v", result)
		}
	})
}

func TestCollectionLibrarySaveClassifiesStorageCorruptionAfterKnownRevision(
	t *testing.T,
) {
	dataDirectory := t.TempDir()
	bridge := newBridgeWithCollectionLibraryDir(dataDirectory)
	if result := bridge.SaveCollectionLibrary(initialCollectionLibraryDocument); !result.Saved {
		t.Fatalf("seed save failed: %#v", result)
	}
	if result := bridge.LoadCollectionLibrary(); result.Error != nil {
		t.Fatalf("seed load failed: %#v", result)
	}

	corruptDocument := []byte(`{"version":1,"state":null}`)
	path := filepath.Join(dataDirectory, collectionLibraryFilename)
	if err := os.WriteFile(path, corruptDocument, 0o600); err != nil {
		t.Fatal(err)
	}

	result := bridge.SaveCollectionLibrary(
		`{"version":1,"state":{"collections":[{"id":"next"}]}}`,
	)
	if result.Saved || result.Error == nil ||
		result.Error.Code != CollectionLibraryErrorCorrupt {
		t.Fatalf("save over newly corrupt storage = %#v", result)
	}
	persisted, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(persisted) != string(corruptDocument) {
		t.Fatalf("corrupt source was overwritten: %s", persisted)
	}
}

func TestCollectionLibraryServiceRemembersRevisionAfterPartialCommit(
	t *testing.T,
) {
	initialRevision := calculateCollectionLibraryRevision(
		[]byte(initialCollectionLibraryDocument),
	)
	firstUpdate := `{"version":1,"state":{"collections":[{"id":"first"}]}}`
	firstRevision := calculateCollectionLibraryRevision([]byte(firstUpdate))
	secondUpdate := `{"version":1,"state":{"collections":[{"id":"second"}]}}`
	secondRevision := calculateCollectionLibraryRevision([]byte(secondUpdate))

	saveCalls := 0
	expectedRevisions := make([]collectionLibraryRevision, 0, 2)
	repository := &stubCollectionLibraryRepository{
		load: func(context.Context) (collectionLibrarySnapshot, error) {
			return collectionLibrarySnapshot{
				Document: initialCollectionLibraryDocument,
				Revision: initialRevision,
				Found:    true,
			}, nil
		},
		save: func(
			_ context.Context,
			_ collectionLibraryDocument,
			expected collectionLibraryRevision,
		) (collectionLibraryCommit, error) {
			expectedRevisions = append(expectedRevisions, expected)
			saveCalls++
			if saveCalls == 1 {
				return collectionLibraryCommit{
					Revision:  firstRevision,
					Published: true,
				}, errors.New("directory sync failed after replacement")
			}
			return collectionLibraryCommit{
				Revision:  secondRevision,
				Published: true,
			}, nil
		},
	}
	service := newCollectionLibraryService(repository)
	if result := service.Load(); result.Error != nil {
		t.Fatalf("Load() = %#v", result)
	}

	first := service.Save(firstUpdate)
	if first.Saved || first.Error == nil ||
		first.Error.Code != CollectionLibraryErrorWriteFailed {
		t.Fatalf("first Save() = %#v, want a post-commit durability error", first)
	}
	if second := service.Save(secondUpdate); !second.Saved || second.Error != nil {
		t.Fatalf("second Save() = %#v", second)
	}
	if len(expectedRevisions) != 2 ||
		expectedRevisions[0] != initialRevision ||
		expectedRevisions[1] != firstRevision {
		t.Fatalf(
			"expected revisions = %#v, want [%q %q]",
			expectedRevisions,
			initialRevision,
			firstRevision,
		)
	}
}

func TestCollectionLibraryServiceRejectsInvalidRepositoryCommits(t *testing.T) {
	for name, commit := range map[string]collectionLibraryCommit{
		"success without publish": {},
		"publish without revision": {
			Published: true,
		},
	} {
		t.Run(name, func(t *testing.T) {
			repository := &stubCollectionLibraryRepository{
				load: func(context.Context) (collectionLibrarySnapshot, error) {
					return collectionLibrarySnapshot{
						Revision: missingCollectionLibraryRevision,
					}, nil
				},
				save: func(
					context.Context,
					collectionLibraryDocument,
					collectionLibraryRevision,
				) (collectionLibraryCommit, error) {
					return commit, nil
				},
			}
			result := newCollectionLibraryService(repository).
				Save(initialCollectionLibraryDocument)
			if result.Saved || result.Error == nil ||
				result.Error.Code != CollectionLibraryErrorWriteFailed {
				t.Fatalf("Save() = %#v", result)
			}
		})
	}
}

func TestCollectionLibraryStopCancelsFileLockWaiter(t *testing.T) {
	dataDirectory := t.TempDir()
	lockFile, err := os.OpenFile(
		filepath.Join(dataDirectory, collectionLibraryLockFilename),
		os.O_CREATE|os.O_RDWR,
		0o600,
	)
	if err != nil {
		t.Fatal(err)
	}
	lock, err := lockCollectionLibraryFile(context.Background(), lockFile)
	if errors.Is(err, errCollectionLibraryLockUnsupported) {
		_ = lockFile.Close()
		t.Skip("collection file locking is not supported on this platform")
	}
	if err != nil {
		_ = lockFile.Close()
		t.Fatal(err)
	}
	defer func() {
		_ = unlockCollectionLibraryFile(lockFile, &lock)
		_ = lockFile.Close()
	}()

	bridge := newBridgeWithCollectionLibraryDir(dataDirectory)
	result := make(chan CollectionLibraryLoadResult, 1)
	go func() {
		result <- bridge.LoadCollectionLibrary()
	}()
	time.Sleep(50 * time.Millisecond)
	bridge.cancelCollectionPersistence()

	select {
	case loaded := <-result:
		if loaded.Error == nil ||
			loaded.Error.Code != CollectionLibraryErrorReadFailed {
			t.Fatalf("canceled LoadCollectionLibrary() = %#v", loaded)
		}
	case <-time.After(time.Second):
		t.Fatal("collection lock waiter ignored persistence cancellation")
	}
}

func TestInvokeDispatchesCollectionLibraryMethods(t *testing.T) {
	bridge := newBridgeWithCollectionLibraryDir(t.TempDir())
	saveArguments, err := json.Marshal([]any{initialCollectionLibraryDocument})
	if err != nil {
		t.Fatal(err)
	}
	rawSave, err := bridge.Invoke(bridgeMethodSaveCollectionLibrary, string(saveArguments))
	if err != nil {
		t.Fatal(err)
	}
	save, ok := rawSave.(CollectionLibrarySaveResult)
	if !ok || !save.Saved {
		t.Fatalf("SaveCollectionLibrary invoke result = %#v", rawSave)
	}

	rawLoad, err := bridge.Invoke(bridgeMethodLoadCollectionLibrary, "[]")
	if err != nil {
		t.Fatal(err)
	}
	load, ok := rawLoad.(CollectionLibraryLoadResult)
	if !ok || !load.Found || load.Data != initialCollectionLibraryDocument {
		t.Fatalf("LoadCollectionLibrary invoke result = %#v", rawLoad)
	}

	if _, err := bridge.Invoke(
		bridgeMethodLoadCollectionLibrary,
		`["unexpected"]`,
	); err == nil {
		t.Fatal("LoadCollectionLibrary accepted unexpected arguments")
	}
	if _, err := bridge.Invoke(bridgeMethodSaveCollectionLibrary, `[]`); err == nil {
		t.Fatal("SaveCollectionLibrary accepted a missing argument")
	}
}

type stubCollectionLibraryRepository struct {
	load func(context.Context) (collectionLibrarySnapshot, error)
	save func(
		context.Context,
		collectionLibraryDocument,
		collectionLibraryRevision,
	) (collectionLibraryCommit, error)
}

func (repository *stubCollectionLibraryRepository) Load(
	ctx context.Context,
) (collectionLibrarySnapshot, error) {
	return repository.load(ctx)
}

func (repository *stubCollectionLibraryRepository) Save(
	ctx context.Context,
	document collectionLibraryDocument,
	expectedRevision collectionLibraryRevision,
) (collectionLibraryCommit, error) {
	return repository.save(ctx, document, expectedRevision)
}
