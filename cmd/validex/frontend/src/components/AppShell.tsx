import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  LoaderCircle,
  PanelLeftOpen,
  PanelRightOpen,
  X,
} from "lucide-react";
import { RequestTabs } from "../features/requests/RequestTabs";
import { RequestWorkbench } from "../features/requests/RequestWorkbench";
import { WelcomeWorkspace } from "../features/requests/WelcomeWorkspace";
import { useOpenAPIImport } from "../features/openapi/useOpenAPIImport";
import { useTranslation } from "../i18n";
import { useCancelRequest } from "../lib/queries";
import type { BootstrapData, WorkspaceView } from "../lib/types";
import { cn } from "../lib/utils";
import { IconButton } from "../shared/ui";
import { useCollectionLibraryStore } from "../stores/collectionLibrary";
import { useCollectionLibraryPersistence } from "../stores/collectionLibraryStorage";
import { useWorkspaceStore } from "../stores/workspace";
import { ActivityBar } from "./ActivityBar";
import { CommandPalette } from "./CommandPalette";
import { ContextPanel } from "./ContextPanel";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";

const MockServerLab = lazy(() =>
  import("../features/mock-server/MockServerLab").then((module) => ({
    default: module.MockServerLab,
  })),
);
const JSONLab = lazy(() =>
  import("../features/json-lab/JSONLab").then((module) => ({
    default: module.JSONLab,
  })),
);
const DiagnosticsLab = lazy(() =>
  import("../features/diagnostics/DiagnosticsLab").then((module) => ({
    default: module.DiagnosticsLab,
  })),
);
const ProtocolLab = lazy(() =>
  import("../features/protocols/ProtocolLab").then((module) => ({
    default: module.ProtocolLab,
  })),
);
const AutomationLab = lazy(() =>
  import("../features/automation/AutomationLab").then((module) => ({
    default: module.AutomationLab,
  })),
);

type ToolView = Exclude<WorkspaceView, "requests">;

function renderTool(view: ToolView) {
  switch (view) {
    case "mock":
      return <MockServerLab />;
    case "json":
      return <JSONLab />;
    case "diagnostics":
      return <DiagnosticsLab />;
    case "protocols":
      return <ProtocolLab />;
    case "automation":
      return <AutomationLab />;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const panelMinWidth = 210;
const panelCompactThresholdWidth = 190;
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
  const t = useTranslation();
  const activeView = useWorkspaceStore((state) => state.activeView);
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
  const setActiveView = useWorkspaceStore((state) => state.setActiveView);
  const reopenClosedTab = useWorkspaceStore((state) => state.reopenClosedTab);
  const updateTab = useWorkspaceStore((state) => state.updateTab);
  const reconcileSavedRequestLinks = useWorkspaceStore(
    (state) => state.reconcileSavedRequestLinks,
  );
  const savedRequests = useCollectionLibraryStore((state) => state.requests);
  const collectionLibraryPersistence =
    useCollectionLibraryPersistence();
  const setPaletteOpen = useWorkspaceStore(
    (state) => state.setCommandPaletteOpen,
  );
  const cancelRequest = useCancelRequest();
  const {
    importSpec,
    isPending: importPending,
    notice: welcomeImportNotice,
  } = useOpenAPIImport();
  const activeToolView: ToolView | null =
    activeView === "requests" ? null : activeView;
  const [visitedToolViews, setVisitedToolViews] = useState<ToolView[]>(() =>
    activeToolView ? [activeToolView] : [],
  );
  const renderedToolViews =
    activeToolView && !visitedToolViews.includes(activeToolView)
      ? [...visitedToolViews, activeToolView]
      : visitedToolViews;
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(() =>
    typeof window === "undefined" ? verticalCenterMinWidth : window.innerWidth,
  );
  const [compactPanel, setCompactPanel] = useState<"left" | "right" | null>(
    null,
  );

  useEffect(() => {
    if (!collectionLibraryPersistence.hydrated) return;
    reconcileSavedRequestLinks(
      savedRequests.map(({ id, collectionId, name, method, url, headers, body }) => ({
        id,
        collectionId,
        name,
        method,
        url,
        headers,
        body,
      })),
    );
  }, [
    collectionLibraryPersistence.hydrated,
    reconcileSavedRequestLinks,
    savedRequests,
  ]);
  const requestedCenterMinWidth =
    responsePlacement === "horizontal"
      ? horizontalCenterMinWidth
      : verticalCenterMinWidth;
  const requestedPanelCount = Number(leftVisible) + Number(rightVisible);
  const requestedLayoutMinWidth =
    requestedCenterMinWidth +
    requestedPanelCount *
      (panelCompactThresholdWidth + panelResizerWidth);
  const compactLayout =
    workspaceWidth <= 720 || workspaceWidth < requestedLayoutMinWidth;
  const layoutLeftVisible = compactLayout
    ? compactPanel === "left"
    : leftVisible;
  const layoutRightVisible = compactLayout
    ? compactPanel === "right"
    : rightVisible;
  const centerMinWidth = compactLayout ? 0 : requestedCenterMinWidth;
  const fittedPanelWidths = useMemo(
    () =>
      fitPanelWidths(
        workspaceWidth,
        centerMinWidth,
        layoutLeftVisible,
        layoutRightVisible,
        leftWidth,
        rightWidth,
      ),
    [
      centerMinWidth,
      layoutLeftVisible,
      leftWidth,
      layoutRightVisible,
      rightWidth,
      workspaceWidth,
    ],
  );

  useEffect(() => {
    if (!activeToolView) return;
    setVisitedToolViews((current) =>
      current.includes(activeToolView) ? current : [...current, activeToolView],
    );
  }, [activeToolView]);

  const previousViewRef = useRef(activeView);
  useEffect(() => {
    if (previousViewRef.current === activeView) return;
    previousViewRef.current = activeView;
    const frame = window.requestAnimationFrame(() => {
      const workspace =
        activeView === "requests"
          ? document.querySelector<HTMLElement>(
              ".workspace-layout:not([hidden]) h1",
            )
          : document.querySelector<HTMLElement>(
              ".tool-workspace:not([hidden]) h1",
            );
      if (!workspace) return;
      workspace.tabIndex = -1;
      workspace.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeView]);

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
  }, [activeView]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && compactPanel) {
        event.preventDefault();
        setCompactPanel(null);
        return;
      }
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (command && event.key.toLowerCase() === "n") {
        event.preventDefault();
        openTab({
          name: t("chrome.untitledRequest"),
          url: "",
          dirty: true,
        });
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
                title: t("shell.cancelNotFound.title"),
                message: t("shell.cancelNotFound.message"),
                hint: t("shell.cancelNotFound.hint"),
              },
            });
          })
          .catch((error) => {
            updateTab(activeTab.id, {
              running: false,
              error: true,
              userError: {
                code: "cancel_failed",
                title: t("shell.cancelFailed.title"),
                message: t("shell.cancelFailed.message"),
                hint: t("shell.cancelFailed.hint"),
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
    compactPanel,
    openTab,
    reopenClosedTab,
    setPaletteOpen,
    t,
    updateTab,
  ]);

  const panelBounds = (side: "left" | "right") => {
    const otherWidth =
      side === "left" ? fittedPanelWidths.right : fittedPanelWidths.left;
    const visibleCount =
      Number(layoutLeftVisible) + Number(layoutRightVisible);
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

  return (
    <div className="app-shell">
      <TopBar bootstrap={bootstrap} />
      <div className="application-body">
        <ActivityBar />
        {renderedToolViews.map((view) => (
          <Suspense
            key={view}
            fallback={
              <main
                className="tool-workspace tool-workspace-loading"
                aria-busy="true"
                hidden={activeView !== view}
              >
                <LoaderCircle className="spin" size={22} />
                <span>{t("shell.workspacePreparing")}</span>
              </main>
            }
          >
            <main
              className="tool-workspace"
              hidden={activeView !== view}
              aria-hidden={activeView !== view}
            >
              {renderTool(view)}
            </main>
          </Suspense>
        ))}
        <main
          ref={workspaceRef}
          className={cn(
            "workspace-layout",
            compactLayout && "compact-layout",
          )}
          hidden={activeView !== "requests"}
          aria-hidden={activeView !== "requests"}
          style={{
            gridTemplateColumns: [
              layoutLeftVisible
                ? `${fittedPanelWidths.left}px 4px`
                : "0px 0px",
              `minmax(${centerMinWidth}px, 1fr)`,
              layoutRightVisible
                ? `4px ${fittedPanelWidths.right}px`
                : "0px 0px",
            ].join(" "),
          }}
        >
          {compactPanel && (
            <button
              type="button"
              className="mobile-panel-scrim"
              aria-label={t("shell.closeSidePanel")}
              onClick={() => setCompactPanel(null)}
            />
          )}
          <div
            id="request-panel"
            className={cn(
              "panel-slot",
              "request-panel-slot",
              !layoutLeftVisible && "panel-hidden",
            )}
          >
            {compactLayout && layoutLeftVisible && (
              <IconButton
                label={t("shell.closeRequestPanel")}
                className="mobile-panel-close"
                onClick={() => setCompactPanel(null)}
              >
                <X size={15} />
              </IconButton>
            )}
            <Sidebar bootstrap={bootstrap} />
          </div>
          <div
            className={cn(
              "panel-resizer",
              "panel-resizer-left",
              !layoutLeftVisible && "panel-hidden",
            )}
            onPointerDown={startResize("left")}
            onKeyDown={resizeWithKeyboard("left")}
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label={t("shell.resizeRequestPanel")}
            aria-controls="request-panel"
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
              <RequestWorkbench
                tab={activeTab}
                bootstrap={bootstrap}
                compact={compactLayout}
              />
            ) : (
              <WelcomeWorkspace
                importPending={importPending}
                importNotice={welcomeImportNotice}
                onCreateRequest={() =>
                  openTab({
                    name: t("chrome.untitledRequest"),
                    url: "",
                    dirty: true,
                  })
                }
                onImportOpenAPI={() => void importSpec()}
                onOpenTool={setActiveView}
              />
            )}
          </div>

          <div
            className={cn(
              "panel-resizer",
              "panel-resizer-right",
              !layoutRightVisible && "panel-hidden",
            )}
            onPointerDown={startResize("right")}
            onKeyDown={resizeWithKeyboard("right")}
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label={t("shell.resizeContextPanel")}
            aria-controls="context-panel"
            aria-valuemin={panelBounds("right").min}
            aria-valuemax={panelBounds("right").max}
            aria-valuenow={fittedPanelWidths.right}
          >
            <span />
          </div>
          <div
            id="context-panel"
            className={cn(
              "panel-slot",
              "context-panel-slot",
              !layoutRightVisible && "panel-hidden",
            )}
          >
            {compactLayout && layoutRightVisible && (
              <IconButton
                label={t("shell.closeContextPanel")}
                className="mobile-panel-close"
                onClick={() => setCompactPanel(null)}
              >
                <X size={15} />
              </IconButton>
            )}
            <ContextPanel bootstrap={bootstrap} tab={activeTab} />
          </div>

          {!layoutLeftVisible && (
            <IconButton
              label={t("shell.showRequestPanel")}
              className="panel-restore panel-restore-left"
              onClick={() =>
                compactLayout ? setCompactPanel("left") : toggleLeft()
              }
            >
              <PanelLeftOpen size={15} />
            </IconButton>
          )}
          {!layoutRightVisible && (
            <IconButton
              label={t("shell.showContextPanel")}
              className="panel-restore panel-restore-right"
              onClick={() =>
                compactLayout ? setCompactPanel("right") : toggleRight()
              }
            >
              <PanelRightOpen size={15} />
            </IconButton>
          )}
        </main>
      </div>
      <StatusBar bootstrap={bootstrap} />
      <CommandPalette bootstrap={bootstrap} />
    </div>
  );
}
