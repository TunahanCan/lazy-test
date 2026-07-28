import type { StateStorage } from "../core/store.js";
import { backend } from "../lib/backend.js";
import type { UserError } from "../lib/types.js";

export const COLLECTION_LIBRARY_PERSISTENCE_PHASE = {
  LOADING: "loading",
  SAVING: "saving",
  READY: "ready",
  ERROR: "error",
} as const;

export type CollectionLibraryPersistencePhase =
  (typeof COLLECTION_LIBRARY_PERSISTENCE_PHASE)[keyof typeof COLLECTION_LIBRARY_PERSISTENCE_PHASE];

export interface CollectionLibraryPersistenceSnapshot {
  phase: CollectionLibraryPersistencePhase;
  hydrated: boolean;
  pendingWrites: number;
  operation?: "read" | "write";
  error?: UserError;
}

export class UnsupportedCollectionLibraryVersionError extends Error {
  readonly code = "collection_library_newer_version";

  constructor(readonly storedVersion: number) {
    super(
      `Collection library version ${storedVersion} is newer than this application supports.`,
    );
    this.name = "UnsupportedCollectionLibraryVersionError";
  }
}

const listeners = new Set<() => void>();
let persistenceSnapshot: CollectionLibraryPersistenceSnapshot = {
  phase: COLLECTION_LIBRARY_PERSISTENCE_PHASE.LOADING,
  hydrated: false,
  pendingWrites: 0,
  operation: "read",
};
let latestDocument: string | undefined;
let latestStorageName: string | undefined;
let lastRequestedDocument: string | undefined;
let latestWrite: Promise<boolean> = Promise.resolve(true);
let latestWriteSequence = 0;
let pendingWrites = 0;

function publish(snapshot: CollectionLibraryPersistenceSnapshot) {
  persistenceSnapshot = snapshot;
  for (const listener of listeners) listener();
}

function browserStorageError(operation: "read" | "write"): UserError {
  return {
    code: `collection_library_browser_${operation}_failed`,
    title:
      operation === "read"
        ? "Koleksiyonlar yüklenemedi"
        : "Koleksiyon kaydedilemedi",
    message:
      operation === "read"
        ? "Tarayıcı geliştirme depolaması okunamadı."
        : "Tarayıcı geliştirme depolamasına yazılamadı.",
  };
}

function bridgeStorageError(
  operation: "read" | "write",
  error: unknown,
): UserError {
  return {
    code: `collection_library_bridge_${operation}_failed`,
    title:
      operation === "read"
        ? "Koleksiyonlar yüklenemedi"
        : "Koleksiyon kaydedilemedi",
    message: "Masaüstü depolama bağlantısı yanıt vermedi.",
    technical: error instanceof Error ? error.message : String(error),
  };
}

function markReady(hydrated: boolean) {
  publish({
    phase: COLLECTION_LIBRARY_PERSISTENCE_PHASE.READY,
    hydrated,
    pendingWrites,
  });
}

function markFailure(
  operation: "read" | "write",
  error: UserError,
  hydrated: boolean,
) {
  publish({
    phase: COLLECTION_LIBRARY_PERSISTENCE_PHASE.ERROR,
    hydrated,
    pendingWrites,
    operation,
    error,
  });
}

export function subscribeCollectionLibraryPersistence(
  listener: () => void,
) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCollectionLibraryPersistenceSnapshot() {
  return persistenceSnapshot;
}

export function beginCollectionLibraryHydration() {
  publish({
    phase: COLLECTION_LIBRARY_PERSISTENCE_PHASE.LOADING,
    hydrated: false,
    pendingWrites,
    operation: "read",
  });
}

export function finishCollectionLibraryHydration(error?: unknown) {
  if (error) {
    const persistenceError =
      error instanceof UnsupportedCollectionLibraryVersionError
        ? {
            code: error.code,
            title: "Koleksiyonlar daha yeni bir sürümle kaydedilmiş",
            message:
              "Bu koleksiyon dosyasını güvenle açmak için Validex’i güncelleyin.",
          }
        : bridgeStorageError("read", error);
    markFailure(
      "read",
      persistenceError,
      false,
    );
    return;
  }
  if (
    persistenceSnapshot.phase ===
      COLLECTION_LIBRARY_PERSISTENCE_PHASE.ERROR &&
    persistenceSnapshot.operation === "read"
  ) {
    return;
  }
  if (
    persistenceSnapshot.phase ===
      COLLECTION_LIBRARY_PERSISTENCE_PHASE.ERROR &&
    persistenceSnapshot.operation === "write"
  ) {
    publish({ ...persistenceSnapshot, hydrated: true, pendingWrites });
    return;
  }
  if (pendingWrites > 0) {
    publish({
      phase: COLLECTION_LIBRARY_PERSISTENCE_PHASE.SAVING,
      hydrated: true,
      pendingWrites,
      operation: "write",
    });
    return;
  }
  markReady(true);
}

interface NativeWriteOutcome {
  saved: boolean;
  error?: UserError;
}

function saveNativeDocument(data: string): Promise<boolean> {
  latestDocument = data;
  const sequence = ++latestWriteSequence;
  pendingWrites += 1;
  if (persistenceSnapshot.hydrated) {
    publish({
      phase: COLLECTION_LIBRARY_PERSISTENCE_PHASE.SAVING,
      hydrated: true,
      pendingWrites,
      operation: "write",
    });
  } else {
    publish({ ...persistenceSnapshot, pendingWrites });
  }

  const operation = (async (): Promise<NativeWriteOutcome> => {
    try {
      const result = await backend.saveCollectionLibrary(data);
      if (!result.saved || result.error) {
        return {
          saved: false,
          error:
            result.error ??
            bridgeStorageError("write", "save rejected"),
        };
      }
      return { saved: true };
    } catch (error) {
      return {
        saved: false,
        error: bridgeStorageError("write", error),
      };
    }
  })();
  latestWrite = operation.then((outcome) => outcome.saved);

  void operation.then((outcome) => {
    pendingWrites = Math.max(0, pendingWrites - 1);
    if (sequence !== latestWriteSequence) {
      publish({ ...persistenceSnapshot, pendingWrites });
      return;
    }
    if (!outcome.saved) {
      markFailure(
        "write",
        outcome.error ?? bridgeStorageError("write", "save rejected"),
        persistenceSnapshot.hydrated,
      );
      return;
    }
    lastRequestedDocument = data;
    if (!persistenceSnapshot.hydrated) {
      publish({ ...persistenceSnapshot, pendingWrites });
    } else if (pendingWrites > 0) {
      publish({
        phase: COLLECTION_LIBRARY_PERSISTENCE_PHASE.SAVING,
        hydrated: true,
        pendingWrites,
        operation: "write",
      });
    } else {
      markReady(true);
    }
  });
  return latestWrite;
}

export function waitForCollectionLibraryPersistence(): Promise<boolean> {
  return latestWrite;
}

export function retryCollectionLibraryWrite(): Promise<boolean> {
  if (!latestDocument) return Promise.resolve(true);
  if (backend.hasNativeCollectionLibrary()) {
    return saveNativeDocument(latestDocument);
  }
  if (!latestStorageName) return Promise.resolve(false);
  try {
    localStorage.setItem(latestStorageName, latestDocument);
    lastRequestedDocument = latestDocument;
    latestWrite = Promise.resolve(true);
    markReady(persistenceSnapshot.hydrated);
    return latestWrite;
  } catch {
    markFailure(
      "write",
      browserStorageError("write"),
      persistenceSnapshot.hydrated,
    );
    latestWrite = Promise.resolve(false);
    return latestWrite;
  }
}

export function createCollectionLibraryStorage(
  emptyDocument: string,
): StateStorage {
  return {
    getItem(name) {
      latestStorageName = name;
      beginCollectionLibraryHydration();
      if (!backend.hasNativeCollectionLibrary()) {
        try {
          const data = localStorage.getItem(name);
          latestDocument = data ?? undefined;
          lastRequestedDocument = data ?? undefined;
          latestWrite = Promise.resolve(true);
          return data;
        } catch {
          markFailure("read", browserStorageError("read"), false);
          return null;
        }
      }

      return backend
        .loadCollectionLibrary()
        .then(async (result) => {
          if (result.error) {
            markFailure("read", result.error, false);
            return null;
          }
          if (result.found) {
            latestDocument = result.data;
            lastRequestedDocument = result.data;
            latestWrite = Promise.resolve(true);
            return result.data;
          }

          let legacyDocument: string | null = null;
          try {
            legacyDocument = localStorage.getItem(name);
          } catch {
            // Native storage remains usable even if the origin fallback is not.
          }
          if (legacyDocument) {
            latestDocument = legacyDocument;
            const migrated = await saveNativeDocument(legacyDocument);
            if (migrated) {
              try {
                localStorage.removeItem(name);
              } catch {
                // The confirmed native copy remains the source of truth.
              }
            }
            return legacyDocument;
          }
          latestWrite = Promise.resolve(true);
          return null;
        })
        .catch((error) => {
          markFailure("read", bridgeStorageError("read", error), false);
          return null;
        });
    },
    setItem(name, data) {
      latestStorageName = name;
      latestDocument = data;
      if (data === lastRequestedDocument) {
        return latestWrite.then(() => undefined);
      }
      lastRequestedDocument = data;
      if (!backend.hasNativeCollectionLibrary()) {
        try {
          localStorage.setItem(name, data);
          latestWrite = Promise.resolve(true);
          if (persistenceSnapshot.hydrated) markReady(true);
        } catch {
          latestWrite = Promise.resolve(false);
          markFailure(
            "write",
            browserStorageError("write"),
            persistenceSnapshot.hydrated,
          );
        }
        return;
      }
      return saveNativeDocument(data).then(() => undefined);
    },
    removeItem(name) {
      latestStorageName = name;
      latestDocument = emptyDocument;
      lastRequestedDocument = emptyDocument;
      if (!backend.hasNativeCollectionLibrary()) {
        try {
          localStorage.removeItem(name);
          latestWrite = Promise.resolve(true);
          if (persistenceSnapshot.hydrated) markReady(true);
        } catch {
          latestWrite = Promise.resolve(false);
          markFailure(
            "write",
            browserStorageError("write"),
            persistenceSnapshot.hydrated,
          );
        }
        return;
      }
      return saveNativeDocument(emptyDocument).then(() => undefined);
    },
  };
}
