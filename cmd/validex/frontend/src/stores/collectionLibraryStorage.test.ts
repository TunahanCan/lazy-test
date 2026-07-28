import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backend } from "../lib/backend";
import {
  COLLECTION_LIBRARY_PERSISTENCE_PHASE,
  beginCollectionLibraryHydration,
  createCollectionLibraryStorage,
  finishCollectionLibraryHydration,
  getCollectionLibraryPersistenceSnapshot,
  waitForCollectionLibraryPersistence,
} from "./collectionLibraryStorage";

const storageKey = "validex:test-collection-library";
const emptyDocument =
  '{"state":{"collections":[],"requests":[]},"version":1}';

function documentWithName(name: string) {
  return JSON.stringify({
    state: {
      collections: [{ id: name, name }],
      requests: [],
    },
    version: 1,
  });
}

describe("collection library persistence adapter", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("publishes hydration only after Zustand finishes parsing and merging", async () => {
    vi.spyOn(backend, "hasNativeCollectionLibrary").mockReturnValue(false);
    localStorage.setItem(storageKey, emptyDocument);
    const storage = createCollectionLibraryStorage(emptyDocument);

    await storage.getItem(storageKey);

    expect(getCollectionLibraryPersistenceSnapshot()).toMatchObject({
      phase: COLLECTION_LIBRARY_PERSISTENCE_PHASE.LOADING,
      hydrated: false,
    });
    finishCollectionLibraryHydration();
    expect(getCollectionLibraryPersistenceSnapshot()).toMatchObject({
      phase: COLLECTION_LIBRARY_PERSISTENCE_PHASE.READY,
      hydrated: true,
    });
  });

  it("migrates the origin fallback only after a confirmed native write", async () => {
    vi.spyOn(backend, "hasNativeCollectionLibrary").mockReturnValue(true);
    vi.spyOn(backend, "loadCollectionLibrary").mockResolvedValue({
      data: "",
      found: false,
    });
    const save = vi
      .spyOn(backend, "saveCollectionLibrary")
      .mockResolvedValue({ saved: true });
    localStorage.setItem(storageKey, emptyDocument);
    const storage = createCollectionLibraryStorage(emptyDocument);

    await expect(storage.getItem(storageKey)).resolves.toBe(emptyDocument);

    expect(save).toHaveBeenCalledWith(emptyDocument);
    expect(localStorage.getItem(storageKey)).toBeNull();
    finishCollectionLibraryHydration();
    expect(getCollectionLibraryPersistenceSnapshot().hydrated).toBe(true);
  });

  it("exposes a failed durable acknowledgement without marking data ready", async () => {
    vi.spyOn(backend, "hasNativeCollectionLibrary").mockReturnValue(true);
    vi.spyOn(backend, "saveCollectionLibrary").mockResolvedValue({
      saved: false,
      error: {
        code: "collection_library_write_failed",
        title: "Write failed",
        message: "Disk is full",
      },
    });
    beginCollectionLibraryHydration();
    finishCollectionLibraryHydration();
    const storage = createCollectionLibraryStorage(emptyDocument);

    await storage.setItem(storageKey, documentWithName("failed"));

    await expect(waitForCollectionLibraryPersistence()).resolves.toBe(false);
    expect(getCollectionLibraryPersistenceSnapshot()).toMatchObject({
      phase: COLLECTION_LIBRARY_PERSISTENCE_PHASE.ERROR,
      hydrated: true,
      operation: "write",
      error: { code: "collection_library_write_failed" },
    });
  });

  it("dispatches every accepted native snapshot without a browser-only queue", async () => {
    vi.spyOn(backend, "hasNativeCollectionLibrary").mockReturnValue(true);
    const resolvers: Array<(value: { saved: true }) => void> = [];
    const save = vi
      .spyOn(backend, "saveCollectionLibrary")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvers.push(resolve);
          }),
      );
    beginCollectionLibraryHydration();
    finishCollectionLibraryHydration();
    const storage = createCollectionLibraryStorage(emptyDocument);
    const first = storage.setItem(storageKey, documentWithName("first"));
    const second = storage.setItem(storageKey, documentWithName("second"));

    expect(save).toHaveBeenCalledTimes(2);
    resolvers[0]({ saved: true });
    await first;
    resolvers[1]({ saved: true });
    await second;

    await expect(waitForCollectionLibraryPersistence()).resolves.toBe(true);
    expect(getCollectionLibraryPersistenceSnapshot()).toMatchObject({
      phase: COLLECTION_LIBRARY_PERSISTENCE_PHASE.READY,
      hydrated: true,
      pendingWrites: 0,
    });
  });
});
