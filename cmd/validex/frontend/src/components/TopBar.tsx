import { useMemo, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Braces,
  ChevronDown,
  Command,
  FilePlus2,
  Import,
  LayoutPanelLeft,
  LayoutPanelTop,
  Moon,
  PanelRight,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { useImportOpenAPI } from "../lib/queries";
import { importedRequestURL } from "../lib/openapi";
import type { BootstrapData, ThemePreference } from "../lib/types";
import { useWorkspaceStore } from "../stores/workspace";
import { Button, IconButton, Kbd } from "./ui";

function Logo() {
  return (
    <div className="brand" aria-label="Validex home">
      <span className="brand-mark">
        <Braces size={17} aria-hidden="true" />
      </span>
      <span>Validex</span>
    </div>
  );
}

function ThemeItem({
  value,
  active,
  icon,
}: {
  value: ThemePreference;
  active: boolean;
  icon: React.ReactNode;
}) {
  const setTheme = useWorkspaceStore((state) => state.setTheme);
  const labels: Record<ThemePreference, string> = {
    system: "Sistem teması",
    light: "Açık tema",
    dark: "Koyu tema",
  };
  return (
    <DropdownMenu.Item
      className="menu-item"
      onSelect={() => setTheme(value)}
    >
      {icon}
      <span>{labels[value]}</span>
      {active && <span className="menu-check">✓</span>}
    </DropdownMenu.Item>
  );
}

export function TopBar({ bootstrap }: { bootstrap: BootstrapData }) {
  const [importMessage, setImportMessage] = useState("");
  const environmentID = useWorkspaceStore((state) => state.activeEnvironmentID);
  const setEnvironment = useWorkspaceStore((state) => state.setEnvironment);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const setPaletteOpen = useWorkspaceStore(
    (state) => state.setCommandPaletteOpen,
  );
  const theme = useWorkspaceStore((state) => state.theme);
  const toggleLeft = useWorkspaceStore((state) => state.toggleLeft);
  const toggleRight = useWorkspaceStore((state) => state.toggleRight);
  const resetLayout = useWorkspaceStore((state) => state.resetLayout);
  const setResponsePlacement = useWorkspaceStore(
    (state) => state.setResponsePlacement,
  );
  const responsePlacement = useWorkspaceStore(
    (state) => state.responsePlacement,
  );
  const importer = useImportOpenAPI();

  const activeEnvironment = useMemo(
    () =>
      bootstrap.environments.find(
        (environment) => environment.id === environmentID,
      ) ?? bootstrap.environments[0],
    [bootstrap.environments, environmentID],
  );

  const importSpec = async () => {
    const result = await importer.mutateAsync();
    if (result.canceled) return;
    if (result.error) {
      setImportMessage(`${result.error.title}: ${result.error.message}`);
      return;
    }
    for (const endpoint of result.endpoints.slice(0, 6)) {
      openTab({
        id: endpoint.id,
        name: endpoint.summary || endpoint.path,
        method: endpoint.method,
        url: importedRequestURL(result.baseUrl, endpoint.path),
        dirty: false,
      });
    }
    setImportMessage(
      `${result.title || "OpenAPI"} · ${result.endpoints.length} endpoint içe aktarıldı`,
    );
  };

  return (
    <>
      <header className="topbar">
        <Logo />
        <div className="topbar-divider" />

        <div className="topbar-select" aria-label="Workspace">
          <span className="select-label">Workspace</span>
          <strong>{bootstrap.workspaceName}</strong>
        </div>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="environment-select">
              <span className="environment-indicator" />
              {activeEnvironment?.name ?? "Environment"}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" align="start" sideOffset={6}>
              <DropdownMenu.Label className="menu-label">
                ENVIRONMENT
              </DropdownMenu.Label>
              {bootstrap.environments.map((environment) => (
                <DropdownMenu.Item
                  key={environment.id}
                  className="menu-item"
                  onSelect={() => setEnvironment(environment.id)}
                >
                  <span className="environment-indicator" />
                  {environment.name}
                  {environment.id === environmentID && (
                    <span className="menu-check">✓</span>
                  )}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <button
          className="global-search"
          onClick={() => setPaletteOpen(true)}
          aria-label="Global arama ve command palette"
        >
          <Search size={15} aria-hidden="true" />
          <span>Search requests, APIs and commands…</span>
          <Kbd>⌘ K</Kbd>
        </button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="primary" className="new-button">
              <Plus size={15} aria-hidden="true" />
              New
              <ChevronDown size={13} aria-hidden="true" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" align="end" sideOffset={6}>
              <DropdownMenu.Item
                className="menu-item"
                onSelect={() =>
                  openTab({
                    name: "Untitled request",
                    url: "",
                    dirty: true,
                  })
                }
              >
                <FilePlus2 size={16} /> New request
                <span className="menu-shortcut">⌘N</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item className="menu-item" onSelect={importSpec}>
                <Import size={16} /> Import OpenAPI
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <IconButton label="Layout ve ayarlar">
              <Settings size={17} />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" align="end" sideOffset={6}>
              <DropdownMenu.Label className="menu-label">
                LAYOUT
              </DropdownMenu.Label>
              <DropdownMenu.Item className="menu-item" onSelect={toggleLeft}>
                <LayoutPanelLeft size={16} /> Toggle collection panel
              </DropdownMenu.Item>
              <DropdownMenu.Item className="menu-item" onSelect={toggleRight}>
                <PanelRight size={16} /> Toggle context panel
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="menu-item"
                onSelect={() =>
                  setResponsePlacement(
                    responsePlacement === "vertical" ? "horizontal" : "vertical",
                  )
                }
              >
                <LayoutPanelTop size={16} /> Response:{" "}
                {responsePlacement === "vertical" ? "bottom" : "right"}
              </DropdownMenu.Item>
              <DropdownMenu.Item className="menu-item" onSelect={resetLayout}>
                <RotateCcw size={16} /> Reset layout
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="menu-separator" />
              <DropdownMenu.Label className="menu-label">
                APPEARANCE
              </DropdownMenu.Label>
              <ThemeItem
                value="system"
                active={theme === "system"}
                icon={<Command size={16} />}
              />
              <ThemeItem
                value="light"
                active={theme === "light"}
                icon={<Sun size={16} />}
              />
              <ThemeItem
                value="dark"
                active={theme === "dark"}
                icon={<Moon size={16} />}
              />
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>

      {importMessage && (
        <button
          className="toast"
          onClick={() => setImportMessage("")}
          aria-label="Bildirimi kapat"
        >
          <span>{importMessage}</span>
          <X size={14} />
        </button>
      )}

    </>
  );
}
