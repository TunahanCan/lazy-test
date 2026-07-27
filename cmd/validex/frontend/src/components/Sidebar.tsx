import { useMemo, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileCode2,
  FileJson2,
  Folder,
  FolderOpen,
  Search,
  Star,
} from "lucide-react";
import type { BootstrapData, CollectionNode } from "../lib/types";
import { cn } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";
import { MethodBadge } from "./ui";

const sections = [
  { id: "collections", label: "Collections", icon: Boxes },
  { id: "history", label: "History", icon: Clock3 },
] as const;

function RequestContext({
  node,
  children,
}: {
  node: CollectionNode;
  children: React.ReactNode;
}) {
  const openTab = useWorkspaceStore((state) => state.openTab);
  const setCodeGeneratorOpen = useWorkspaceStore(
    (state) => state.setCodeGeneratorOpen,
  );
  const selectRequest = () => {
    if (!node.method) return;
    openTab({
      id: node.id,
      name: node.name,
      method: node.method,
      url: node.url ?? "",
      dirty: false,
    });
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="menu context-menu">
          <ContextMenu.Item className="menu-item" onSelect={selectRequest}>
            <FileJson2 size={15} /> Open
          </ContextMenu.Item>
          <ContextMenu.Item
            className="menu-item"
            disabled={!node.method}
            onSelect={() => {
              selectRequest();
              setCodeGeneratorOpen(true);
            }}
          >
            <FileCode2 size={15} /> Generate Java test
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function NodeIcon({
  node,
  expanded,
}: {
  node: CollectionNode;
  expanded: boolean;
}) {
  if (node.kind === "collection" || node.kind === "folder") {
    return expanded ? (
      <FolderOpen size={15} aria-hidden="true" />
    ) : (
      <Folder size={15} aria-hidden="true" />
    );
  }
  return null;
}

export function Sidebar({ bootstrap }: { bootstrap: BootstrapData }) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const section = useWorkspaceStore((state) => state.sidebarSection);
  const setSection = useWorkspaceStore((state) => state.setSidebarSection);
  const openTab = useWorkspaceStore((state) => state.openTab);

  const visibleNodes = useMemo(() => {
    if (section === "history") {
      return bootstrap.history.map<CollectionNode>((entry) => ({
        id: entry.id,
        kind: "request",
        name: entry.requestName,
        method: entry.method,
        url: entry.url,
        depth: 0,
      }));
    }
    if (section !== "collections" && section !== "apis") return [];
    const normalized = query.trim().toLocaleLowerCase("tr");
    const byID = new Map(bootstrap.collections.map((node) => [node.id, node]));
    return bootstrap.collections.filter((node) => {
      if (!normalized) {
        let parentID = node.parentId;
        while (parentID) {
          if (collapsed.has(parentID)) return false;
          parentID = byID.get(parentID)?.parentId;
        }
        return true;
      }
      return `${node.name} ${node.method ?? ""} ${node.url ?? ""}`
        .toLocaleLowerCase("tr")
        .includes(normalized);
    });
  }, [bootstrap.collections, bootstrap.history, collapsed, query, section]);

  const virtualizer = useVirtualizer({
    count: visibleNodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 31,
    overscan: 10,
  });

  const openNode = (node: CollectionNode) => {
    if (node.kind === "folder" || node.kind === "collection") {
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
      return;
    }
    if (node.kind !== "request" && node.kind !== "operation") return;
    openTab({
      id: node.id,
      name: node.name,
      method: node.method ?? "GET",
      url: node.url ?? "",
      dirty: false,
    });
  };

  return (
    <aside className="sidebar" aria-label="Workspace navigation">
      <nav className="sidebar-sections" aria-label="Workspace sections">
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={cn("sidebar-section", section === id && "active")}
            onClick={() => setSection(id)}
            aria-current={section === id ? "page" : undefined}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
            {id === "collections" && (
              <span className="section-count">{bootstrap.collections.length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-toolbar">
        <label className="sidebar-search">
          <Search size={14} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${section}`}
            aria-label={`Search ${section}`}
          />
        </label>
      </div>

      {visibleNodes.length > 0 ? (
        <div ref={scrollRef} className="tree-scroll" tabIndex={0}>
          <div
            className="virtual-list"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const node = visibleNodes[virtualItem.index];
              const expanded = Boolean(node.expanded) && !collapsed.has(node.id);
              return (
                <RequestContext key={node.id} node={node}>
                  <button
                    className="tree-row"
                    style={{
                      transform: `translateY(${virtualItem.start}px)`,
                      paddingLeft: `${10 + node.depth * 16}px`,
                    }}
                    onDoubleClick={() => openNode(node)}
                    onClick={() => openNode(node)}
                    title={node.url}
                  >
                    {(node.kind === "folder" || node.kind === "collection") && (
                      expanded ? (
                        <ChevronDown className="tree-chevron" size={12} />
                      ) : (
                        <ChevronRight className="tree-chevron" size={12} />
                      )
                    )}
                    <NodeIcon node={node} expanded={expanded} />
                    {node.method && (
                      <MethodBadge method={node.method} compact />
                    )}
                    <span className="tree-label">{node.name}</span>
                    {node.favorite && (
                      <Star
                        className="favorite"
                        size={12}
                        fill="currentColor"
                        aria-label="Favorite"
                      />
                    )}
                  </button>
                </RequestContext>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="sidebar-empty">
          <Boxes size={22} />
          <strong>Henüz {section} yok</strong>
          <span>Workspace’e eklediğiniz öğeler burada görünür.</span>
        </div>
      )}

    </aside>
  );
}
