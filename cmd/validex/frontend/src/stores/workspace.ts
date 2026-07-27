import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  HTTPMethod,
  RequestTab,
  ResponsePlacement,
  ThemePreference,
} from "../lib/types";
import {
  isSecretKey,
  isSafeSecretReference,
} from "../lib/secrets";

export const workspaceStorageKey = "validex:workspace:validex-workspace";

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
    return JSON.stringify({
      ...persisted,
      state: {
        ...state,
        environmentVariables: withoutSecretVariables(
          state.environmentVariables ?? {},
        ),
        tabs: Array.isArray(state.tabs)
          ? state.tabs.map(persistedTab)
          : state.tabs,
        recentlyClosed: Array.isArray(state.recentlyClosed)
          ? state.recentlyClosed.map(persistedTab)
          : state.recentlyClosed,
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

const defaultHeaders = [
  {
    id: "header-accept",
    enabled: true,
    key: "Accept",
    value: "application/json",
    description: "Beklenen response formatı",
    source: "Generated" as const,
  },
  {
    id: "header-auth",
    enabled: false,
    key: "Authorization",
    value: "Bearer {{token}}",
    description: "Development bearer token",
    source: "Environment" as const,
  },
];

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

function persistedTab(tab: RequestTab): RequestTab {
  const requestSection = [
    "params",
    "authorization",
    "headers",
    "body",
  ].includes(tab.requestSection)
    ? tab.requestSection
    : "params";
  const responseSection = [
    "body",
    "headers",
    "cookies",
    "timeline",
    "raw",
  ].includes(tab.responseSection)
    ? tab.responseSection
    : "body";
  return {
    ...tab,
    running: false,
    error: false,
    response: undefined,
    userError: undefined,
    requestSection,
    responseSection,
    headers: (tab.headers ?? []).map((header) => {
      if (!isSecretKey(header.key) || isSafeSecretReference(header.value)) {
        return header;
      }
      return { ...header, enabled: false, value: "" };
    }),
  };
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
    headers: defaultHeaders.map((header) => ({ ...header })),
    dirty: false,
    running: false,
    error: false,
    pinned: false,
    requestSection: "params",
    responseSection: "body",
    ...overrides,
  };
}

interface WorkspaceState {
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
  theme: ThemePreference;
  commandPaletteOpen: boolean;
  runnerOpen: boolean;
  codeGeneratorOpen: boolean;
  sidebarSection:
    | "collections"
    | "environments"
    | "apis"
    | "flows"
    | "history";
  setEnvironment: (id: string) => void;
  setEnvironmentVariable: (
    environmentID: string,
    key: string,
    value: string,
  ) => void;
  setActiveTab: (id: string) => void;
  openTab: (tab?: Partial<RequestTab>) => void;
  closeTab: (id: string, force?: boolean) => boolean;
  closeOtherTabs: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  reopenClosedTab: () => void;
  duplicateTab: (id: string) => void;
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
  resetLayout: () => void;
  setTheme: (theme: ThemePreference) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setRunnerOpen: (open: boolean) => void;
  setCodeGeneratorOpen: (open: boolean) => void;
  setSidebarSection: (section: WorkspaceState["sidebarSection"]) => void;
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

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaceID: "validex-workspace",
      activeEnvironmentID: "none",
      environmentVariables: {},
      tabs: [],
      activeTabID: "",
      recentlyClosed: [],
      leftVisible: false,
      rightVisible: false,
      leftWidth: 264,
      rightWidth: 292,
      responseSize: 42,
      responsePlacement: "vertical",
      theme: "system",
      commandPaletteOpen: false,
      runnerOpen: false,
      codeGeneratorOpen: false,
      sidebarSection: "collections",
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
      setActiveTab: (id) => set({ activeTabID: id }),
      openTab: (tab = {}) =>
        set((state) => {
          if (tab.id) {
            const existing = state.tabs.find((candidate) => candidate.id === tab.id);
            if (existing) return { activeTabID: existing.id };
          }
          const next = createRequestTab(tab);
          return { tabs: [...state.tabs, next], activeTabID: next.id };
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
            (candidate) => candidate.id === tab.id,
          );
          if (existing) {
            return {
              activeTabID: existing.id,
              recentlyClosed: rest,
            };
          }
          return {
            tabs: [...state.tabs, tab],
            activeTabID: tab.id,
            recentlyClosed: rest,
          };
        }),
      duplicateTab: (id) => {
        const tab = get().tabs.find((candidate) => candidate.id === id);
        if (tab)
          get().openTab({
            ...tab,
            id: crypto.randomUUID(),
            name: `${tab.name} copy`,
            running: false,
            error: false,
            userError: undefined,
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
      resetLayout: () =>
        set({
          leftVisible: true,
          rightVisible: true,
          leftWidth: 264,
          rightWidth: 292,
          responseSize: 42,
          responsePlacement: "vertical",
        }),
      setTheme: (theme) => set({ theme }),
      setCommandPaletteOpen: (commandPaletteOpen) =>
        set({ commandPaletteOpen }),
      setRunnerOpen: (runnerOpen) => set({ runnerOpen }),
      setCodeGeneratorOpen: (codeGeneratorOpen) =>
        set({ codeGeneratorOpen }),
      setSidebarSection: (sidebarSection) => set({ sidebarSection }),
    }),
    {
      name: workspaceStorageKey,
      version: 4,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState, persistedVersion) => {
        const state = persistedState as Partial<WorkspaceState>;
        const resetLegacyDemo =
          persistedVersion === 0 && isUntouchedLegacyDemoRequest(state.tabs);
        const resetBlankStarter =
          persistedVersion < 4 && isUntouchedStarterRequest(state.tabs);
        const resetToWelcome = resetLegacyDemo || resetBlankStarter;
        const tabs = resetToWelcome
          ? []
          : (state.tabs ?? []).map(persistedTab);
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
            : (state.activeTabID ?? tabs[0]?.id ?? ""),
          recentlyClosed: (state.recentlyClosed ?? []).map(persistedTab),
          leftVisible: resetToWelcome
            ? false
            : (state.leftVisible ?? true),
          rightVisible: resetToWelcome
            ? false
            : (state.rightVisible ?? false),
          sidebarSection:
            state.sidebarSection === "history" ? "history" : "collections",
        } as WorkspaceState;
      },
      partialize: (state) => ({
        workspaceID: state.workspaceID,
        activeEnvironmentID: state.activeEnvironmentID,
        environmentVariables: withoutSecretVariables(
          state.environmentVariables,
        ),
        tabs: state.tabs.map(persistedTab),
        activeTabID: state.activeTabID,
        recentlyClosed: state.recentlyClosed.map(persistedTab),
        leftVisible: state.leftVisible,
        rightVisible: state.rightVisible,
        leftWidth: state.leftWidth,
        rightWidth: state.rightWidth,
        responseSize: state.responseSize,
        responsePlacement: state.responsePlacement,
        theme: state.theme,
        sidebarSection: state.sidebarSection,
      }),
    },
  ),
);
