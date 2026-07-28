import {
  Lifecycle,
  eventElement,
  html,
  setHTML,
  type Disposable,
  type TrustedHTMLFragment,
} from "../../core/dom.js";
import { applicationCommands } from "../../app/commands.js";
import { icon } from "../../core/icons.js";
import {
  openMenu,
  presentDialog,
  type DialogHandle,
  type OpenMenuOptions,
  type OpenOverlay,
} from "../../core/overlays.js";
import {
  COLLECTION_NAME_LENGTH_LIMITS,
  SAVED_REQUEST_NAME_LENGTH_LIMITS,
  bySortOrder,
  type RequestCollection,
  type SavedRequest,
} from "../../features/collections/model.js";
import {
  getLocale,
  subscribeLocale,
  t,
} from "../../i18n/locale.js";
import {
  importedEndpointTabID,
  importedRequestURL,
} from "../../lib/openapi.js";
import type {
  BootstrapData,
  HTTPMethod,
  RequestTab,
} from "../../lib/types.js";
import {
  collectionLibraryStore,
} from "../../stores/collectionLibrary.js";
import {
  COLLECTION_LIBRARY_PERSISTENCE_PHASE,
  getCollectionLibraryPersistenceSnapshot,
  retryCollectionLibraryWrite,
  subscribeCollectionLibraryPersistence,
} from "../../stores/collectionLibraryStorage.js";
import { workspaceStore } from "../../stores/workspace.js";
import {
  isVirtualListNavigationKey,
  virtualNavigationTarget,
  virtualWindowRange,
  type VirtualWindowRange,
} from "./sidebarVirtualization.js";

const treeRowHeight = 33;
const apiOverscan = 10;

type SidebarSection = "requests" | "apis";

interface APINode {
  id: string;
  name: string;
  method: HTTPMethod;
  url: string;
  openApi?: RequestTab["openApi"];
}

type LibraryTreeNode =
  | {
      kind: "collection";
      id: string;
      collection: RequestCollection;
      requestCount: number;
    }
  | {
      kind: "request";
      id: string;
      request: SavedRequest;
    };

type LibraryEditTarget =
  | { kind: "collection"; id: string; name: string }
  | { kind: "request"; id: string; name: string };

type LibraryDeleteTarget =
  | {
      kind: "collection";
      id: string;
      name: string;
      requestCount: number;
    }
  | { kind: "request"; id: string; name: string };

function methodBadge(method: HTTPMethod): TrustedHTMLFragment {
  return html`
    <span
      class="method-badge method-${method.toLowerCase()} method-compact"
      aria-label="${t("common.httpMethod", { method })}"
    >
      ${method}
    </span>
  `;
}

function visibleLibraryNodes(
  collections: readonly RequestCollection[],
  requests: readonly SavedRequest[],
  expandedCollectionIDs: readonly string[],
  query: string,
): LibraryTreeNode[] {
  const locale = getLocale();
  const normalized = query.trim().toLocaleLowerCase(locale);
  const orderedRequests = [...requests].sort(bySortOrder);
  const requestsByCollection = new Map<string, SavedRequest[]>();
  for (const request of orderedRequests) {
    const grouped = requestsByCollection.get(request.collectionId);
    if (grouped) grouped.push(request);
    else requestsByCollection.set(request.collectionId, [request]);
  }

  return [...collections].sort(bySortOrder).flatMap<LibraryTreeNode>(
    (collection) => {
      const collectionRequests =
        requestsByCollection.get(collection.id) ?? [];
      const collectionMatches = collection.name
        .toLocaleLowerCase(locale)
        .includes(normalized);
      const matchingRequests = normalized
        ? collectionRequests.filter((request) =>
            `${request.name} ${request.method} ${request.url}`
              .toLocaleLowerCase(locale)
              .includes(normalized),
          )
        : collectionRequests;
      if (
        normalized &&
        !collectionMatches &&
        matchingRequests.length === 0
      ) {
        return [];
      }
      const displayedRequests = normalized
        ? collectionMatches
          ? collectionRequests
          : matchingRequests
        : expandedCollectionIDs.includes(collection.id)
          ? collectionRequests
          : [];
      return [
        {
          kind: "collection",
          id: collection.id,
          collection,
          requestCount: collectionRequests.length,
        },
        ...displayedRequests.map((request) => ({
          kind: "request" as const,
          id: request.id,
          request,
        })),
      ];
    },
  );
}

/**
 * Mounts the dependency-free Collections / imported APIs sidebar.
 */
export function mountSidebar(
  root: HTMLElement,
  bootstrap: BootstrapData,
): Disposable {
  void bootstrap;
  const lifecycle = new Lifecycle();
  let disposed = false;
  let rendering = false;
  let query = "";
  let collectionScrollTop = 0;
  let apiScrollTop = 0;
  let apiViewportHeight = 0;
  let activeMenu: OpenOverlay | undefined;
  let activeDialog: DialogHandle | undefined;
  let apiResizeObserver: ResizeObserver | undefined;
  let renderedAPIList: HTMLElement | undefined;
  let renderedAPIRange: VirtualWindowRange | undefined;
  let renderedAPICount = -1;

  const persistence = () =>
    getCollectionLibraryPersistenceSnapshot();

  const section = (): SidebarSection =>
    workspaceStore.getState().sidebarSection;

  const readOnly = (): boolean =>
    persistence().error?.code === "collection_library_conflict";

  const apiNodes = (): APINode[] => {
    const importedSpec = workspaceStore.getState().latestImportedSpec;
    if (!importedSpec) return [];
    const locale = getLocale();
    const normalized = query.trim().toLocaleLowerCase(locale);
    return importedSpec.endpoints
      .filter((endpoint) =>
        `${endpoint.summary} ${endpoint.method} ${endpoint.path} ${endpoint.tags.join(" ")}`
          .toLocaleLowerCase(locale)
          .includes(normalized),
      )
      .map((endpoint) => ({
        id: importedEndpointTabID(importedSpec.specId, endpoint.id),
        name: endpoint.summary || endpoint.path,
        method: endpoint.method,
        url: importedRequestURL(importedSpec.baseUrl, endpoint.path),
        openApi: {
          specId: importedSpec.specId,
          path: endpoint.path,
        },
      }));
  };

  const openAPINode = (nodeID: string): void => {
    const node = apiNodes().find((candidate) => candidate.id === nodeID);
    if (!node) return;
    workspaceStore.getState().openTab({
      id: node.id,
      name: node.name,
      method: node.method,
      url: node.url,
      openApi: node.openApi,
      dirty: false,
    });
  };

  const openSavedRequest = (requestID: string): void => {
    const workspace = workspaceStore.getState();
    const existing = workspace.tabs.find(
      (tab) => tab.savedRequestId === requestID,
    );
    if (existing) {
      workspace.setActiveTab(existing.id);
      return;
    }
    const snapshot = collectionLibraryStore
      .getState()
      .openRequestSnapshot(requestID);
    if (!snapshot) return;
    workspace.openTab({ ...snapshot, dirty: false });
  };

  const reconcileSavedRequestLinks = (): void => {
    if (!persistence().hydrated) return;
    workspaceStore.getState().reconcileSavedRequestLinks(
      collectionLibraryStore
        .getState()
        .requests.map(
          ({
            id,
            collectionId,
            literalValues,
            name,
            method,
            url,
            headers,
            body,
          }) => ({
            id,
            collectionId,
            literalValues,
            name,
            method,
            url,
            headers,
            body,
          }),
        ),
    );
  };

  const apiRowsMarkup = (
    nodes: readonly APINode[],
  ): TrustedHTMLFragment => {
    const activeTabID = workspaceStore.getState().activeTabID;
    const range = virtualWindowRange({
      count: nodes.length,
      scrollTop: apiScrollTop,
      viewportHeight: apiViewportHeight,
      rowHeight: treeRowHeight,
      overscan: apiOverscan,
    });
    return html`
      ${nodes.slice(range.start, range.end).map(
        (node, offset) => {
          const active = node.id === activeTabID;
          return html`
          <button
            type="button"
            class="tree-row${active ? " active" : ""}"
            style="transform: translateY(${(range.start + offset) *
            treeRowHeight}px); padding-left: 10px"
            title="${node.url}"
            data-action="open-api"
            data-api-id="${node.id}"
            data-focus="api:${node.id}"
            data-state="${active ? "active" : "idle"}"
            aria-current="${active ? "page" : "false"}"
            aria-keyshortcuts="Shift+F10"
            aria-label="${t("sidebar.openEndpoint", {
              method: node.method,
              name: node.name,
              url: node.url,
            })}"
          >
            ${methodBadge(node.method)}
            <span class="tree-label">${node.name}</span>
          </button>
        `;
        },
      )}
    `;
  };

  const updateAPIRows = (focusNodeID?: string): void => {
    if (disposed) return;
    const list = root.querySelector<HTMLElement>("[data-api-list]");
    if (!list) return;
    const nodes = apiNodes();
    const range = virtualWindowRange({
      count: nodes.length,
      scrollTop: apiScrollTop,
      viewportHeight: apiViewportHeight,
      rowHeight: treeRowHeight,
      overscan: apiOverscan,
    });
    list.style.height = `${nodes.length * treeRowHeight}px`;
    const focusedNodeID =
      focusNodeID ??
      (document.activeElement instanceof HTMLElement &&
      list.contains(document.activeElement)
        ? document.activeElement.dataset.apiId
        : undefined);
    if (
      renderedAPIList !== list ||
      renderedAPICount !== nodes.length ||
      renderedAPIRange?.start !== range.start ||
      renderedAPIRange?.end !== range.end
    ) {
      setHTML(list, apiRowsMarkup(nodes));
      renderedAPIList = list;
      renderedAPICount = nodes.length;
      renderedAPIRange = range;
    }
    if (!focusedNodeID) return;
    [
      ...list.querySelectorAll<HTMLButtonElement>("[data-api-id]"),
    ]
      .find((candidate) => candidate.dataset.apiId === focusedNodeID)
      ?.focus({ preventScroll: true });
  };

  const navigateAPIRow = (
    nodeID: string,
    key: string,
  ): boolean => {
    if (!isVirtualListNavigationKey(key)) return false;
    const nodes = apiNodes();
    const currentIndex = nodes.findIndex(
      (candidate) => candidate.id === nodeID,
    );
    if (currentIndex < 0) return false;

    const scroll = root.querySelector<HTMLElement>(
      '[data-scroll-kind="apis"]',
    );
    if (scroll) {
      apiScrollTop = scroll.scrollTop;
      apiViewportHeight = scroll.clientHeight;
    }
    const target = virtualNavigationTarget({
      count: nodes.length,
      currentIndex,
      key,
      scrollTop: apiScrollTop,
      viewportHeight: apiViewportHeight,
      rowHeight: treeRowHeight,
      overscan: apiOverscan,
    });
    const targetNode =
      target === undefined ? undefined : nodes[target.index];
    if (!target || !targetNode) return false;

    apiScrollTop = target.scrollTop;
    if (scroll) {
      scroll.scrollTop = target.scrollTop;
      apiScrollTop = scroll.scrollTop;
    }
    updateAPIRows(targetNode.id);
    return true;
  };

  const apiBrowserMarkup = (): TrustedHTMLFragment => {
    const importedSpec = workspaceStore.getState().latestImportedSpec;
    const nodes = apiNodes();
    return html`
      ${importedSpec
        ? html`
            <div class="sidebar-source" title="${importedSpec.title}">
              <strong>
                ${importedSpec.title || t("sidebar.importedOpenAPI")}
              </strong>
              <span>
                ${t(
                  importedSpec.endpoints.length === 1
                    ? "sidebar.endpointCount.one"
                    : "sidebar.endpointCount.many",
                  { count: importedSpec.endpoints.length },
                )}
              </span>
            </div>
          `
        : ""}
      ${(importedSpec?.endpoints.length ?? 0) > 0
        ? html`
            <div class="sidebar-toolbar">
              <label class="sidebar-search">
                ${icon("search", 14)}
                <input
                  type="search"
                  value="${query}"
                  data-sidebar-search
                  data-focus="sidebar-search"
                  placeholder="${t("sidebar.searchAPIs")}"
                  aria-label="${t("sidebar.searchAPIs")}"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>
            </div>
            ${query.trim()
              ? html`
                  <span
                    class="sr-only sidebar-search-summary"
                    role="status"
                    aria-live="polite"
                  >
                    ${t(
                      nodes.length === 1
                        ? "sidebar.searchResultCount.one"
                        : "sidebar.searchResultCount.many",
                      { count: nodes.length },
                    )}
                  </span>
                `
              : ""}
          `
        : ""}
      ${nodes.length === 0
        ? html`
            <div class="sidebar-empty">
              ${icon(query.trim() ? "search" : "protocols", 22)}
              <strong>
                ${query.trim()
                  ? t("sidebar.noAPISearchResult")
                  : importedSpec
                    ? t("sidebar.noAPIEndpoints")
                    : t("sidebar.noImportedOpenAPI")}
              </strong>
              <span>
                ${query.trim()
                  ? t("sidebar.tryDifferentSearch")
                  : importedSpec
                    ? t("sidebar.noAPIEndpointsHint")
                    : t("sidebar.importOpenAPIHint")}
              </span>
              ${query.trim()
                ? ""
                : html`
                    <button
                      type="button"
                      class="button button-primary button-sm sidebar-import-action"
                      data-action="import-openapi"
                      data-focus="import-openapi"
                    >
                      ${icon("import", 14)} ${t("chrome.importOpenAPI")}
                    </button>
                  `}
            </div>
          `
        : html`
            <div
              class="tree-scroll"
              role="region"
              aria-label="${t("sidebar.apis")}"
              data-scroll-kind="apis"
            >
              <div
                class="virtual-list"
                data-api-list
                style="height: ${nodes.length * treeRowHeight}px"
              >
                ${apiRowsMarkup(nodes)}
              </div>
            </div>
          `}
    `;
  };

  const collectionRowsMarkup = (
    nodes: readonly LibraryTreeNode[],
    expandedCollectionIDs: readonly string[],
  ): TrustedHTMLFragment => {
    const workspace = workspaceStore.getState();
    const activeTab = workspace.tabs.find(
      (tab) => tab.id === workspace.activeTabID,
    );
    return html`
    ${nodes.map((node, index) => {
      if (node.kind === "collection") {
        const expanded =
          query.trim().length > 0 ||
          expandedCollectionIDs.includes(node.collection.id);
        const requestCount = t(
          node.requestCount === 1
            ? "sidebar.collectionRequestCount.one"
            : "sidebar.collectionRequestCount.many",
          { count: node.requestCount },
        );
        return html`
          <div
            class="library-tree-row"
            style="transform: translateY(${index * treeRowHeight}px)"
            data-library-kind="collection"
            data-library-item-id="${node.collection.id}"
          >
            <button
              type="button"
              class="tree-row collection-row"
              data-action="toggle-collection"
              data-library-kind="collection"
              data-library-item-id="${node.collection.id}"
              data-focus="library:collection:${node.collection.id}"
              data-state="${expanded ? "expanded" : "collapsed"}"
              aria-expanded="${expanded ? "true" : "false"}"
              aria-keyshortcuts="Shift+F10"
              aria-label="${query.trim()
                ? node.collection.name
                : expanded
                  ? t("sidebar.collapseCollection", {
                      name: node.collection.name,
                      count: requestCount,
                    })
                  : t("sidebar.expandCollection", {
                      name: node.collection.name,
                      count: requestCount,
                    })}"
            >
              ${icon(
                "chevron-right",
                14,
                `tree-chevron${expanded ? " expanded" : ""}`,
              )}
              ${icon(expanded ? "folder-open" : "folder", 15)}
              <span class="tree-label">${node.collection.name}</span>
              <span class="collection-count">${node.requestCount}</span>
            </button>
            <button
              type="button"
              class="icon-button library-row-actions"
              data-action="library-menu"
              data-library-kind="collection"
              data-library-item-id="${node.collection.id}"
              data-request-count="${node.requestCount}"
              data-focus="menu:collection:${node.collection.id}"
              aria-label="${t("sidebar.moreActions", {
                name: node.collection.name,
              })}"
              title="${t("sidebar.moreActions", {
                name: node.collection.name,
              })}"
            >
              ${icon("more", 15)}
            </button>
          </div>
        `;
      }
      const active = activeTab?.savedRequestId === node.request.id;
      return html`
        <div
          class="library-tree-row"
          style="transform: translateY(${index * treeRowHeight}px)"
          data-library-kind="request"
          data-library-item-id="${node.request.id}"
        >
          <button
            type="button"
            class="tree-row saved-request-row${active ? " active" : ""}"
            title="${node.request.url}"
            data-action="open-saved-request"
            data-library-kind="request"
            data-library-item-id="${node.request.id}"
            data-focus="library:request:${node.request.id}"
            data-state="${active ? "active" : "idle"}"
            aria-current="${active ? "page" : "false"}"
            aria-keyshortcuts="Shift+F10"
            aria-label="${t("sidebar.openSavedRequest", {
              method: node.request.method,
              name: node.request.name,
              url: node.request.url,
            })}"
          >
            ${methodBadge(node.request.method)}
            <span class="tree-label">${node.request.name}</span>
          </button>
          <button
            type="button"
            class="icon-button library-row-actions"
            data-action="library-menu"
            data-library-kind="request"
            data-library-item-id="${node.request.id}"
            data-focus="menu:request:${node.request.id}"
            aria-label="${t("sidebar.moreActions", {
              name: node.request.name,
            })}"
            title="${t("sidebar.moreActions", {
              name: node.request.name,
            })}"
          >
            ${icon("more", 15)}
          </button>
        </div>
      `;
    })}
    `;
  };

  const collectionPanelMarkup = (): TrustedHTMLFragment => {
    const library = collectionLibraryStore.getState();
    const nodes = visibleLibraryNodes(
      library.collections,
      library.requests,
      library.expandedCollectionIds,
      query,
    );
    const isReadOnly = readOnly();
    return html`
      <div class="sidebar-toolbar collection-toolbar">
        <label class="sidebar-search">
          ${icon("search", 14)}
          <input
            type="search"
            value="${query}"
            data-sidebar-search
            data-focus="sidebar-search"
            placeholder="${t("sidebar.searchRequests")}"
            aria-label="${t("sidebar.searchRequests")}"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <button
          type="button"
          class="icon-button new-collection-button"
          data-action="new-collection"
          data-focus="new-collection"
          aria-label="${t("sidebar.newCollection")}"
          title="${isReadOnly
            ? t("sidebar.readOnlyAction")
            : t("sidebar.newCollection")}"
          ${isReadOnly ? "disabled" : ""}
        >
          ${icon("plus", 15)}
        </button>
      </div>
      ${query.trim()
        ? html`
            <span
              class="sr-only sidebar-search-summary"
              role="status"
              aria-live="polite"
            >
              ${t(
                nodes.length === 1
                  ? "sidebar.searchResultCount.one"
                  : "sidebar.searchResultCount.many",
                { count: nodes.length },
              )}
            </span>
          `
        : ""}
      ${nodes.length === 0
        ? html`
            <div class="sidebar-empty">
              ${icon(query.trim() ? "search" : "folder", 22)}
              <strong>
                ${query.trim()
                  ? t("sidebar.noSearchResult")
                  : t("sidebar.noOpenRequest")}
              </strong>
              <span>
                ${query.trim()
                  ? t("sidebar.tryDifferentSearch")
                  : t("sidebar.createFirstRequestHint")}
              </span>
              ${query.trim()
                ? ""
                : html`
                    <button
                      type="button"
                      class="button button-primary button-sm"
                      data-action="new-collection"
                      data-focus="new-collection-empty"
                      title="${isReadOnly
                        ? t("sidebar.readOnlyAction")
                        : t("sidebar.newCollection")}"
                      ${isReadOnly ? "disabled" : ""}
                    >
                      ${icon("plus", 14)} ${t("sidebar.newCollection")}
                    </button>
                  `}
            </div>
          `
        : html`
            <div
              class="tree-scroll"
              role="region"
              aria-label="${t("sidebar.requests")}"
              data-scroll-kind="requests"
            >
              <div
                class="virtual-list"
                style="height: ${nodes.length * treeRowHeight}px"
              >
                ${collectionRowsMarkup(
                  nodes,
                  library.expandedCollectionIds,
                )}
              </div>
            </div>
          `}
    `;
  };

  const storageNoticeMarkup = (): TrustedHTMLFragment => {
    const snapshot = persistence();
    if (
      snapshot.phase !== COLLECTION_LIBRARY_PERSISTENCE_PHASE.ERROR ||
      !snapshot.hydrated
    ) {
      return html``;
    }
    const conflict =
      snapshot.error?.code === "collection_library_conflict";
    return html`
      <div class="library-storage-notice" role="alert">
        ${icon("warning", 15)}
        <span>
          ${conflict
            ? t("sidebar.libraryConflict")
            : t("sidebar.libraryWriteFailed")}
          ${snapshot.error?.message || snapshot.error?.hint
            ? html`
                <details>
                  <summary>${t("common.technicalDetails")}</summary>
                  ${snapshot.error.message
                    ? html`<small>${snapshot.error.message}</small>`
                    : ""}
                  ${snapshot.error.hint
                    ? html`<small>${snapshot.error.hint}</small>`
                    : ""}
                </details>
              `
            : ""}
        </span>
        ${conflict
          ? ""
          : html`
              <button
                type="button"
                class="button button-secondary button-sm"
                data-action="retry-storage"
              >
                ${icon("refresh", 13)} ${t("sidebar.retryStorage")}
              </button>
            `}
      </div>
    `;
  };

  const loadingMarkup = (): TrustedHTMLFragment => {
    const snapshot = persistence();
    const failed =
      snapshot.phase === COLLECTION_LIBRARY_PERSISTENCE_PHASE.ERROR;
    return html`
      <div
        class="sidebar-empty library-loading-state"
        role="${failed ? "alert" : "status"}"
        aria-live="${failed ? "assertive" : "polite"}"
        aria-busy="${snapshot.phase ===
        COLLECTION_LIBRARY_PERSISTENCE_PHASE.LOADING
          ? "true"
          : "false"}"
      >
        ${icon(failed ? "warning" : "spinner", 22, failed ? "" : "spin")}
        <strong>
          ${failed
            ? snapshot.error?.code ===
              "collection_library_newer_version"
              ? t("sidebar.libraryUpgradeRequired")
              : t("sidebar.libraryLoadFailed")
            : t("sidebar.libraryLoading")}
        </strong>
        ${failed
          ? html`
              <button
                type="button"
                class="button button-secondary button-sm"
                data-action="retry-storage"
              >
                ${icon("refresh", 13)} ${t("sidebar.retryStorage")}
              </button>
            `
          : ""}
      </div>
    `;
  };

  const sidebarMarkup = (): TrustedHTMLFragment => {
    const workspace = workspaceStore.getState();
    const library = collectionLibraryStore.getState();
    const snapshot = persistence();
    const activeSection = workspace.sidebarSection;
    const endpointCount =
      workspace.latestImportedSpec?.endpoints.length ?? 0;
    return html`
      <aside class="sidebar" aria-label="${t("sidebar.navigation")}">
        <nav class="sidebar-sections" aria-label="${t("sidebar.sections")}">
          <button
            type="button"
            class="sidebar-section${activeSection === "requests"
              ? " active"
              : ""}"
            data-action="select-section"
            data-section="requests"
            data-focus="section:requests"
            data-state="${activeSection === "requests"
              ? "active"
              : "inactive"}"
            aria-current="${activeSection === "requests" ? "page" : "false"}"
          >
            ${icon("folder", 15)}
            <span>${t("sidebar.requests")}</span>
            <span class="section-count">${library.requests.length}</span>
          </button>
          <button
            type="button"
            class="sidebar-section${activeSection === "apis"
              ? " active"
              : ""}"
            data-action="select-section"
            data-section="apis"
            data-focus="section:apis"
            data-state="${activeSection === "apis"
              ? "active"
              : "inactive"}"
            aria-current="${activeSection === "apis" ? "page" : "false"}"
          >
            ${icon("protocols", 15)}
            <span>${t("sidebar.apis")}</span>
            <span class="section-count">${endpointCount}</span>
          </button>
        </nav>
        ${activeSection === "requests"
          ? html`
              ${storageNoticeMarkup()}
              ${snapshot.hydrated
                ? collectionPanelMarkup()
                : loadingMarkup()}
            `
          : apiBrowserMarkup()}
      </aside>
    `;
  };

  const observeAPIScroll = (): void => {
    apiResizeObserver?.disconnect();
    apiResizeObserver = undefined;
    const scroll = root.querySelector<HTMLElement>(
      '[data-scroll-kind="apis"]',
    );
    if (!scroll) return;
    scroll.scrollTop = apiScrollTop;
    apiViewportHeight = scroll.clientHeight;
    updateAPIRows();
    if (typeof ResizeObserver === "undefined") return;
    apiResizeObserver = new ResizeObserver(() => {
      if (disposed || !scroll.isConnected) return;
      apiViewportHeight = scroll.clientHeight;
      updateAPIRows();
    });
    apiResizeObserver.observe(scroll);
  };

  const render = (): void => {
    if (disposed || rendering) return;
    rendering = true;
    activeMenu?.dispose();
    activeMenu = undefined;
    const currentScroll = root.querySelector<HTMLElement>(
      "[data-scroll-kind]",
    );
    if (currentScroll?.dataset.scrollKind === "requests") {
      collectionScrollTop = currentScroll.scrollTop;
    } else if (currentScroll?.dataset.scrollKind === "apis") {
      apiScrollTop = currentScroll.scrollTop;
      apiViewportHeight = currentScroll.clientHeight;
    }
    const focused =
      document.activeElement instanceof HTMLElement &&
      root.contains(document.activeElement)
        ? document.activeElement
        : undefined;
    const focusKey = focused?.dataset.focus;
    const selection =
      focused instanceof HTMLInputElement &&
      ["text", "search"].includes(focused.type)
        ? {
            start: focused.selectionStart,
            end: focused.selectionEnd,
            direction: focused.selectionDirection,
          }
        : undefined;
    try {
      setHTML(root, sidebarMarkup());
      const activeSection = section();
      const nextScroll = root.querySelector<HTMLElement>(
        `[data-scroll-kind="${activeSection}"]`,
      );
      if (nextScroll) {
        nextScroll.scrollTop =
          activeSection === "requests"
            ? collectionScrollTop
            : apiScrollTop;
      }
      observeAPIScroll();
      if (focusKey) {
        const replacement = [
          ...root.querySelectorAll<HTMLElement>("[data-focus]"),
        ].find((element) => element.dataset.focus === focusKey);
        if (replacement && !replacement.matches(":disabled")) {
          replacement.focus({ preventScroll: true });
          if (
            selection &&
            replacement instanceof HTMLInputElement
          ) {
            replacement.setSelectionRange(
              selection.start,
              selection.end,
              selection.direction ?? undefined,
            );
          }
        } else {
          root
            .querySelector<HTMLElement>(
              `[data-focus="section:${activeSection}"]`,
            )
            ?.focus({ preventScroll: true });
        }
      }
    } finally {
      rendering = false;
    }
  };

  const showMenu = (options: OpenMenuOptions): OpenOverlay => {
    activeMenu?.dispose();
    activeMenu = openMenu(options);
    return activeMenu;
  };

  const trackDialog = (
    dialog: DialogHandle,
    trigger?: HTMLElement,
  ): DialogHandle => {
    activeDialog?.dispose();
    activeDialog = dialog;
    void dialog.closed.then(() => {
      if (activeDialog === dialog) activeDialog = undefined;
      if (
        !disposed &&
        (!trigger || !trigger.isConnected)
      ) {
        root
          .querySelector<HTMLInputElement>("[data-sidebar-search]")
          ?.focus();
      }
    });
    return dialog;
  };

  const openCreateCollectionDialog = (
    trigger?: HTMLElement,
  ): void => {
    if (readOnly()) return;
    const dialog = trackDialog(
      presentDialog(
        html`
          <form data-create-collection-form>
            <div class="dialog-header collection-dialog-header">
              <span class="dialog-icon" aria-hidden="true">
                ${icon("plus", 17)}
              </span>
              <div>
                <h2>${t("sidebar.newCollection")}</h2>
              </div>
            </div>
            <label class="dialog-field">
              ${t("sidebar.collectionName")}
              <input
                name="collectionName"
                maxlength="${COLLECTION_NAME_LENGTH_LIMITS[1]}"
                placeholder="${t("sidebar.collectionNamePlaceholder")}"
              />
            </label>
            <div class="dialog-actions">
              <button
                type="button"
                class="button button-secondary button-md"
                data-dialog-close="cancel"
              >
                ${t("sidebar.cancel")}
              </button>
              <button
                type="submit"
                class="button button-primary button-md"
                data-create-submit
                disabled
              >
                ${t("sidebar.createCollection")}
              </button>
            </div>
          </form>
        `,
        {
          className: "library-dialog",
          trigger,
          initialFocus: '[name="collectionName"]',
        },
      ),
      trigger,
    );
    const form = dialog.element.querySelector<HTMLFormElement>(
      "[data-create-collection-form]",
    );
    const input = form?.elements.namedItem("collectionName");
    const submit = form?.querySelector<HTMLButtonElement>(
      "[data-create-submit]",
    );
    if (
      !form ||
      !(input instanceof HTMLInputElement) ||
      !submit
    ) {
      dialog.close("cancel");
      return;
    }
    input.addEventListener("input", () => {
      submit.disabled = !input.value.trim();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (
        collectionLibraryStore
          .getState()
          .createCollection(input.value)
      ) {
        dialog.close("create");
      }
    });
  };

  const openRenameDialog = (
    target: LibraryEditTarget,
    trigger?: HTMLElement,
  ): void => {
    if (readOnly()) return;
    const isCollection = target.kind === "collection";
    const dialog = trackDialog(
      presentDialog(
        html`
          <form data-rename-library-form>
            <div class="dialog-header">
              <div>
                <h2>
                  ${isCollection
                    ? t("sidebar.renameCollection")
                    : t("sidebar.renameRequest")}
                </h2>
              </div>
            </div>
            <label class="dialog-field">
              ${isCollection
                ? t("sidebar.collectionName")
                : t("requests.workbench.requestName")}
              <input
                name="libraryName"
                value="${target.name}"
                maxlength="${isCollection
                  ? COLLECTION_NAME_LENGTH_LIMITS[1]
                  : SAVED_REQUEST_NAME_LENGTH_LIMITS[1]}"
              />
            </label>
            <div class="dialog-actions">
              <button
                type="button"
                class="button button-secondary button-md"
                data-dialog-close="cancel"
              >
                ${t("sidebar.cancel")}
              </button>
              <button
                type="submit"
                class="button button-primary button-md"
                data-rename-submit
              >
                ${t("sidebar.saveName")}
              </button>
            </div>
          </form>
        `,
        {
          className: "library-dialog",
          trigger,
          initialFocus: '[name="libraryName"]',
        },
      ),
      trigger,
    );
    const form = dialog.element.querySelector<HTMLFormElement>(
      "[data-rename-library-form]",
    );
    const input = form?.elements.namedItem("libraryName");
    const submit = form?.querySelector<HTMLButtonElement>(
      "[data-rename-submit]",
    );
    if (
      !form ||
      !(input instanceof HTMLInputElement) ||
      !submit
    ) {
      dialog.close("cancel");
      return;
    }
    input.select();
    input.addEventListener("input", () => {
      submit.disabled = !input.value.trim();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const library = collectionLibraryStore.getState();
      const renamed =
        target.kind === "collection"
          ? library.renameCollection(target.id, input.value)
          : library.renameRequest(target.id, input.value);
      if (renamed) dialog.close("rename");
    });
  };

  const openDeleteDialog = async (
    target: LibraryDeleteTarget,
    trigger?: HTMLElement,
  ): Promise<void> => {
    if (readOnly()) return;
    const isCollection = target.kind === "collection";
    const dialog = trackDialog(
      presentDialog(
        html`
          <div class="dialog-header">
            <div>
              <h2>
                ${isCollection
                  ? t("sidebar.deleteCollectionTitle")
                  : t("sidebar.deleteRequestTitle")}
              </h2>
              <p>
                ${isCollection
                  ? t("sidebar.deleteCollectionDescription", {
                      name: target.name,
                      count: target.requestCount,
                    })
                  : t("sidebar.deleteRequestDescription", {
                      name: target.name,
                    })}
              </p>
            </div>
          </div>
          <div class="dialog-actions">
            <button
              type="button"
              class="button button-secondary button-md"
              data-dialog-close="cancel"
              data-cancel-delete
            >
              ${t("sidebar.cancel")}
            </button>
            <button
              type="button"
              class="button button-danger button-md"
              data-dialog-close="delete"
              data-confirm-delete
            >
              ${icon("trash", 14)} ${t("sidebar.confirmDelete")}
            </button>
          </div>
        `,
        {
          className: "library-dialog",
          trigger,
          initialFocus: "[data-cancel-delete]",
        },
      ),
      trigger,
    );
    const result = await dialog.closed;
    if (disposed || result !== "delete" || readOnly()) return;
    const library = collectionLibraryStore.getState();
    if (target.kind === "collection") {
      library.deleteCollection(target.id);
    } else {
      library.deleteRequest(target.id);
    }
    window.requestAnimationFrame(() => {
      root.querySelector<HTMLInputElement>("[data-sidebar-search]")?.focus();
    });
  };

  const openMoveMenu = (
    requestID: string,
    anchor: HTMLElement,
  ): void => {
    const library = collectionLibraryStore.getState();
    const request = library.requests.find(
      (candidate) => candidate.id === requestID,
    );
    if (!request || readOnly()) return;
    const destinations = [...library.collections]
      .sort(bySortOrder)
      .filter(
        (collection) => collection.id !== request.collectionId,
      );
    if (destinations.length === 0) return;
    showMenu({
      anchor,
      restoreFocus: anchor,
      label: t("sidebar.moveTo"),
      entries: destinations.map((collection) => ({
        label: collection.name,
        icon: "folder" as const,
        action: () => {
          collectionLibraryStore
            .getState()
            .moveRequest(request.id, collection.id);
        },
      })),
    });
  };

  const openCollectionMenu = (
    collectionID: string,
    trigger: HTMLElement,
    point?: { x: number; y: number },
  ): void => {
    const library = collectionLibraryStore.getState();
    const collection = library.collections.find(
      (candidate) => candidate.id === collectionID,
    );
    if (!collection) return;
    const requestCount = library.requests.filter(
      (request) => request.collectionId === collection.id,
    ).length;
    const target: LibraryEditTarget = {
      kind: "collection",
      id: collection.id,
      name: collection.name,
    };
    showMenu({
      anchor: point ? undefined : trigger,
      point,
      restoreFocus: trigger,
      label: t("sidebar.moreActions", { name: collection.name }),
      entries: [
        {
          label: t("sidebar.newRequestInCollection"),
          icon: "plus",
          disabled: readOnly(),
          action: () =>
            applicationCommands.openRequestDraft({
              name: t("requests.untitled"),
              url: "",
              collectionId: collection.id,
            }),
        },
        {
          label: t("sidebar.rename"),
          icon: "settings",
          disabled: readOnly(),
          action: () => openRenameDialog(target, trigger),
        },
        { kind: "separator" },
        {
          label: t("sidebar.delete"),
          icon: "trash",
          danger: true,
          disabled: readOnly(),
          action: () =>
            openDeleteDialog(
              {
                ...target,
                requestCount,
              },
              trigger,
            ),
        },
      ],
    });
  };

  const openRequestMenu = (
    requestID: string,
    trigger: HTMLElement,
    point?: { x: number; y: number },
  ): void => {
    const library = collectionLibraryStore.getState();
    const request = library.requests.find(
      (candidate) => candidate.id === requestID,
    );
    if (!request) return;
    const moveAvailable = library.collections.length > 1;
    const target: LibraryEditTarget = {
      kind: "request",
      id: request.id,
      name: request.name,
    };
    showMenu({
      anchor: point ? undefined : trigger,
      point,
      restoreFocus: trigger,
      label: t("sidebar.moreActions", { name: request.name }),
      entries: [
        {
          label: t("sidebar.openRequest"),
          icon: "request",
          action: () => openSavedRequest(request.id),
        },
        {
          label: t("sidebar.rename"),
          icon: "settings",
          disabled: readOnly(),
          action: () => openRenameDialog(target, trigger),
        },
        ...(moveAvailable
          ? [
              {
                label: t("sidebar.moveTo"),
                icon: "folder" as const,
                disabled: readOnly(),
                action: () => openMoveMenu(request.id, trigger),
              },
            ]
          : []),
        { kind: "separator" as const },
        {
          label: t("sidebar.delete"),
          icon: "trash",
          danger: true,
          disabled: readOnly(),
          action: () =>
            openDeleteDialog(
              {
                kind: "request",
                id: request.id,
                name: request.name,
              },
              trigger,
            ),
        },
      ],
    });
  };

  const openAPIMenu = (
    nodeID: string,
    trigger: HTMLElement,
    point?: { x: number; y: number },
  ): void => {
    const node = apiNodes().find(
      (candidate) => candidate.id === nodeID,
    );
    if (!node) return;
    showMenu({
      anchor: point ? undefined : trigger,
      point,
      restoreFocus: trigger,
      label: node.name,
      entries: [
        {
          label: t("sidebar.openRequest"),
          icon: "request",
          action: () => openAPINode(node.id),
        },
      ],
    });
  };

  const retryStorage = (): void => {
    if (persistence().operation === "write") {
      void retryCollectionLibraryWrite();
      return;
    }
    void collectionLibraryStore.persist.rehydrate();
  };

  lifecycle.listen(root, "input", (event) => {
    const input = event.target;
    if (
      !(input instanceof HTMLInputElement) ||
      !input.hasAttribute("data-sidebar-search")
    ) {
      return;
    }
    query = input.value;
    if (section() === "apis") apiScrollTop = 0;
    render();
  });

  lifecycle.listen(root, "click", (event) => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-action]")
        : null;
    if (!target || !root.contains(target)) return;
    if (target instanceof HTMLButtonElement && target.disabled) return;
    switch (target.dataset.action) {
      case "select-section": {
        const next = target.dataset.section as
          | SidebarSection
          | undefined;
        if (!next) return;
        query = "";
        collectionScrollTop = 0;
        apiScrollTop = 0;
        workspaceStore.getState().setSidebarSection(next);
        break;
      }
      case "new-collection":
        openCreateCollectionDialog(target);
        break;
      case "toggle-collection": {
        const collectionID = target.dataset.libraryItemId;
        if (!collectionID) return;
        const library = collectionLibraryStore.getState();
        if (
          query.trim() &&
          !library.expandedCollectionIds.includes(collectionID)
        ) {
          library.toggleCollection(collectionID);
        }
        if (query.trim()) {
          query = "";
          render();
        } else {
          library.toggleCollection(collectionID);
        }
        break;
      }
      case "open-saved-request":
        if (target.dataset.libraryItemId) {
          openSavedRequest(target.dataset.libraryItemId);
        }
        break;
      case "library-menu":
        if (
          target.dataset.libraryKind === "collection" &&
          target.dataset.libraryItemId
        ) {
          openCollectionMenu(
            target.dataset.libraryItemId,
            target,
          );
        } else if (
          target.dataset.libraryKind === "request" &&
          target.dataset.libraryItemId
        ) {
          openRequestMenu(target.dataset.libraryItemId, target);
        }
        break;
      case "open-api":
        if (target.dataset.apiId) openAPINode(target.dataset.apiId);
        break;
      case "import-openapi":
        window.dispatchEvent(new CustomEvent("validex:import-openapi"));
        break;
      case "retry-storage":
        retryStorage();
        break;
    }
  });

  lifecycle.listen(root, "keydown", (event) => {
    const sectionButton = eventElement<HTMLButtonElement>(
      event,
      "[data-section]",
    );
    if (sectionButton) {
      const sections = [
        ...root.querySelectorAll<HTMLButtonElement>("[data-section]"),
      ];
      const index = sections.indexOf(sectionButton);
      let nextIndex: number | undefined;
      if (event.key === "ArrowRight") {
        nextIndex = (index + 1) % sections.length;
      } else if (event.key === "ArrowLeft") {
        nextIndex = (index - 1 + sections.length) % sections.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = sections.length - 1;
      }
      if (nextIndex !== undefined) {
        event.preventDefault();
        sections[nextIndex]?.click();
      }
      return;
    }

    const row = eventElement<HTMLButtonElement>(event, ".tree-row");
    if (!row) return;
    if (
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      event.preventDefault();
      if (row.dataset.apiId) {
        openAPIMenu(row.dataset.apiId, row);
      } else if (
        row.dataset.libraryKind === "collection" &&
        row.dataset.libraryItemId
      ) {
        openCollectionMenu(row.dataset.libraryItemId, row);
      } else if (
        row.dataset.libraryKind === "request" &&
        row.dataset.libraryItemId
      ) {
        openRequestMenu(row.dataset.libraryItemId, row);
      }
      return;
    }

    if (
      row.dataset.libraryKind === "collection" &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      const expanded = row.getAttribute("aria-expanded") === "true";
      const shouldExpand = event.key === "ArrowRight";
      if (expanded !== shouldExpand) {
        event.preventDefault();
        row.click();
      }
      return;
    }

    if (
      row.dataset.apiId &&
      isVirtualListNavigationKey(event.key)
    ) {
      event.preventDefault();
      navigateAPIRow(row.dataset.apiId, event.key);
      return;
    }

    const rows = [
      ...root.querySelectorAll<HTMLButtonElement>(".tree-row"),
    ];
    const index = rows.indexOf(row);
    let nextIndex: number | undefined;
    if (event.key === "ArrowDown") {
      nextIndex = Math.min(rows.length - 1, index + 1);
    } else if (event.key === "ArrowUp") {
      nextIndex = Math.max(0, index - 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = rows.length - 1;
    }
    if (nextIndex === undefined || nextIndex === index) return;
    event.preventDefault();
    rows[nextIndex]?.focus({ preventScroll: true });
    rows[nextIndex]?.scrollIntoView?.({ block: "nearest" });
  });

  lifecycle.listen(root, "contextmenu", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const apiRow = target.closest<HTMLElement>("[data-api-id]");
    if (apiRow?.dataset.apiId && root.contains(apiRow)) {
      event.preventDefault();
      openAPIMenu(apiRow.dataset.apiId, apiRow, {
        x: event.clientX,
        y: event.clientY,
      });
      return;
    }
    const libraryRow = target.closest<HTMLElement>(
      "[data-library-kind][data-library-item-id]",
    );
    if (!libraryRow || !root.contains(libraryRow)) return;
    const itemID = libraryRow.dataset.libraryItemId;
    if (!itemID) return;
    event.preventDefault();
    const point = { x: event.clientX, y: event.clientY };
    if (libraryRow.dataset.libraryKind === "collection") {
      openCollectionMenu(itemID, libraryRow, point);
    } else {
      openRequestMenu(itemID, libraryRow, point);
    }
  });

  lifecycle.listen(
    root,
    "scroll",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.scrollKind === "requests") {
        collectionScrollTop = target.scrollTop;
      } else if (target.dataset.scrollKind === "apis") {
        apiScrollTop = target.scrollTop;
        apiViewportHeight = target.clientHeight;
        updateAPIRows();
      }
    },
    true,
  );

  lifecycle.add(
    collectionLibraryStore.subscribe(() => {
      reconcileSavedRequestLinks();
      render();
    }),
  );
  lifecycle.add(
    workspaceStore.subscribe((state, previous) => {
      const activeSavedRequestID = state.tabs.find(
        (tab) => tab.id === state.activeTabID,
      )?.savedRequestId;
      const previousActiveSavedRequestID = previous.tabs.find(
        (tab) => tab.id === previous.activeTabID,
      )?.savedRequestId;
      if (
        state.sidebarSection !== previous.sidebarSection ||
        state.latestImportedSpec !== previous.latestImportedSpec ||
        state.activeTabID !== previous.activeTabID ||
        activeSavedRequestID !== previousActiveSavedRequestID
      ) {
        render();
      }
    }),
  );
  lifecycle.add(
    subscribeCollectionLibraryPersistence(() => {
      reconcileSavedRequestLinks();
      render();
    }),
  );
  lifecycle.add(subscribeLocale(render));

  reconcileSavedRequestLinks();
  render();

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      apiResizeObserver?.disconnect();
      activeMenu?.dispose();
      activeDialog?.dispose();
      lifecycle.dispose();
      root.replaceChildren();
    },
  };
}
