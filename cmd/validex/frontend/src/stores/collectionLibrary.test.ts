import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedRequestSnapshot } from "../features/collections/model";
import {
  collectionLibraryStorageKey,
  collectionLibraryStorageVersion,
  selectOrderedCollections,
  selectOrderedRequests,
  useCollectionLibraryStore,
} from "./collectionLibrary";
import { getCollectionLibraryPersistenceSnapshot } from "./collectionLibraryStorage";

function requestSnapshot(
  overrides: Partial<SavedRequestSnapshot> = {},
): SavedRequestSnapshot {
  return {
    name: "List users",
    method: "GET",
    url: "https://api.example.test/users",
    headers: [],
    body: "",
    ...overrides,
  };
}

describe("collection library store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    localStorage.clear();
    useCollectionLibraryStore.setState({
      collections: [],
      requests: [],
      expandedCollectionIds: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates, renames, toggles and cascade-deletes collections", () => {
    const firstId =
      useCollectionLibraryStore.getState().createCollection("  Core   API ");
    const secondId =
      useCollectionLibraryStore.getState().createCollection("Admin API");

    expect(firstId).toBeDefined();
    expect(secondId).toBeDefined();
    expect(
      selectOrderedCollections(useCollectionLibraryStore.getState()).map(
        ({ name, sortOrder }) => ({ name, sortOrder }),
      ),
    ).toEqual([
      { name: "Core API", sortOrder: 0 },
      { name: "Admin API", sortOrder: 1 },
    ]);
    expect(
      useCollectionLibraryStore.getState().expandedCollectionIds,
    ).toEqual([firstId, secondId]);

    useCollectionLibraryStore.getState().toggleCollection(firstId!);
    expect(
      useCollectionLibraryStore.getState().expandedCollectionIds,
    ).toEqual([secondId]);
    expect(
      useCollectionLibraryStore
        .getState()
        .renameCollection(firstId!, "Public API"),
    ).toBe(true);

    const requestId = useCollectionLibraryStore
      .getState()
      .saveRequest(firstId!, requestSnapshot());
    expect(requestId).toBeDefined();
    expect(
      useCollectionLibraryStore.getState().deleteCollection(firstId!),
    ).toBe(true);
    expect(useCollectionLibraryStore.getState().requests).toEqual([]);
    expect(
      useCollectionLibraryStore.getState().collections.map(({ name }) => name),
    ).toEqual(["Admin API"]);
  });

  it("saves, updates, moves, renames, opens and deletes requests", () => {
    const sourceId =
      useCollectionLibraryStore.getState().createCollection("Source")!;
    const targetId =
      useCollectionLibraryStore.getState().createCollection("Target")!;
    const firstId = useCollectionLibraryStore
      .getState()
      .saveRequest(sourceId, requestSnapshot())!;
    const secondId = useCollectionLibraryStore
      .getState()
      .saveRequest(
        sourceId,
        requestSnapshot({ name: "Create user", method: "POST" }),
      )!;

    expect(
      selectOrderedRequests(
        useCollectionLibraryStore.getState(),
        sourceId,
      ).map(({ id, sortOrder }) => ({ id, sortOrder })),
    ).toEqual([
      { id: firstId, sortOrder: 0 },
      { id: secondId, sortOrder: 1 },
    ]);

    vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));
    expect(
      useCollectionLibraryStore.getState().upsertRequest(
        targetId,
        requestSnapshot({
          name: "Updated users",
          method: "PATCH",
          body: '{"active":true}',
        }),
        firstId,
      ),
    ).toBe(firstId);
    expect(
      useCollectionLibraryStore
        .getState()
        .renameRequest(firstId, "Activate users"),
    ).toBe(true);

    const opened = useCollectionLibraryStore
      .getState()
      .openRequestSnapshot(firstId);
    expect(opened).toMatchObject({
      savedRequestId: firstId,
      collectionId: targetId,
      name: "Activate users",
      method: "PATCH",
      body: '{"active":true}',
    });
    expect(opened).not.toHaveProperty("response");
    opened!.headers.push({
      id: "local",
      enabled: true,
      key: "X-Local",
      value: "only-in-tab",
    });
    expect(
      useCollectionLibraryStore.getState().requests[0].headers,
    ).toEqual([]);

    expect(
      useCollectionLibraryStore.getState().moveRequest(secondId, targetId),
    ).toBe(true);
    expect(
      selectOrderedRequests(
        useCollectionLibraryStore.getState(),
        targetId,
      ).map(({ id, sortOrder }) => ({ id, sortOrder })),
    ).toEqual([
      { id: firstId, sortOrder: 0 },
      { id: secondId, sortOrder: 1 },
    ]);
    expect(
      useCollectionLibraryStore.getState().deleteRequest(firstId),
    ).toBe(true);
    expect(
      useCollectionLibraryStore.getState().openRequestSnapshot(firstId),
    ).toBeUndefined();
  });

  it("rejects invalid names and missing collection targets", () => {
    expect(
      useCollectionLibraryStore.getState().createCollection(" "),
    ).toBeUndefined();
    expect(
      useCollectionLibraryStore
        .getState()
        .saveRequest("missing", requestSnapshot()),
    ).toBeUndefined();

    const collectionId =
      useCollectionLibraryStore.getState().createCollection("API")!;
    expect(
      useCollectionLibraryStore
        .getState()
        .saveRequest(collectionId, requestSnapshot({ name: "" })),
    ).toBeUndefined();
    expect(
      useCollectionLibraryStore
        .getState()
        .moveRequest("missing", collectionId),
    ).toBe(false);
  });

  it("persists only request snapshots and sanitizes secret header literals", async () => {
    const collectionId =
      useCollectionLibraryStore.getState().createCollection("Private API")!;
    const snapshot = {
      ...requestSnapshot({
        headers: [
          {
            id: "authorization-reference",
            enabled: true,
            key: "Authorization",
            value: "Bearer {{token}}",
          },
          {
            id: "api-key-literal",
            enabled: true,
            key: "X-API-Key",
            value: "production-secret",
          },
          {
            id: "content-type",
            enabled: true,
            key: "Content-Type",
            value: "application/json",
          },
        ],
      }),
      running: true,
      response: { body: "must not persist" },
    } as SavedRequestSnapshot;

    const requestId = useCollectionLibraryStore
      .getState()
      .saveRequest(collectionId, snapshot);

    expect(
      useCollectionLibraryStore.getState().requests[0].headers,
    ).toEqual([
      expect.objectContaining({
        id: "authorization-reference",
        enabled: true,
        value: "Bearer {{token}}",
      }),
      expect.objectContaining({
        id: "api-key-literal",
        enabled: false,
        value: "",
      }),
      expect.objectContaining({
        id: "content-type",
        enabled: true,
        value: "application/json",
      }),
    ]);
    expect(
      useCollectionLibraryStore
        .getState()
        .openRequestSnapshot(requestId!)?.headers[1],
    ).toMatchObject({ enabled: false, value: "" });

    const persisted = JSON.parse(
      localStorage.getItem(collectionLibraryStorageKey) ?? "{}",
    );
    expect(persisted.version).toBe(collectionLibraryStorageVersion);
    expect(persisted.state.requests[0].headers).toEqual([
      expect.objectContaining({
        id: "authorization-reference",
        enabled: true,
        value: "Bearer {{token}}",
      }),
      expect.objectContaining({
        id: "api-key-literal",
        enabled: false,
        value: "",
      }),
      expect.objectContaining({
        id: "content-type",
        enabled: true,
        value: "application/json",
      }),
    ]);
    expect(persisted.state.requests[0]).not.toHaveProperty("running");
    expect(persisted.state.requests[0]).not.toHaveProperty("response");
    expect(Object.keys(persisted.state).sort()).toEqual([
      "collections",
      "requests",
    ]);

    await useCollectionLibraryStore.persist.rehydrate();
    expect(
      useCollectionLibraryStore
        .getState()
        .openRequestSnapshot(requestId!)?.headers[1],
    ).toMatchObject({ enabled: false, value: "" });
  });

  it("sanitizes secrets and removes orphan requests while hydrating", async () => {
    localStorage.setItem(
      collectionLibraryStorageKey,
      JSON.stringify({
        version: collectionLibraryStorageVersion,
        state: {
          collections: [
            {
              id: "collection-1",
              name: "Hydrated",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              sortOrder: 0,
            },
          ],
          expandedCollectionIds: [
            "collection-1",
            "collection-1",
            "missing",
          ],
          requests: [
            {
              id: "request-1",
              collectionId: "collection-1",
              name: "Secret request",
              method: "GET",
              url: "https://example.test",
              headers: [
                {
                  id: "authorization",
                  enabled: true,
                  key: "Authorization",
                  value: "Bearer literal-secret",
                },
              ],
              body: "",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              sortOrder: 0,
            },
            {
              id: "orphan",
              collectionId: "missing",
              name: "Orphan",
              method: "GET",
              url: "",
              headers: [],
              body: "",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              sortOrder: 1,
            },
          ],
        },
      }),
    );

    await useCollectionLibraryStore.persist.rehydrate();

    expect(useCollectionLibraryStore.getState().expandedCollectionIds).toEqual([
      "collection-1",
    ]);
    expect(useCollectionLibraryStore.getState().requests).toHaveLength(1);
    expect(useCollectionLibraryStore.getState().requests[0].headers[0]).toMatchObject({
      enabled: false,
      value: "",
    });
  });

  it("keeps only the first record for every persisted identity", async () => {
    const collection = {
      id: "collection-1",
      name: "First collection",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      sortOrder: 0,
    };
    const request = {
      id: "request-1",
      collectionId: collection.id,
      name: "First request",
      method: "GET",
      url: "https://example.test/first",
      headers: [
        {
          id: "header-1",
          enabled: true,
          key: "Accept",
          value: "application/json",
        },
        {
          id: "header-1",
          enabled: true,
          key: "X-Duplicate",
          value: "ignored",
        },
      ],
      body: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      sortOrder: 0,
    };
    localStorage.setItem(
      collectionLibraryStorageKey,
      JSON.stringify({
        version: collectionLibraryStorageVersion,
        state: {
          collections: [
            collection,
            { ...collection, name: "Duplicate collection" },
          ],
          requests: [
            request,
            { ...request, name: "Duplicate request" },
          ],
          expandedCollectionIds: [collection.id],
        },
      }),
    );

    await useCollectionLibraryStore.persist.rehydrate();

    expect(useCollectionLibraryStore.getState().collections).toHaveLength(1);
    expect(useCollectionLibraryStore.getState().collections[0].name).toBe(
      "First collection",
    );
    expect(useCollectionLibraryStore.getState().requests).toHaveLength(1);
    expect(useCollectionLibraryStore.getState().requests[0]).toMatchObject({
      name: "First request",
      headers: [expect.objectContaining({ key: "Accept" })],
    });
  });

  it("refuses a collection document from a newer application version", async () => {
    const futureDocument = JSON.stringify({
      version: collectionLibraryStorageVersion + 1,
      state: {
        collections: [],
        requests: [],
        expandedCollectionIds: [],
        futureField: true,
      },
    });
    localStorage.setItem(collectionLibraryStorageKey, futureDocument);

    await useCollectionLibraryStore.persist.rehydrate();

    expect(getCollectionLibraryPersistenceSnapshot()).toMatchObject({
      hydrated: false,
      operation: "read",
      error: { code: "collection_library_newer_version" },
    });
    expect(localStorage.getItem(collectionLibraryStorageKey)).toBe(
      futureDocument,
    );
  });
});
