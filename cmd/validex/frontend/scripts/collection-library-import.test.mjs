import assert from "node:assert/strict";
import test from "node:test";

const browserStorage = new Map();
const storageWrites = [];
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {},
});
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key) => browserStorage.get(key) ?? null,
    setItem: (key, value) => {
      browserStorage.set(key, value);
      storageWrites.push({ key, value });
    },
    removeItem: (key) => browserStorage.delete(key),
  },
});

const {
  collectionLibraryStorageKey,
  collectionLibraryStore,
  collectionLibraryViewStorageKey,
} = await import(
  "../.typescript-build/esm/stores/collectionLibrary.js"
);

await collectionLibraryStore.hydrated;

function seedLibrary() {
  collectionLibraryStore.setState({
    collections: [
      {
        id: "existing-collection",
        name: "Payments API",
        createdAt: "2026-07-28T10:00:00.000Z",
        updatedAt: "2026-07-28T10:00:00.000Z",
        sortOrder: 4,
      },
    ],
    requests: [],
    expandedCollectionIds: ["existing-collection"],
  });
  storageWrites.length = 0;
}

test("collection batch import commits normalized data atomically", () => {
  seedLibrary();
  const batch = {
    collections: [
      {
        name: "  Payments   API  ",
        requests: [
          {
            name: "  Create   payment ",
            method: "POST",
            url: "{{baseUrl}}/payments",
            headers: [
              {
                enabled: true,
                key: "Authorization",
                value: "Bearer imported-secret",
              },
              {
                enabled: true,
                key: "X-Api-Key",
                value: "{{apiKey}}",
              },
              {
                enabled: true,
                key: "X-Trace",
                value: "trace-value",
                description: "Imported trace context",
              },
              {
                enabled: true,
                key: "Ocp-Apim-Subscription-Key",
                value: "literal-subscription-secret",
                sensitive: true,
              },
            ],
            body: '{"amount":42}',
            literalValues: true,
          },
          {
            name: "Payment status",
            method: "GET",
            url: "{{baseUrl}}/payments/42",
            headers: [],
            body: "",
          },
        ],
      },
      {
        name: "Payments API",
        requests: [
          {
            name: "Delete payment",
            method: "DELETE",
            url: "{{baseUrl}}/payments/42",
            headers: [
              {
                enabled: true,
                key: "Cookie",
                value: "sid=imported-cookie",
              },
            ],
            body: "",
            literalValues: false,
          },
        ],
      },
    ],
  };
  const inputBeforeImport = structuredClone(batch);
  let notifications = 0;
  const unsubscribe = collectionLibraryStore.subscribe(() => {
    notifications += 1;
  });

  const summary =
    collectionLibraryStore.getState().importCollections(batch);

  unsubscribe();
  assert.deepEqual(summary, {
    collectionCount: 2,
    requestCount: 3,
    sanitizedSecretCount: 3,
  });
  assert.deepEqual(batch, inputBeforeImport);
  assert.equal(notifications, 1);

  const state = collectionLibraryStore.getState();
  const importedCollections = state.collections.slice(1);
  assert.deepEqual(
    importedCollections.map(({ name, sortOrder }) => ({
      name,
      sortOrder,
    })),
    [
      { name: "Payments API (2)", sortOrder: 5 },
      { name: "Payments API (3)", sortOrder: 6 },
    ],
  );
  assert.ok(
    importedCollections.every(
      (collection) =>
        collection.createdAt === collection.updatedAt &&
        Number.isFinite(Date.parse(collection.createdAt)),
    ),
  );
  assert.ok(
    importedCollections.every((collection) =>
      state.expandedCollectionIds.includes(collection.id),
    ),
  );

  const firstCollectionRequests = state.requests.filter(
    (request) =>
      request.collectionId === importedCollections[0].id,
  );
  const secondCollectionRequests = state.requests.filter(
    (request) =>
      request.collectionId === importedCollections[1].id,
  );
  assert.deepEqual(
    firstCollectionRequests.map(({ name, sortOrder }) => ({
      name,
      sortOrder,
    })),
    [
      { name: "Create payment", sortOrder: 0 },
      { name: "Payment status", sortOrder: 1 },
    ],
  );
  assert.equal(firstCollectionRequests[0].literalValues, true);
  assert.equal(
    firstCollectionRequests[0].headers[0].enabled,
    false,
  );
  assert.equal(firstCollectionRequests[0].headers[0].value, "");
  assert.equal(
    firstCollectionRequests[0].headers[1].value,
    "{{apiKey}}",
  );
  assert.equal(
    firstCollectionRequests[0].headers[2].value,
    "trace-value",
  );
  assert.equal(
    firstCollectionRequests[0].headers[2].description,
    "Imported trace context",
  );
  assert.equal(
    firstCollectionRequests[0].headers[3].enabled,
    false,
  );
  assert.equal(firstCollectionRequests[0].headers[3].value, "");
  assert.equal(
    "sensitive" in firstCollectionRequests[0].headers[3],
    false,
  );
  assert.equal(
    secondCollectionRequests[0].headers[0].enabled,
    false,
  );
  assert.equal(secondCollectionRequests[0].headers[0].value, "");
  assert.equal(
    "literalValues" in secondCollectionRequests[0],
    true,
  );
  assert.equal(secondCollectionRequests[0].literalValues, undefined);

  const allGeneratedIDs = [
    ...importedCollections.map((collection) => collection.id),
    ...state.requests.map((request) => request.id),
    ...state.requests.flatMap((request) =>
      request.headers.map((header) => header.id),
    ),
  ];
  assert.ok(allGeneratedIDs.every((id) => id.length > 0));
  assert.equal(new Set(allGeneratedIDs).size, allGeneratedIDs.length);

  assert.equal(
    storageWrites.filter(
      ({ key }) => key === collectionLibraryStorageKey,
    ).length,
    1,
  );
  assert.equal(
    storageWrites.filter(
      ({ key }) => key === collectionLibraryViewStorageKey,
    ).length,
    1,
  );
  const persistedDocument =
    browserStorage.get(collectionLibraryStorageKey);
  assert.equal(persistedDocument.includes("imported-secret"), false);
  assert.equal(persistedDocument.includes("imported-cookie"), false);
  assert.equal(
    persistedDocument.includes("literal-subscription-secret"),
    false,
  );
});

test("invalid collection batch leaves the entire library untouched", () => {
  const before = collectionLibraryStore.getState();
  const writesBefore = storageWrites.length;
  let notifications = 0;
  const unsubscribe = collectionLibraryStore.subscribe(() => {
    notifications += 1;
  });

  const summary = collectionLibraryStore
    .getState()
    .importCollections({
      collections: [
        {
          name: "Valid collection",
          requests: [],
        },
        {
          name: "Invalid collection",
          requests: [
            {
              name: "Invalid request",
              method: " GET ",
              url: "https://example.test",
              headers: [],
              body: "",
            },
          ],
        },
      ],
    });

  unsubscribe();
  assert.equal(summary, undefined);
  assert.equal(collectionLibraryStore.getState(), before);
  assert.equal(storageWrites.length, writesBefore);
  assert.equal(notifications, 0);
});
