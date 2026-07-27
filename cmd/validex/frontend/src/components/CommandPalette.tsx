import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  Braces,
  FilePlus2,
  FileJson2,
  LayoutPanelLeft,
  Moon,
  RadioTower,
  RotateCcw,
  Search,
  ServerCog,
  Sun,
  Waypoints,
} from "lucide-react";
import type { BootstrapData } from "../lib/types";
import { fuzzyMatch } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";
import { Kbd } from "./ui";

interface CommandItem {
  id: string;
  label: string;
  group: string;
  keywords: string;
  shortcut?: string;
  icon: React.ComponentType<{ size?: number }>;
  action: () => void | Promise<void>;
}

export function CommandPalette({ bootstrap }: { bootstrap: BootstrapData }) {
  const [query, setQuery] = useState("");
  const open = useWorkspaceStore((state) => state.commandPaletteOpen);
  const setOpen = useWorkspaceStore((state) => state.setCommandPaletteOpen);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const resetLayout = useWorkspaceStore((state) => state.resetLayout);
  const toggleLeft = useWorkspaceStore((state) => state.toggleLeft);
  const theme = useWorkspaceStore((state) => state.theme);
  const setTheme = useWorkspaceStore((state) => state.setTheme);
  const setSidebarSection = useWorkspaceStore((state) => state.setSidebarSection);
  const setActiveView = useWorkspaceStore((state) => state.setActiveView);
  const leftVisible = useWorkspaceStore((state) => state.leftVisible);
  const importedSpec = useWorkspaceStore((state) => state.latestImportedSpec);

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        id: "new-request",
        label: "New request",
        group: "Create",
        keywords: "request istek yeni",
        shortcut: "⌘ N",
        icon: FilePlus2,
        action: () =>
          openTab({ name: "Untitled request", url: "", dirty: true }),
      },
      {
        id: "open-requests",
        label: "Open requests",
        group: "Navigate",
        keywords: "request istek sidebar",
        icon: FileJson2,
        action: () => {
          setActiveView("requests");
          setSidebarSection("requests");
          if (!leftVisible) toggleLeft();
        },
      },
      ...(importedSpec
        ? [
            {
              id: "open-imported-apis",
              label: "Open imported APIs",
              group: "Navigate",
              keywords: "openapi endpoints api sidebar",
              icon: Waypoints,
              action: () => {
                setActiveView("requests");
                setSidebarSection("apis");
                if (!leftVisible) toggleLeft();
              },
            } satisfies CommandItem,
          ]
        : []),
      {
        id: "open-mock-server",
        label: "Open Mock Server",
        group: "Developer Tools",
        keywords: "mock server openapi response",
        icon: ServerCog,
        action: () => setActiveView("mock"),
      },
      {
        id: "open-json-lab",
        label: "Open JSON Lab",
        group: "Developer Tools",
        keywords: "json format diff path schema",
        icon: Braces,
        action: () => setActiveView("json"),
      },
      {
        id: "open-diagnostics",
        label: "Open Diagnostics",
        group: "Developer Tools",
        keywords: "spring actuator jwt trace thread coverage environment",
        icon: Activity,
        action: () => setActiveView("diagnostics"),
      },
      {
        id: "open-protocols",
        label: "Open Protocols",
        group: "Developer Tools",
        keywords: "sse websocket grpc",
        icon: RadioTower,
        action: () => setActiveView("protocols"),
      },
      {
        id: "toggle-theme",
        label: theme === "dark" ? "Use light theme" : "Use dark theme",
        group: "Appearance",
        keywords: "theme dark light tema",
        icon: theme === "dark" ? Sun : Moon,
        action: () => setTheme(theme === "dark" ? "light" : "dark"),
      },
      {
        id: "toggle-sidebar",
        label: "Toggle request panel",
        group: "Appearance",
        keywords: "sidebar panel layout",
        icon: LayoutPanelLeft,
        action: toggleLeft,
      },
      {
        id: "reset-layout",
        label: "Reset panel layout",
        group: "Appearance",
        keywords: "panel reset default layout",
        icon: RotateCcw,
        action: resetLayout,
      },
    ],
    [
      openTab,
      importedSpec,
      leftVisible,
      resetLayout,
      setActiveView,
      setSidebarSection,
      setTheme,
      theme,
      toggleLeft,
    ],
  );

  const filtered = commands.filter((command) =>
    fuzzyMatch(
      `${command.label} ${command.group} ${command.keywords}`,
      query,
    ),
  );

  const runCommand = async (command: CommandItem) => {
    setOpen(false);
    setQuery("");
    await command.action();
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay palette-overlay" />
        <Dialog.Content className="command-palette">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">
            Uygulama komutlarını fuzzy search ile bulun.
          </Dialog.Description>
          <div className="palette-search">
            <Search size={18} aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${bootstrap.workspaceName} commands…`}
              aria-label="Command palette ara"
            />
            <Kbd>ESC</Kbd>
          </div>
          <div className="palette-results">
            {filtered.length ? (
              filtered.map((command) => {
                const Icon = command.icon;
                return (
                  <button
                    key={command.id}
                    onClick={() => void runCommand(command)}
                  >
                    <span className="palette-icon">
                      <Icon size={16} />
                    </span>
                    <span>
                      <strong>{command.label}</strong>
                      <small>{command.group}</small>
                    </span>
                    {command.shortcut && <Kbd>{command.shortcut}</Kbd>}
                  </button>
                );
              })
            ) : (
              <div className="palette-empty">
                “{query}” için eşleşen komut bulunamadı.
              </div>
            )}
          </div>
          <div className="palette-footer">
            <span>{filtered.length} available commands</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
