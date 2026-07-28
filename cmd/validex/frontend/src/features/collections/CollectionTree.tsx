import { useMemo } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChevronRight,
  FileJson2,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { useTranslation, type Locale } from "../../i18n";
import { Button, IconButton, MethodBadge } from "../../shared/ui";
import { cn } from "../../lib/utils";
import {
  bySortOrder,
  type RequestCollection,
  type SavedRequest,
} from "./model";
import type {
  LibraryDeleteTarget,
  LibraryEditTarget,
} from "./CollectionLibraryDialogs";

const treeRowHeight = 33;

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

function visibleLibraryNodes(
  collections: readonly RequestCollection[],
  requests: readonly SavedRequest[],
  expandedCollectionIds: readonly string[],
  query: string,
  locale: Locale,
): LibraryTreeNode[] {
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
        : expandedCollectionIds.includes(collection.id)
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

function CollectionActions({
  collection,
  requestCount,
  readOnly,
  onNewRequest,
  onRename,
  onDelete,
}: {
  collection: RequestCollection;
  requestCount: number;
  readOnly: boolean;
  onNewRequest: (collectionId: string) => void;
  onRename: (target: LibraryEditTarget) => void;
  onDelete: (target: LibraryDeleteTarget) => void;
}) {
  const t = useTranslation();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton
          className="library-row-actions"
          label={t("sidebar.moreActions", { name: collection.name })}
        >
          <MoreHorizontal size={15} />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="menu context-menu"
          side="right"
          align="start"
          sideOffset={4}
        >
          <DropdownMenu.Item
            className="menu-item"
            disabled={readOnly}
            onSelect={() => onNewRequest(collection.id)}
          >
            <FilePlus2 size={15} />
            {t("sidebar.newRequestInCollection")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="menu-item"
            disabled={readOnly}
            onSelect={() =>
              onRename({
                kind: "collection",
                id: collection.id,
                name: collection.name,
              })
            }
          >
            <Pencil size={15} />
            {t("sidebar.rename")}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="menu-separator" />
          <DropdownMenu.Item
            className="menu-item menu-danger"
            disabled={readOnly}
            onSelect={() =>
              onDelete({
                kind: "collection",
                id: collection.id,
                name: collection.name,
                requestCount,
              })
            }
          >
            <Trash2 size={15} />
            {t("sidebar.delete")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function RequestActions({
  request,
  collections,
  readOnly,
  onOpenRequest,
  onRename,
  onMoveRequest,
  onDelete,
}: {
  request: SavedRequest;
  collections: RequestCollection[];
  readOnly: boolean;
  onOpenRequest: (requestId: string) => void;
  onRename: (target: LibraryEditTarget) => void;
  onMoveRequest: (requestId: string, collectionId: string) => void;
  onDelete: (target: LibraryDeleteTarget) => void;
}) {
  const t = useTranslation();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton
          className="library-row-actions"
          label={t("sidebar.moreActions", { name: request.name })}
        >
          <MoreHorizontal size={15} />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="menu context-menu"
          side="right"
          align="start"
          sideOffset={4}
        >
          <DropdownMenu.Item
            className="menu-item"
            onSelect={() => onOpenRequest(request.id)}
          >
            <FileJson2 size={15} />
            {t("sidebar.openRequest")}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="menu-item"
            disabled={readOnly}
            onSelect={() =>
              onRename({
                kind: "request",
                id: request.id,
                name: request.name,
              })
            }
          >
            <Pencil size={15} />
            {t("sidebar.rename")}
          </DropdownMenu.Item>
          {collections.length > 1 && (
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger
                className="menu-item"
                disabled={readOnly}
              >
                <Folder size={15} />
                {t("sidebar.moveTo")}
                <ChevronRight size={13} className="menu-sub-chevron" />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent
                  className="menu context-menu"
                  sideOffset={5}
                >
                  {collections
                    .filter(
                      (collection) =>
                        collection.id !== request.collectionId,
                    )
                    .map((collection) => (
                      <DropdownMenu.Item
                        key={collection.id}
                        className="menu-item"
                        onSelect={() =>
                          onMoveRequest(request.id, collection.id)
                        }
                      >
                        <Folder size={14} />
                        {collection.name}
                      </DropdownMenu.Item>
                    ))}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          )}
          <DropdownMenu.Separator className="menu-separator" />
          <DropdownMenu.Item
            className="menu-item menu-danger"
            disabled={readOnly}
            onSelect={() =>
              onDelete({
                kind: "request",
                id: request.id,
                name: request.name,
              })
            }
          >
            <Trash2 size={15} />
            {t("sidebar.delete")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function CollectionLibraryPanel({
  collections,
  requests,
  expandedCollectionIds,
  query,
  locale,
  readOnly = false,
  onQueryChange,
  onCreateCollection,
  onToggleCollection,
  onOpenRequest,
  onNewRequest,
  onRename,
  onMoveRequest,
  onDelete,
}: {
  collections: RequestCollection[];
  requests: SavedRequest[];
  expandedCollectionIds: string[];
  query: string;
  locale: Locale;
  readOnly?: boolean;
  onQueryChange: (query: string) => void;
  onCreateCollection: () => void;
  onToggleCollection: (collectionId: string) => void;
  onOpenRequest: (requestId: string) => void;
  onNewRequest: (collectionId: string) => void;
  onRename: (target: LibraryEditTarget) => void;
  onMoveRequest: (requestId: string, collectionId: string) => void;
  onDelete: (target: LibraryDeleteTarget) => void;
}) {
  const t = useTranslation();
  const orderedCollections = useMemo(
    () => [...collections].sort(bySortOrder),
    [collections],
  );
  const nodes = useMemo(
    () =>
      visibleLibraryNodes(
        collections,
        requests,
        expandedCollectionIds,
        query,
        locale,
      ),
    [collections, expandedCollectionIds, locale, query, requests],
  );

  const rows = nodes.map((node, index) => ({
    node,
    index,
  }));

  return (
    <>
      <div className="sidebar-toolbar collection-toolbar">
        <label className="sidebar-search">
          <Search size={14} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("sidebar.searchRequests")}
            aria-label={t("sidebar.searchRequests")}
          />
        </label>
        <IconButton
          label={t("sidebar.newCollection")}
          className="new-collection-button"
          disabled={readOnly}
          onClick={onCreateCollection}
        >
          <FolderPlus size={15} />
        </IconButton>
      </div>

      {nodes.length === 0 ? (
        <div className="sidebar-empty">
          {query.trim() ? <Search size={22} /> : <FolderPlus size={22} />}
          <strong>
            {query.trim()
              ? t("sidebar.noSearchResult")
              : t("sidebar.noOpenRequest")}
          </strong>
          <span>
            {query.trim()
              ? t("sidebar.tryDifferentSearch")
              : t("sidebar.createFirstRequestHint")}
          </span>
          {!query.trim() && (
            <Button
              size="sm"
              variant="primary"
              disabled={readOnly}
              onClick={onCreateCollection}
            >
              <FolderPlus size={14} />
              {t("sidebar.newCollection")}
            </Button>
          )}
        </div>
      ) : (
        <div
          className="tree-scroll"
          aria-label={t("sidebar.requests")}
        >
          <div
            className="virtual-list"
            style={{ height: `${nodes.length * treeRowHeight}px` }}
          >
            {rows.map(({ node, index }) => {
              const rowStyle = {
                transform: `translateY(${index * treeRowHeight}px)`,
              };
              if (node.kind === "collection") {
                const expanded =
                  query.trim().length > 0 ||
                  expandedCollectionIds.includes(node.collection.id);
                return (
                  <div
                    key={`collection:${node.id}`}
                    className="library-tree-row"
                    style={rowStyle}
                  >
                    <ContextMenu.Root>
                      <ContextMenu.Trigger asChild>
                        <button
                          className="tree-row collection-row"
                          data-library-item-id={node.collection.id}
                          aria-expanded={expanded}
                          aria-label={
                            query.trim()
                              ? node.collection.name
                              : expanded
                              ? t("sidebar.collapseCollection", {
                                  name: node.collection.name,
                                })
                              : t("sidebar.expandCollection", {
                                  name: node.collection.name,
                                })
                          }
                          onClick={() => {
                            if (
                              query.trim() &&
                              !expandedCollectionIds.includes(
                                node.collection.id,
                              )
                            ) {
                              onToggleCollection(node.collection.id);
                            }
                            if (query.trim()) onQueryChange("");
                            else onToggleCollection(node.collection.id);
                          }}
                        >
                          <ChevronRight
                            size={14}
                            className={cn(
                              "tree-chevron",
                              expanded && "expanded",
                            )}
                            aria-hidden="true"
                          />
                          {expanded ? (
                            <FolderOpen size={15} aria-hidden="true" />
                          ) : (
                            <Folder size={15} aria-hidden="true" />
                          )}
                          <span className="tree-label">
                            {node.collection.name}
                          </span>
                          <span className="collection-count">
                            {node.requestCount}
                          </span>
                        </button>
                      </ContextMenu.Trigger>
                      <ContextMenu.Portal>
                        <ContextMenu.Content className="menu context-menu">
                          <ContextMenu.Item
                            className="menu-item"
                            disabled={readOnly}
                            onSelect={() => onNewRequest(node.collection.id)}
                          >
                            <FilePlus2 size={15} />
                            {t("sidebar.newRequestInCollection")}
                          </ContextMenu.Item>
                          <ContextMenu.Item
                            className="menu-item"
                            disabled={readOnly}
                            onSelect={() =>
                              onRename({
                                kind: "collection",
                                id: node.collection.id,
                                name: node.collection.name,
                              })
                            }
                          >
                            <Pencil size={15} />
                            {t("sidebar.rename")}
                          </ContextMenu.Item>
                          <ContextMenu.Separator className="menu-separator" />
                          <ContextMenu.Item
                            className="menu-item menu-danger"
                            disabled={readOnly}
                            onSelect={() =>
                              onDelete({
                                kind: "collection",
                                id: node.collection.id,
                                name: node.collection.name,
                                requestCount: node.requestCount,
                              })
                            }
                          >
                            <Trash2 size={15} />
                            {t("sidebar.delete")}
                          </ContextMenu.Item>
                        </ContextMenu.Content>
                      </ContextMenu.Portal>
                    </ContextMenu.Root>
                    <CollectionActions
                      collection={node.collection}
                      requestCount={node.requestCount}
                      readOnly={readOnly}
                      onNewRequest={onNewRequest}
                      onRename={onRename}
                      onDelete={onDelete}
                    />
                  </div>
                );
              }

              return (
                <div
                  key={`request:${node.id}`}
                  className="library-tree-row"
                  style={rowStyle}
                >
                  <ContextMenu.Root>
                    <ContextMenu.Trigger asChild>
                      <button
                        className="tree-row saved-request-row"
                        data-library-item-id={node.request.id}
                        title={node.request.url}
                        onClick={() => onOpenRequest(node.request.id)}
                      >
                        <MethodBadge method={node.request.method} compact />
                        <span className="tree-label">{node.request.name}</span>
                      </button>
                    </ContextMenu.Trigger>
                    <ContextMenu.Portal>
                      <ContextMenu.Content className="menu context-menu">
                        <ContextMenu.Item
                          className="menu-item"
                          onSelect={() => onOpenRequest(node.request.id)}
                        >
                          <FileJson2 size={15} />
                          {t("sidebar.openRequest")}
                        </ContextMenu.Item>
                        <ContextMenu.Item
                          className="menu-item"
                          disabled={readOnly}
                          onSelect={() =>
                            onRename({
                              kind: "request",
                              id: node.request.id,
                              name: node.request.name,
                            })
                          }
                        >
                          <Pencil size={15} />
                          {t("sidebar.rename")}
                        </ContextMenu.Item>
                        {orderedCollections.length > 1 && (
                          <ContextMenu.Sub>
                            <ContextMenu.SubTrigger
                              className="menu-item"
                              disabled={readOnly}
                            >
                              <Folder size={15} />
                              {t("sidebar.moveTo")}
                              <ChevronRight
                                size={13}
                                className="menu-sub-chevron"
                              />
                            </ContextMenu.SubTrigger>
                            <ContextMenu.Portal>
                              <ContextMenu.SubContent
                                className="menu context-menu"
                                sideOffset={5}
                              >
                                {orderedCollections
                                  .filter(
                                    (collection) =>
                                      collection.id !==
                                      node.request.collectionId,
                                  )
                                  .map((collection) => (
                                    <ContextMenu.Item
                                      key={collection.id}
                                      className="menu-item"
                                      onSelect={() =>
                                        onMoveRequest(
                                          node.request.id,
                                          collection.id,
                                        )
                                      }
                                    >
                                      <Folder size={14} />
                                      {collection.name}
                                    </ContextMenu.Item>
                                  ))}
                              </ContextMenu.SubContent>
                            </ContextMenu.Portal>
                          </ContextMenu.Sub>
                        )}
                        <ContextMenu.Separator className="menu-separator" />
                        <ContextMenu.Item
                          className="menu-item menu-danger"
                          disabled={readOnly}
                          onSelect={() =>
                            onDelete({
                              kind: "request",
                              id: node.request.id,
                              name: node.request.name,
                            })
                          }
                        >
                          <Trash2 size={15} />
                          {t("sidebar.delete")}
                        </ContextMenu.Item>
                      </ContextMenu.Content>
                    </ContextMenu.Portal>
                  </ContextMenu.Root>
                  <RequestActions
                    request={node.request}
                    collections={orderedCollections}
                    readOnly={readOnly}
                    onOpenRequest={onOpenRequest}
                    onRename={onRename}
                    onMoveRequest={onMoveRequest}
                    onDelete={onDelete}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
