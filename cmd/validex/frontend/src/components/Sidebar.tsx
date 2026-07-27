import { useMemo, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileJson2, FilePlus2, Search, Waypoints } from "lucide-react";
import {
  importedEndpointTabID,
  importedRequestURL,
} from "../lib/openapi";
import type { BootstrapData, HTTPMethod, RequestTab } from "../lib/types";
import { cn } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";
import { Button, MethodBadge } from "./ui";

const sections = [
  { id: "requests", label: "Requests", icon: FileJson2 },
  { id: "apis", label: "APIs", icon: Waypoints },
] as const;

interface SidebarNode {
  id: string;
  name: string;
  method: HTTPMethod;
  url: string;
  openApi?: RequestTab["openApi"];
}

function openSidebarNode(
  node: SidebarNode,
  openTab: (tab?: Partial<RequestTab>) => void,
) {
  if (!node.method) return;
  openTab({
    id: node.id,
    name: node.name,
    method: node.method,
    url: node.url ?? "",
    openApi: node.openApi,
    dirty: false,
  });
}

function RequestContext({
  node,
  children,
}: {
  node: SidebarNode;
  children: React.ReactNode;
}) {
  const openTab = useWorkspaceStore((state) => state.openTab);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="menu context-menu">
          <ContextMenu.Item
            className="menu-item"
            onSelect={() => openSidebarNode(node, openTab)}
          >
            <FileJson2 size={15} /> Open request
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export function Sidebar({ bootstrap: _bootstrap }: { bootstrap: BootstrapData }) {
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const section = useWorkspaceStore((state) => state.sidebarSection);
  const setSection = useWorkspaceStore((state) => state.setSidebarSection);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const tabs = useWorkspaceStore((state) => state.tabs);
  const importedSpec = useWorkspaceStore((state) => state.latestImportedSpec);
  const itemCount =
    section === "apis" ? (importedSpec?.endpoints.length ?? 0) : tabs.length;

  const visibleNodes = useMemo<SidebarNode[]>(() => {
    const normalized = query.trim().toLocaleLowerCase("tr");
    if (section === "apis") {
      if (!importedSpec) return [];
      return importedSpec.endpoints
        .filter((endpoint) =>
          `${endpoint.summary} ${endpoint.method} ${endpoint.path} ${endpoint.tags.join(" ")}`
            .toLocaleLowerCase("tr")
            .includes(normalized),
        )
        .map((endpoint) => ({
          id: importedEndpointTabID(importedSpec.specId, endpoint.id),
          name: endpoint.summary || endpoint.path,
          method: endpoint.method,
          url: importedRequestURL(importedSpec.baseUrl, endpoint.path),
          openApi: {
            specId: importedSpec.specId,
            path: endpoint.path,
          },
        }));
    }

    return tabs
      .filter((tab) =>
        `${tab.name} ${tab.method} ${tab.url}`
          .toLocaleLowerCase("tr")
          .includes(normalized),
      )
      .map((tab) => ({
        id: tab.id,
        name: tab.name,
        method: tab.method,
        url: tab.url,
        openApi: tab.openApi,
      }));
  }, [importedSpec, query, section, tabs]);

  const virtualizer = useVirtualizer({
    count: visibleNodes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 31,
    overscan: 10,
  });

  return (
    <aside className="sidebar" aria-label="Request navigation">
      <nav className="sidebar-sections" aria-label="Request sections">
        {sections.map(({ id, label, icon: Icon }) => {
          const count =
            id === "apis" ? (importedSpec?.endpoints.length ?? 0) : tabs.length;
          return (
            <button
              key={id}
              className={cn("sidebar-section", section === id && "active")}
              onClick={() => {
                setSection(id);
                setQuery("");
              }}
              aria-current={section === id ? "page" : undefined}
              aria-label={label}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{label}</span>
              <span className="section-count">{count}</span>
            </button>
          );
        })}
      </nav>

      {section === "apis" && importedSpec && (
        <div className="sidebar-source" title={importedSpec.title}>
          <strong>{importedSpec.title || "Imported OpenAPI"}</strong>
          <span>{importedSpec.endpoints.length} endpoints</span>
        </div>
      )}

      {itemCount > 0 && (
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
      )}

      {visibleNodes.length > 0 ? (
        <div ref={scrollRef} className="tree-scroll" tabIndex={0}>
          <div
            className="virtual-list"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const node = visibleNodes[virtualItem.index];
              return (
                <RequestContext key={node.id} node={node}>
                  <button
                    className="tree-row"
                    style={{
                      transform: `translateY(${virtualItem.start}px)`,
                      paddingLeft: "10px",
                    }}
                    onClick={() => openSidebarNode(node, openTab)}
                    title={node.url}
                  >
                    {node.method && <MethodBadge method={node.method} compact />}
                    <span className="tree-label">{node.name}</span>
                  </button>
                </RequestContext>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="sidebar-empty">
          {query.trim() ? (
            <Search size={22} />
          ) : section === "apis" ? (
            <Waypoints size={22} />
          ) : (
            <FileJson2 size={22} />
          )}
          <strong>
            {query.trim()
              ? "Eşleşen request bulunamadı"
              : section === "apis"
                ? "Henüz OpenAPI içe aktarılmadı"
                : "Henüz açık request yok"}
          </strong>
          <span>
            {query.trim()
              ? "Farklı bir arama terimi deneyin."
              : section === "apis"
                ? "New menüsünden OpenAPI dosyanızı içe aktarın."
                : "İlk API request’inizi oluşturarak başlayın."}
          </span>
          {!query.trim() && section === "requests" && (
            <Button
              size="sm"
              variant="primary"
              onClick={() =>
                openTab({ name: "Untitled request", url: "", dirty: true })
              }
            >
              <FilePlus2 size={14} /> New request
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
