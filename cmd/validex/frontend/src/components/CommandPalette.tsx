import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  FilePlus2,
  FileJson2,
  LayoutPanelLeft,
  Moon,
  RotateCcw,
  Search,
  Sun,
  Waypoints,
} from "lucide-react";
import { toolWorkspaceDefinitions } from "../app/workspaceRegistry";
import { useTranslation } from "../i18n";
import { shortcutLabel } from "../lib/shortcuts";
import type { BootstrapData } from "../lib/types";
import { fuzzyMatch } from "../lib/utils";
import { Kbd } from "../shared/ui";
import { useWorkspaceStore } from "../stores/workspace";

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
  const t = useTranslation();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
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
        label: t("chrome.newRequest"),
        group: t("palette.group.create"),
        keywords: "request istek yeni",
        shortcut: shortcutLabel("N"),
        icon: FilePlus2,
        action: () =>
          openTab({
            name: t("chrome.untitledRequest"),
            url: "",
            dirty: true,
          }),
      },
      {
        id: "open-requests",
        label: t("palette.openRequests"),
        group: t("palette.group.navigate"),
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
              label: t("palette.openImportedAPIs"),
              group: t("palette.group.navigate"),
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
      ...toolWorkspaceDefinitions.map(
        (definition) =>
          ({
            id: `open-${definition.id}`,
            label: t("palette.openWorkspace", {
              workspace: t(definition.labelKey),
            }),
            group: t("palette.group.developerTools"),
            keywords: definition.keywords,
            icon: definition.icon,
            action: () => setActiveView(definition.id),
          }) satisfies CommandItem,
      ),
      {
        id: "toggle-theme",
        label:
          theme === "dark"
            ? t("palette.useLightTheme")
            : t("palette.useDarkTheme"),
        group: t("palette.group.appearance"),
        keywords: "theme dark light tema",
        icon: theme === "dark" ? Sun : Moon,
        action: () => setTheme(theme === "dark" ? "light" : "dark"),
      },
      {
        id: "toggle-sidebar",
        label: t("palette.toggleRequestPanel"),
        group: t("palette.group.appearance"),
        keywords: "sidebar panel layout",
        icon: LayoutPanelLeft,
        action: toggleLeft,
      },
      {
        id: "reset-layout",
        label: t("palette.resetPanelLayout"),
        group: t("palette.group.appearance"),
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
      t,
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

  useEffect(() => {
    setActiveIndex(0);
  }, [open, query]);

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
          <Dialog.Title className="sr-only">
            {t("palette.title")}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {t("palette.description")}
          </Dialog.Description>
          <div className="palette-search">
            <Search size={18} aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("palette.search", {
                workspace: bootstrap.workspaceName,
              })}
              aria-label={t("palette.searchAria")}
              role="combobox"
              aria-autocomplete="list"
              aria-controls="command-palette-results"
              aria-expanded={open}
              aria-activedescendant={
                filtered[activeIndex]
                  ? `command-option-${filtered[activeIndex].id}`
                  : undefined
              }
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && filtered.length > 0) {
                  event.preventDefault();
                  setActiveIndex((current) => (current + 1) % filtered.length);
                }
                if (event.key === "ArrowUp" && filtered.length > 0) {
                  event.preventDefault();
                  setActiveIndex(
                    (current) =>
                      (current - 1 + filtered.length) % filtered.length,
                  );
                }
                if (
                  event.key === "Enter" &&
                  filtered[activeIndex] !== undefined
                ) {
                  event.preventDefault();
                  void runCommand(filtered[activeIndex]);
                }
              }}
            />
            <Kbd>ESC</Kbd>
          </div>
          <div
            id="command-palette-results"
            className="palette-results"
            role="listbox"
            aria-label={t("palette.title")}
          >
            {filtered.length ? (
              filtered.map((command, index) => {
                const Icon = command.icon;
                return (
                  <button
                    id={`command-option-${command.id}`}
                    key={command.id}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === activeIndex}
                    className={index === activeIndex ? "active" : undefined}
                    onPointerMove={() => setActiveIndex(index)}
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
                {t("palette.noResult", { query })}
              </div>
            )}
          </div>
          <div className="palette-footer">
            <span>
              {t(
                filtered.length === 1
                  ? "palette.available.one"
                  : "palette.available.many",
                { count: filtered.length },
              )}
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
