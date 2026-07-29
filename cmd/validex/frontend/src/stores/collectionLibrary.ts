import {
  createStore,
  type Store,
} from "../core/store.js";
import {
  COLLECTION_NAME_LENGTH_LIMITS,
  SAVED_REQUEST_NAME_LENGTH_LIMITS,
  bySortOrder,
  createOpenRequestSnapshot,
  normalizedLibraryName,
  type OpenRequestSnapshot,
  type RequestCollection,
  type SavedRequest,
  type SavedRequestSnapshot,
} from "../features/collections/model.js";
import type {
  ImportedCollection,
  ImportedCollectionBatch,
  ImportedRequest,
} from "../features/collections/postmanTransfer.js";
import { isValidHTTPMethod } from "../lib/http.js";
import { isSafeSecretReference, isSecretKey } from "../lib/secrets.js";
import type { HTTPMethod, KeyValue } from "../lib/types.js";
import {
  createCollectionLibraryStorage,
  finishCollectionLibraryHydration,
  getCollectionLibraryPersistenceSnapshot,
  UnsupportedCollectionLibraryVersionError,
} from "./collectionLibraryStorage.js";

export const collectionLibraryStorageKey = "validex:collection-library";
export const collectionLibraryStorageVersion = 1;
export const collectionLibraryViewStorageKey =
  "validex:collection-library:view";

const emptyCollectionLibraryDocument = JSON.stringify({
  state: {
    collections: [],
    requests: [],
    expandedCollectionIds: [],
  },
  version: collectionLibraryStorageVersion,
});

const collectionLibraryPersistStorage = createCollectionLibraryStorage(
  emptyCollectionLibraryDocument,
);

function loadExpandedCollectionIds(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const value = JSON.parse(
      localStorage.getItem(collectionLibraryViewStorageKey) ?? "[]",
    );
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter(
              (id): id is string =>
                typeof id === "string" && id.trim().length > 0,
            ),
          ),
        ]
      : [];
  } catch {
    return [];
  }
}

function persistExpandedCollectionIds(ids: readonly string[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      collectionLibraryViewStorageKey,
      JSON.stringify(ids),
    );
  } catch {
    // Expansion is a disposable UI preference; domain data stays native.
  }
}

export interface CollectionLibraryData {
  collections: RequestCollection[];
  requests: SavedRequest[];
  expandedCollectionIds: string[];
}

export interface CollectionImportSummary {
  collectionCount: number;
  requestCount: number;
  sanitizedSecretCount: number;
}

export interface CollectionLibraryState extends CollectionLibraryData {
  createCollection: (name: string) => string | undefined;
  importCollections: (
    batch: ImportedCollectionBatch,
  ) => CollectionImportSummary | undefined;
  renameCollection: (collectionId: string, name: string) => boolean;
  deleteCollection: (collectionId: string) => boolean;
  toggleCollection: (collectionId: string) => void;
  saveRequest: (
    collectionId: string,
    snapshot: SavedRequestSnapshot,
  ) => string | undefined;
  upsertRequest: (
    collectionId: string,
    snapshot: SavedRequestSnapshot,
    requestId?: string,
  ) => string | undefined;
  renameRequest: (requestId: string, name: string) => boolean;
  moveRequest: (requestId: string, collectionId: string) => boolean;
  deleteRequest: (requestId: string) => boolean;
  openRequestSnapshot: (
    requestId: string,
  ) => OpenRequestSnapshot | undefined;
}

function now(): string {
  return new Date().toISOString();
}

function nextSortOrder(items: readonly { sortOrder: number }[]): number {
  return (
    items.reduce(
      (maximum, item) => Math.max(maximum, item.sortOrder),
      -1,
    ) + 1
  );
}

function touchCollections(
  collections: readonly RequestCollection[],
  collectionIds: ReadonlySet<string>,
  updatedAt: string,
): RequestCollection[] {
  return collections.map((collection) =>
    collectionIds.has(collection.id)
      ? { ...collection, updatedAt }
      : collection,
  );
}

function createSavedRequest(
  id: string,
  collectionId: string,
  snapshot: SavedRequestSnapshot,
  createdAt: string,
  sortOrder: number,
): SavedRequest {
  return {
    id,
    collectionId,
    literalValues: snapshot.literalValues === true ? true : undefined,
    name: snapshot.name,
    method: snapshot.method,
    url: snapshot.url,
    headers: snapshot.headers.map(persistedHeader),
    body: snapshot.body,
    createdAt,
    updatedAt: createdAt,
    sortOrder,
  };
}

function persistedHeader(header: KeyValue): KeyValue {
  if (!isSecretKey(header.key) || isSafeSecretReference(header.value)) {
    return { ...header };
  }
  return {
    ...header,
    enabled: false,
    value: "",
  };
}

interface PreparedImportedRequest
  extends Omit<ImportedRequest, "method" | "name"> {
  method: HTTPMethod;
  name: string;
}

interface PreparedImportedCollection
  extends Omit<ImportedCollection, "name" | "requests"> {
  name: string;
  requests: PreparedImportedRequest[];
}

function preparedImportedHeader(
  value: unknown,
): ImportedRequest["headers"][number] | undefined {
  if (
    !isRecord(value) ||
    typeof value.enabled !== "boolean" ||
    typeof value.key !== "string" ||
    typeof value.value !== "string" ||
    (value.description !== undefined &&
      typeof value.description !== "string") ||
    (value.sensitive !== undefined &&
      typeof value.sensitive !== "boolean")
  ) {
    return undefined;
  }
  const header: ImportedRequest["headers"][number] = {
    enabled: value.enabled,
    key: value.key,
    value: value.value,
  };
  if (typeof value.description === "string") {
    header.description = value.description;
  }
  if (value.sensitive === true) {
    header.sensitive = true;
  }
  return header;
}

function preparedImportedRequest(
  value: unknown,
): PreparedImportedRequest | undefined {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    !isValidHTTPMethod(value.method) ||
    typeof value.url !== "string" ||
    !Array.isArray(value.headers) ||
    typeof value.body !== "string" ||
    (value.literalValues !== undefined &&
      typeof value.literalValues !== "boolean")
  ) {
    return undefined;
  }
  const name = normalizedLibraryName(
    value.name,
    SAVED_REQUEST_NAME_LENGTH_LIMITS,
  );
  if (!name) return undefined;
  const headers: ImportedRequest["headers"] = [];
  for (const candidate of value.headers) {
    const header = preparedImportedHeader(candidate);
    if (!header) return undefined;
    headers.push(header);
  }
  return {
    name,
    method: value.method,
    url: value.url,
    headers,
    body: value.body,
    literalValues:
      value.literalValues === true ? true : undefined,
  };
}

function preparedImportedCollections(
  value: unknown,
): PreparedImportedCollection[] | undefined {
  if (
    !isRecord(value) ||
    !Array.isArray(value.collections) ||
    value.collections.length === 0
  ) {
    return undefined;
  }
  const collections: PreparedImportedCollection[] = [];
  for (const candidate of value.collections) {
    if (
      !isRecord(candidate) ||
      typeof candidate.name !== "string" ||
      !Array.isArray(candidate.requests)
    ) {
      return undefined;
    }
    const name = normalizedLibraryName(
      candidate.name,
      COLLECTION_NAME_LENGTH_LIMITS,
    );
    if (!name) return undefined;
    const requests: PreparedImportedRequest[] = [];
    for (const importedRequest of candidate.requests) {
      const request = preparedImportedRequest(importedRequest);
      if (!request) return undefined;
      requests.push(request);
    }
    collections.push({ name, requests });
  }
  return collections;
}

function uniqueImportedCollectionName(
  name: string,
  reservedNames: Set<string>,
): string {
  const normalizedKey = (value: string) => value.toLowerCase();
  if (!reservedNames.has(normalizedKey(name))) {
    reservedNames.add(normalizedKey(name));
    return name;
  }
  const maximumLength = COLLECTION_NAME_LENGTH_LIMITS[1];
  for (let sequence = 2; ; sequence += 1) {
    const suffix = ` (${sequence})`;
    const candidate = `${name
      .slice(0, maximumLength - suffix.length)
      .trimEnd()}${suffix}`;
    if (!reservedNames.has(normalizedKey(candidate))) {
      reservedNames.add(normalizedKey(candidate));
      return candidate;
    }
  }
}

function persistedRequest(request: SavedRequest): SavedRequest {
  return {
    id: request.id,
    collectionId: request.collectionId,
    literalValues: request.literalValues === true ? true : undefined,
    name: request.name,
    method: request.method,
    url: request.url,
    headers: request.headers.map(persistedHeader),
    body: request.body,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    sortOrder: request.sortOrder,
  };
}

function persistedCollection(
  collection: RequestCollection,
): RequestCollection {
  return {
    id: collection.id,
    name: collection.name,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    sortOrder: collection.sortOrder,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueByID<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function hydratedCollection(value: unknown): RequestCollection | undefined {
  if (!isRecord(value)) return undefined;
  const name =
    typeof value.name === "string"
      ? normalizedLibraryName(value.name, COLLECTION_NAME_LENGTH_LIMITS)
      : undefined;
  if (
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    !name ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    typeof value.sortOrder !== "number" ||
    !Number.isFinite(value.sortOrder)
  ) {
    return undefined;
  }
  return {
    id: value.id,
    name,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    sortOrder: value.sortOrder,
  };
}

function hydratedHeader(value: unknown): KeyValue | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    typeof value.enabled !== "boolean" ||
    typeof value.key !== "string" ||
    typeof value.value !== "string"
  ) {
    return undefined;
  }
  const header: KeyValue = {
    id: value.id,
    enabled: value.enabled,
    key: value.key,
    value: value.value,
  };
  if (typeof value.description === "string") {
    header.description = value.description;
  }
  if (
    value.source === "Manual" ||
    value.source === "OpenAPI" ||
    value.source === "Environment" ||
    value.source === "Extracted" ||
    value.source === "Generated"
  ) {
    header.source = value.source;
  }
  return persistedHeader(header);
}

function hydratedRequest(
  value: unknown,
  collectionIds: ReadonlySet<string>,
): SavedRequest | undefined {
  if (!isRecord(value)) return undefined;
  const name =
    typeof value.name === "string"
      ? normalizedLibraryName(value.name, SAVED_REQUEST_NAME_LENGTH_LIMITS)
      : undefined;
  if (
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    typeof value.collectionId !== "string" ||
    !collectionIds.has(value.collectionId) ||
    !name ||
    !isValidHTTPMethod(value.method) ||
    typeof value.url !== "string" ||
    !Array.isArray(value.headers) ||
    typeof value.body !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    typeof value.sortOrder !== "number" ||
    !Number.isFinite(value.sortOrder)
  ) {
    return undefined;
  }
  const headers = uniqueByID(
    value.headers
      .map(hydratedHeader)
      .filter((header): header is KeyValue => header !== undefined),
  );
  return {
    id: value.id,
    collectionId: value.collectionId,
    literalValues: value.literalValues === true ? true : undefined,
    name,
    method: value.method as HTTPMethod,
    url: value.url,
    headers,
    body: value.body,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    sortOrder: value.sortOrder,
  };
}

export function hydrateLibraryData(value: unknown): CollectionLibraryData {
  const persisted = isRecord(value) ? value : {};
  const collections = Array.isArray(persisted.collections)
    ? uniqueByID(
        persisted.collections
          .map(hydratedCollection)
          .filter(
            (collection): collection is RequestCollection =>
              collection !== undefined,
          ),
      )
    : [];
  const collectionIds = new Set(
    collections.map((collection) => collection.id),
  );
  const requests = Array.isArray(persisted.requests)
    ? uniqueByID(
        persisted.requests
          .map((request) => hydratedRequest(request, collectionIds))
          .filter(
            (request): request is SavedRequest => request !== undefined,
          ),
      )
    : [];
  const expandedCollectionIds = Array.isArray(
    persisted.expandedCollectionIds,
  )
    ? [
        ...new Set(
          persisted.expandedCollectionIds.filter(
            (id): id is string =>
              typeof id === "string" && collectionIds.has(id),
          ),
        ),
      ]
    : [];
  return { collections, requests, expandedCollectionIds };
}

export function selectOrderedCollections(
  state: Pick<CollectionLibraryState, "collections">,
): RequestCollection[] {
  return [...state.collections].sort(bySortOrder);
}

export function selectOrderedRequests(
  state: Pick<CollectionLibraryState, "requests">,
  collectionId: string,
): SavedRequest[] {
  return state.requests
    .filter((request) => request.collectionId === collectionId)
    .sort(bySortOrder);
}

const baseCollectionLibraryStore = createStore<CollectionLibraryState>(
  (set, get) => ({
      collections: [],
      requests: [],
      expandedCollectionIds: loadExpandedCollectionIds(),
      createCollection: (rawName) => {
        const name = normalizedLibraryName(
          rawName,
          COLLECTION_NAME_LENGTH_LIMITS,
        );
        if (!name) return undefined;
        const id = crypto.randomUUID();
        const createdAt = now();
        const sortOrder = nextSortOrder(get().collections);
        const expandedCollectionIds = [
          ...new Set([...get().expandedCollectionIds, id]),
        ];
        persistExpandedCollectionIds(expandedCollectionIds);
        set((state) => ({
          collections: [
            ...state.collections,
            { id, name, createdAt, updatedAt: createdAt, sortOrder },
          ],
          expandedCollectionIds,
        }));
        return id;
      },
      importCollections: (batch) => {
        const importedCollections = preparedImportedCollections(batch);
        if (!importedCollections) return undefined;

        const state = get();
        const importedAt = now();
        const reservedNames = new Set(
          state.collections.map((collection) =>
            collection.name.toLowerCase(),
          ),
        );
        const collections: RequestCollection[] = [];
        const requests: SavedRequest[] = [];
        const expandedCollectionIds = new Set(
          state.expandedCollectionIds,
        );
        let collectionSortOrder = nextSortOrder(state.collections);
        let sanitizedSecretCount = 0;

        for (const importedCollection of importedCollections) {
          const collectionId = crypto.randomUUID();
          const name = uniqueImportedCollectionName(
            importedCollection.name,
            reservedNames,
          );
          collections.push({
            id: collectionId,
            name,
            createdAt: importedAt,
            updatedAt: importedAt,
            sortOrder: collectionSortOrder,
          });
          collectionSortOrder += 1;
          expandedCollectionIds.add(collectionId);

          importedCollection.requests.forEach(
            (importedRequest, sortOrder) => {
              const headers = importedRequest.headers.map((header) => {
                const sensitive =
                  header.sensitive === true ||
                  isSecretKey(header.key);
                const sanitized =
                  sensitive &&
                  !isSafeSecretReference(header.value);
                if (sanitized) {
                  sanitizedSecretCount += 1;
                }
                return persistedHeader({
                  id: crypto.randomUUID(),
                  enabled: sanitized ? false : header.enabled,
                  key: header.key,
                  value: sanitized ? "" : header.value,
                  ...(header.description
                    ? { description: header.description }
                    : {}),
                });
              });
              requests.push(
                createSavedRequest(
                  crypto.randomUUID(),
                  collectionId,
                  {
                    name: importedRequest.name,
                    method: importedRequest.method,
                    url: importedRequest.url,
                    headers,
                    body: importedRequest.body,
                    literalValues: importedRequest.literalValues,
                  },
                  importedAt,
                  sortOrder,
                ),
              );
            },
          );
        }

        const nextExpandedCollectionIds = [
          ...expandedCollectionIds,
        ];
        persistExpandedCollectionIds(nextExpandedCollectionIds);
        set({
          collections: [...state.collections, ...collections],
          requests: [...state.requests, ...requests],
          expandedCollectionIds: nextExpandedCollectionIds,
        });
        return {
          collectionCount: collections.length,
          requestCount: requests.length,
          sanitizedSecretCount,
        };
      },
      renameCollection: (collectionId, rawName) => {
        const name = normalizedLibraryName(
          rawName,
          COLLECTION_NAME_LENGTH_LIMITS,
        );
        if (!name) return false;
        const collection = get().collections.find(
          (candidate) => candidate.id === collectionId,
        );
        if (!collection) return false;
        const updatedAt = now();
        set((state) => ({
          collections: state.collections.map((candidate) =>
            candidate.id === collectionId
              ? { ...candidate, name, updatedAt }
              : candidate,
          ),
        }));
        return true;
      },
      deleteCollection: (collectionId) => {
        if (
          !get().collections.some(
            (collection) => collection.id === collectionId,
          )
        ) {
          return false;
        }
        const expandedCollectionIds =
          get().expandedCollectionIds.filter((id) => id !== collectionId);
        persistExpandedCollectionIds(expandedCollectionIds);
        set((state) => ({
          collections: state.collections.filter(
            (collection) => collection.id !== collectionId,
          ),
          requests: state.requests.filter(
            (request) => request.collectionId !== collectionId,
          ),
          expandedCollectionIds,
        }));
        return true;
      },
      toggleCollection: (collectionId) => {
        if (
          !get().collections.some(
            (collection) => collection.id === collectionId,
          )
        ) {
          return;
        }
        const expandedCollectionIds =
          get().expandedCollectionIds.includes(collectionId)
            ? get().expandedCollectionIds.filter(
                (id) => id !== collectionId,
              )
            : [...get().expandedCollectionIds, collectionId];
        persistExpandedCollectionIds(expandedCollectionIds);
        set({ expandedCollectionIds });
      },
      saveRequest: (collectionId, snapshot) => {
        const state = get();
        if (
          !state.collections.some(
            (collection) => collection.id === collectionId,
          )
        ) {
          return undefined;
        }
        const name = normalizedLibraryName(
          snapshot.name,
          SAVED_REQUEST_NAME_LENGTH_LIMITS,
        );
        if (!name) return undefined;
        const id = crypto.randomUUID();
        const createdAt = now();
        const request = createSavedRequest(
          id,
          collectionId,
          { ...snapshot, name },
          createdAt,
          nextSortOrder(
            state.requests.filter(
              (candidate) => candidate.collectionId === collectionId,
            ),
          ),
        );
        set((current) => ({
          requests: [...current.requests, request],
          collections: touchCollections(
            current.collections,
            new Set([collectionId]),
            createdAt,
          ),
        }));
        return id;
      },
      upsertRequest: (collectionId, snapshot, requestId) => {
        const state = get();
        const targetCollection = state.collections.find(
          (collection) => collection.id === collectionId,
        );
        if (!targetCollection) return undefined;
        const name = normalizedLibraryName(
          snapshot.name,
          SAVED_REQUEST_NAME_LENGTH_LIMITS,
        );
        if (!name) return undefined;
        const existing = requestId
          ? state.requests.find((request) => request.id === requestId)
          : undefined;
        if (!existing) {
          return get().saveRequest(collectionId, { ...snapshot, name });
        }
        const updatedAt = now();
        const moved = existing.collectionId !== collectionId;
        const sortOrder = moved
          ? nextSortOrder(
              state.requests.filter(
                (request) => request.collectionId === collectionId,
              ),
            )
          : existing.sortOrder;
        const updated: SavedRequest = {
          ...existing,
          collectionId,
          literalValues:
            snapshot.literalValues === true ? true : undefined,
          name,
          method: snapshot.method,
          url: snapshot.url,
          headers: snapshot.headers.map(persistedHeader),
          body: snapshot.body,
          updatedAt,
          sortOrder,
        };
        set((current) => ({
          requests: current.requests.map((request) =>
            request.id === existing.id ? updated : request,
          ),
          collections: touchCollections(
            current.collections,
            new Set([existing.collectionId, collectionId]),
            updatedAt,
          ),
        }));
        return existing.id;
      },
      renameRequest: (requestId, rawName) => {
        const name = normalizedLibraryName(
          rawName,
          SAVED_REQUEST_NAME_LENGTH_LIMITS,
        );
        if (!name) return false;
        const request = get().requests.find(
          (candidate) => candidate.id === requestId,
        );
        if (!request) return false;
        const updatedAt = now();
        set((state) => ({
          requests: state.requests.map((candidate) =>
            candidate.id === requestId
              ? { ...candidate, name, updatedAt }
              : candidate,
          ),
          collections: touchCollections(
            state.collections,
            new Set([request.collectionId]),
            updatedAt,
          ),
        }));
        return true;
      },
      moveRequest: (requestId, collectionId) => {
        const state = get();
        const request = state.requests.find(
          (candidate) => candidate.id === requestId,
        );
        if (
          !request ||
          !state.collections.some(
            (collection) => collection.id === collectionId,
          )
        ) {
          return false;
        }
        if (request.collectionId === collectionId) return true;
        const updatedAt = now();
        const sortOrder = nextSortOrder(
          state.requests.filter(
            (candidate) => candidate.collectionId === collectionId,
          ),
        );
        set((current) => ({
          requests: current.requests.map((candidate) =>
            candidate.id === requestId
              ? {
                  ...candidate,
                  collectionId,
                  updatedAt,
                  sortOrder,
                }
              : candidate,
          ),
          collections: touchCollections(
            current.collections,
            new Set([request.collectionId, collectionId]),
            updatedAt,
          ),
        }));
        return true;
      },
      deleteRequest: (requestId) => {
        const request = get().requests.find(
          (candidate) => candidate.id === requestId,
        );
        if (!request) return false;
        const updatedAt = now();
        set((state) => ({
          requests: state.requests.filter(
            (candidate) => candidate.id !== requestId,
          ),
          collections: touchCollections(
            state.collections,
            new Set([request.collectionId]),
            updatedAt,
          ),
        }));
        return true;
      },
      openRequestSnapshot: (requestId) => {
        const request = get().requests.find(
          (candidate) => candidate.id === requestId,
        );
        return request ? createOpenRequestSnapshot(request) : undefined;
      },
    }),
);

export interface CollectionLibraryStore
  extends Store<CollectionLibraryState> {
  readonly hydrated: Promise<void>;
  persist: {
    clearStorage(): Promise<void>;
    rehydrate(): Promise<void>;
  };
}

export function collectionLibraryDocument(
  state: Pick<CollectionLibraryState, "collections" | "requests">,
): string {
  return JSON.stringify({
    state: {
      collections: state.collections.map(persistedCollection),
      requests: state.requests.map(persistedRequest),
    },
    version: collectionLibraryStorageVersion,
  });
}

function mergeHydratedLibrary(
  persistedState: unknown,
  currentState: CollectionLibraryState,
): CollectionLibraryState {
  const hydrated = hydrateLibraryData(persistedState);
  const collectionIds = new Set(
    hydrated.collections.map((collection) => collection.id),
  );
  const expandedCollectionIds = [
    ...new Set(
      (
        currentState.expandedCollectionIds.length > 0
          ? currentState.expandedCollectionIds
          : hydrated.expandedCollectionIds
      ).filter((id) => collectionIds.has(id)),
    ),
  ];
  persistExpandedCollectionIds(expandedCollectionIds);
  return {
    ...currentState,
    ...hydrated,
    expandedCollectionIds,
  };
}

let hydrationPromise: Promise<void> = Promise.resolve();
let hydrationInProgress = false;
let persistenceEnabled = false;

function persistCollectionLibrary(state: CollectionLibraryState): void {
  if (hydrationInProgress || !persistenceEnabled) return;
  try {
    const write = collectionLibraryPersistStorage.setItem(
      collectionLibraryStorageKey,
      collectionLibraryDocument(state),
    );
    if (write) {
      void Promise.resolve(write).catch((error) => {
        console.error("Could not persist collection library", error);
      });
    }
  } catch (error) {
    console.error("Could not persist collection library", error);
  }
}

function rehydrateCollectionLibrary(): Promise<void> {
  if (hydrationInProgress) return hydrationPromise;
  hydrationInProgress = true;
  persistenceEnabled = false;
  hydrationPromise = (async () => {
    try {
      const rawDocument = await collectionLibraryPersistStorage.getItem(
        collectionLibraryStorageKey,
      );
      if (rawDocument) {
        const document = JSON.parse(rawDocument) as {
          state?: unknown;
          version?: unknown;
        };
        const persistedVersion =
          typeof document.version === "number" &&
          Number.isInteger(document.version)
            ? document.version
            : 0;
        if (persistedVersion > collectionLibraryStorageVersion) {
          throw new UnsupportedCollectionLibraryVersionError(
            persistedVersion,
          );
        }
        baseCollectionLibraryStore.setState(
          mergeHydratedLibrary(
            document.state,
            baseCollectionLibraryStore.getState(),
          ),
          true,
        );
      }
      finishCollectionLibraryHydration();
    } catch (error) {
      finishCollectionLibraryHydration(error);
    } finally {
      hydrationInProgress = false;
      persistenceEnabled =
        getCollectionLibraryPersistenceSnapshot().hydrated;
    }
  })();
  return hydrationPromise;
}

baseCollectionLibraryStore.subscribe((state) => {
  persistCollectionLibrary(state);
});

export const collectionLibraryStore: CollectionLibraryStore = {
  ...baseCollectionLibraryStore,
  get hydrated() {
    return hydrationPromise;
  },
  persist: {
    async clearStorage() {
      await collectionLibraryPersistStorage.removeItem?.(
        collectionLibraryStorageKey,
      );
    },
    rehydrate: rehydrateCollectionLibrary,
  },
};

void collectionLibraryStore.persist.rehydrate();
