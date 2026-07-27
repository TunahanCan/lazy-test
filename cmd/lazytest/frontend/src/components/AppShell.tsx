import { useEffect, type PointerEvent as ReactPointerEvent } from "react";
import {
  FilePlus2,
  Import,
  PanelLeftOpen,
  PanelRightOpen,
  Sparkles,
} from "lucide-react";
import { useCancelRequest, useImportOpenAPI } from "../lib/queries";
import { importedRequestURL } from "../lib/openapi";
import type { BootstrapData } from "../lib/types";
import { cn } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";
import { CodeGeneratorDialog } from "./CodeGeneratorDialog";
import { CommandPalette } from "./CommandPalette";
import { ContextPanel } from "./ContextPanel";
import { RequestTabs } from "./RequestTabs";
import { RequestWorkbench } from "./RequestWorkbench";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";
import { Button, IconButton } from "./ui";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function AppShell({ bootstrap }: { bootstrap: BootstrapData }) {
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabID = useWorkspaceStore((state) => state.activeTabID);
  const activeTab = tabs.find((tab) => tab.id === activeTabID);
  const leftVisible = useWorkspaceStore((state) => state.leftVisible);
  const rightVisible = useWorkspaceStore((state) => state.rightVisible);
  const leftWidth = useWorkspaceStore((state) => state.leftWidth);
  const rightWidth = useWorkspaceStore((state) => state.rightWidth);
  const setLeftWidth = useWorkspaceStore((state) => state.setLeftWidth);
  const setRightWidth = useWorkspaceStore((state) => state.setRightWidth);
  const toggleLeft = useWorkspaceStore((state) => state.toggleLeft);
  const toggleRight = useWorkspaceStore((state) => state.toggleRight);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const reopenClosedTab = useWorkspaceStore((state) => state.reopenClosedTab);
  const updateTab = useWorkspaceStore((state) => state.updateTab);
  const setPaletteOpen = useWorkspaceStore(
    (state) => state.setCommandPaletteOpen,
  );
  const cancelRequest = useCancelRequest();
  const importer = useImportOpenAPI();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (command && event.key.toLowerCase() === "n") {
        event.preventDefault();
        openTab({ name: "Untitled request", url: "", dirty: true });
      }
      if (command && event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        reopenClosedTab();
      }
      if (event.key === "Escape" && activeTab?.running) {
        event.preventDefault();
        void cancelRequest
          .mutateAsync(activeTab.id)
          .then((canceled) => {
            if (canceled) return;
            updateTab(activeTab.id, {
              running: false,
              error: true,
              userError: {
                code: "cancel_not_found",
                title: "Çalışan request bulunamadı",
                message: "Backend bu request için aktif bir işlem bulamadı.",
                hint: "Request’i yeniden gönderin veya uygulamayı yeniden başlatın.",
              },
            });
          })
          .catch((error) => {
            updateTab(activeTab.id, {
              running: false,
              error: true,
              userError: {
                code: "cancel_failed",
                title: "Request iptal edilemedi",
                message: "Native backend iptal komutuna yanıt vermedi.",
                hint: "Uygulamayı yeniden başlatıp tekrar deneyin.",
                technical:
                  error instanceof Error ? error.message : String(error),
              },
            });
          });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeTab?.id,
    activeTab?.running,
    cancelRequest,
    openTab,
    reopenClosedTab,
    setPaletteOpen,
    updateTab,
  ]);

  const startResize =
    (side: "left" | "right") =>
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = side === "left" ? leftWidth : rightWidth;
      document.body.classList.add("resizing");
      const move = (moveEvent: PointerEvent) => {
        const delta =
          side === "left"
            ? moveEvent.clientX - startX
            : startX - moveEvent.clientX;
        const next = clamp(startWidth + delta, 210, 440);
        if (side === "left") setLeftWidth(next);
        else setRightWidth(next);
      };
      const stop = () => {
        document.body.classList.remove("resizing");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
    };

  const importSpec = async () => {
    const result = await importer.mutateAsync();
    if (result.error || result.canceled) return;
    result.endpoints.slice(0, 10).forEach((endpoint) =>
      openTab({
        id: `${endpoint.id}-${crypto.randomUUID()}`,
        name: endpoint.summary || endpoint.path,
        method: endpoint.method,
        url: importedRequestURL(result.baseUrl, endpoint.path),
        dirty: false,
      }),
    );
  };

  return (
    <div className="app-shell">
      <TopBar bootstrap={bootstrap} />
      <div
        className="workspace-layout"
        style={{
          gridTemplateColumns: [
            leftVisible ? `${leftWidth}px 4px` : "0px 0px",
            "minmax(480px, 1fr)",
            rightVisible ? `4px ${rightWidth}px` : "0px 0px",
          ].join(" "),
        }}
      >
        <div className={cn("panel-slot", !leftVisible && "panel-hidden")}>
          <Sidebar bootstrap={bootstrap} />
        </div>
        <div
          className={cn(
            "panel-resizer",
            "panel-resizer-left",
            !leftVisible && "panel-hidden",
          )}
          onPointerDown={startResize("left")}
          role="separator"
          aria-orientation="vertical"
          aria-label="Collection panelini yeniden boyutlandır"
        >
          <span />
        </div>

        <section className="center-workspace">
          <RequestTabs />
          {activeTab ? (
            <RequestWorkbench tab={activeTab} bootstrap={bootstrap} />
          ) : (
            <div className="welcome-state">
              <div className="welcome-mark">
                <Sparkles size={24} />
              </div>
              <p className="eyebrow">WELCOME TO VALIDEX</p>
              <h1>API çalışmalarınızı tek bir yerde toplayın.</h1>
              <p>
                İlk request’inizi manuel oluşturun veya OpenAPI dosyanızdan
                endpoint’leri içe aktarın.
              </p>
              <div className="welcome-actions">
                <Button
                  variant="primary"
                  onClick={() =>
                    openTab({
                      name: "Untitled request",
                      url: "",
                      dirty: true,
                    })
                  }
                >
                  <FilePlus2 size={15} /> New request
                </Button>
                <Button onClick={() => void importSpec()}>
                  <Import size={15} /> Import OpenAPI
                </Button>
              </div>
              <div className="welcome-shortcuts">
                <span>
                  <strong>⌘ K</strong> Search anything
                </span>
                <span>
                  <strong>⌘ N</strong> New request
                </span>
                <span>
                  <strong>⇧ ⌘ T</strong> Reopen tab
                </span>
              </div>
            </div>
          )}
        </section>

        <div
          className={cn(
            "panel-resizer",
            "panel-resizer-right",
            !rightVisible && "panel-hidden",
          )}
          onPointerDown={startResize("right")}
          role="separator"
          aria-orientation="vertical"
          aria-label="Context panelini yeniden boyutlandır"
        >
          <span />
        </div>
        <div className={cn("panel-slot", !rightVisible && "panel-hidden")}>
          <ContextPanel bootstrap={bootstrap} tab={activeTab} />
        </div>

        {!leftVisible && (
          <IconButton
            label="Collection panelini göster"
            className="panel-restore panel-restore-left"
            onClick={toggleLeft}
          >
            <PanelLeftOpen size={15} />
          </IconButton>
        )}
        {!rightVisible && (
          <IconButton
            label="Context panelini göster"
            className="panel-restore panel-restore-right"
            onClick={toggleRight}
          >
            <PanelRightOpen size={15} />
          </IconButton>
        )}
      </div>
      <StatusBar bootstrap={bootstrap} />
      <CommandPalette bootstrap={bootstrap} />
      <CodeGeneratorDialog />
    </div>
  );
}
