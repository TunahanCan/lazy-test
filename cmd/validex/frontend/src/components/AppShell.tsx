import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  FilePlus2,
  Import,
  LoaderCircle,
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

const panelMinWidth = 210;
const panelMaxWidth = 440;
const verticalCenterMinWidth = 480;
const horizontalCenterMinWidth = 660;
const panelResizerWidth = 4;
const panelKeyboardStep = 16;

function fitPanelWidths(
  containerWidth: number,
  centerMinWidth: number,
  leftVisible: boolean,
  rightVisible: boolean,
  leftWidth: number,
  rightWidth: number,
) {
  const visibleCount = Number(leftVisible) + Number(rightVisible);
  const budget = Math.max(
    0,
    containerWidth - centerMinWidth - visibleCount * panelResizerWidth,
  );
  const desiredLeft = leftVisible
    ? clamp(leftWidth, panelMinWidth, panelMaxWidth)
    : 0;
  const desiredRight = rightVisible
    ? clamp(rightWidth, panelMinWidth, panelMaxWidth)
    : 0;

  if (visibleCount === 0) return { left: 0, right: 0 };
  if (visibleCount === 1) {
    return {
      left: leftVisible ? Math.floor(Math.min(desiredLeft, budget)) : 0,
      right: rightVisible ? Math.floor(Math.min(desiredRight, budget)) : 0,
    };
  }
  if (desiredLeft + desiredRight <= budget) {
    return { left: desiredLeft, right: desiredRight };
  }

  const safeMinimum = Math.min(panelMinWidth, budget / 2);
  const leftCapacity = Math.max(0, desiredLeft - safeMinimum);
  const rightCapacity = Math.max(0, desiredRight - safeMinimum);
  const totalCapacity = leftCapacity + rightCapacity;
  const overflow = desiredLeft + desiredRight - budget;
  const leftReduction =
    totalCapacity > 0 ? overflow * (leftCapacity / totalCapacity) : overflow / 2;
  const fittedLeft = clamp(
    desiredLeft - leftReduction,
    safeMinimum,
    desiredLeft,
  );

  return {
    left: Math.floor(fittedLeft),
    right: Math.floor(Math.max(0, budget - fittedLeft)),
  };
}

export function AppShell({ bootstrap }: { bootstrap: BootstrapData }) {
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabID = useWorkspaceStore((state) => state.activeTabID);
  const activeTab = tabs.find((tab) => tab.id === activeTabID);
  const leftVisible = useWorkspaceStore((state) => state.leftVisible);
  const rightVisible = useWorkspaceStore((state) => state.rightVisible);
  const leftWidth = useWorkspaceStore((state) => state.leftWidth);
  const rightWidth = useWorkspaceStore((state) => state.rightWidth);
  const responsePlacement = useWorkspaceStore(
    (state) => state.responsePlacement,
  );
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
  const [welcomeImportNotice, setWelcomeImportNotice] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(() =>
    typeof window === "undefined" ? verticalCenterMinWidth : window.innerWidth,
  );
  const centerMinWidth =
    responsePlacement === "horizontal"
      ? horizontalCenterMinWidth
      : verticalCenterMinWidth;
  const fittedPanelWidths = useMemo(
    () =>
      fitPanelWidths(
        workspaceWidth,
        centerMinWidth,
        leftVisible,
        rightVisible,
        leftWidth,
        rightWidth,
      ),
    [
      centerMinWidth,
      leftVisible,
      leftWidth,
      rightVisible,
      rightWidth,
      workspaceWidth,
    ],
  );

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const measure = () => {
      setWorkspaceWidth(workspace.clientWidth || window.innerWidth);
    };
    measure();
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(workspace);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
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
        if (document.querySelector('[role="dialog"], [role="menu"]')) return;
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

  const panelBounds = (side: "left" | "right") => {
    const otherWidth =
      side === "left" ? fittedPanelWidths.right : fittedPanelWidths.left;
    const visibleCount = Number(leftVisible) + Number(rightVisible);
    const available = Math.max(
      0,
      workspaceWidth -
        centerMinWidth -
        visibleCount * panelResizerWidth -
        otherWidth,
    );
    const max = Math.min(panelMaxWidth, Math.floor(available));
    return { min: Math.min(panelMinWidth, max), max };
  };

  const setPanelWidth = (side: "left" | "right", width: number) => {
    if (side === "left") {
      if (rightVisible && rightWidth !== fittedPanelWidths.right) {
        setRightWidth(fittedPanelWidths.right);
      }
      setLeftWidth(width);
    } else {
      if (leftVisible && leftWidth !== fittedPanelWidths.left) {
        setLeftWidth(fittedPanelWidths.left);
      }
      setRightWidth(width);
    }
  };

  const startResize =
    (side: "left" | "right") =>
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth =
        side === "left" ? fittedPanelWidths.left : fittedPanelWidths.right;
      const bounds = panelBounds(side);
      document.body.classList.add("resizing");
      const move = (moveEvent: PointerEvent) => {
        const delta =
          side === "left"
            ? moveEvent.clientX - startX
            : startX - moveEvent.clientX;
        setPanelWidth(
          side,
          clamp(startWidth + delta, bounds.min, bounds.max),
        );
      };
      const stop = () => {
        document.body.classList.remove("resizing");
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
    };

  const resizeWithKeyboard =
    (side: "left" | "right") =>
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const bounds = panelBounds(side);
      const current =
        side === "left" ? fittedPanelWidths.left : fittedPanelWidths.right;
      const spatialDirection = side === "left" ? 1 : -1;
      let next: number | undefined;
      if (event.key === "Home") next = bounds.min;
      if (event.key === "End") next = bounds.max;
      if (event.key === "ArrowLeft") {
        next = current - panelKeyboardStep * spatialDirection;
      }
      if (event.key === "ArrowRight") {
        next = current + panelKeyboardStep * spatialDirection;
      }
      if (next === undefined) return;
      event.preventDefault();
      setPanelWidth(side, clamp(next, bounds.min, bounds.max));
    };

  const importSpec = async () => {
    setWelcomeImportNotice(null);
    try {
      const result = await importer.mutateAsync();
      if (result.canceled) return;
      if (result.error) {
        setWelcomeImportNotice({
          message: `${result.error.title}: ${result.error.message}`,
          tone: "error",
        });
        return;
      }
      const openedEndpoints = result.endpoints.slice(0, 8);
      openedEndpoints.forEach((endpoint) =>
        openTab({
          id: `${endpoint.id}-${crypto.randomUUID()}`,
          name: endpoint.summary || endpoint.path,
          method: endpoint.method,
          url: importedRequestURL(result.baseUrl, endpoint.path),
          dirty: false,
        }),
      );
      setWelcomeImportNotice({
        message:
          openedEndpoints.length > 0
            ? `${openedEndpoints.length} endpoint sekmede açıldı${
                result.endpoints.length > openedEndpoints.length
                  ? ` (${result.endpoints.length} endpoint bulundu)`
                  : ""
              }`
            : "OpenAPI dosyasında açılabilir endpoint bulunamadı.",
        tone: openedEndpoints.length > 0 ? "success" : "error",
      });
    } catch (error) {
      setWelcomeImportNotice({
        message: `OpenAPI içe aktarılamadı: ${
          error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu."
        }`,
        tone: "error",
      });
    }
  };

  return (
    <div className="app-shell">
      <TopBar bootstrap={bootstrap} />
      <div
        ref={workspaceRef}
        className="workspace-layout"
        style={{
          gridTemplateColumns: [
            leftVisible ? `${fittedPanelWidths.left}px 4px` : "0px 0px",
            `minmax(${centerMinWidth}px, 1fr)`,
            rightVisible ? `4px ${fittedPanelWidths.right}px` : "0px 0px",
          ].join(" "),
        }}
      >
        <div
          id="collection-panel"
          className={cn("panel-slot", !leftVisible && "panel-hidden")}
        >
          <Sidebar bootstrap={bootstrap} />
        </div>
        <div
          className={cn(
            "panel-resizer",
            "panel-resizer-left",
            !leftVisible && "panel-hidden",
          )}
          onPointerDown={startResize("left")}
          onKeyDown={resizeWithKeyboard("left")}
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Collection panelini yeniden boyutlandır"
          aria-controls="collection-panel"
          aria-valuemin={panelBounds("left").min}
          aria-valuemax={panelBounds("left").max}
          aria-valuenow={fittedPanelWidths.left}
        >
          <span />
        </div>

        <div
          className={cn(
            "center-workspace",
            tabs.length === 0 && "welcome-workspace",
          )}
        >
          {tabs.length > 0 && <RequestTabs />}
          {activeTab ? (
            <RequestWorkbench tab={activeTab} bootstrap={bootstrap} />
          ) : (
            <main className="welcome-state">
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
                <Button
                  disabled={importer.isPending}
                  onClick={() => void importSpec()}
                >
                  {importer.isPending ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Import size={15} />
                  )}
                  {importer.isPending ? "Importing…" : "Import OpenAPI"}
                </Button>
              </div>
              {welcomeImportNotice && (
                <p
                  className={cn(
                    "welcome-import-notice",
                    welcomeImportNotice.tone === "error" && "danger",
                  )}
                  role={
                    welcomeImportNotice.tone === "error" ? "alert" : "status"
                  }
                >
                  {welcomeImportNotice.message}
                </p>
              )}
              <div className="welcome-shortcuts">
                <span>
                  <strong>⌘ K</strong> Search commands
                </span>
                <span>
                  <strong>⌘ N</strong> New request
                </span>
                <span>
                  <strong>⇧ ⌘ T</strong> Reopen tab
                </span>
              </div>
            </main>
          )}
        </div>

        <div
          className={cn(
            "panel-resizer",
            "panel-resizer-right",
            !rightVisible && "panel-hidden",
          )}
          onPointerDown={startResize("right")}
          onKeyDown={resizeWithKeyboard("right")}
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Context panelini yeniden boyutlandır"
          aria-controls="context-panel"
          aria-valuemin={panelBounds("right").min}
          aria-valuemax={panelBounds("right").max}
          aria-valuenow={fittedPanelWidths.right}
        >
          <span />
        </div>
        <div
          id="context-panel"
          className={cn("panel-slot", !rightVisible && "panel-hidden")}
        >
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
