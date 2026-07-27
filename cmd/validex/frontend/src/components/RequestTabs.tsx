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
  Save,
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
  const updateTab = useWorkspaceStore((state) => state.updateTab);
  const togglePin = useWorkspaceStore((state) => state.togglePin);
  const recentlyClosed = useWorkspaceStore((state) => state.recentlyClosed);
  const [pendingCloseID, setPendingCloseID] = useState<string | null>(null);
  const [draggedID, setDraggedID] = useState<string | null>(null);

  const requestClose = (id: string) => {
    if (!closeTab(id)) setPendingCloseID(id);
  };
  const pendingTab = tabs.find((tab) => tab.id === pendingCloseID);

  return (
    <>
      <div className="request-tabs-shell">
        <div className="request-tabs" role="tablist" aria-label="Open requests">
          {tabs.map((tab) => (
            <ContextMenu.Root key={tab.id}>
              <ContextMenu.Trigger asChild>
                <button
                  role="tab"
                  aria-selected={tab.id === activeTabID}
                  className={cn(
                    "request-tab",
                    tab.id === activeTabID && "active",
                  )}
                  onClick={() => setActiveTab(tab.id)}
                  draggable
                  onDragStart={() => setDraggedID(tab.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedID) reorderTab(draggedID, tab.id);
                    setDraggedID(null);
                  }}
                >
                  {tab.pinned && <Pin size={11} className="tab-pin" />}
                  <MethodBadge method={tab.method} compact />
                  <span className="tab-name">{tab.name}</span>
                  {tab.dirty && (
                    <span className="dirty-dot" aria-label="Kaydedilmemiş değişiklik" />
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
                  {!tab.pinned && (
                    <span
                      className="tab-close"
                      role="button"
                      tabIndex={0}
                      aria-label={`${tab.name} sekmesini kapat`}
                      onClick={(event) => {
                        event.stopPropagation();
                        requestClose(tab.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.stopPropagation();
                          requestClose(tab.id);
                        }
                      }}
                    >
                      <X size={13} />
                    </span>
                  )}
                </button>
              </ContextMenu.Trigger>
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
                    onSelect={() => closeOtherTabs(tab.id)}
                  >
                    Close other tabs
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="menu-item"
                    onSelect={() => closeTabsToRight(tab.id)}
                  >
                    Close tabs to the right
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
                    onSelect={() => requestClose(tab.id)}
                  >
                    <X size={15} /> Close tab
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          ))}
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
                <Dialog.Title>Değişiklikler kaydedilsin mi?</Dialog.Title>
                <Dialog.Description>
                  “{pendingTab?.name}” sekmesinde kaydedilmemiş değişiklikler var.
                </Dialog.Description>
              </div>
            </div>
            <p className="dialog-copy">
              Kaydetmeden kapatırsanız son düzenlemeler kaybolur.
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
                Kaydetmeden kapat
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (pendingCloseID) {
                    updateTab(pendingCloseID, { dirty: false });
                    closeTab(pendingCloseID, true);
                  }
                  setPendingCloseID(null);
                }}
              >
                <Save size={15} /> Kaydet
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
