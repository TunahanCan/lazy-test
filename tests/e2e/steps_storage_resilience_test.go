package e2e

import (
	stdcontext "context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/chromedp/chromedp"
	"github.com/cucumber/godog"
)

const (
	storageFirstSnapshot  = "First snapshot"
	storageNewestSnapshot = "Newest snapshot"
)

type storageResilienceSteps struct {
	world                *browserWorld
	replayCollectionName string
	replayRequestName    string
}

func registerStorageResilienceSteps(
	context *godog.ScenarioContext,
	world *browserWorld,
) {
	steps := &storageResilienceSteps{world: world}
	context.Before(func(
		ctx stdcontext.Context,
		_ *godog.Scenario,
	) (stdcontext.Context, error) {
		*steps = storageResilienceSteps{world: world}
		return ctx, nil
	})

	context.Step(
		`^the native collection library is empty and writes fail$`,
		steps.emptyLibraryWithFailingWrites,
	)
	context.Step(
		`^the native collection library is empty and writable$`,
		steps.emptyWritableLibrary,
	)
	context.Step(
		`^the "([^"]+)" collection remains visible after the failed write$`,
		steps.collectionRemainsVisibleAfterFailure,
	)
	context.Step(
		`^collection storage reports the write failure without false success$`,
		steps.writeFailureWithoutFalseSuccess,
	)
	context.Step(
		`^the collection storage write failure is visible$`,
		steps.writeFailureIsVisible,
	)
	context.Step(
		`^native collection storage recovers$`,
		steps.nativeStorageRecovers,
	)
	context.Step(
		`^I retry the collection storage write$`,
		steps.retryStorageWrite,
	)
	context.Step(
		`^durable collection storage contains only the latest name "([^"]+)"$`,
		steps.durableStorageContainsLatestName,
	)
	context.Step(
		`^collection storage returns to the ready state$`,
		steps.storageReturnsReady,
	)
	context.Step(
		`^an editable collection library will reject its next write as a conflict$`,
		steps.editableLibraryRejectsWriteAsConflict,
	)
	context.Step(
		`^the collection storage conflict is visible$`,
		steps.storageConflictIsVisible,
	)
	context.Step(
		`^create, rename, delete, and request save are unavailable after the conflict$`,
		steps.mutationsUnavailableAfterConflict,
	)
	context.Step(
		`^the native collection library contains a newer document version$`,
		steps.libraryContainsNewerVersion,
	)
	context.Step(
		`^the collection library asks for a Validex upgrade$`,
		steps.libraryAsksForUpgrade,
	)
	context.Step(
		`^create, rename, delete, and request save are unavailable for the newer document$`,
		steps.mutationsUnavailableForNewerDocument,
	)
	context.Step(
		`^native collection writes are deferred$`,
		steps.deferCollectionWrites,
	)
	context.Step(
		`^two ordered collection snapshots are pending$`,
		steps.twoOrderedSnapshotsArePending,
	)
	context.Step(
		`^the newest native write completes before the oldest write$`,
		steps.completeWritesNewestFirst,
	)
	context.Step(
		`^durable collection storage still contains the newest snapshot$`,
		steps.durableStorageContainsNewestSnapshot,
	)
	context.Step(
		`^the newest native write conflicts before the oldest write succeeds$`,
		steps.completeLatestWithConflictThenOldest,
	)
	context.Step(
		`^the conflict remains read-only without a compensating write$`,
		steps.conflictRemainsWithoutReplay,
	)
	context.Step(
		`^the newest native write succeeds before the oldest write fails$`,
		steps.completeLatestThenFailOldest,
	)
	context.Step(
		`^no compensating collection write is needed$`,
		steps.noCompensatingWriteIsNeeded,
	)
	context.Step(
		`^durable collection storage still contains the newest snapshot without replay$`,
		steps.durableNewestSnapshotWithoutReplay,
	)
	context.Step(
		`^a dirty request is ready for replay-protected saving$`,
		steps.prepareDirtyReplayProtectedRequest,
	)
	context.Step(
		`^I begin saving "([^"]+)" to the "([^"]+)" collection$`,
		steps.beginSavingRequestToCollection,
	)
	context.Step(
		`^the collection creation and saved request snapshots are pending$`,
		steps.collectionAndRequestSnapshotsArePending,
	)
	context.Step(
		`^the newest saved request snapshot completes first$`,
		steps.completeNewestSavedRequestSnapshot,
	)
	context.Step(
		`^the saved request remains dirty without a success status$`,
		steps.savedRequestRemainsDirtyWithoutSuccess,
	)
	context.Step(
		`^the older collection snapshot completes and overwrites durable storage$`,
		steps.completeOlderCollectionSnapshot,
	)
	context.Step(
		`^a compensating latest snapshot write is pending$`,
		steps.compensatingLatestSnapshotIsPending,
	)
	context.Step(
		`^the compensating collection write fails$`,
		steps.failCompensatingCollectionWrite,
	)
	context.Step(
		`^the latest saved request remains in memory as dirty with a storage error$`,
		steps.latestRequestRemainsDirtyAfterReplayFailure,
	)
}

func (s *storageResilienceSteps) emptyLibraryWithFailingWrites() error {
	s.world.initialConfig = map[string]any{
		"overrides": map[string]any{
			"SaveCollectionLibrary": storageWriteFailureResult(),
		},
	}
	return nil
}

func (s *storageResilienceSteps) emptyWritableLibrary() error {
	s.world.initialConfig = map[string]any{}
	return nil
}

func (s *storageResilienceSteps) collectionRemainsVisibleAfterFailure(
	name string,
) error {
	if err := collectionWaitForNamedCollection(s.world, name); err != nil {
		return err
	}
	return s.writeFailureIsVisible()
}

func (s *storageResilienceSteps) writeFailureWithoutFalseSuccess() error {
	var state struct {
		Alert       bool   `json:"alert"`
		Retry       bool   `json:"retry"`
		StatusTone  string `json:"statusTone"`
		StatusText  string `json:"statusText"`
		DurableData string `json:"durableData"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			const notice = document.querySelector(
				".library-storage-notice[role=alert]"
			);
			const status = document.querySelector(
				".statusbar-message[role=status]"
			);
			return {
				alert: Boolean(notice),
				retry: Boolean(
					notice?.querySelector('[data-action="retry-storage"]')
				),
				statusTone: status?.getAttribute("data-tone") || "",
				statusText: status?.textContent?.trim() || "",
				durableData: globalThis.__VALIDEX_E2E__.collectionData
			};
		})()`,
		&state,
	)); err != nil {
		return err
	}
	if !state.Alert || !state.Retry || state.StatusTone != "error" {
		return fmt.Errorf(
			"failed collection write is not exposed as recoverable error: %+v",
			state,
		)
	}
	statusText := strings.ToLower(state.StatusText)
	if !strings.Contains(statusText, "not saved") &&
		!strings.Contains(statusText, "failed") {
		return fmt.Errorf(
			"failed collection write status is ambiguous: %q",
			state.StatusText,
		)
	}
	if state.DurableData != "" {
		return fmt.Errorf(
			"failed collection write changed durable data: %s",
			state.DurableData,
		)
	}
	return nil
}

func (s *storageResilienceSteps) writeFailureIsVisible() error {
	return requestWaitFor(
		s.world,
		`Boolean(
			document.querySelector(
				'.library-storage-notice[role="alert"] [data-action="retry-storage"]'
			) &&
			document.querySelector(
				'.statusbar-message[data-tone="error"]'
			)
		)`,
		"recoverable collection write failure",
	)
}

func (s *storageResilienceSteps) nativeStorageRecovers() error {
	return requestConfigureBridgeCall(
		s.world,
		"SaveCollectionLibrary",
		map[string]any{"saved": true},
	)
}

func (s *storageResilienceSteps) retryStorageWrite() error {
	if err := requestClick(
		s.world,
		`.library-storage-notice [data-action="retry-storage"]`,
	); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "SaveCollectionLibrary"
		).length >= 3`,
		"retried latest collection snapshot",
	)
}

func (s *storageResilienceSteps) durableStorageContainsLatestName(
	name string,
) error {
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`(() => {
				const raw = globalThis.__VALIDEX_E2E__.collectionData;
				if (!raw) return false;
				const document = JSON.parse(raw);
				const names = document.state?.collections?.map(
					(collection) => collection.name
				) || [];
				return names.length === 1 && names[0] === %s;
			})()`,
			requestJSON(name),
		),
		"latest retried collection snapshot",
	)
}

func (s *storageResilienceSteps) storageReturnsReady() error {
	return requestWaitFor(
		s.world,
		`Boolean(
			!document.querySelector(".library-storage-notice") &&
			!document.querySelector('.statusbar-message[data-tone="error"]') &&
			!document.querySelector(".statusbar-message .spin")
		)`,
		"ready collection storage",
	)
}

func (s *storageResilienceSteps) editableLibraryRejectsWriteAsConflict() error {
	s.world.initialConfig = map[string]any{
		"collectionData": collectionSearchMoveDocument("Orders", "Customers"),
		"overrides": map[string]any{
			"SaveCollectionLibrary": storageConflictResult(),
		},
	}
	return nil
}

func (s *storageResilienceSteps) storageConflictIsVisible() error {
	return requestWaitFor(
		s.world,
		`Boolean(
			document.querySelector(".library-storage-notice[role=alert]") &&
			!document.querySelector(
				'.library-storage-notice [data-action="retry-storage"]'
			) &&
			document.querySelector(
				'.statusbar-message[data-tone="error"]'
			)
		)`,
		"read-only collection storage conflict",
	)
}

func (s *storageResilienceSteps) mutationsUnavailableAfterConflict() error {
	if err := collectionEnsureSidebarVisible(s.world); err != nil {
		return err
	}
	if err := requestEnsureEditable(s.world); err != nil {
		return err
	}
	id, err := collectionNamedItemID(s.world, "collection", "Orders local edit")
	if err != nil {
		return err
	}
	if id == "" {
		return fmt.Errorf("locally renamed collection is unavailable")
	}
	if err := collectionOpenLibraryMenu(s.world, "collection", id); err != nil {
		return err
	}
	var state struct {
		CreateDisabled bool `json:"createDisabled"`
		RenameDisabled bool `json:"renameDisabled"`
		DeleteDisabled bool `json:"deleteDisabled"`
		SaveDisabled   bool `json:"saveDisabled"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`(() => ({
			createDisabled: Boolean(
				document.querySelector('[data-action="new-collection"]')?.disabled
			),
			renameDisabled: Boolean(
				document.querySelector(
					'.native-menu [role="menuitem"][data-menu-index="1"]'
				)?.disabled
			),
			deleteDisabled: Boolean(
				document.querySelector(
					'.native-menu [role="menuitem"].danger'
				)?.disabled
			),
			saveDisabled: Boolean(
				document.querySelector('[data-action="save-request"]')?.disabled
			)
		}))()`,
		&state,
	)); err != nil {
		return err
	}
	if !state.CreateDisabled ||
		!state.RenameDisabled ||
		!state.DeleteDisabled ||
		!state.SaveDisabled {
		return fmt.Errorf(
			"storage conflict left collection mutations available: %+v",
			state,
		)
	}
	return nil
}

func (s *storageResilienceSteps) libraryContainsNewerVersion() error {
	var document map[string]any
	if err := json.Unmarshal(
		[]byte(collectionSearchMoveDocument("Orders", "Customers")),
		&document,
	); err != nil {
		return fmt.Errorf("prepare newer collection document: %w", err)
	}
	document["version"] = 2
	s.world.initialConfig = map[string]any{
		"collectionData": requestJSON(document),
	}
	return nil
}

func (s *storageResilienceSteps) libraryAsksForUpgrade() error {
	return requestWaitFor(
		s.world,
		`Boolean(
			document.querySelector(
				'.library-loading-state[role="alert"]'
			)?.textContent?.includes("Update Validex")
		)`,
		"collection library upgrade requirement",
	)
}

func (s *storageResilienceSteps) mutationsUnavailableForNewerDocument() error {
	if err := requestEnsureEditable(s.world); err != nil {
		return err
	}
	var state struct {
		EditableCreate bool `json:"editableCreate"`
		LibraryMenu    bool `json:"libraryMenu"`
		SaveDisabled   bool `json:"saveDisabled"`
		SaveCalls      int  `json:"saveCalls"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`(() => ({
			editableCreate: Boolean(
				document.querySelector(
					'[data-action="new-collection"]:not(:disabled)'
				)
			),
			libraryMenu: Boolean(
				document.querySelector('[data-action="library-menu"]')
			),
			saveDisabled: Boolean(
				document.querySelector('[data-action="save-request"]')?.disabled
			),
			saveCalls: globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "SaveCollectionLibrary"
			).length
		}))()`,
		&state,
	)); err != nil {
		return err
	}
	if state.EditableCreate ||
		state.LibraryMenu ||
		!state.SaveDisabled ||
		state.SaveCalls != 0 {
		return fmt.Errorf(
			"newer collection document left mutations available: %+v",
			state,
		)
	}
	return nil
}

func (s *storageResilienceSteps) deferCollectionWrites() error {
	var deferred bool
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			globalThis.__VALIDEX_E2E__.defer("SaveCollectionLibrary");
			return true;
		})()`,
		&deferred,
	)); err != nil {
		return err
	}
	if !deferred {
		return fmt.Errorf("could not defer native collection writes")
	}
	return nil
}

func (s *storageResilienceSteps) twoOrderedSnapshotsArePending() error {
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`(() => {
				const control = globalThis.__VALIDEX_E2E__;
				const inputs = control.pendingInputs("SaveCollectionLibrary");
				if (inputs.length !== 2) return false;
				const first = JSON.parse(inputs[0]);
				const newest = JSON.parse(inputs[1]);
				const firstNames = first.state?.collections?.map(
					(collection) => collection.name
				) || [];
				const newestNames = newest.state?.collections?.map(
					(collection) => collection.name
				) || [];
				return (
					firstNames.length === 1 &&
					firstNames[0] === %s &&
					newestNames.includes(%s) &&
					newestNames.includes(%s)
				);
			})()`,
			requestJSON(storageFirstSnapshot),
			requestJSON(storageFirstSnapshot),
			requestJSON(storageNewestSnapshot),
		),
		"two pending collection snapshots in mutation order",
	)
}

func (s *storageResilienceSteps) completeWritesNewestFirst() error {
	var resolved bool
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			const control = globalThis.__VALIDEX_E2E__;
			const newest = control.resolveAt(
				"SaveCollectionLibrary",
				1,
				{ saved: true }
			);
			const oldest = control.resolveAt(
				"SaveCollectionLibrary",
				0,
				{ saved: true }
			);
			return newest && oldest;
		})()`,
		&resolved,
	)); err != nil {
		return err
	}
	if !resolved {
		return fmt.Errorf("could not resolve deferred collection writes in reverse")
	}
	return nil
}

func (s *storageResilienceSteps) durableStorageContainsNewestSnapshot() error {
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`(() => {
				const control = globalThis.__VALIDEX_E2E__;
				const writes = control.calls.filter(
					(call) => call.method === "SaveCollectionLibrary"
				);
				if (
					writes.length < 3 ||
					control.pendingCount("SaveCollectionLibrary") !== 0 ||
					!control.collectionData
				) {
					return false;
				}
				const durable = JSON.parse(control.collectionData);
				const names = durable.state?.collections?.map(
					(collection) => collection.name
				) || [];
				return (
					names.includes(%s) &&
					names.includes(%s) &&
					writes.at(-1)?.input === control.collectionData
				);
			})()`,
			requestJSON(storageFirstSnapshot),
			requestJSON(storageNewestSnapshot),
		),
		"newest durable collection snapshot after reversed completion",
	)
}

func (s *storageResilienceSteps) completeLatestWithConflictThenOldest() error {
	var resolved bool
	if err := s.world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`(() => {
				const control = globalThis.__VALIDEX_E2E__;
				const newest = control.resolveAt(
					"SaveCollectionLibrary",
					1,
					%s
				);
				const oldest = control.resolveAt(
					"SaveCollectionLibrary",
					0,
					{ saved: true }
				);
				return newest && oldest;
			})()`,
			requestJSON(storageConflictResult()),
		),
		&resolved,
	)); err != nil {
		return err
	}
	if !resolved {
		return fmt.Errorf(
			"could not complete latest conflict before stale success",
		)
	}
	return nil
}

func (s *storageResilienceSteps) conflictRemainsWithoutReplay() error {
	if err := requestWaitFor(
		s.world,
		`Boolean(
			globalThis.__VALIDEX_E2E__.pendingCount(
				"SaveCollectionLibrary"
			) === 0 &&
			document.querySelector(".library-storage-notice[role=alert]") &&
			document.querySelector('[data-action="new-collection"]')?.disabled
		)`,
		"read-only conflict after stale write completion",
	); err != nil {
		return err
	}
	var writes int
	if err := s.world.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "SaveCollectionLibrary"
		).length`,
		&writes,
	)); err != nil {
		return err
	}
	if writes != 2 {
		return fmt.Errorf(
			"storage conflict triggered %d writes, want exactly 2 without replay",
			writes,
		)
	}
	return nil
}

func (s *storageResilienceSteps) completeLatestThenFailOldest() error {
	var completed bool
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			const control = globalThis.__VALIDEX_E2E__;
			const newest = control.resolveAt(
				"SaveCollectionLibrary",
				1,
				{ saved: true }
			);
			const oldest = control.reject(
				"SaveCollectionLibrary",
				"stale durable write failed"
			);
			return newest && oldest;
		})()`,
		&completed,
	)); err != nil {
		return err
	}
	if !completed {
		return fmt.Errorf("could not complete latest write before stale failure")
	}
	return nil
}

func (s *storageResilienceSteps) noCompensatingWriteIsNeeded() error {
	if err := requestWaitFor(
		s.world,
		`globalThis.__VALIDEX_E2E__.pendingCount(
			"SaveCollectionLibrary"
		) === 0`,
		"all collection writes to settle after stale failure",
	); err != nil {
		return err
	}
	var writes int
	if err := s.world.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.calls.filter(
			(call) => call.method === "SaveCollectionLibrary"
		).length`,
		&writes,
	)); err != nil {
		return err
	}
	if writes != 2 {
		return fmt.Errorf(
			"stale failed write triggered %d writes, want exactly 2",
			writes,
		)
	}
	return nil
}

func (s *storageResilienceSteps) durableNewestSnapshotWithoutReplay() error {
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`(() => {
				const control = globalThis.__VALIDEX_E2E__;
				if (!control.collectionData) return false;
				const durable = JSON.parse(control.collectionData);
				const names = durable.state?.collections?.map(
					(collection) => collection.name
				) || [];
				return (
					names.includes(%s) &&
					names.includes(%s) &&
					control.calls.filter(
						(call) => call.method === "SaveCollectionLibrary"
					).length === 2
				);
			})()`,
			requestJSON(storageFirstSnapshot),
			requestJSON(storageNewestSnapshot),
		),
		"newest durable snapshot after stale failure",
	)
}

func (s *storageResilienceSteps) prepareDirtyReplayProtectedRequest() error {
	if err := requestEnsureEditable(s.world); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[name="method"]`,
		"POST",
		true,
	); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[name="url"]`,
		requestTestURL,
		false,
	); err != nil {
		return err
	}
	if err := requestBlur(s.world, `[name="url"]`); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`Boolean(document.querySelector(".request-tab.active .dirty-dot"))`,
		"dirty request before replay-protected save",
	)
}

func (s *storageResilienceSteps) beginSavingRequestToCollection(
	requestName string,
	collectionName string,
) error {
	collectionID, err := collectionNamedItemID(
		s.world,
		"collection",
		collectionName,
	)
	if err != nil {
		return err
	}
	if collectionID == "" {
		return fmt.Errorf(
			"save destination %q was not found",
			collectionName,
		)
	}
	s.replayCollectionName = collectionName
	s.replayRequestName = requestName

	if err := requestClick(s.world, `[data-action="save-request"]`); err != nil {
		return err
	}
	if err := requestWaitVisible(s.world, `[data-save-form]`); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[data-save-form] [name="requestName"]`,
		requestName,
		false,
	); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[data-save-form] [name="collectionID"]`,
		collectionID,
		true,
	); err != nil {
		return err
	}

	var observing bool
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			globalThis.__VALIDEX_E2E_STORAGE_SUCCESS_OBSERVER__?.disconnect();
			globalThis.__VALIDEX_E2E_STORAGE_SUCCESS_SEEN__ = false;
			const recordSuccess = () => {
				if (
					document.querySelector(
						".app-feedback.success"
					)
				) {
					globalThis.__VALIDEX_E2E_STORAGE_SUCCESS_SEEN__ = true;
				}
			};
			const observer = new MutationObserver(recordSuccess);
			observer.observe(document.body, {
				attributes: true,
				childList: true,
				subtree: true
			});
			globalThis.__VALIDEX_E2E_STORAGE_SUCCESS_OBSERVER__ = observer;
			recordSuccess();
			return true;
		})()`,
		&observing,
	)); err != nil {
		return fmt.Errorf("observe save success feedback: %w", err)
	}
	if !observing {
		return fmt.Errorf("could not observe save success feedback")
	}
	if err := requestClick(
		s.world,
		`[data-save-form] button[type="submit"]`,
	); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`Boolean(
			globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "SaveCollectionLibrary"
			).length === 2 &&
			globalThis.__VALIDEX_E2E__.pendingCount(
				"SaveCollectionLibrary"
			) === 2
		)`,
		"deferred collection creation and saved request writes",
	)
}

func (s *storageResilienceSteps) collectionAndRequestSnapshotsArePending() error {
	if s.replayCollectionName == "" || s.replayRequestName == "" {
		return fmt.Errorf("replay protection fixture names are unavailable")
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`(() => {
				const inputs = globalThis.__VALIDEX_E2E__.pendingInputs(
					"SaveCollectionLibrary"
				);
				if (inputs.length !== 2) return false;
				const oldest = JSON.parse(inputs[0]);
				const newest = JSON.parse(inputs[1]);
				const oldCollections = oldest.state?.collections || [];
				const oldRequests = oldest.state?.requests || [];
				const newCollections = newest.state?.collections || [];
				const newRequests = newest.state?.requests || [];
				return (
					oldCollections.length === 1 &&
					oldCollections[0]?.name === %s &&
					oldRequests.length === 0 &&
					newCollections.length === 1 &&
					newCollections[0]?.name === %s &&
					newRequests.length === 1 &&
					newRequests[0]?.name === %s
				);
			})()`,
			requestJSON(s.replayCollectionName),
			requestJSON(s.replayCollectionName),
			requestJSON(s.replayRequestName),
		),
		"ordered collection creation and saved request snapshots",
	)
}

func (s *storageResilienceSteps) completeNewestSavedRequestSnapshot() error {
	var resolved bool
	if err := s.world.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.resolveAt(
			"SaveCollectionLibrary",
			1,
			{ saved: true }
		)`,
		&resolved,
	)); err != nil {
		return err
	}
	if !resolved {
		return fmt.Errorf("could not resolve the newest saved request snapshot")
	}
	if err := requestWaitFor(
		s.world,
		`(() => {
			const control = globalThis.__VALIDEX_E2E__;
			const writes = control.calls.filter(
				(call) => call.method === "SaveCollectionLibrary"
			);
			return (
				control.pendingCount("SaveCollectionLibrary") === 1 &&
				control.collectionData === writes[1]?.input
			);
		})()`,
		"newest raw collection write to settle",
	); err != nil {
		return err
	}
	return s.waitForStorageRenderCheckpoint()
}

func (s *storageResilienceSteps) savedRequestRemainsDirtyWithoutSuccess() error {
	var state struct {
		Dirty       bool `json:"dirty"`
		Success     bool `json:"success"`
		SuccessSeen bool `json:"successSeen"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`(() => ({
			dirty: Boolean(
				document.querySelector(".request-tab.active .dirty-dot")
			),
			success: Boolean(
				document.querySelector(
					".app-feedback.success"
				)
			),
			successSeen:
				globalThis.__VALIDEX_E2E_STORAGE_SUCCESS_SEEN__ === true
		}))()`,
		&state,
	)); err != nil {
		return err
	}
	if !state.Dirty || state.Success || state.SuccessSeen {
		return fmt.Errorf(
			"request save claimed durable success before stabilization: %+v",
			state,
		)
	}
	return nil
}

func (s *storageResilienceSteps) completeOlderCollectionSnapshot() error {
	var resolved bool
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			const control = globalThis.__VALIDEX_E2E__;
			const completed = control.resolveAt(
				"SaveCollectionLibrary",
				0,
				{ saved: true }
			);
			if (completed) control.defer("SaveCollectionLibrary");
			return completed;
		})()`,
		&resolved,
	)); err != nil {
		return err
	}
	if !resolved {
		return fmt.Errorf("could not resolve the older collection snapshot")
	}
	if err := requestWaitFor(
		s.world,
		`(() => {
			const control = globalThis.__VALIDEX_E2E__;
			const writes = control.calls.filter(
				(call) => call.method === "SaveCollectionLibrary"
			);
			return (
				writes.length === 3 &&
				control.pendingCount("SaveCollectionLibrary") === 1 &&
				control.collectionData === writes[0]?.input
			);
		})()`,
		"older write overwrite and compensating write scheduling",
	); err != nil {
		return err
	}
	return s.waitForStorageRenderCheckpoint()
}

func (s *storageResilienceSteps) compensatingLatestSnapshotIsPending() error {
	return requestWaitFor(
		s.world,
		`(() => {
			const control = globalThis.__VALIDEX_E2E__;
			const writes = control.calls.filter(
				(call) => call.method === "SaveCollectionLibrary"
			);
			const pending = control.pendingInputs("SaveCollectionLibrary");
			if (
				writes.length !== 3 ||
				pending.length !== 1 ||
				!control.collectionData
			) {
				return false;
			}
			const overwritten = JSON.parse(control.collectionData);
			return (
				writes[2]?.input === writes[1]?.input &&
				pending[0] === writes[2]?.input &&
				(overwritten.state?.requests || []).length === 0
			);
		})()`,
		"pending compensating write for the latest snapshot",
	)
}

func (s *storageResilienceSteps) failCompensatingCollectionWrite() error {
	var rejected bool
	if err := s.world.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.reject(
			"SaveCollectionLibrary",
			"compensating durable write failed"
		)`,
		&rejected,
	)); err != nil {
		return err
	}
	if !rejected {
		return fmt.Errorf("could not reject the compensating collection write")
	}
	if err := requestWaitFor(
		s.world,
		`Boolean(
			globalThis.__VALIDEX_E2E__.pendingCount(
				"SaveCollectionLibrary"
			) === 0 &&
			document.querySelector(".library-storage-notice[role=alert]") &&
			document.querySelector('.statusbar-message[data-tone="error"]')
		)`,
		"failed compensating write feedback",
	); err != nil {
		return err
	}
	return s.waitForStorageRenderCheckpoint()
}

func (s *storageResilienceSteps) latestRequestRemainsDirtyAfterReplayFailure() error {
	if s.replayCollectionName == "" || s.replayRequestName == "" {
		return fmt.Errorf("replay protection fixture names are unavailable")
	}
	var state struct {
		Alert             bool   `json:"alert"`
		Retry             bool   `json:"retry"`
		ErrorStatus       bool   `json:"errorStatus"`
		SuccessSeen       bool   `json:"successSeen"`
		Dirty             bool   `json:"dirty"`
		CollectionVisible bool   `json:"collectionVisible"`
		CollectionCount   string `json:"collectionCount"`
		RequestVisible    bool   `json:"requestVisible"`
		RequestLinked     bool   `json:"requestLinked"`
		DurableRequests   int    `json:"durableRequests"`
	}
	if err := s.world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`(() => {
				const collection = [...document.querySelectorAll(
					'[data-action="toggle-collection"]'
				)].find(
					(row) => row.querySelector(".tree-label")?.textContent === %s
				);
				const request = [...document.querySelectorAll(
					'[data-action="open-saved-request"]'
				)].find(
					(row) => row.querySelector(".tree-label")?.textContent === %s
				);
				const durableRaw =
					globalThis.__VALIDEX_E2E__.collectionData;
				const durable = durableRaw ? JSON.parse(durableRaw) : {};
				return {
					alert: Boolean(
						document.querySelector(
							".library-storage-notice[role=alert]"
						)
					),
					retry: Boolean(
						document.querySelector(
							'.library-storage-notice [data-action="retry-storage"]'
						)
					),
					errorStatus: Boolean(
						document.querySelector(
							'.statusbar-message[data-tone="error"]'
						)
					),
					successSeen:
						globalThis.__VALIDEX_E2E_STORAGE_SUCCESS_SEEN__ === true,
					dirty: Boolean(
						document.querySelector(".request-tab.active .dirty-dot")
					),
					collectionVisible: Boolean(collection),
					collectionCount:
						collection?.querySelector(".collection-count")
							?.textContent?.trim() || "",
					requestVisible: Boolean(request),
					requestLinked:
						request?.getAttribute("aria-current") === "page",
					durableRequests:
						(durable.state?.requests || []).length
				};
			})()`,
			requestJSON(s.replayCollectionName),
			requestJSON(s.replayRequestName),
		),
		&state,
	)); err != nil {
		return err
	}
	if !state.Alert ||
		!state.Retry ||
		!state.ErrorStatus ||
		state.SuccessSeen ||
		!state.Dirty ||
		!state.CollectionVisible ||
		state.CollectionCount != "1" ||
		!state.RequestVisible ||
		!state.RequestLinked ||
		state.DurableRequests != 0 {
		return fmt.Errorf(
			"latest in-memory request was not retained after replay failure: %+v",
			state,
		)
	}
	return nil
}

func (s *storageResilienceSteps) waitForStorageRenderCheckpoint() error {
	var scheduled bool
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			globalThis.__VALIDEX_E2E_STORAGE_RENDERED__ = false;
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					globalThis.__VALIDEX_E2E_STORAGE_RENDERED__ = true;
				});
			});
			return true;
		})()`,
		&scheduled,
	)); err != nil {
		return fmt.Errorf("schedule storage render checkpoint: %w", err)
	}
	if !scheduled {
		return fmt.Errorf("could not schedule storage render checkpoint")
	}
	return requestWaitFor(
		s.world,
		`globalThis.__VALIDEX_E2E_STORAGE_RENDERED__ === true`,
		"storage result render checkpoint",
	)
}

func storageWriteFailureResult() map[string]any {
	return map[string]any{
		"saved": false,
		"error": map[string]any{
			"code":    "collection_library_write_failed",
			"title":   "Collections could not be saved",
			"message": "The durable collection write failed.",
			"hint":    "Retry after storage becomes available.",
		},
	}
}

func storageConflictResult() map[string]any {
	return map[string]any{
		"saved": false,
		"error": map[string]any{
			"code":    "collection_library_conflict",
			"title":   "Collections changed in another window",
			"message": "Reload Validex before editing this library.",
		},
	}
}
