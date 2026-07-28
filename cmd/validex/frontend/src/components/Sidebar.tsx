import { useEffect, useMemo, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  AlertTriangle,
  FileJson2,
  Folder,
  LoaderCircle,
  RefreshCw,
  Search,
  Waypoints,
} from "lucide-react";
import {
  CollectionLibraryPanel,
} from "../features/collections/CollectionTree";
import {
  CreateCollectionDialog,
  DeleteLibraryItemDialog,
  RenameLibraryItemDialog,
  type LibraryDeleteTarget,
  type LibraryEditTarget,
} from "../features/collections/CollectionLibraryDialogs";
import {
  importedEndpointTabID,
  importedRequestURL,
} from "../lib/openapi";
import { useLocale } from "../i18n";
import type { BootstrapData, HTTPMethod, RequestTab } from "../lib/types";
import { cn } from "../lib/utils";
import { useCollectionLibraryStore } from "../stores/collectionLibrary";
import {
  COLLECTION_LIBRARY_PERSISTENCE_PHASE,
  retryCollectionLibraryWrite,
  useCollectionLibraryPersistence,
} from "../stores/collectionLibraryStorage";
import { useWorkspaceStore } from "../stores/workspace";
import { Button, MethodBadge } from "../shared/ui";

const sections = [
  { id: "requests", labelKey: "sidebar.requests", icon: Folder },
  { id: "apis", labelKey: "sidebar.apis", icon: Waypoints },
] as const;

const apiRowHeight = 33;
const apiOverscan = 10;

interface APINode {
  id: string;
  name: string;
  method: HTTPMethod;
  url: string;
  openApi?: RequestTab["openApi"];
}

function visibleRowRange(
  count: number,
  scrollTop: number,
  viewportHeight: number,
) {
  const effectiveHeight =
    viewportHeight > 0 ? viewportHeight : apiRowHeight * 20;
  return {
    start: Math.max(0, Math.floor(scrollTop / apiRowHeight) - apiOverscan),
    end: Math.min(
      count,
      Math.ceil((scrollTop + effectiveHeight) / apiRowHeight) + apiOverscan,
    ),
  };
}

function openAPINode(
  node: APINode,
  openTab: (tab?: Partial<RequestTab>) => void,
) {
  openTab({
    id: node.id,
    name: node.name,
    method: node.method,
    url: node.url,
    openApi: node.openApi,
    dirty: false,
  });
}

function APIBrowser({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const { locale, t } = useLocale();
  const importedSpec = useWorkspaceStore((state) => state.latestImportedSpec);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });
  const nodes = useMemo<APINode[]>(() => {
    if (!importedSpec) return [];
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
  }, [importedSpec, locale, query]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const measure = () =>
      setViewport((current) => ({
        scrollTop: current.scrollTop,
        height: scrollElement.clientHeight,
      }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [nodes.length]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setViewport((current) => ({ ...current, scrollTop: 0 }));
  }, [query]);

  const range = visibleRowRange(
    nodes.length,
    viewport.scrollTop,
    viewport.height,
  );
  const rows = nodes.slice(range.start, range.end).map((node, offset) => ({
    node,
    index: range.start + offset,
  }));

  return (
    <>
      {importedSpec && (
        <div className="sidebar-source" title={importedSpec.title}>
          <strong>{importedSpec.title || t("sidebar.importedOpenAPI")}</strong>
          <span>
            {t(
              importedSpec.endpoints.length === 1
                ? "sidebar.endpointCount.one"
                : "sidebar.endpointCount.many",
              { count: importedSpec.endpoints.length },
            )}
          </span>
        </div>
      )}

      {(importedSpec?.endpoints.length ?? 0) > 0 && (
        <div className="sidebar-toolbar">
          <label className="sidebar-search">
            <Search size={14} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={t("sidebar.searchAPIs")}
              aria-label={t("sidebar.searchAPIs")}
            />
          </label>
        </div>
      )}

      {nodes.length === 0 ? (
        <div className="sidebar-empty">
          {query.trim() ? <Search size={22} /> : <Waypoints size={22} />}
          <strong>
            {query.trim()
              ? t("sidebar.noSearchResult")
              : t("sidebar.noImportedOpenAPI")}
          </strong>
          <span>
            {query.trim()
              ? t("sidebar.tryDifferentSearch")
              : t("sidebar.importOpenAPIHint")}
          </span>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="tree-scroll"
          aria-label={t("sidebar.apis")}
          onScroll={(event) =>
            setViewport({
              scrollTop: event.currentTarget.scrollTop,
              height: event.currentTarget.clientHeight,
            })
          }
        >
          <div
            className="virtual-list"
            style={{ height: `${nodes.length * apiRowHeight}px` }}
          >
            {rows.map(({ node, index }) => (
              <ContextMenu.Root key={node.id}>
                <ContextMenu.Trigger asChild>
                  <button
                    className="tree-row"
                    style={{
                      transform: `translateY(${index * apiRowHeight}px)`,
                      paddingLeft: "10px",
                    }}
                    title={node.url}
                    onClick={() => openAPINode(node, openTab)}
                  >
                    <MethodBadge method={node.method} compact />
                    <span className="tree-label">{node.name}</span>
                  </button>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content className="menu context-menu">
                    <ContextMenu.Item
                      className="menu-item"
                      onSelect={() => openAPINode(node, openTab)}
                    >
                      <FileJson2 size={15} />
                      {t("sidebar.openRequest")}
                    </ContextMenu.Item>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export function Sidebar({ bootstrap: _bootstrap }: { bootstrap: BootstrapData }) {
  const { locale, t } = useLocale();
  const [query, setQuery] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [editTarget, setEditTarget] = useState<LibraryEditTarget | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<LibraryDeleteTarget | null>(null);
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);

  const section = useWorkspaceStore((state) => state.sidebarSection);
  const setSection = useWorkspaceStore((state) => state.setSidebarSection);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const setActiveTab = useWorkspaceStore((state) => state.setActiveTab);
  const tabs = useWorkspaceStore((state) => state.tabs);
  const importedSpec = useWorkspaceStore((state) => state.latestImportedSpec);

  const collections = useCollectionLibraryStore((state) => state.collections);
  const savedRequests = useCollectionLibraryStore((state) => state.requests);
  const expandedCollectionIds = useCollectionLibraryStore(
    (state) => state.expandedCollectionIds,
  );
  const createCollection = useCollectionLibraryStore(
    (state) => state.createCollection,
  );
  const renameCollection = useCollectionLibraryStore(
    (state) => state.renameCollection,
  );
  const deleteCollection = useCollectionLibraryStore(
    (state) => state.deleteCollection,
  );
  const toggleCollection = useCollectionLibraryStore(
    (state) => state.toggleCollection,
  );
  const renameRequest = useCollectionLibraryStore(
    (state) => state.renameRequest,
  );
  const moveRequest = useCollectionLibraryStore(
    (state) => state.moveRequest,
  );
  const deleteRequest = useCollectionLibraryStore(
    (state) => state.deleteRequest,
  );
  const openRequestSnapshot = useCollectionLibraryStore(
    (state) => state.openRequestSnapshot,
  );
  const collectionLibraryPersistence =
    useCollectionLibraryPersistence();

  const openSavedRequest = (requestId: string) => {
    const existing = tabs.find((tab) => tab.savedRequestId === requestId);
    if (existing) {
      setActiveTab(existing.id);
      return;
    }
    const snapshot = openRequestSnapshot(requestId);
    if (!snapshot) return;
    openTab({
      ...snapshot,
      dirty: false,
    });
  };

  const rememberDialogFocus = (libraryItemId?: string) => {
    const libraryRow = libraryItemId
      ? Array.from(
          document.querySelectorAll<HTMLElement>("[data-library-item-id]"),
        ).find((element) => element.dataset.libraryItemId === libraryItemId)
      : undefined;
    dialogReturnFocusRef.current =
      libraryRow ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
  };

  const renameLibraryItem = (target: LibraryEditTarget, name: string) => {
    if (target.kind === "collection") {
      return renameCollection(target.id, name);
    }
    return renameRequest(target.id, name);
  };

  const moveSavedRequest = (requestId: string, collectionId: string) => {
    moveRequest(requestId, collectionId);
  };

  const deleteLibraryItem = (target: LibraryDeleteTarget) => {
    if (target.kind === "collection") {
      deleteCollection(target.id);
    } else {
      deleteRequest(target.id);
    }
    setDeleteTarget(null);
  };

  const retryCollectionLibrary = () => {
    if (collectionLibraryPersistence.operation === "write") {
      void retryCollectionLibraryWrite();
      return;
    }
    void useCollectionLibraryStore.persist.rehydrate();
  };

  return (
    <>
      <aside className="sidebar" aria-label={t("sidebar.navigation")}>
        <nav className="sidebar-sections" aria-label={t("sidebar.sections")}>
          {sections.map(({ id, labelKey, icon: Icon }) => {
            const count =
              id === "apis"
                ? (importedSpec?.endpoints.length ?? 0)
                : savedRequests.length;
            return (
              <button
                key={id}
                className={cn("sidebar-section", section === id && "active")}
                onClick={() => {
                  setSection(id);
                  setQuery("");
                }}
                aria-current={section === id ? "page" : undefined}
                aria-label={t(labelKey)}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{t(labelKey)}</span>
                <span className="section-count">{count}</span>
              </button>
            );
          })}
        </nav>

        {section === "requests" ? (
          <>
            {collectionLibraryPersistence.phase ===
              COLLECTION_LIBRARY_PERSISTENCE_PHASE.ERROR &&
              collectionLibraryPersistence.hydrated && (
                <div className="library-storage-notice" role="alert">
                  <AlertTriangle size={15} aria-hidden="true" />
                  <span>
                    {collectionLibraryPersistence.error?.code ===
                    "collection_library_conflict"
                      ? t("sidebar.libraryConflict")
                      : t("sidebar.libraryWriteFailed")}
                    {collectionLibraryPersistence.error?.message && (
                      <small>
                        {collectionLibraryPersistence.error.message}
                      </small>
                    )}
                    {collectionLibraryPersistence.error?.hint && (
                      <small>
                        {collectionLibraryPersistence.error.hint}
                      </small>
                    )}
                  </span>
                  {collectionLibraryPersistence.error?.code !==
                    "collection_library_conflict" && (
                    <Button size="sm" onClick={retryCollectionLibrary}>
                      <RefreshCw size={13} />
                      {t("sidebar.retryStorage")}
                    </Button>
                  )}
                </div>
              )}
            {!collectionLibraryPersistence.hydrated ? (
              <div
                className="sidebar-empty library-loading-state"
                aria-busy={
                  collectionLibraryPersistence.phase ===
                  COLLECTION_LIBRARY_PERSISTENCE_PHASE.LOADING
                }
              >
                {collectionLibraryPersistence.phase ===
                COLLECTION_LIBRARY_PERSISTENCE_PHASE.ERROR ? (
                  <AlertTriangle size={22} aria-hidden="true" />
                ) : (
                  <LoaderCircle
                    className="spin"
                    size={22}
                    aria-hidden="true"
                  />
                )}
                <strong>
                  {collectionLibraryPersistence.phase ===
                  COLLECTION_LIBRARY_PERSISTENCE_PHASE.ERROR
                    ? collectionLibraryPersistence.error?.code ===
                      "collection_library_newer_version"
                      ? t("sidebar.libraryUpgradeRequired")
                      : t("sidebar.libraryLoadFailed")
                    : t("sidebar.libraryLoading")}
                </strong>
                {collectionLibraryPersistence.phase ===
                  COLLECTION_LIBRARY_PERSISTENCE_PHASE.ERROR && (
                  <Button size="sm" onClick={retryCollectionLibrary}>
                    <RefreshCw size={13} />
                    {t("sidebar.retryStorage")}
                  </Button>
                )}
              </div>
            ) : (
              <CollectionLibraryPanel
                collections={collections}
                requests={savedRequests}
                expandedCollectionIds={expandedCollectionIds}
                query={query}
                locale={locale}
                readOnly={
                  collectionLibraryPersistence.error?.code ===
                  "collection_library_conflict"
                }
                onQueryChange={setQuery}
                onCreateCollection={() => {
                  rememberDialogFocus();
                  setCreatingCollection(true);
                }}
                onToggleCollection={toggleCollection}
                onOpenRequest={openSavedRequest}
                onNewRequest={(collectionId) =>
                  openTab({
                    name: t("requests.untitled"),
                    url: "",
                    collectionId,
                    dirty: true,
                  })
                }
                onRename={(target) => {
                  rememberDialogFocus(target.id);
                  setEditTarget(target);
                }}
                onMoveRequest={moveSavedRequest}
                onDelete={(target) => {
                  rememberDialogFocus(target.id);
                  setDeleteTarget(target);
                }}
              />
            )}
          </>
        ) : (
          <APIBrowser query={query} onQueryChange={setQuery} />
        )}
      </aside>

      <CreateCollectionDialog
        open={creatingCollection}
        returnFocus={dialogReturnFocusRef.current}
        onOpenChange={setCreatingCollection}
        onCreate={(name) => Boolean(createCollection(name))}
      />
      <RenameLibraryItemDialog
        target={editTarget}
        returnFocus={dialogReturnFocusRef.current}
        onOpenChange={(open) => !open && setEditTarget(null)}
        onRename={renameLibraryItem}
      />
      <DeleteLibraryItemDialog
        target={deleteTarget}
        returnFocus={dialogReturnFocusRef.current}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onDelete={deleteLibraryItem}
      />
    </>
  );
}
