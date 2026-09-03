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
	collectionOrderService = "Order service"
	collectionRequestName  = "Create order"
	postmanCollectionName  = "Postman Orders"
	postmanRequestName     = "Create order"
	postmanRequestMethod   = "POST"
	postmanRequestURL      = "https://api.example.test/orders?dryRun=true"
	postmanRequestBody     = `{"sku":"SKU-42","quantity":2}`
	postmanV21Schema       = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
)

type collectionSteps struct {
	world *browserWorld

	deletingCollectionID string
	savedRequestID       string
	moveRequestID        string
	moveSourceID         string
	moveDestinationID    string
	importedEndpointID   string
}

type collectionLibraryDocumentFixture struct {
	State struct {
		Collections []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"collections"`
		Requests []struct {
			ID           string `json:"id"`
			CollectionID string `json:"collectionId"`
			Name         string `json:"name"`
			Method       string `json:"method"`
			URL          string `json:"url"`
			Body         string `json:"body"`
			Literal      bool   `json:"literalValues"`
		} `json:"requests"`
	} `json:"state"`
	Version int `json:"version"`
}

func registerCollectionSteps(context *godog.ScenarioContext, world *browserWorld) {
	steps := &collectionSteps{world: world}
	context.Before(func(
		ctx stdcontext.Context,
		_ *godog.Scenario,
	) (stdcontext.Context, error) {
		*steps = collectionSteps{world: world}
		return ctx, nil
	})

	context.Step(`^collection storage is writable$`, steps.collectionStorageIsWritable)
	context.Step(`^the request library is empty$`, steps.requestLibraryIsEmpty)
	context.Step(
		`^I create a collection named "([^"]+)"$`,
		steps.createCollectionNamed,
	)
	context.Step(
		`^the "([^"]+)" collection appears in the request library$`,
		steps.collectionAppears,
	)
	context.Step(
		`^I rename the "([^"]+)" collection to "([^"]+)"$`,
		steps.renameCollection,
	)
	context.Step(
		`^I request deletion of the "([^"]+)" collection$`,
		steps.requestCollectionDeletion,
	)
	context.Step(
		`^the destructive confirmation describes the affected collection$`,
		steps.destructiveConfirmationDescribesCollection,
	)
	context.Step(
		`^I confirm the collection deletion$`,
		steps.confirmCollectionDeletion,
	)
	context.Step(
		`^the collection is removed from the request library and persistent snapshot$`,
		steps.collectionIsRemovedEverywhere,
	)
	context.Step(
		`^a collection named "([^"]+)" exists$`,
		steps.collectionExists,
	)
	context.Step(
		`^I have composed an unsaved request named "([^"]+)"$`,
		steps.composeUnsavedNamedRequest,
	)
	context.Step(
		`^I save the request to the "([^"]+)" collection$`,
		steps.saveRequestToCollection,
	)
	context.Step(
		`^durable collection storage contains the saved request$`,
		steps.durableStorageContainsSavedRequest,
	)
	context.Step(
		`^the request tab is linked to the saved request and is no longer dirty$`,
		steps.requestTabIsLinkedAndClean,
	)
	context.Step(`^I close the request tab$`, steps.closeRequestTab)
	context.Step(`^I reload Validex$`, steps.reloadValidex)
	context.Step(
		`^I reopen "([^"]+)" from the request library$`,
		steps.reopenRequestFromLibrary,
	)
	context.Step(
		`^its name, method, URL, headers, body, and variable mode are restored$`,
		steps.savedRequestFieldsAreRestored,
	)
	context.Step(
		`^the collections "([^"]+)" and "([^"]+)" contain saved requests$`,
		steps.collectionsContainSavedRequests,
	)
	context.Step(
		`^I search the request library by request method and URL fragment$`,
		steps.searchLibraryByMethodAndURL,
	)
	context.Step(
		`^only matching collections and requests are shown$`,
		steps.onlyMatchingLibraryEntriesAreShown,
	)
	context.Step(
		`^the search result count is announced$`,
		steps.searchResultCountIsAnnounced,
	)
	context.Step(
		`^I clear the request library search$`,
		steps.clearLibrarySearch,
	)
	context.Step(
		`^I move a saved request from "([^"]+)" to "([^"]+)"$`,
		steps.moveSavedRequest,
	)
	context.Step(
		`^both collection request counts are updated$`,
		steps.collectionRequestCountsAreUpdated,
	)
	context.Step(
		`^reopening the moved request still restores its data$`,
		steps.reopenMovedRequestRestoresData,
	)
	context.Step(
		`^the collection file picker returns a Postman v2\.1 collection$`,
		steps.collectionFilePickerReturnsPostman,
	)
	context.Step(
		`^I import the Postman collection$`,
		steps.importPostmanCollection,
	)
	context.Step(
		`^the imported "([^"]+)" collection and "([^"]+)" request are visible and persisted$`,
		steps.importedPostmanCollectionIsVisibleAndPersisted,
	)
	context.Step(
		`^I export the "([^"]+)" collection$`,
		steps.exportCollection,
	)
	context.Step(
		`^the export is Postman v2\.1 and contains the "([^"]+)" request$`,
		steps.exportedPostmanCollectionContainsRequest,
	)
	context.Step(
		`^the file picker will return a valid OpenAPI document with endpoints$`,
		steps.filePickerReturnsOpenAPI,
	)
	context.Step(
		`^I import the OpenAPI document$`,
		steps.importOpenAPIDocument,
	)
	context.Step(
		`^the imported API title and endpoint count are visible$`,
		steps.importedAPISummaryIsVisible,
	)
	context.Step(
		`^I open the imported APIs library$`,
		steps.openImportedAPIsLibrary,
	)
	context.Step(
		`^I open an imported endpoint$`,
		steps.openImportedEndpoint,
	)
	context.Step(
		`^a request tab opens with the endpoint method, URL, and contract metadata$`,
		steps.importedEndpointRequestIsComplete,
	)
	context.Step(
		`^the endpoint is marked active in the imported APIs library$`,
		steps.importedEndpointIsActive,
	)
}

func (s *collectionSteps) collectionStorageIsWritable() error {
	if err := collectionEnsureSidebarVisible(s.world); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`Boolean(
			document.querySelector('[data-action="new-collection"]:not(:disabled)') &&
			!document.querySelector(".library-storage-notice[role=alert]")
		)`,
		"writable collection library",
	)
}

func (s *collectionSteps) requestLibraryIsEmpty() error {
	var state struct {
		Collections int  `json:"collections"`
		Requests    int  `json:"requests"`
		Empty       bool `json:"empty"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`({
			collections: document.querySelectorAll(
				'[data-library-kind="collection"]'
			).length,
			requests: document.querySelectorAll(
				'[data-library-kind="request"]'
			).length,
			empty: Boolean(document.querySelector(".sidebar-empty"))
		})`,
		&state,
	)); err != nil {
		return err
	}
	if state.Collections != 0 || state.Requests != 0 || !state.Empty {
		return fmt.Errorf("request library is not empty: %+v", state)
	}
	return nil
}

func (s *collectionSteps) createCollectionNamed(name string) error {
	before, err := requestBridgeCallCount(s.world, "SaveCollectionLibrary")
	if err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-action="new-collection"]`); err != nil {
		return err
	}
	if err := requestWaitVisible(s.world, `[data-create-collection-form]`); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[data-create-collection-form] [name="collectionName"]`,
		name,
		false,
	); err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-create-submit]`); err != nil {
		return err
	}
	if err := collectionWaitForNamedCollection(s.world, name); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "SaveCollectionLibrary"
			).length > %d`,
			before,
		),
		"persisted collection creation",
	)
}

func (s *collectionSteps) collectionAppears(name string) error {
	id, err := collectionNamedItemID(s.world, "collection", name)
	if err != nil {
		return err
	}
	if id == "" {
		return fmt.Errorf("collection %q does not appear in the request library", name)
	}
	var count string
	selector := fmt.Sprintf(
		`[data-action="toggle-collection"][data-library-item-id="%s"] .collection-count`,
		id,
	)
	if err := s.world.run(chromedp.Text(selector, &count, chromedp.ByQuery)); err != nil {
		return err
	}
	if strings.TrimSpace(count) != "0" {
		return fmt.Errorf("new collection %q request count = %q, want 0", name, count)
	}
	return nil
}

func (s *collectionSteps) renameCollection(from, to string) error {
	id, err := collectionNamedItemID(s.world, "collection", from)
	if err != nil {
		return err
	}
	if id == "" {
		return fmt.Errorf("collection %q was not found for rename", from)
	}
	if err := collectionOpenLibraryMenu(s.world, "collection", id); err != nil {
		return err
	}
	if err := requestClick(
		s.world,
		`.native-menu [role="menuitem"][data-menu-index="1"]`,
	); err != nil {
		return err
	}
	if err := requestWaitVisible(s.world, `[data-rename-library-form]`); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[data-rename-library-form] [name="libraryName"]`,
		to,
		false,
	); err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-rename-submit]`); err != nil {
		return err
	}
	return collectionWaitForNamedCollection(s.world, to)
}

func (s *collectionSteps) requestCollectionDeletion(name string) error {
	id, err := collectionNamedItemID(s.world, "collection", name)
	if err != nil {
		return err
	}
	if id == "" {
		return fmt.Errorf("collection %q was not found for deletion", name)
	}
	s.deletingCollectionID = id
	if err := collectionOpenLibraryMenu(s.world, "collection", id); err != nil {
		return err
	}
	if err := requestClick(
		s.world,
		`.native-menu [role="menuitem"].danger`,
	); err != nil {
		return err
	}
	return requestWaitVisible(s.world, `dialog.native-dialog [data-confirm-delete]`)
}

func (s *collectionSteps) destructiveConfirmationDescribesCollection() error {
	var confirmation struct {
		Open        bool   `json:"open"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Danger      bool   `json:"danger"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			const dialog = document.querySelector("dialog.native-dialog");
			const confirm = dialog?.querySelector("[data-confirm-delete]");
			return {
				open: Boolean(dialog?.open),
				title: dialog?.querySelector("h2")?.textContent?.trim() || "",
				description: dialog?.querySelector(".dialog-header p")?.textContent?.trim() || "",
				danger: Boolean(confirm?.classList.contains("button-danger"))
			};
		})()`,
		&confirmation,
	)); err != nil {
		return err
	}
	if !confirmation.Open ||
		confirmation.Title == "" ||
		!strings.Contains(confirmation.Description, collectionOrderService) ||
		!confirmation.Danger {
		return fmt.Errorf("collection deletion confirmation is incomplete: %+v", confirmation)
	}
	return nil
}

func (s *collectionSteps) confirmCollectionDeletion() error {
	if s.deletingCollectionID == "" {
		return fmt.Errorf("no collection deletion is pending")
	}
	if err := requestClick(s.world, `[data-confirm-delete]`); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`!document.querySelector(
				'[data-library-kind="collection"][data-library-item-id="%s"]'
			)`,
			s.deletingCollectionID,
		),
		"removed collection row",
	)
}

func (s *collectionSteps) collectionIsRemovedEverywhere() error {
	if s.deletingCollectionID == "" {
		return fmt.Errorf("deleted collection identifier is unavailable")
	}
	document, err := collectionLatestPersistedDocument(s.world)
	if err != nil {
		return err
	}
	for _, collection := range document.State.Collections {
		if collection.ID == s.deletingCollectionID {
			return fmt.Errorf("deleted collection remains in persistent snapshot")
		}
	}
	for _, request := range document.State.Requests {
		if request.CollectionID == s.deletingCollectionID {
			return fmt.Errorf("deleted collection request remains in persistent snapshot")
		}
	}
	return nil
}

func (s *collectionSteps) collectionExists(name string) error {
	id, err := collectionNamedItemID(s.world, "collection", name)
	if err != nil {
		return err
	}
	if id != "" {
		return nil
	}
	if err := s.createCollectionNamed(name); err != nil {
		return err
	}
	return nil
}

func (s *collectionSteps) composeUnsavedNamedRequest(name string) error {
	if err := requestEnsureEditable(s.world); err != nil {
		return err
	}
	if err := requestSetValue(s.world, `[name="method"]`, "POST", true); err != nil {
		return err
	}
	if err := requestSetValue(s.world, `[name="url"]`, requestTestURL, false); err != nil {
		return err
	}
	if err := requestBlur(s.world, `[name="url"]`); err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-request-section="headers"]`); err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-action="add-header"]`); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[data-header-row]:last-of-type [data-header-field="key"]`,
		"X-E2E",
		false,
	); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[data-header-row]:last-of-type [data-header-field="value"]`,
		"collection",
		false,
	); err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-request-section="body"]`); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[name="body"]`,
		`{"sku":"SKU-1","quantity":2}`,
		false,
	); err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-request-section="variables"]`); err != nil {
		return err
	}
	if err := collectionSetChecked(
		s.world,
		`[name="resolveVariables"]`,
		false,
	); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		`document.querySelector('[name="resolveVariables"]')?.checked === false`,
		"literal variable mode",
	); err != nil {
		return err
	}
	if err := s.world.run(chromedp.DoubleClick(
		`.request-tab.active [data-request-tab-button]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	if err := requestWaitVisible(s.world, `[data-rename-form]`); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[data-rename-form] [name="requestName"]`,
		name,
		false,
	); err != nil {
		return err
	}
	if err := requestClick(
		s.world,
		`[data-rename-form] button[type="submit"]`,
	); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector(
				".request-tab.active [data-request-tab-button] span"
			)?.textContent === %s`,
			requestJSON(name),
		),
		"renamed unsaved request tab",
	)
}

func (s *collectionSteps) saveRequestToCollection(name string) error {
	collectionID, err := collectionNamedItemID(s.world, "collection", name)
	if err != nil {
		return err
	}
	if collectionID == "" {
		return fmt.Errorf("save destination %q was not found", name)
	}
	before, err := requestBridgeCallCount(s.world, "SaveCollectionLibrary")
	if err != nil {
		return err
	}
	if err := requestClick(s.world, `[data-action="save-request"]`); err != nil {
		return err
	}
	if err := requestWaitVisible(s.world, `[data-save-form]`); err != nil {
		return err
	}
	if err := requestSetValue(
		s.world,
		`[data-save-form] [name="requestName"]`,
		collectionRequestName,
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
	if err := requestClick(
		s.world,
		`[data-save-form] button[type="submit"]`,
	); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "SaveCollectionLibrary"
			).length > %d`,
			before,
		),
		"durable saved request write",
	); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		`!document.querySelector(".request-tab.active .dirty-dot")`,
		"clean saved request tab",
	); err != nil {
		return err
	}
	document, err := collectionLatestPersistedDocument(s.world)
	if err != nil {
		return err
	}
	for _, request := range document.State.Requests {
		if request.Name == collectionRequestName {
			s.savedRequestID = request.ID
			return nil
		}
	}
	return fmt.Errorf("saved request was not found in the persistent document")
}

func (s *collectionSteps) durableStorageContainsSavedRequest() error {
	document, err := collectionLatestPersistedDocument(s.world)
	if err != nil {
		return err
	}
	for _, request := range document.State.Requests {
		if request.ID == s.savedRequestID &&
			request.Name == collectionRequestName &&
			request.Method == "POST" &&
			request.URL == requestTestURL &&
			request.Body == `{"sku":"SKU-1","quantity":2}` &&
			request.Literal {
			return nil
		}
	}
	return fmt.Errorf(
		"durable collection storage does not contain the complete request %q",
		s.savedRequestID,
	)
}

func (s *collectionSteps) requestTabIsLinkedAndClean() error {
	if s.savedRequestID == "" {
		return fmt.Errorf("saved request identifier is unavailable")
	}
	selector := fmt.Sprintf(
		`[data-action="open-saved-request"][data-library-item-id="%s"]`,
		s.savedRequestID,
	)
	var linked bool
	if err := s.world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`Boolean(
				document.querySelector(%s)?.getAttribute("aria-current") === "page" &&
				!document.querySelector(".request-tab.active .dirty-dot")
			)`,
			requestJSON(selector),
		),
		&linked,
	)); err != nil {
		return err
	}
	if !linked {
		return fmt.Errorf("request tab is not visibly linked to its persisted request")
	}
	return nil
}

func (s *collectionSteps) closeRequestTab() error {
	before, err := collectionRequestTabCount(s.world)
	if err != nil {
		return err
	}
	if err := requestClick(
		s.world,
		`.request-tab.active [data-action="close-tab"]`,
	); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelectorAll("[data-request-tab]").length === %d`,
			before-1,
		),
		"closed clean request tab",
	)
}

func (s *collectionSteps) reloadValidex() error {
	if err := s.world.run(
		chromedp.Reload(),
		chromedp.WaitVisible("[data-activity]", chromedp.ByQuery),
		chromedp.WaitReady("[data-workspace-view]", chromedp.ByQuery),
	); err != nil {
		return fmt.Errorf("reload Validex after durable save: %w", err)
	}
	if err := collectionEnsureSidebarVisible(s.world); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		`globalThis.__VALIDEX_E2E__.calls.some(
			(call) => call.method === "LoadCollectionLibrary"
		)`,
		"collection library reload from native storage",
	); err != nil {
		return err
	}
	return collectionWaitForNamedCollection(s.world, collectionOrderService)
}

func (s *collectionSteps) reopenRequestFromLibrary(name string) error {
	id, err := collectionNamedItemID(s.world, "request", name)
	if err != nil {
		return err
	}
	if id == "" {
		return fmt.Errorf("saved request %q is not visible in the library", name)
	}
	s.savedRequestID = id
	if err := requestClick(
		s.world,
		fmt.Sprintf(
			`[data-action="open-saved-request"][data-library-item-id="%s"]`,
			id,
		),
	); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector(
				'[data-action="open-saved-request"][data-library-item-id="%s"]'
			)?.getAttribute("aria-current") === "page"`,
			id,
		),
		"reopened saved request",
	)
}

func (s *collectionSteps) savedRequestFieldsAreRestored() error {
	var composer struct {
		Name   string `json:"name"`
		Method string `json:"method"`
		URL    string `json:"url"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`({
			name: document.querySelector(
				".request-tab.active [data-request-tab-button] span"
			)?.textContent || "",
			method: document.querySelector('[name="method"]')?.value || "",
			url: document.querySelector('[name="url"]')?.value || ""
		})`,
		&composer,
	)); err != nil {
		return err
	}
	if composer.Name != collectionRequestName ||
		composer.Method != "POST" ||
		composer.URL != requestTestURL {
		return fmt.Errorf("reopened request composer fields differ: %+v", composer)
	}
	if err := requestClick(s.world, `[data-request-section="headers"]`); err != nil {
		return err
	}
	var headerOK bool
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			const row = document.querySelector("[data-header-row]");
			return row?.querySelector('[data-header-field="key"]')?.value === "X-E2E" &&
				row?.querySelector('[data-header-field="value"]')?.value === "collection";
		})()`,
		&headerOK,
	)); err != nil {
		return err
	}
	if !headerOK {
		return fmt.Errorf("saved request headers were not restored")
	}
	if err := requestClick(s.world, `[data-request-section="body"]`); err != nil {
		return err
	}
	var body string
	if err := s.world.run(chromedp.Value(`[name="body"]`, &body, chromedp.ByQuery)); err != nil {
		return err
	}
	if body != `{"sku":"SKU-1","quantity":2}` {
		return fmt.Errorf("restored request body = %q", body)
	}
	if err := requestClick(s.world, `[data-request-section="variables"]`); err != nil {
		return err
	}
	var literalMode bool
	if err := s.world.run(chromedp.Evaluate(
		`document.querySelector('[name="resolveVariables"]')?.checked === false`,
		&literalMode,
	)); err != nil {
		return err
	}
	if !literalMode {
		return fmt.Errorf("saved request variable mode was not restored")
	}
	return nil
}

func (s *collectionSteps) collectionsContainSavedRequests(
	source string,
	destination string,
) error {
	document := collectionSearchMoveDocument(source, destination)
	s.world.closePage()
	s.world.initialConfig = map[string]any{"collectionData": document}
	if err := s.world.openPage(); err != nil {
		return fmt.Errorf("load search and move collection fixture: %w", err)
	}
	if err := collectionEnsureSidebarVisible(s.world); err != nil {
		return err
	}
	s.moveSourceID = "collection-orders"
	s.moveDestinationID = "collection-customers"
	s.moveRequestID = "request-update-order"
	return requestWaitFor(
		s.world,
		`document.querySelectorAll(
			'[data-library-kind="collection"] [data-action="toggle-collection"]'
		).length === 2 &&
		document.querySelectorAll(
			'[data-library-kind="request"] [data-action="open-saved-request"]'
		).length === 3`,
		"search and move collection fixture",
	)
}

func (s *collectionSteps) searchLibraryByMethodAndURL() error {
	if err := requestSetValue(
		s.world,
		`[data-sidebar-search]`,
		"PATCH orders/42",
		false,
	); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`document.querySelectorAll(
			'[data-library-kind="collection"] [data-action="toggle-collection"]'
		).length === 1 &&
		document.querySelectorAll(
			'[data-library-kind="request"] [data-action="open-saved-request"]'
		).length === 1`,
		"filtered request library",
	)
}

func (s *collectionSteps) onlyMatchingLibraryEntriesAreShown() error {
	var result struct {
		Collections []string `json:"collections"`
		Requests    []string `json:"requests"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`({
			collections: [...document.querySelectorAll(
				'[data-action="toggle-collection"] .tree-label'
			)].map((element) => element.textContent?.trim() || ""),
			requests: [...document.querySelectorAll(
				'[data-action="open-saved-request"] .tree-label'
			)].map((element) => element.textContent?.trim() || "")
		})`,
		&result,
	)); err != nil {
		return err
	}
	if len(result.Collections) != 1 ||
		result.Collections[0] != "Orders" ||
		len(result.Requests) != 1 ||
		result.Requests[0] != "Update order" {
		return fmt.Errorf("unexpected request library search result: %+v", result)
	}
	return nil
}

func (s *collectionSteps) searchResultCountIsAnnounced() error {
	var summary struct {
		Role     string `json:"role"`
		Live     string `json:"live"`
		Text     string `json:"text"`
		HasCount bool   `json:"hasCount"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			const result = document.querySelector(".sidebar-search-summary");
			const text = result?.textContent?.trim() || "";
			return {
				role: result?.getAttribute("role") || "",
				live: result?.getAttribute("aria-live") || "",
				text,
				hasCount: /\b2\b/.test(text)
			};
		})()`,
		&summary,
	)); err != nil {
		return err
	}
	if summary.Role != "status" ||
		summary.Live != "polite" ||
		summary.Text == "" ||
		!summary.HasCount {
		return fmt.Errorf("search result count is not announced: %+v", summary)
	}
	return nil
}

func (s *collectionSteps) clearLibrarySearch() error {
	if err := requestSetValue(s.world, `[data-sidebar-search]`, "", false); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`document.querySelectorAll(
			'[data-library-kind="collection"] [data-action="toggle-collection"]'
		).length === 2 &&
		!document.querySelector(".sidebar-search-summary")`,
		"cleared request library search",
	)
}

func (s *collectionSteps) moveSavedRequest(from, to string) error {
	sourceID, err := collectionNamedItemID(s.world, "collection", from)
	if err != nil {
		return err
	}
	destinationID, err := collectionNamedItemID(s.world, "collection", to)
	if err != nil {
		return err
	}
	if sourceID == "" || destinationID == "" {
		return fmt.Errorf("move collections were not found: %q -> %q", from, to)
	}
	s.moveSourceID = sourceID
	s.moveDestinationID = destinationID
	if err := collectionOpenLibraryMenu(
		s.world,
		"request",
		s.moveRequestID,
	); err != nil {
		return err
	}
	if err := requestClick(
		s.world,
		`.native-menu [role="menuitem"][data-menu-index="2"]`,
	); err != nil {
		return err
	}
	if err := requestWaitVisible(s.world, `.native-menu [role="menuitem"]`); err != nil {
		return err
	}
	var destinationLabel string
	if err := s.world.run(chromedp.Text(
		`.native-menu [role="menuitem"][data-menu-index="0"]`,
		&destinationLabel,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	if strings.TrimSpace(destinationLabel) != to {
		return fmt.Errorf("move destination menu = %q, want %q", destinationLabel, to)
	}
	if err := requestClick(
		s.world,
		`.native-menu [role="menuitem"][data-menu-index="0"]`,
	); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`document.querySelector(
				'[data-action="library-menu"][data-library-kind="collection"][data-library-item-id="%s"]'
			)?.getAttribute("data-request-count") === "2"`,
			s.moveDestinationID,
		),
		"moved saved request",
	)
}

func (s *collectionSteps) collectionRequestCountsAreUpdated() error {
	var counts struct {
		Source      string `json:"source"`
		Destination string `json:"destination"`
	}
	if err := s.world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`({
				source: document.querySelector(
					'[data-action="library-menu"][data-library-kind="collection"][data-library-item-id="%s"]'
				)?.getAttribute("data-request-count") || "",
				destination: document.querySelector(
					'[data-action="library-menu"][data-library-kind="collection"][data-library-item-id="%s"]'
				)?.getAttribute("data-request-count") || ""
			})`,
			s.moveSourceID,
			s.moveDestinationID,
		),
		&counts,
	)); err != nil {
		return err
	}
	if counts.Source != "1" || counts.Destination != "2" {
		return fmt.Errorf("collection counts after move = %+v, want 1 and 2", counts)
	}
	document, err := collectionLatestPersistedDocument(s.world)
	if err != nil {
		return err
	}
	for _, request := range document.State.Requests {
		if request.ID == s.moveRequestID {
			if request.CollectionID != s.moveDestinationID {
				return fmt.Errorf("persistent moved request has collection %q", request.CollectionID)
			}
			return nil
		}
	}
	return fmt.Errorf("moved request is absent from the persistent snapshot")
}

func (s *collectionSteps) reopenMovedRequestRestoresData() error {
	if err := requestClick(
		s.world,
		fmt.Sprintf(
			`[data-action="open-saved-request"][data-library-item-id="%s"]`,
			s.moveRequestID,
		),
	); err != nil {
		return err
	}
	if err := requestWaitVisible(s.world, `[data-request-form]`); err != nil {
		return err
	}
	var fields struct {
		Method string `json:"method"`
		URL    string `json:"url"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`({
			method: document.querySelector('[name="method"]')?.value || "",
			url: document.querySelector('[name="url"]')?.value || ""
		})`,
		&fields,
	)); err != nil {
		return err
	}
	if fields.Method != "PATCH" ||
		fields.URL != "https://api.example.test/orders/42" {
		return fmt.Errorf("moved request fields were not restored: %+v", fields)
	}
	if err := requestClick(s.world, `[data-request-section="headers"]`); err != nil {
		return err
	}
	var header string
	if err := s.world.run(chromedp.Value(
		`[data-header-field="value"]`,
		&header,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	if header != "move-fixture" {
		return fmt.Errorf("moved request header = %q, want move-fixture", header)
	}
	return nil
}

func (s *collectionSteps) collectionFilePickerReturnsPostman() error {
	return requestConfigureBridgeCall(
		s.world,
		"ImportCollectionFile",
		map[string]any{
			"data":     postmanCollectionV21Fixture,
			"path":     "/fixtures/postman-orders.postman_collection.json",
			"canceled": false,
		},
	)
}

func (s *collectionSteps) importPostmanCollection() error {
	before, err := requestBridgeCallCount(
		s.world,
		"ImportCollectionFile",
	)
	if err != nil {
		return err
	}
	if err := requestClick(
		s.world,
		`[data-left-panel] [data-action="import-collection"]:not(:disabled)`,
	); err != nil {
		return err
	}
	if err := requestWaitVisible(
		s.world,
		`.collection-import-preview-dialog`,
	); err != nil {
		return fmt.Errorf("open Postman collection import preview: %w", err)
	}
	if err := requestWaitFor(
		s.world,
		`document.activeElement?.matches("[data-import-preview-confirm]")`,
		"safe default focus in compatible collection import preview",
	); err != nil {
		return err
	}
	var preview struct {
		Collection string `json:"collection"`
		Requests   string `json:"requests"`
		Warnings   string `json:"warnings"`
		Compatible bool   `json:"compatible"`
		Focused    bool   `json:"focused"`
	}
	if err := s.world.run(chromedp.Evaluate(`(() => {
		const dialog = document.querySelector(".collection-import-preview-dialog");
		const facts = [...(dialog?.querySelectorAll(
			".collection-import-preview-summary > div"
		) || [])].map((item) => item.querySelector("strong")?.textContent?.trim() || "");
		const confirm = dialog?.querySelector("[data-import-preview-confirm]");
		return {
			collection: facts[0] || "",
			requests: facts[1] || "",
			warnings: facts[2] || "",
			compatible: Boolean(dialog?.querySelector(".collection-import-compatible")),
			focused: document.activeElement === confirm,
		};
	})()`, &preview)); err != nil {
		return err
	}
	if preview.Collection != postmanCollectionName || preview.Requests != "1" ||
		preview.Warnings != "0" || !preview.Compatible || !preview.Focused {
		return fmt.Errorf("Postman import preview is incomplete: %+v", preview)
	}
	if err := requestClick(
		s.world,
		`.collection-import-preview-dialog [data-import-preview-confirm]`,
	); err != nil {
		return fmt.Errorf("confirm Postman collection import: %w", err)
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "ImportCollectionFile"
			).length === %d`,
			before+1,
		),
		"Postman collection file import",
	)
}

func (s *collectionSteps) importedPostmanCollectionIsVisibleAndPersisted(
	collectionName string,
	requestName string,
) error {
	if collectionName != postmanCollectionName ||
		requestName != postmanRequestName {
		return fmt.Errorf(
			"unexpected Postman fixture names %q / %q",
			collectionName,
			requestName,
		)
	}
	if err := collectionWaitForNamedCollection(
		s.world,
		collectionName,
	); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		fmt.Sprintf(
			`[...document.querySelectorAll(
				'[data-library-kind="request"] .tree-label'
			)].some((element) => element.textContent?.trim() === %s)`,
			requestJSON(requestName),
		),
		"imported Postman request "+requestName,
	); err != nil {
		return err
	}
	if err := requestWaitFor(
		s.world,
		`(() => {
			const raw = globalThis.__VALIDEX_E2E__.collectionData;
			if (!raw) return false;
			const document = JSON.parse(raw);
			const collection = document.state?.collections?.find(
				(candidate) => candidate.name === "Postman Orders"
			);
			return Boolean(
				collection &&
				document.state?.requests?.some(
					(request) =>
						request.collectionId === collection.id &&
						request.name === "Create order" &&
						request.method === "POST" &&
						request.url ===
							"https://api.example.test/orders?dryRun=true"
				)
			);
		})()`,
		"durable imported Postman collection",
	); err != nil {
		return err
	}

	document, err := collectionLatestPersistedDocument(s.world)
	if err != nil {
		return err
	}
	collectionID := ""
	for _, collection := range document.State.Collections {
		if collection.Name == collectionName {
			collectionID = collection.ID
			break
		}
	}
	if collectionID == "" {
		return fmt.Errorf(
			"persisted Postman collection %q was not found",
			collectionName,
		)
	}
	for _, request := range document.State.Requests {
		if request.CollectionID != collectionID ||
			request.Name != requestName {
			continue
		}
		if request.Method != postmanRequestMethod ||
			request.URL != postmanRequestURL ||
			request.Body != postmanRequestBody {
			return fmt.Errorf(
				"persisted Postman request is incomplete: %+v",
				request,
			)
		}
		return nil
	}
	return fmt.Errorf(
		"persisted Postman request %q was not found",
		requestName,
	)
}

func (s *collectionSteps) exportCollection(collectionName string) error {
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
			"collection %q was not found for export",
			collectionName,
		)
	}
	before, err := requestBridgeCallCount(
		s.world,
		"ExportCollectionFile",
	)
	if err != nil {
		return err
	}
	if err := collectionOpenLibraryMenu(
		s.world,
		"collection",
		collectionID,
	); err != nil {
		return err
	}

	var clicked bool
	if err := s.world.run(chromedp.Evaluate(
		`(() => {
			const item = [...document.querySelectorAll(
				'.native-menu [role="menuitem"]'
			)].find(
				(candidate) =>
					candidate.textContent?.trim() === "Export collection"
			);
			if (!(item instanceof HTMLElement)) return false;
			item.click();
			return true;
		})()`,
		&clicked,
	)); err != nil {
		return err
	}
	if !clicked {
		return fmt.Errorf(
			"collection export menu action was not found for %q",
			collectionName,
		)
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "ExportCollectionFile"
			).length === %d`,
			before+1,
		),
		"Postman collection export",
	)
}

func (s *collectionSteps) exportedPostmanCollectionContainsRequest(
	requestName string,
) error {
	calls, err := requestBridgeCalls(s.world)
	if err != nil {
		return err
	}
	var exportCalls []requestBridgeCall
	for _, call := range calls {
		if call.Method == "ExportCollectionFile" {
			exportCalls = append(exportCalls, call)
		}
	}
	if len(exportCalls) != 1 {
		return fmt.Errorf(
			"ExportCollectionFile call count = %d, want 1",
			len(exportCalls),
		)
	}
	var input struct {
		SuggestedName string `json:"suggestedName"`
		Data          string `json:"data"`
	}
	if err := json.Unmarshal(exportCalls[0].Input, &input); err != nil {
		return fmt.Errorf(
			"decode ExportCollectionFile input: %w",
			err,
		)
	}
	if input.SuggestedName !=
		postmanCollectionName+".postman_collection.json" {
		return fmt.Errorf(
			"export suggested name = %q",
			input.SuggestedName,
		)
	}
	var document struct {
		Info struct {
			ID     string `json:"_postman_id"`
			Name   string `json:"name"`
			Schema string `json:"schema"`
		} `json:"info"`
		Items []struct {
			Name    string `json:"name"`
			Request struct {
				Method  string `json:"method"`
				Headers []struct {
					Key      string `json:"key"`
					Value    string `json:"value"`
					Disabled bool   `json:"disabled"`
				} `json:"header"`
				Body struct {
					Mode string `json:"mode"`
					Raw  string `json:"raw"`
				} `json:"body"`
				URL string `json:"url"`
			} `json:"request"`
		} `json:"item"`
	}
	if err := json.Unmarshal([]byte(input.Data), &document); err != nil {
		return fmt.Errorf("decode exported Postman document: %w", err)
	}
	if document.Info.ID == "" ||
		document.Info.Name != postmanCollectionName ||
		document.Info.Schema != postmanV21Schema {
		return fmt.Errorf(
			"exported Postman v2.1 info is incomplete: %+v",
			document.Info,
		)
	}
	if len(document.Items) != 1 {
		return fmt.Errorf(
			"exported Postman item count = %d, want 1",
			len(document.Items),
		)
	}
	item := document.Items[0]
	if item.Name != requestName ||
		item.Request.Method != postmanRequestMethod ||
		item.Request.URL != postmanRequestURL ||
		item.Request.Body.Mode != "raw" ||
		item.Request.Body.Raw != postmanRequestBody {
		return fmt.Errorf(
			"exported Postman request is incomplete: %+v",
			item,
		)
	}
	hasClientHeader := false
	for _, header := range item.Request.Headers {
		if header.Key == "X-Client" &&
			header.Value == "validex-e2e" &&
			!header.Disabled {
			hasClientHeader = true
			break
		}
	}
	if !hasClientHeader {
		return fmt.Errorf(
			"exported Postman request has no enabled X-Client header: %+v",
			item.Request.Headers,
		)
	}
	return nil
}

func (s *collectionSteps) filePickerReturnsOpenAPI() error {
	result := map[string]any{
		"specId":  "orders-api",
		"path":    "/fixtures/orders.openapi.yaml",
		"title":   "Orders API",
		"version": "1.0.0",
		"baseUrl": requestTestURL[:len(requestTestURL)-len("/orders")],
		"endpoints": []map[string]any{
			{
				"id":      "listOrders",
				"method":  "GET",
				"path":    "/orders",
				"summary": "List orders",
				"tags":    []string{"Orders"},
			},
			{
				"id":      "createOrder",
				"method":  "POST",
				"path":    "/orders",
				"summary": "Create order",
				"tags":    []string{"Orders"},
			},
		},
		"canceled": false,
	}
	return requestConfigureBridgeCall(s.world, "ImportOpenAPI", result)
}

const postmanCollectionV21Fixture = `{
  "info": {
    "_postman_id": "postman-orders-e2e",
    "name": "Postman Orders",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Create order",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json",
            "type": "text"
          },
          {
            "key": "X-Client",
            "value": "validex-e2e",
            "type": "text"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\"sku\":\"SKU-42\",\"quantity\":2}"
        },
        "url": {
          "raw": "https://api.example.test/orders?dryRun=true",
          "protocol": "https",
          "host": ["api", "example", "test"],
          "path": ["orders"],
          "query": [
            {
              "key": "dryRun",
              "value": "true"
            }
          ]
        }
      }
    }
  ]
}`

func (s *collectionSteps) importOpenAPIDocument() error {
	before, err := requestBridgeCallCount(s.world, "ImportOpenAPI")
	if err != nil {
		return err
	}
	if err := requestClick(
		s.world,
		`[data-request-layout] [data-action="import-openapi"]`,
	); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		fmt.Sprintf(
			`globalThis.__VALIDEX_E2E__.calls.filter(
				(call) => call.method === "ImportOpenAPI"
			).length > %d && document.querySelector(".tool-notice")?.textContent.includes("Orders API")`,
			before,
		),
		"imported OpenAPI document",
	)
}

func (s *collectionSteps) importedAPISummaryIsVisible() error {
	var summary string
	if err := s.world.run(chromedp.Text(`.tool-notice`, &summary, chromedp.ByQuery)); err != nil {
		return err
	}
	if !strings.Contains(summary, "Orders API") ||
		!strings.Contains(summary, "2") {
		return fmt.Errorf("OpenAPI import summary = %q", summary)
	}
	return nil
}

func (s *collectionSteps) openImportedAPIsLibrary() error {
	if err := requestClick(s.world, `[data-section="apis"]`); err != nil {
		return err
	}
	return requestWaitFor(
		s.world,
		`document.querySelector('[data-section="apis"]')?.getAttribute("aria-current") === "page" &&
		 document.querySelector(".sidebar-source strong")?.textContent.trim() === "Orders API" &&
		 document.querySelectorAll("[data-action=open-api]").length === 2`,
		"imported APIs library",
	)
}

func (s *collectionSteps) openImportedEndpoint() error {
	var endpointID string
	if err := s.world.run(chromedp.Evaluate(
		`document.querySelector("[data-action=open-api]")?.getAttribute("data-api-id") || ""`,
		&endpointID,
	)); err != nil {
		return err
	}
	if endpointID == "" {
		return fmt.Errorf("imported endpoint was not rendered")
	}
	s.importedEndpointID = endpointID
	if err := requestClick(
		s.world,
		fmt.Sprintf(`[data-action="open-api"][data-api-id="%s"]`, endpointID),
	); err != nil {
		return err
	}
	return requestWaitVisible(s.world, `[data-request-form]`)
}

func (s *collectionSteps) importedEndpointRequestIsComplete() error {
	var state struct {
		TabID  string `json:"tabId"`
		Method string `json:"method"`
		URL    string `json:"url"`
	}
	if err := s.world.run(chromedp.Evaluate(
		`({
			tabId: document.querySelector(
				'.request-tab.active [data-request-tab-button]'
			)?.getAttribute("data-tab-id") || "",
			method: document.querySelector('[name="method"]')?.value || "",
			url: document.querySelector('[name="url"]')?.value || ""
		})`,
		&state,
	)); err != nil {
		return err
	}
	if state.TabID != s.importedEndpointID ||
		!strings.HasPrefix(state.TabID, "openapi:orders-api:") ||
		state.Method != "GET" ||
		state.URL != requestTestURL {
		return fmt.Errorf("imported endpoint request is incomplete: %+v", state)
	}
	return nil
}

func (s *collectionSteps) importedEndpointIsActive() error {
	selector := fmt.Sprintf(
		`[data-action="open-api"][data-api-id="%s"]`,
		s.importedEndpointID,
	)
	var active bool
	if err := s.world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`(() => {
				const endpoint = document.querySelector(%s);
				return endpoint?.getAttribute("aria-current") === "page" &&
					endpoint?.getAttribute("data-state") === "active";
			})()`,
			requestJSON(selector),
		),
		&active,
	)); err != nil {
		return err
	}
	if !active {
		return fmt.Errorf("opened imported endpoint is not marked active")
	}
	return nil
}

func collectionWaitForNamedCollection(world *browserWorld, name string) error {
	return requestWaitFor(
		world,
		fmt.Sprintf(
			`[...document.querySelectorAll(
				'[data-action="toggle-collection"] .tree-label'
			)].some((element) => element.textContent?.trim() === %s)`,
			requestJSON(name),
		),
		"collection "+name,
	)
}

func collectionEnsureSidebarVisible(world *browserWorld) error {
	var hidden bool
	if err := world.run(chromedp.Evaluate(
		`document.querySelector("[data-left-panel]")?.getAttribute("aria-hidden") === "true"`,
		&hidden,
	)); err != nil {
		return err
	}
	if hidden {
		if err := requestClick(world, `[data-action="restore-left"]`); err != nil {
			return err
		}
	}
	return requestWaitFor(
		world,
		`document.querySelector("[data-left-panel]")?.getAttribute("aria-hidden") === "false" &&
		 !document.querySelector("[data-left-panel]")?.hasAttribute("inert")`,
		"visible request library sidebar",
	)
}

func collectionNamedItemID(
	world *browserWorld,
	kind string,
	name string,
) (string, error) {
	var id string
	err := world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`(() => {
				const row = [...document.querySelectorAll(
					'[data-library-kind=%s][data-library-item-id]'
				)].find((candidate) =>
					candidate.querySelector(".tree-label")?.textContent?.trim() === %s
				);
				return row?.getAttribute("data-library-item-id") || "";
			})()`,
			requestJSON(kind),
			requestJSON(name),
		),
		&id,
	))
	return id, err
}

func collectionOpenLibraryMenu(
	world *browserWorld,
	kind string,
	id string,
) error {
	selector := fmt.Sprintf(
		`[data-action="library-menu"][data-library-kind="%s"][data-library-item-id="%s"]`,
		kind,
		id,
	)
	if err := requestClick(world, selector); err != nil {
		return err
	}
	return requestWaitVisible(world, `.native-menu[role="menu"]`)
}

func collectionSetChecked(
	world *browserWorld,
	selector string,
	checked bool,
) error {
	var changed bool
	if err := world.run(chromedp.Evaluate(
		fmt.Sprintf(
			`(() => {
				const input = document.querySelector(%s);
				if (!(input instanceof HTMLInputElement)) return false;
				input.focus();
				input.checked = %t;
				input.dispatchEvent(new Event("change", { bubbles: true }));
				return true;
			})()`,
			requestJSON(selector),
			checked,
		),
		&changed,
	)); err != nil {
		return err
	}
	if !changed {
		return fmt.Errorf("could not set checked=%t on %s", checked, selector)
	}
	return nil
}

func collectionLatestPersistedDocument(
	world *browserWorld,
) (collectionLibraryDocumentFixture, error) {
	var raw string
	if err := world.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E__.collectionData`,
		&raw,
	)); err != nil {
		return collectionLibraryDocumentFixture{}, err
	}
	if raw == "" {
		return collectionLibraryDocumentFixture{}, fmt.Errorf(
			"native bridge has no persisted collection document",
		)
	}
	var document collectionLibraryDocumentFixture
	if err := json.Unmarshal([]byte(raw), &document); err != nil {
		return collectionLibraryDocumentFixture{}, fmt.Errorf(
			"decode persisted collection document: %w",
			err,
		)
	}
	if document.Version != 1 {
		return collectionLibraryDocumentFixture{}, fmt.Errorf(
			"persisted collection document version = %d, want 1",
			document.Version,
		)
	}
	return document, nil
}

func collectionRequestTabCount(world *browserWorld) (int, error) {
	var count int
	err := world.run(chromedp.Evaluate(
		`document.querySelectorAll("[data-request-tab]").length`,
		&count,
	))
	return count, err
}

func collectionSearchMoveDocument(source, destination string) string {
	const timestamp = "2026-07-29T12:00:00.000Z"
	document := map[string]any{
		"state": map[string]any{
			"collections": []map[string]any{
				{
					"id":        "collection-orders",
					"name":      source,
					"createdAt": timestamp,
					"updatedAt": timestamp,
					"sortOrder": 0,
				},
				{
					"id":        "collection-customers",
					"name":      destination,
					"createdAt": timestamp,
					"updatedAt": timestamp,
					"sortOrder": 1,
				},
			},
			"requests": []map[string]any{
				collectionSavedRequestFixture(
					"request-get-orders",
					"collection-orders",
					"Get orders",
					"GET",
					requestTestURL+"?limit=25",
					"",
					0,
					"orders-fixture",
				),
				collectionSavedRequestFixture(
					"request-update-order",
					"collection-orders",
					"Update order",
					"PATCH",
					"https://api.example.test/orders/42",
					`{"status":"READY"}`,
					1,
					"move-fixture",
				),
				collectionSavedRequestFixture(
					"request-get-customers",
					"collection-customers",
					"Get customers",
					"GET",
					"https://api.example.test/customers",
					"",
					0,
					"customers-fixture",
				),
			},
			"expandedCollectionIds": []string{
				"collection-orders",
				"collection-customers",
			},
		},
		"version": 1,
	}
	return requestJSON(document)
}

func collectionSavedRequestFixture(
	id string,
	collectionID string,
	name string,
	method string,
	url string,
	body string,
	sortOrder int,
	headerValue string,
) map[string]any {
	const timestamp = "2026-07-29T12:00:00.000Z"
	return map[string]any{
		"id":           id,
		"collectionId": collectionID,
		"name":         name,
		"method":       method,
		"url":          url,
		"headers": []map[string]any{
			{
				"id":          id + "-header",
				"enabled":     true,
				"key":         "X-Fixture",
				"value":       headerValue,
				"description": "E2E fixture header",
				"source":      "Manual",
			},
		},
		"body":          body,
		"createdAt":     timestamp,
		"updatedAt":     timestamp,
		"sortOrder":     sortOrder,
		"literalValues": true,
	}
}
