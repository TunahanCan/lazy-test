import { useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  Copy,
  LoaderCircle,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { useTranslation } from "../../i18n";
import { cn } from "../../lib/utils";
import { useWorkspaceStore } from "../../stores/workspace";
import { Button, IconButton, MethodBadge } from "../../shared/ui";

export function RequestTabs() {
  const t = useTranslation();
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabID = useWorkspaceStore((state) => state.activeTabID);
  const setActiveTab = useWorkspaceStore((state) => state.setActiveTab);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const closeOtherTabs = useWorkspaceStore((state) => state.closeOtherTabs);
  const closeTabsToRight = useWorkspaceStore(
    (state) => state.closeTabsToRight,
  );
  const duplicateTab = useWorkspaceStore((state) => state.duplicateTab);
  const reopenClosedTab = useWorkspaceStore((state) => state.reopenClosedTab);
  const reorderTab = useWorkspaceStore((state) => state.reorderTab);
  const updateTab = useWorkspaceStore((state) => state.updateTab);
  const togglePin = useWorkspaceStore((state) => state.togglePin);
  const recentlyClosed = useWorkspaceStore((state) => state.recentlyClosed);
  const [pendingCloseID, setPendingCloseID] = useState<string | null>(null);
  const [renamingID, setRenamingID] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [draggedID, setDraggedID] = useState<string | null>(null);

  const requestClose = (id: string) => {
    if (tabs.find((tab) => tab.id === id)?.running) return;
    if (!closeTab(id)) setPendingCloseID(id);
  };
  const pendingTab = tabs.find((tab) => tab.id === pendingCloseID);
  const renamingTab = tabs.find((tab) => tab.id === renamingID);

  const startRename = (id: string) => {
    const tab = tabs.find((candidate) => candidate.id === id);
    if (!tab) return;
    setRenamingID(id);
    setRenameValue(tab.name);
  };

  const commitRename = () => {
    const name = renameValue.trim();
    if (!renamingID || !name) return;
    updateTab(renamingID, { name, dirty: true });
    setRenamingID(null);
    setRenameValue("");
  };

  const focusTab = (index: number) => {
    if (tabs.length === 0) return;
    const normalized = (index + tabs.length) % tabs.length;
    const target = tabs[normalized];
    setActiveTab(target.id);
    requestAnimationFrame(() =>
      document.getElementById(`request-tab-${target.id}`)?.focus(),
    );
  };

  return (
    <>
      <div className="request-tabs-shell">
        <div
          className="request-tabs"
          role="tablist"
          aria-label={t("requests.tabs.openRequests")}
        >
          {tabs.map((tab, index) => {
            const canCloseOtherTabs = tabs.some(
              (candidate) =>
                candidate.id !== tab.id &&
                !candidate.pinned &&
                !candidate.dirty &&
                !candidate.running,
            );
            const canCloseTabsToRight = tabs.some(
              (candidate, candidateIndex) =>
                candidateIndex > index &&
                !candidate.pinned &&
                !candidate.dirty &&
                !candidate.running,
            );
            const canCloseFromTab = !tab.pinned && !tab.running;
            const accessibleName = [
              tab.method,
              tab.name,
              tab.dirty && t("requests.tabs.localDraft"),
              tab.running && t("requests.tabs.running"),
              tab.error && !tab.running && t("requests.tabs.error"),
            ]
              .filter(Boolean)
              .join(", ");
            const keyboardShortcuts = [
              canCloseFromTab && "Delete",
              index > 0 && "Alt+Shift+ArrowLeft",
              index < tabs.length - 1 && "Alt+Shift+ArrowRight",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <ContextMenu.Root key={tab.id}>
                <ContextMenu.Trigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "request-tab",
                      tab.id === activeTabID && "active",
                    )}
                    id={`request-tab-${tab.id}`}
                    role="tab"
                    aria-label={accessibleName}
                    aria-selected={tab.id === activeTabID}
                    aria-controls={`request-panel-${tab.id}`}
                    aria-describedby={
                      canCloseFromTab
                        ? `request-tab-close-description-${tab.id}`
                        : undefined
                    }
                    aria-keyshortcuts={keyboardShortcuts || undefined}
                    tabIndex={tab.id === activeTabID ? 0 : -1}
                    title={t("requests.tabs.renameHint")}
                    style={{ textAlign: "left" }}
                    draggable
                    onDragStart={() => setDraggedID(tab.id)}
                    onDragEnd={() => setDraggedID(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggedID) reorderTab(draggedID, tab.id);
                      setDraggedID(null);
                    }}
                    onClick={() => setActiveTab(tab.id)}
                    onDoubleClick={() => startRename(tab.id)}
                    onKeyDown={(event) => {
                      const isKeyboardReorder =
                        event.altKey &&
                        event.shiftKey &&
                        (event.key === "ArrowLeft" ||
                          event.key === "ArrowRight");
                      if (isKeyboardReorder) {
                        event.preventDefault();
                        const targetIndex =
                          index + (event.key === "ArrowLeft" ? -1 : 1);
                        const target = tabs[targetIndex];
                        if (target) {
                          reorderTab(tab.id, target.id);
                          requestAnimationFrame(() =>
                            document
                              .getElementById(`request-tab-${tab.id}`)
                              ?.focus(),
                          );
                        }
                      } else if (
                        event.key === "Delete" &&
                        canCloseFromTab
                      ) {
                        event.preventDefault();
                        requestClose(tab.id);
                      } else if (event.key === "ArrowLeft") {
                        event.preventDefault();
                        focusTab(index - 1);
                      } else if (event.key === "ArrowRight") {
                        event.preventDefault();
                        focusTab(index + 1);
                      } else if (event.key === "Home") {
                        event.preventDefault();
                        focusTab(0);
                      } else if (event.key === "End") {
                        event.preventDefault();
                        focusTab(tabs.length - 1);
                      }
                    }}
                  >
                    {tab.pinned && (
                      <Pin size={11} className="tab-pin" aria-hidden="true" />
                    )}
                    <MethodBadge method={tab.method} compact />
                    <span className="tab-name">{tab.name}</span>
                    {tab.dirty && (
                      <span className="dirty-dot" aria-hidden="true" />
                    )}
                    {tab.running && (
                      <LoaderCircle
                        className="spin tab-state-icon"
                        size={13}
                        aria-hidden="true"
                      />
                    )}
                    {tab.error && !tab.running && (
                      <AlertCircle
                        className="tab-state-icon tab-error"
                        size={13}
                        aria-hidden="true"
                      />
                    )}
                    {canCloseFromTab && (
                      <span
                        id={`request-tab-close-description-${tab.id}`}
                        className="sr-only"
                      >
                        {t("requests.tabs.closeNamed", { name: tab.name })}
                      </span>
                    )}
                    {!tab.pinned && (
                      <span
                        className="tab-close"
                        aria-hidden="true"
                        draggable={false}
                        style={
                          tab.running
                            ? { cursor: "not-allowed", opacity: 0.25 }
                            : undefined
                        }
                        title={
                          tab.running
                            ? t("requests.tabs.cancelBeforeClose")
                            : t("requests.tabs.closeNamed", {
                                name: tab.name,
                              })
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          requestClose(tab.id);
                        }}
                      >
                        <X size={13} aria-hidden="true" />
                      </span>
                    )}
                  </button>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content className="menu context-menu">
                    <ContextMenu.Item
                      className="menu-item"
                      onSelect={() => startRename(tab.id)}
                    >
                      <Pencil size={15} /> {t("requests.tabs.rename")}
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="menu-item"
                      onSelect={() =>
                        duplicateTab(
                          tab.id,
                          t("requests.tabs.duplicateName", {
                            name: tab.name,
                          }),
                        )
                      }
                    >
                      <Copy size={15} /> {t("requests.tabs.duplicate")}
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="menu-item"
                      onSelect={() => togglePin(tab.id)}
                    >
                      {tab.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                      {tab.pinned
                        ? t("requests.tabs.unpin")
                        : t("requests.tabs.pin")}
                    </ContextMenu.Item>
                    <ContextMenu.Separator className="menu-separator" />
                    <ContextMenu.Item
                      className="menu-item"
                      disabled={!canCloseOtherTabs}
                      onSelect={() => closeOtherTabs(tab.id)}
                    >
                      {t("requests.tabs.closeOtherClean")}
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="menu-item"
                      disabled={!canCloseTabsToRight}
                      onSelect={() => closeTabsToRight(tab.id)}
                    >
                      {t("requests.tabs.closeCleanRight")}
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="menu-item"
                      disabled={recentlyClosed.length === 0}
                      onSelect={reopenClosedTab}
                    >
                      <RotateCcw size={15} />{" "}
                      {t("requests.tabs.reopenClosed")}
                    </ContextMenu.Item>
                    <ContextMenu.Separator className="menu-separator" />
                    <ContextMenu.Item
                      className="menu-item"
                      disabled={tab.running}
                      onSelect={() => requestClose(tab.id)}
                    >
                      <X size={15} /> {t("requests.tabs.close")}
                    </ContextMenu.Item>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            );
          })}
        </div>
        <IconButton
          label={t("requests.tabs.new")}
          className="new-tab"
          onClick={() =>
            openTab({ name: t("requests.untitled"), url: "", dirty: true })
          }
        >
          <Plus size={16} />
        </IconButton>
      </div>

      <Dialog.Root
        open={pendingCloseID !== null}
        onOpenChange={(open) => !open && setPendingCloseID(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog unsaved-dialog">
            <div className="dialog-header">
              <div>
                <Dialog.Title>
                  {t("requests.tabs.closeDraftTitle")}
                </Dialog.Title>
                <Dialog.Description>
                  {t("requests.tabs.closeDraftDescription", {
                    name: pendingTab?.name ?? "",
                  })}
                </Dialog.Description>
              </div>
            </div>
            <p className="dialog-copy">
              {t("requests.tabs.closeDraftHint")}
            </p>
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <Button>{t("requests.tabs.cancel")}</Button>
              </Dialog.Close>
              <Button
                variant="danger"
                onClick={() => {
                  if (pendingCloseID) closeTab(pendingCloseID, true);
                  setPendingCloseID(null);
                }}
              >
                {t("requests.tabs.closeDraft")}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={renamingID !== null}
        onOpenChange={(open) => {
          if (open) return;
          setRenamingID(null);
          setRenameValue("");
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog rename-dialog">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                commitRename();
              }}
            >
              <div className="dialog-header">
                <div>
                  <Dialog.Title>
                    {t("requests.tabs.renameTitle")}
                  </Dialog.Title>
                  <Dialog.Description>
                    {t("requests.tabs.renameDescription")}
                  </Dialog.Description>
                </div>
              </div>
              <label className="dialog-field">
                {t("requests.tabs.requestName")}
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  placeholder={
                    renamingTab?.name ?? t("requests.tabs.requestName")
                  }
                  maxLength={80}
                  aria-label={t("requests.tabs.newName")}
                />
              </label>
              <div className="dialog-actions">
                <Dialog.Close asChild>
                  <Button>{t("requests.tabs.cancel")}</Button>
                </Dialog.Close>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!renameValue.trim()}
                >
                  {t("requests.tabs.updateName")}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
