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
      latestImportedSpec: undefined,
      sidebarSection: "requests",
    });
  });

  it("creates new requests without automatic headers", () => {
    expect(createRequestTab({ id: "empty-headers" }).headers).toEqual([]);
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

  it("removes only exact legacy default headers during migration", async () => {
    const legacyTab = createRequestTab({
      id: "legacy-default-headers",
      headers: [
        {
          id: "header-accept",
          enabled: true,
          key: "Accept",
          value: "application/json",
          source: "Generated",
        },
        {
          id: "header-auth",
          enabled: false,
          key: "Authorization",
          value: "Bearer {{token}}",
          source: "Environment",
        },
        {
          id: "manual-accept",
          enabled: true,
          key: "Accept",
          value: "application/json",
          source: "Manual",
        },
        {
          id: "header-accept",
          enabled: true,
          key: "Accept",
          value: "text/plain",
          source: "Generated",
        },
        {
          id: "header-auth",
          enabled: true,
          key: "Authorization",
          value: "Bearer {{token}}",
          source: "Environment",
        },
      ],
    });
    localStorage.setItem(
      workspaceStorageKey,
      JSON.stringify({
        version: 6,
        state: {
          tabs: [legacyTab],
          activeTabID: legacyTab.id,
          recentlyClosed: [legacyTab],
          environmentVariables: {},
        },
      }),
    );

    await useWorkspaceStore.persist.rehydrate();

    expect(
      useWorkspaceStore.getState().tabs[0].headers.map((header) => ({
        id: header.id,
        enabled: header.enabled,
        value: header.value,
        source: header.source,
      })),
    ).toEqual([
      {
        id: "manual-accept",
        enabled: true,
        value: "application/json",
        source: "Manual",
      },
      {
        id: "header-accept",
        enabled: true,
        value: "text/plain",
        source: "Generated",
      },
      {
        id: "header-auth",
        enabled: true,
        value: "Bearer {{token}}",
        source: "Environment",
      },
    ]);
    expect(useWorkspaceStore.getState().recentlyClosed[0].headers).toHaveLength(
      3,
    );
  });

  it("opens the welcome screen for an untouched legacy demo", async () => {
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
    expect(state.tabs).toEqual([]);
    expect(state.activeTabID).toBe("");
    expect(state.leftVisible).toBe(false);
    expect(state.rightVisible).toBe(false);
  });

  it("keeps dirty tabs safe during bulk close operations", () => {
    const active = createRequestTab({ id: "active" });
    const clean = createRequestTab({ id: "clean" });
    const dirty = createRequestTab({ id: "dirty", dirty: true });
    useWorkspaceStore.setState({
      tabs: [active, clean, dirty],
      activeTabID: active.id,
      recentlyClosed: [],
    });

    useWorkspaceStore.getState().closeOtherTabs(active.id);

    expect(useWorkspaceStore.getState().tabs.map((tab) => tab.id)).toEqual([
      "active",
      "dirty",
    ]);
    expect(useWorkspaceStore.getState().recentlyClosed[0].id).toBe("clean");
  });

  it("keeps running tabs safe during every close operation", () => {
    const target = createRequestTab({ id: "target" });
    const running = createRequestTab({ id: "running", running: true });
    useWorkspaceStore.setState({
      tabs: [target, running],
      activeTabID: running.id,
      recentlyClosed: [],
    });

    expect(useWorkspaceStore.getState().closeTab(running.id, true)).toBe(false);
    useWorkspaceStore.getState().closeTabsToRight(target.id);

    const state = useWorkspaceStore.getState();
    expect(state.tabs.map((tab) => tab.id)).toEqual(["target", "running"]);
    expect(state.activeTabID).toBe("running");
    expect(state.recentlyClosed).toEqual([]);
  });

  it("falls back to the target tab when closing the active tabs to its right", () => {
    const target = createRequestTab({ id: "target" });
    const middle = createRequestTab({ id: "middle" });
    const active = createRequestTab({ id: "active" });
    useWorkspaceStore.setState({
      tabs: [target, middle, active],
      activeTabID: active.id,
      recentlyClosed: [],
    });

    useWorkspaceStore.getState().closeTabsToRight(target.id);

    const state = useWorkspaceStore.getState();
    expect(state.tabs.map((tab) => tab.id)).toEqual(["target"]);
    expect(state.activeTabID).toBe("target");
    expect(state.recentlyClosed.map((tab) => tab.id)).toEqual([
      "active",
      "middle",
    ]);
  });

  it("focuses an existing tab instead of reopening a duplicate ID", () => {
    const existing = createRequestTab({
      id: "shared-id",
      url: "https://example.test/current",
    });
    const closed = createRequestTab({
      id: "shared-id",
      url: "https://example.test/closed",
    });
    useWorkspaceStore.setState({
      tabs: [existing],
      activeTabID: "",
      recentlyClosed: [closed],
    });

    useWorkspaceStore.getState().reopenClosedTab();

    const state = useWorkspaceStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].url).toBe("https://example.test/current");
    expect(state.activeTabID).toBe(existing.id);
    expect(state.recentlyClosed).toEqual([]);
  });

  it("clears transient request state when duplicating a tab", () => {
    const running = createRequestTab({
      id: "running",
      running: true,
      error: true,
      userError: {
        code: "network_error",
        title: "Request failed",
        message: "Temporary failure",
      },
      responseSection: "raw",
      response: {
        requestId: "completed-request",
        statusCode: 200,
        status: "OK",
        durationMs: 10,
        sizeBytes: 2,
        contentType: "application/json",
        protocol: "HTTP/1.1",
        remoteAddr: "127.0.0.1",
        tls: "",
        traceId: "trace-stale",
        headers: {},
        cookies: [],
        body: "{}",
        rawBody: "{}",
        timeline: [],
        resolvedUrl: "https://example.test",
      },
    });
    useWorkspaceStore.setState({
      tabs: [running],
      activeTabID: running.id,
    });

    useWorkspaceStore.getState().duplicateTab(running.id);

    const duplicate = useWorkspaceStore.getState().tabs[1];
    expect(duplicate.id).not.toBe(running.id);
    expect(duplicate).toMatchObject({
      name: "Untitled request copy",
      running: false,
      error: false,
      pinned: false,
    });
    expect(duplicate.userError).toBeUndefined();
    expect(duplicate.response).toBeUndefined();
    expect(duplicate.responseSection).toBe("body");
  });

  it("keeps the latest imported API transient", () => {
    useWorkspaceStore.getState().setImportedSpec({
      specId: "orders",
      path: "/tmp/orders.yaml",
      title: "Orders API",
      version: "1.0.0",
      baseUrl: "/api/v1",
      endpoints: [
        {
          id: "get-order",
          method: "GET",
          path: "/orders/{id}",
          summary: "Get order",
          tags: ["orders"],
        },
      ],
      canceled: false,
    });

    const state = useWorkspaceStore.getState();
    expect(state.latestImportedSpec?.endpoints).toHaveLength(1);
    expect(state.sidebarSection).toBe("apis");
    expect(state.leftVisible).toBe(true);
    const persisted = JSON.parse(
      localStorage.getItem(workspaceStorageKey) ?? "{}",
    );
    expect(persisted.state.latestImportedSpec).toBeUndefined();
    expect(persisted.state.sidebarSection).toBeUndefined();
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
