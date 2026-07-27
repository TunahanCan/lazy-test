import { useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  Copy,
  LoaderCircle,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";
import { Button, IconButton, MethodBadge } from "./ui";

export function RequestTabs() {
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
  const togglePin = useWorkspaceStore((state) => state.togglePin);
  const recentlyClosed = useWorkspaceStore((state) => state.recentlyClosed);
  const [pendingCloseID, setPendingCloseID] = useState<string | null>(null);
  const [draggedID, setDraggedID] = useState<string | null>(null);
  const [focusedCloseID, setFocusedCloseID] = useState<string | null>(null);

  const requestClose = (id: string) => {
    if (tabs.find((tab) => tab.id === id)?.running) return;
    if (!closeTab(id)) setPendingCloseID(id);
  };
  const pendingTab = tabs.find((tab) => tab.id === pendingCloseID);

  return (
    <>
      <div className="request-tabs-shell">
        <div className="request-tabs" role="tablist" aria-label="Open requests">
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
            return (
              <ContextMenu.Root key={tab.id}>
                <div
                  className={cn(
                    "request-tab",
                    tab.id === activeTabID && "active",
                  )}
                  draggable
                  onDragStart={() => setDraggedID(tab.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedID) reorderTab(draggedID, tab.id);
                    setDraggedID(null);
                  }}
                >
                  <ContextMenu.Trigger asChild>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab.id === activeTabID}
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        display: "flex",
                        minWidth: 0,
                        height: "100%",
                        flex: 1,
                        alignItems: "center",
                        gap: 6,
                        padding: 0,
                        background: "transparent",
                        color: "inherit",
                        textAlign: "left",
                      }}
                    >
                      {tab.pinned && <Pin size={11} className="tab-pin" />}
                      <MethodBadge method={tab.method} compact />
                      <span className="tab-name">{tab.name}</span>
                      {tab.dirty && (
                        <span
                          className="dirty-dot"
                          aria-label="Kaydedilmemiş değişiklik"
                        />
                      )}
                      {tab.running && (
                        <LoaderCircle
                          className="spin tab-state-icon"
                          size={13}
                          aria-label="Request çalışıyor"
                        />
                      )}
                      {tab.error && !tab.running && (
                        <AlertCircle
                          className="tab-state-icon tab-error"
                          size={13}
                          aria-label="Request hatası"
                        />
                      )}
                    </button>
                  </ContextMenu.Trigger>
                  {!tab.pinned && (
                    <button
                      type="button"
                      className="tab-close"
                      aria-label={`${tab.name} sekmesini kapat`}
                      draggable={false}
                      disabled={tab.running}
                      title={
                        tab.running
                          ? "Kapatmadan önce request’i iptal edin"
                          : undefined
                      }
                      style={{
                        padding: 0,
                        background: "transparent",
                        color: "inherit",
                        opacity: focusedCloseID === tab.id ? 1 : undefined,
                      }}
                      onFocus={() => setFocusedCloseID(tab.id)}
                      onBlur={() => setFocusedCloseID(null)}
                      onClick={(event) => {
                        event.stopPropagation();
                        requestClose(tab.id);
                      }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <ContextMenu.Portal>
                  <ContextMenu.Content className="menu context-menu">
                    <ContextMenu.Item
                      className="menu-item"
                      onSelect={() => duplicateTab(tab.id)}
                    >
                      <Copy size={15} /> Duplicate
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="menu-item"
                      onSelect={() => togglePin(tab.id)}
                    >
                      {tab.pinned ? <PinOff size={15} /> : <Pin size={15} />}
                      {tab.pinned ? "Unpin tab" : "Pin tab"}
                    </ContextMenu.Item>
                    <ContextMenu.Separator className="menu-separator" />
                    <ContextMenu.Item
                      className="menu-item"
                      disabled={!canCloseOtherTabs}
                      onSelect={() => closeOtherTabs(tab.id)}
                    >
                      Close other clean tabs
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="menu-item"
                      disabled={!canCloseTabsToRight}
                      onSelect={() => closeTabsToRight(tab.id)}
                    >
                      Close clean tabs to the right
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="menu-item"
                      disabled={recentlyClosed.length === 0}
                      onSelect={reopenClosedTab}
                    >
                      <RotateCcw size={15} /> Reopen closed tab
                    </ContextMenu.Item>
                    <ContextMenu.Separator className="menu-separator" />
                    <ContextMenu.Item
                      className="menu-item"
                      disabled={tab.running}
                      onSelect={() => requestClose(tab.id)}
                    >
                      <X size={15} /> Close tab
                    </ContextMenu.Item>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            );
          })}
        </div>
        <IconButton
          label="Yeni request sekmesi"
          className="new-tab"
          onClick={() =>
            openTab({ name: "Untitled request", url: "", dirty: true })
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
                <Dialog.Title>Kaydedilmemiş sekme kapatılsın mı?</Dialog.Title>
                <Dialog.Description>
                  “{pendingTab?.name}” sekmesindeki düzenlemeler aktif çalışma
                  alanından kaldırılacak.
                </Dialog.Description>
              </div>
            </div>
            <p className="dialog-copy">
              Gerekirse son kapatılan sekmeyi “Reopen closed tab” komutuyla geri
              açabilirsiniz.
            </p>
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <Button>İptal</Button>
              </Dialog.Close>
              <Button
                variant="danger"
                onClick={() => {
                  if (pendingCloseID) closeTab(pendingCloseID, true);
                  setPendingCloseID(null);
                }}
              >
                Sekmeyi kapat
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
