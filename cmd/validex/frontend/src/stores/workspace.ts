import {
  createPersistedStore,
  localStorageStateStorage,
} from "../core/store.js";
import type {
  HTTPMethod,
  ImportSpecResult,
  ImportedEndpoint,
  RequestTab,
  ResponsePlacement,
  ThemePreference,
  WorkspaceView,
} from "../lib/types.js";
import {
  isSecretKey,
  isSafeSecretReference,
} from "../lib/secrets.js";
import { responseSizeDefault } from "../features/requests/model/responseLayout.js";

export const workspaceStorageKey = "validex:workspace:validex-workspace";
export const workspaceStorageVersion = 9;

const previousResponseSizeDefault = 36;

const legacyWorkspaceStorageKeys = [
  "validex:workspace:sample-workspace",
  "lazytest:workspace:sample-workspace",
];

function sanitizePersistedWorkspace(rawWorkspace: string): string | undefined {
  try {
    const persisted = JSON.parse(rawWorkspace) as {
      state?: Partial<WorkspaceState>;
      version?: number;
    };
    if (
      !persisted ||
      typeof persisted !== "object" ||
      !persisted.state ||
      typeof persisted.state !== "object"
    ) {
      return undefined;
    }

    const state = persisted.state;
    const tabs = persistedTabs(state.tabs);
    const recentlyClosed = persistedTabs(state.recentlyClosed);
    return JSON.stringify({
      ...persisted,
      state: {
        ...state,
        environmentVariables: withoutSecretVariables(
          state.environmentVariables ?? {},
        ),
        tabs,
        activeTabID: persistedActiveTabID(state.activeTabID, tabs),
        recentlyClosed,
      },
    });
  } catch {
    return undefined;
  }
}

function removeLegacyWorkspaceStorage(storage: Storage): void {
  for (const legacyKey of legacyWorkspaceStorageKeys) {
    storage.removeItem(legacyKey);
  }
}

export function migrateLegacyWorkspaceStorage(storage: Storage): void {
  const currentWorkspace = storage.getItem(workspaceStorageKey);
  if (currentWorkspace !== null) {
    const sanitizedWorkspace = sanitizePersistedWorkspace(currentWorkspace);
    if (sanitizedWorkspace === undefined) return;
    storage.setItem(workspaceStorageKey, sanitizedWorkspace);
    if (storage.getItem(workspaceStorageKey) !== sanitizedWorkspace) return;
    removeLegacyWorkspaceStorage(storage);
    return;
  }

  for (const legacyKey of legacyWorkspaceStorageKeys) {
    const legacyWorkspace = storage.getItem(legacyKey);
    if (legacyWorkspace === null) continue;
    const sanitizedWorkspace = sanitizePersistedWorkspace(legacyWorkspace);
    if (sanitizedWorkspace === undefined) continue;
    storage.setItem(workspaceStorageKey, sanitizedWorkspace);
    if (storage.getItem(workspaceStorageKey) !== sanitizedWorkspace) return;
    removeLegacyWorkspaceStorage(storage);
    return;
  }
}

if (typeof localStorage !== "undefined") {
  migrateLegacyWorkspaceStorage(localStorage);
}

function withoutSecretVariables(
  environments: Record<string, Record<string, string>>,
) {
  return Object.fromEntries(
    Object.entries(environments).map(([environmentID, variables]) => [
      environmentID,
      Object.fromEntries(
        Object.entries(variables).filter(([key]) => !isSecretKey(key)),
      ),
    ]),
  );
}

function isLegacyDefaultHeader(
  header: RequestTab["headers"][number],
): boolean {
  return (
    (header.id === "header-accept" &&
      header.enabled === true &&
      header.key === "Accept" &&
      header.value === "application/json" &&
      header.source === "Generated") ||
    (header.id === "header-auth" &&
      header.enabled === false &&
      header.key === "Authorization" &&
      header.value === "Bearer {{token}}" &&
      header.source === "Environment")
  );
}

function persistedTab(tab: RequestTab): RequestTab {
  const requestSection = [
    "params",
    "headers",
    "body",
    "variables",
  ].includes(tab.requestSection)
    ? tab.requestSection
    : "params";
  const responseSection = [
    "body",
    "headers",
    "cookies",
    "timeline",
    "contract",
    "raw",
  ].includes(tab.responseSection)
    ? tab.responseSection
    : "body";
  const persisted: RequestTab = {
    ...tab,
    running: false,
    error: false,
    response: undefined,
    userError: undefined,
    openApi: undefined,
    requestSection,
    responseSection,
    headers: (tab.headers ?? [])
      .filter((header) => !isLegacyDefaultHeader(header))
      .map((header) => {
        if (!isSecretKey(header.key) || isSafeSecretReference(header.value)) {
          return header;
        }
        return { ...header, enabled: false, value: "" };
      }),
  };
  delete persisted.sessionOnly;
  return persisted;
}

function persistedTabs(value: unknown): RequestTab[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (tab): tab is RequestTab =>
        typeof tab === "object" &&
        tab !== null &&
        (tab as Partial<RequestTab>).sessionOnly !== true,
    )
    .map(persistedTab);
}

function persistedActiveTabID(
  activeTabID: unknown,
  tabs: readonly RequestTab[],
): string {
  return typeof activeTabID === "string" &&
    tabs.some((tab) => tab.id === activeTabID)
    ? activeTabID
    : (tabs[0]?.id ?? "");
}

export function createRequestTab(
  overrides: Partial<RequestTab> = {},
): RequestTab {
  const id = overrides.id ?? crypto.randomUUID();
  return {
    id,
    name: "Untitled request",
    method: "GET",
    url: "",
    body: "",
    headers: [],
    dirty: false,
    running: false,
    error: false,
    pinned: false,
    requestSection: "params",
    responseSection: "body",
    ...overrides,
  };
}

export interface ImportedSpecWorkspace {
  specId: string;
  title: string;
  baseUrl: string;
  endpoints: ImportedEndpoint[];
}

export interface SavedRequestLink {
  id: string;
  collectionId: string;
  literalValues?: boolean;
  name: string;
  method: HTTPMethod;
  url: string;
  headers: RequestTab["headers"];
  body: string;
}

export interface WorkspaceState {
  workspaceID: string;
  activeEnvironmentID: string;
  environmentVariables: Record<string, Record<string, string>>;
  tabs: RequestTab[];
  activeTabID: string;
  recentlyClosed: RequestTab[];
  leftVisible: boolean;
  rightVisible: boolean;
  leftWidth: number;
  rightWidth: number;
  responseSize: number;
  responsePlacement: ResponsePlacement;
  activeView: WorkspaceView;
  theme: ThemePreference;
  commandPaletteOpen: boolean;
  sidebarSection: "requests" | "apis";
  latestImportedSpec?: ImportedSpecWorkspace;
  setEnvironment: (id: string) => void;
  setEnvironmentVariable: (
    environmentID: string,
    key: string,
    value: string,
  ) => void;
  removeEnvironmentVariable: (environmentID: string, key: string) => void;
  setActiveTab: (id: string) => void;
  openTab: (tab?: Partial<RequestTab>) => void;
  closeTab: (id: string, force?: boolean) => boolean;
  closeOtherTabs: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  reopenClosedTab: () => void;
  duplicateTab: (id: string, name: string) => void;
  reorderTab: (fromID: string, toID: string) => void;
  updateTab: (id: string, patch: Partial<RequestTab>) => void;
  setMethod: (id: string, method: HTTPMethod) => void;
  togglePin: (id: string) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  setResponseSize: (size: number) => void;
  setResponsePlacement: (placement: ResponsePlacement) => void;
  setActiveView: (view: WorkspaceView) => void;
  resetLayout: () => void;
  setTheme: (theme: ThemePreference) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSidebarSection: (section: WorkspaceState["sidebarSection"]) => void;
  setImportedSpec: (result: ImportSpecResult) => void;
  reconcileSavedRequestLinks: (links: SavedRequestLink[]) => void;
}

export function createPersistedWorkspaceState(state: WorkspaceState) {
  const tabs = persistedTabs(state.tabs);
  const recentlyClosed = persistedTabs(state.recentlyClosed);
  return {
    workspaceID: state.workspaceID,
    activeEnvironmentID: state.activeEnvironmentID,
    environmentVariables: withoutSecretVariables(
      state.environmentVariables,
    ),
    tabs,
    activeTabID: persistedActiveTabID(state.activeTabID, tabs),
    recentlyClosed,
    leftVisible: state.leftVisible,
    rightVisible: state.rightVisible,
    leftWidth: state.leftWidth,
    rightWidth: state.rightWidth,
    responseSize: state.responseSize,
    responsePlacement: state.responsePlacement,
    activeView: state.activeView,
    theme: state.theme,
  };
}

function reconcileTabWithSavedRequests(
  tab: RequestTab,
  links: ReadonlyMap<string, SavedRequestLink>,
): RequestTab {
  if (!tab.savedRequestId) return tab;
  const link = links.get(tab.savedRequestId);
  if (!link) {
    return {
      ...tab,
      savedRequestId: undefined,
      collectionId: undefined,
      dirty: true,
    };
  }
  const linkedFields = tab.dirty
    ? {
        name: link.name,
        method: tab.method,
        url: tab.url,
        body: tab.body,
        literalValues: tab.literalValues,
      }
    : {
        name: link.name,
        method: link.method,
        url: link.url,
        body: link.body,
        literalValues: link.literalValues,
      };
  const headersChanged =
    !tab.dirty &&
    JSON.stringify(tab.headers) !== JSON.stringify(link.headers);
  const requestDefinitionChanged =
    !tab.dirty &&
    (tab.method !== link.method ||
      tab.url !== link.url ||
      tab.body !== link.body ||
      Boolean(tab.literalValues) !== Boolean(link.literalValues) ||
      headersChanged);
  if (
    tab.collectionId === link.collectionId &&
    tab.name === linkedFields.name &&
    tab.method === linkedFields.method &&
    tab.url === linkedFields.url &&
    tab.body === linkedFields.body &&
    Boolean(tab.literalValues) === Boolean(linkedFields.literalValues) &&
    !headersChanged
  ) {
    return tab;
  }
  return {
    ...tab,
    collectionId: link.collectionId,
    ...linkedFields,
    headers: headersChanged
      ? link.headers.map((header) => ({ ...header }))
      : tab.headers,
    response: requestDefinitionChanged ? undefined : tab.response,
    error: requestDefinitionChanged ? false : tab.error,
    userError: requestDefinitionChanged
      ? undefined
      : tab.userError,
  };
}

function isUntouchedLegacyDemoRequest(tabs: RequestTab[] | undefined): boolean {
  if (tabs?.length !== 1) return false;
  const [tab] = tabs;
  return (
    tab.id === "request-list-users" &&
    tab.name === "List users" &&
    tab.url === "{{baseUrl}}/v1/users" &&
    tab.body.includes("Ada Lovelace") &&
    !tab.dirty
  );
}

function isUntouchedStarterRequest(tabs: RequestTab[] | undefined): boolean {
  if (tabs?.length !== 1) return false;
  const [tab] = tabs;
  return (
    tab.id === "request-list-users" &&
    tab.name === "Untitled request" &&
    tab.url === "" &&
    tab.body === "" &&
    !tab.dirty &&
    !tab.response
  );
}

export const workspaceStore = createPersistedStore<WorkspaceState>(
  (set, get) => ({
      workspaceID: "validex-workspace",
      activeEnvironmentID: "none",
      environmentVariables: {},
      tabs: [],
      activeTabID: "",
      recentlyClosed: [],
      leftVisible: true,
      rightVisible: false,
      leftWidth: 264,
      rightWidth: 292,
      responseSize: responseSizeDefault,
      responsePlacement: "horizontal",
      activeView: "requests",
      theme: "system",
      commandPaletteOpen: false,
      sidebarSection: "requests",
      latestImportedSpec: undefined,
      setEnvironment: (id) => set({ activeEnvironmentID: id }),
      setEnvironmentVariable: (environmentID, key, value) =>
        set((state) => ({
          environmentVariables: {
            ...state.environmentVariables,
            [environmentID]: {
              ...(state.environmentVariables[environmentID] ?? {}),
              [key]: value,
            },
          },
          tabs: state.tabs.map((tab) => ({
            ...tab,
            error: false,
            userError: undefined,
          })),
        })),
      removeEnvironmentVariable: (environmentID, key) =>
        set((state) => {
          const current = {
            ...(state.environmentVariables[environmentID] ?? {}),
          };
          delete current[key];
          const environmentVariables = { ...state.environmentVariables };
          if (Object.keys(current).length > 0) {
            environmentVariables[environmentID] = current;
          } else {
            delete environmentVariables[environmentID];
          }
          return {
            environmentVariables,
            tabs: state.tabs.map((tab) => ({
              ...tab,
              error: false,
              userError: undefined,
            })),
          };
        }),
      setActiveTab: (id) => set({ activeTabID: id, activeView: "requests" }),
      openTab: (tab = {}) =>
        set((state) => {
          if (tab.savedRequestId) {
            const existingSavedRequest = state.tabs.find(
              (candidate) =>
                candidate.savedRequestId === tab.savedRequestId,
            );
            if (existingSavedRequest) {
              return {
                activeTabID: existingSavedRequest.id,
                activeView: "requests",
              };
            }
          }
          if (tab.id) {
            const existing = state.tabs.find((candidate) => candidate.id === tab.id);
            if (existing) {
              return { activeTabID: existing.id, activeView: "requests" };
            }
          }
          const next = createRequestTab(tab);
          return {
            tabs: [...state.tabs, next],
            activeTabID: next.id,
            activeView: "requests",
          };
        }),
      closeTab: (id, force = false) => {
        const state = get();
        const tab = state.tabs.find((candidate) => candidate.id === id);
        if (!tab || tab.running || (tab.dirty && !force)) return false;
        const index = state.tabs.findIndex((candidate) => candidate.id === id);
        const tabs = state.tabs.filter((candidate) => candidate.id !== id);
        const fallback = tabs[Math.min(index, tabs.length - 1)];
        const closedTab = {
          ...tab,
          running: false,
          error: false,
          userError: undefined,
        };
        set({
          tabs,
          activeTabID:
            state.activeTabID === id ? (fallback?.id ?? "") : state.activeTabID,
          recentlyClosed: [closedTab, ...state.recentlyClosed].slice(0, 10),
        });
        return true;
      },
      closeOtherTabs: (id) =>
        set((state) => {
          const closing = state.tabs.filter(
            (tab) =>
              tab.id !== id && !tab.pinned && !tab.dirty && !tab.running,
          );
          return {
            tabs: state.tabs.filter(
              (tab) => tab.id === id || tab.pinned || tab.dirty || tab.running,
            ),
            activeTabID: id,
            recentlyClosed: [
              ...closing.reverse(),
              ...state.recentlyClosed,
            ].slice(0, 10),
          };
        }),
      closeTabsToRight: (id) =>
        set((state) => {
          const index = state.tabs.findIndex((tab) => tab.id === id);
          if (index < 0) return state;
          const closing = state.tabs.filter(
            (tab, tabIndex) =>
              tabIndex > index && !tab.pinned && !tab.dirty && !tab.running,
          );
          return {
            tabs: state.tabs.filter(
              (tab, tabIndex) =>
                tabIndex <= index || tab.pinned || tab.dirty || tab.running,
            ),
            recentlyClosed: [
              ...closing.reverse(),
              ...state.recentlyClosed,
            ].slice(0, 10),
            activeTabID: closing.some(
              (tab) => tab.id === state.activeTabID,
            )
              ? id
              : state.activeTabID,
          };
        }),
      reopenClosedTab: () =>
        set((state) => {
          const [tab, ...rest] = state.recentlyClosed;
          if (!tab) return state;
          const existing = state.tabs.find(
            (candidate) =>
              candidate.id === tab.id ||
              (tab.savedRequestId &&
                candidate.savedRequestId === tab.savedRequestId),
          );
          if (existing) {
            return {
              activeTabID: existing.id,
              recentlyClosed: rest,
              activeView: "requests",
            };
          }
          return {
            tabs: [...state.tabs, tab],
            activeTabID: tab.id,
            recentlyClosed: rest,
            activeView: "requests",
          };
        }),
      duplicateTab: (id, name) => {
        const tab = get().tabs.find((candidate) => candidate.id === id);
        if (tab)
          get().openTab({
            ...tab,
            id: crypto.randomUUID(),
            savedRequestId: undefined,
            collectionId: undefined,
            name,
            running: false,
            error: false,
            userError: undefined,
            response: undefined,
            responseSection: "body",
            pinned: false,
          });
      },
      reorderTab: (fromID, toID) =>
        set((state) => {
          const from = state.tabs.findIndex((tab) => tab.id === fromID);
          const to = state.tabs.findIndex((tab) => tab.id === toID);
          if (from < 0 || to < 0 || from === to) return state;
          const tabs = [...state.tabs];
          const [moved] = tabs.splice(from, 1);
          tabs.splice(to, 0, moved);
          return { tabs };
        }),
      updateTab: (id, patch) =>
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === id ? { ...tab, ...patch } : tab,
          ),
        })),
      setMethod: (id, method) => get().updateTab(id, { method, dirty: true }),
      togglePin: (id) =>
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === id ? { ...tab, pinned: !tab.pinned } : tab,
          ),
        })),
      toggleLeft: () => set((state) => ({ leftVisible: !state.leftVisible })),
      toggleRight: () => set((state) => ({ rightVisible: !state.rightVisible })),
      setLeftWidth: (leftWidth) => set({ leftWidth }),
      setRightWidth: (rightWidth) => set({ rightWidth }),
      setResponseSize: (responseSize) => set({ responseSize }),
      setResponsePlacement: (responsePlacement) => set({ responsePlacement }),
      setActiveView: (activeView) => set({ activeView }),
      resetLayout: () =>
        set({
          leftVisible: true,
          rightVisible: false,
          leftWidth: 264,
          rightWidth: 292,
          responseSize: responseSizeDefault,
          responsePlacement: "horizontal",
        }),
      setTheme: (theme) => set({ theme }),
      setCommandPaletteOpen: (commandPaletteOpen) =>
        set({ commandPaletteOpen }),
      setSidebarSection: (sidebarSection) => set({ sidebarSection }),
      setImportedSpec: (result) =>
        set({
          latestImportedSpec: {
            specId: result.specId,
            title: result.title,
            baseUrl: result.baseUrl,
            endpoints: result.endpoints,
          },
          sidebarSection: "apis",
          leftVisible: true,
          activeView: "requests",
        }),
      reconcileSavedRequestLinks: (links) =>
        set((state) => {
          const byID = new Map(links.map((link) => [link.id, link]));
          let changed = false;
          const reconcile = (tab: RequestTab) => {
            const next = reconcileTabWithSavedRequests(tab, byID);
            if (next !== tab) changed = true;
            return next;
          };
          const tabs = state.tabs.map(reconcile);
          const recentlyClosed = state.recentlyClosed.map(reconcile);
          return changed ? { tabs, recentlyClosed } : state;
        }),
    }),
  {
    name: workspaceStorageKey,
    version: workspaceStorageVersion,
    storage: localStorageStateStorage(),
    migrate: migratePersistedWorkspaceState,
    partialize: createPersistedWorkspaceState,
  },
);

export function migratePersistedWorkspaceState(
  persistedState: unknown,
  persistedVersion: number,
): Partial<WorkspaceState> {
  const state = persistedState as Partial<WorkspaceState>;
  const resetLegacyDemo =
    persistedVersion === 0 && isUntouchedLegacyDemoRequest(state.tabs);
  const resetBlankStarter =
    persistedVersion < 4 && isUntouchedStarterRequest(state.tabs);
  const resetToWelcome = resetLegacyDemo || resetBlankStarter;
  const adoptSpaciousResponseLayout =
    persistedVersion < 8 &&
    (state.responsePlacement === undefined ||
      state.responsePlacement === "vertical") &&
    (state.responseSize === undefined || state.responseSize === 32);
  const adoptBalancedResponseSize =
    persistedVersion < workspaceStorageVersion &&
    state.responseSize === previousResponseSizeDefault;
  const adoptSpaciousPanelLayout =
    adoptSpaciousResponseLayout &&
    state.leftVisible === true &&
    state.rightVisible === true;
  const tabs = resetToWelcome ? [] : persistedTabs(state.tabs);
  return {
    ...state,
    workspaceID: "validex-workspace",
    activeEnvironmentID: resetToWelcome
      ? "none"
      : (state.activeEnvironmentID ?? "none"),
    environmentVariables: withoutSecretVariables(
      state.environmentVariables ?? {},
    ),
    tabs,
    activeTabID: resetToWelcome
      ? ""
      : persistedActiveTabID(state.activeTabID, tabs),
    recentlyClosed: persistedTabs(state.recentlyClosed),
    activeView:
      state.activeView === "mock" ||
      state.activeView === "json" ||
      state.activeView === "diagnostics" ||
      state.activeView === "protocols" ||
      state.activeView === "automation"
        ? state.activeView
        : "requests",
    leftVisible: state.leftVisible ?? true,
    rightVisible: resetToWelcome
      ? false
      : adoptSpaciousPanelLayout
        ? false
        : (state.rightVisible ?? false),
    responseSize:
      adoptSpaciousResponseLayout || adoptBalancedResponseSize
        ? responseSizeDefault
        : (state.responseSize ?? responseSizeDefault),
    responsePlacement: adoptSpaciousResponseLayout
      ? "horizontal"
      : state.responsePlacement === "vertical" ||
          state.responsePlacement === "horizontal"
        ? state.responsePlacement
        : "horizontal",
    sidebarSection: "requests",
    latestImportedSpec: undefined,
  };
}
