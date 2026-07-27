import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  HTTPMethod,
  RequestTab,
  ResponsePlacement,
  ThemePreference,
} from "../lib/types";

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

export function createRequestTab(
  overrides: Partial<RequestTab> = {},
): RequestTab {
  const id = overrides.id ?? crypto.randomUUID();
  return {
    id,
    name: "List users",
    method: "GET",
    url: "{{baseUrl}}/v1/users",
    body: `{
  "name": "Ada Lovelace",
  "email": "ada@example.com"
}`,
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

const firstTab = createRequestTab({ id: "request-list-users" });

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaceID: "sample-workspace",
      activeEnvironmentID: "development",
      tabs: [firstTab],
      activeTabID: firstTab.id,
      recentlyClosed: [],
      leftVisible: true,
      rightVisible: true,
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
        if (!tab || (tab.dirty && !force)) return false;
        const index = state.tabs.findIndex((candidate) => candidate.id === id);
        const tabs = state.tabs.filter((candidate) => candidate.id !== id);
        const fallback = tabs[Math.min(index, tabs.length - 1)];
        set({
          tabs,
          activeTabID:
            state.activeTabID === id ? (fallback?.id ?? "") : state.activeTabID,
          recentlyClosed: [tab, ...state.recentlyClosed].slice(0, 10),
        });
        return true;
      },
      closeOtherTabs: (id) =>
        set((state) => ({
          tabs: state.tabs.filter((tab) => tab.id === id || tab.pinned),
          activeTabID: id,
        })),
      closeTabsToRight: (id) =>
        set((state) => {
          const index = state.tabs.findIndex((tab) => tab.id === id);
          return {
            tabs: state.tabs.filter(
              (tab, tabIndex) => tabIndex <= index || tab.pinned,
            ),
          };
        }),
      reopenClosedTab: () =>
        set((state) => {
          const [tab, ...rest] = state.recentlyClosed;
          if (!tab) return state;
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
      name: "lazytest:workspace:sample-workspace",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        workspaceID: state.workspaceID,
        activeEnvironmentID: state.activeEnvironmentID,
        tabs: state.tabs.map((tab) => ({
          ...tab,
          running: false,
          response: undefined,
          userError: undefined,
        })),
        activeTabID: state.activeTabID,
        recentlyClosed: state.recentlyClosed,
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
