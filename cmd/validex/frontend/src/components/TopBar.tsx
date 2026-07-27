import { useMemo, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  AlertCircle,
  Braces,
  CheckCircle2,
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
import {
  importedEndpointTabID,
  importedRequestURL,
} from "../lib/openapi";
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
  const [importNotice, setImportNotice] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const environmentID = useWorkspaceStore((state) => state.activeEnvironmentID);
  const activeView = useWorkspaceStore((state) => state.activeView);
  const setEnvironment = useWorkspaceStore((state) => state.setEnvironment);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const setImportedSpec = useWorkspaceStore((state) => state.setImportedSpec);
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
    try {
      const result = await importer.mutateAsync();
      if (result.canceled) return;
      if (result.error) {
        setImportNotice({
          message: `${result.error.title}: ${result.error.message}`,
          tone: "error",
        });
        return;
      }

      setImportedSpec(result);
      const openedEndpoints = result.endpoints.slice(0, 8);
      for (const endpoint of openedEndpoints) {
        openTab({
          id: importedEndpointTabID(result.specId, endpoint.id),
          name: endpoint.summary || endpoint.path,
          method: endpoint.method,
          url: importedRequestURL(result.baseUrl, endpoint.path),
          openApi: { specId: result.specId, path: endpoint.path },
          dirty: false,
        });
      }

      if (openedEndpoints.length === 0) {
        setImportNotice({
          message: `${result.title || "OpenAPI"} · Açılabilir endpoint bulunamadı`,
          tone: "error",
        });
        return;
      }
      setImportNotice({
        message: `${result.title || "OpenAPI"} · ${openedEndpoints.length} endpoint sekmede açıldı${
          result.endpoints.length > openedEndpoints.length
            ? `; ${result.endpoints.length} endpoint APIs bölümünde erişilebilir`
            : ""
        }`,
        tone: "success",
      });
    } catch (error) {
      setImportNotice({
        message: `OpenAPI içe aktarılamadı: ${
          error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu."
        }`,
        tone: "error",
      });
    }
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
          aria-label="Command palette aç"
        >
          <Search size={15} aria-hidden="true" />
          <span>Search commands…</span>
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
              <DropdownMenu.Item
                className="menu-item"
                disabled={importer.isPending}
                onSelect={importSpec}
              >
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
              {activeView === "requests" && (
                <>
                  <DropdownMenu.Label className="menu-label">
                    REQUEST LAYOUT
                  </DropdownMenu.Label>
                  <DropdownMenu.Item className="menu-item" onSelect={toggleLeft}>
                    <LayoutPanelLeft size={16} /> Toggle request panel
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className="menu-item" onSelect={toggleRight}>
                    <PanelRight size={16} /> Toggle context panel
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="menu-item"
                    onSelect={() =>
                      setResponsePlacement(
                        responsePlacement === "vertical"
                          ? "horizontal"
                          : "vertical",
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
                </>
              )}
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

      {importNotice && (
        <div
          className="toast"
          role={importNotice.tone === "error" ? "alert" : "status"}
          aria-live={importNotice.tone === "error" ? "assertive" : "polite"}
          aria-atomic="true"
        >
          {importNotice.tone === "error" ? (
            <AlertCircle size={15} aria-hidden="true" />
          ) : (
            <CheckCircle2 size={15} aria-hidden="true" />
          )}
          <span>{importNotice.message}</span>
          <IconButton
            label="Bildirimi kapat"
            onClick={() => setImportNotice(null)}
          >
            <X size={14} />
          </IconButton>
        </div>
      )}
    </>
  );
}
