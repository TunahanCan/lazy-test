import { beforeEach, describe, expect, it } from "vitest";
import {
  createRequestTab,
  migrateLegacyWorkspaceStorage,
  useWorkspaceStore,
  workspaceStorageKey,
} from "./workspace";

describe("workspace persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    const tab = createRequestTab({ id: "workspace-test" });
    useWorkspaceStore.setState({
      environmentVariables: {},
      tabs: [tab],
      activeTabID: tab.id,
      recentlyClosed: [],
    });
  });

  it("does not persist transient errors or common secret values", () => {
    const tab = createRequestTab({
      id: "secret-tab",
      running: true,
      error: true,
      headers: [
        {
          id: "authorization",
          enabled: true,
          key: "Authorization",
          value: "Bearer production-secret",
          source: "Manual",
        },
      ],
    });
    useWorkspaceStore.setState({
      environmentVariables: {
        development: {
          baseUrl: "https://api.example.test",
          token: "environment-secret",
        },
      },
      tabs: [tab],
      activeTabID: tab.id,
    });

    const persisted = JSON.parse(
      localStorage.getItem(workspaceStorageKey) ?? "{}",
    );
    expect(persisted.state.environmentVariables.development).toEqual({
      baseUrl: "https://api.example.test",
    });
    expect(persisted.state.tabs[0].running).toBe(false);
    expect(persisted.state.tabs[0].error).toBe(false);
    expect(persisted.state.tabs[0].headers[0].value).toBe("");
    expect(persisted.state.tabs[0].headers[0].enabled).toBe(false);
  });

  it("persists only safe variable references in secret headers", () => {
    const tab = createRequestTab({
      id: "reference-tab",
      headers: [
        {
          id: "safe",
          enabled: true,
          key: "Authorization",
          value: "Bearer {{token}}",
        },
        {
          id: "mixed",
          enabled: true,
          key: "X-API-Key",
          value: "{{token}}-literal-secret",
        },
      ],
    });
    useWorkspaceStore.setState({ tabs: [tab], activeTabID: tab.id });

    const persisted = JSON.parse(
      localStorage.getItem(workspaceStorageKey) ?? "{}",
    );
    expect(persisted.state.tabs[0].headers[0]).toMatchObject({
      enabled: true,
      value: "Bearer {{token}}",
    });
    expect(persisted.state.tabs[0].headers[1]).toMatchObject({
      enabled: false,
      value: "",
    });
  });

  it("clears transient state while migrating an older workspace", async () => {
    const staleTab = createRequestTab({
      id: "stale-tab",
      running: true,
      error: true,
    });
    localStorage.setItem(
      workspaceStorageKey,
      JSON.stringify({
        version: 0,
        state: {
          tabs: [staleTab],
          activeTabID: staleTab.id,
          recentlyClosed: [],
          environmentVariables: {},
        },
      }),
    );

    await useWorkspaceStore.persist.rehydrate();
    const hydrated = useWorkspaceStore.getState().tabs[0];
    expect(hydrated.running).toBe(false);
    expect(hydrated.error).toBe(false);
    expect(hydrated.userError).toBeUndefined();
  });

  it("replaces only the untouched legacy demo request during migration", async () => {
    const legacyTab = createRequestTab({
      id: "request-list-users",
      name: "List users",
      url: "{{baseUrl}}/v1/users",
      body: '{\n  "name": "Ada Lovelace"\n}',
      dirty: false,
    });
    localStorage.setItem(
      workspaceStorageKey,
      JSON.stringify({
        version: 0,
        state: {
          activeEnvironmentID: "development",
          tabs: [legacyTab],
          activeTabID: legacyTab.id,
          recentlyClosed: [],
        },
      }),
    );

    await useWorkspaceStore.persist.rehydrate();
    const state = useWorkspaceStore.getState();
    expect(state.activeEnvironmentID).toBe("none");
    expect(state.tabs[0]).toMatchObject({
      id: "request-list-users",
      name: "Untitled request",
      url: "",
      body: "",
    });
  });

  it("moves a sanitized legacy workspace to the Validex storage key", () => {
    const legacyKey = "lazytest:workspace:sample-workspace";
    const legacyTab = createRequestTab({
      id: "legacy-tab",
      headers: [
        {
          id: "legacy-auth",
          enabled: true,
          key: "Authorization",
          value: "Bearer legacy-secret",
        },
      ],
    });
    localStorage.clear();
    localStorage.setItem(
      legacyKey,
      JSON.stringify({
        version: 2,
        state: {
          workspaceID: "sample-workspace",
          environmentVariables: {
            development: {
              baseUrl: "https://api.example.test",
              accessToken: "legacy-access-token",
              clientSecret: "legacy-client-secret",
            },
          },
          tabs: [legacyTab],
          recentlyClosed: [],
        },
      }),
    );

    migrateLegacyWorkspaceStorage(localStorage);

    const migrated = JSON.parse(
      localStorage.getItem(workspaceStorageKey) ?? "{}",
    );
    expect(migrated).toMatchObject({
      version: 2,
      state: {
        environmentVariables: {
          development: { baseUrl: "https://api.example.test" },
        },
      },
    });
    expect(migrated.state.tabs[0].headers[0]).toMatchObject({
      enabled: false,
      value: "",
    });
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });
});
