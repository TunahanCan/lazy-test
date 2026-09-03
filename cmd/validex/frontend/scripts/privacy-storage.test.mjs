import assert from "node:assert/strict";
import test from "node:test";

import {
  createOpenRequestSnapshot,
} from "../.typescript-build/esm/features/collections/model.js";

const browserStorage = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key) => browserStorage.get(key) ?? null,
    setItem: (key, value) => browserStorage.set(key, value),
    removeItem: (key) => browserStorage.delete(key),
  },
});

const {
  collectionLibraryDocument,
  hydrateLibraryData,
} = await import(
  "../.typescript-build/esm/stores/collectionLibrary.js"
);
const {
  createPersistedWorkspaceState,
  createRequestTab,
  migrateLegacyWorkspaceStorage,
  migratePersistedWorkspaceState,
  workspaceStore,
  workspaceStorageKey,
  workspaceStorageVersion,
} = await import("../.typescript-build/esm/stores/workspace.js");

function workspaceState(tabs, activeTabID, recentlyClosed = []) {
  return {
    workspaceID: "validex-workspace",
    activeEnvironmentID: "none",
    environmentVariables: {},
    tabs,
    activeTabID,
    recentlyClosed,
    leftVisible: true,
    rightVisible: false,
    leftWidth: 264,
    rightWidth: 292,
    responseSize: 32,
    responsePlacement: "vertical",
    activeView: "requests",
    theme: "system",
  };
}

test("new and reset workspaces use the collection-first balanced layout", async () => {
  await workspaceStore.hydrated;
  const initial = workspaceStore.getInitialState();
  assert.equal(initial.leftVisible, true);
  assert.equal(initial.responseSize, 44);

  const previous = workspaceStore.getState();
  try {
    workspaceStore.setState({ leftVisible: false, responseSize: 24 });
    workspaceStore.getState().resetLayout();
    assert.equal(workspaceStore.getState().leftVisible, true);
    assert.equal(workspaceStore.getState().responseSize, 44);
    assert.equal(
      JSON.parse(browserStorage.get(workspaceStorageKey)).version,
      workspaceStorageVersion,
    );
  } finally {
    workspaceStore.setState(previous, true);
  }
});

test("workspace migration adopts the new response default without replacing preferences", () => {
  const previousDefault = workspaceState([], "");
  previousDefault.leftVisible = false;
  previousDefault.responseSize = 36;
  previousDefault.responsePlacement = "horizontal";

  const migratedDefault = migratePersistedWorkspaceState(previousDefault, 8);
  assert.equal(migratedDefault.leftVisible, false);
  assert.equal(migratedDefault.responseSize, 44);
  assert.equal(migratedDefault.responsePlacement, "horizontal");

  const currentVersion = migratePersistedWorkspaceState(
    previousDefault,
    workspaceStorageVersion,
  );
  assert.equal(currentVersion.responseSize, 36);

  const performanceWorkspace = migratePersistedWorkspaceState(
    { ...previousDefault, activeView: "performance" },
    workspaceStorageVersion,
  );
  assert.equal(performanceWorkspace.activeView, "performance");

  const customized = {
    ...previousDefault,
    leftVisible: false,
    responseSize: 52,
    responsePlacement: "vertical",
  };
  const migratedCustomized = migratePersistedWorkspaceState(customized, 8);
  assert.equal(migratedCustomized.leftVisible, false);
  assert.equal(migratedCustomized.responseSize, 52);
  assert.equal(migratedCustomized.responsePlacement, "vertical");

  const { leftVisible: _missingPreference, ...withoutPanelPreference } =
    previousDefault;
  const migratedMissingPreference = migratePersistedWorkspaceState(
    withoutPanelPreference,
    8,
  );
  assert.equal(migratedMissingPreference.leftVisible, true);
});

test("session-only browser requests never enter workspace persistence", () => {
  const persisted = createRequestTab({
    id: "persisted-tab",
    literalValues: true,
    sessionOnly: false,
    url: "https://safe.example.test/profile",
    body: '{"safe":true}',
    headers: [
      {
        id: "authorization",
        enabled: true,
        key: "Authorization",
        value: "Bearer persistent-secret",
      },
    ],
  });
  const sessionOnly = createRequestTab({
    id: "browser-import",
    literalValues: true,
    sessionOnly: true,
    url: "https://private.example.test/?access_token=url-secret",
    body: '{"password":"body-secret"}',
    headers: [
      {
        id: "cookie",
        enabled: true,
        key: "Cookie",
        value: "sid=header-secret",
      },
    ],
  });
  const recentlyClosed = createRequestTab({
    id: "closed-browser-import",
    sessionOnly: true,
    url: "https://closed.example.test/recent-secret",
    body: "closed-body-secret",
    headers: [],
  });

  const snapshot = createPersistedWorkspaceState(
    workspaceState(
      [persisted, sessionOnly],
      sessionOnly.id,
      [recentlyClosed],
    ),
  );
  const serialized = JSON.stringify(snapshot);

  assert.deepEqual(snapshot.tabs.map((tab) => tab.id), [persisted.id]);
  assert.equal(snapshot.activeTabID, persisted.id);
  assert.deepEqual(snapshot.recentlyClosed, []);
  assert.equal(snapshot.tabs[0].literalValues, true);
  assert.equal("sessionOnly" in snapshot.tabs[0], false);
  assert.equal(snapshot.tabs[0].headers[0].enabled, false);
  assert.equal(snapshot.tabs[0].headers[0].value, "");
  for (const secret of [
    "url-secret",
    "body-secret",
    "header-secret",
    "recent-secret",
    "closed-body-secret",
  ]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});

test("workspace persistence keeps the contract response section", () => {
  const contractTab = createRequestTab({
    id: "contract-tab",
    url: "https://api.example.test/orders",
  });
  contractTab.responseSection = "contract";

  const snapshot = createPersistedWorkspaceState(
    workspaceState([contractTab], contractTab.id),
  );

  assert.equal(snapshot.tabs[0].responseSection, "contract");
});

test("workspace migration filters session-only recently closed data", () => {
  const documents = new Map();
  documents.set(
    workspaceStorageKey,
    JSON.stringify({
      state: workspaceState(
        [
          createRequestTab({
            id: "normal",
            url: "https://safe.example.test",
          }),
          createRequestTab({
            id: "session",
            sessionOnly: true,
            url: "https://private.example.test/migration-secret",
          }),
        ],
        "session",
        [
          createRequestTab({
            id: "closed-normal",
            url: "https://safe.example.test/recent",
          }),
          createRequestTab({
            id: "closed-session",
            sessionOnly: true,
            url: "https://closed.example.test/recent-migration-secret",
          }),
        ],
      ),
      version: 7,
    }),
  );
  const storage = {
    getItem: (key) => documents.get(key) ?? null,
    setItem: (key, value) => documents.set(key, value),
    removeItem: (key) => documents.delete(key),
  };

  migrateLegacyWorkspaceStorage(storage);
  const migratedRaw = documents.get(workspaceStorageKey);
  const migrated = JSON.parse(migratedRaw);

  assert.deepEqual(migrated.state.tabs.map((tab) => tab.id), ["normal"]);
  assert.equal(migrated.state.activeTabID, "normal");
  assert.deepEqual(
    migrated.state.recentlyClosed.map((tab) => tab.id),
    ["closed-normal"],
  );
  assert.equal(migratedRaw.includes("migration-secret"), false);
  assert.equal(migratedRaw.includes("recent-migration-secret"), false);
});

test("literal request mode survives an explicit collection roundtrip", () => {
  const document = collectionLibraryDocument({
    collections: [
      {
        id: "collection-1",
        name: "Browser requests",
        createdAt: "2026-07-28T10:00:00.000Z",
        updatedAt: "2026-07-28T10:00:00.000Z",
        sortOrder: 0,
      },
    ],
    requests: [
      {
        id: "request-1",
        collectionId: "collection-1",
        literalValues: true,
        name: "Template payload",
        method: "PROPFIND",
        url: "https://api.example.test/render/{{literal-id}}",
        headers: [
          {
            id: "content-type",
            enabled: true,
            key: "Content-Type",
            value: "application/json",
          },
          {
            id: "cookie",
            enabled: true,
            key: "Cookie",
            value: "sid=must-not-persist",
          },
        ],
        body: '{"template":"{{literal-name}}"}',
        createdAt: "2026-07-28T10:00:00.000Z",
        updatedAt: "2026-07-28T10:00:00.000Z",
        sortOrder: 0,
      },
    ],
  });
  const parsed = JSON.parse(document);
  const hydrated = hydrateLibraryData(parsed.state);
  const request = hydrated.requests[0];
  const opened = createOpenRequestSnapshot(request);

  assert.equal(parsed.state.requests[0].literalValues, true);
  assert.equal(request.literalValues, true);
  assert.equal(opened.literalValues, true);
  assert.equal(opened.method, "PROPFIND");
  assert.equal(opened.url, "https://api.example.test/render/{{literal-id}}");
  assert.equal(opened.body, '{"template":"{{literal-name}}"}');
  assert.equal(request.headers[1].enabled, false);
  assert.equal(request.headers[1].value, "");
  assert.equal(document.includes("must-not-persist"), false);
  assert.equal("sessionOnly" in parsed.state.requests[0], false);
});
