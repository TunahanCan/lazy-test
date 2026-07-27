import { useEffect, useMemo, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { FileJson2, FilePlus2, Search, Waypoints } from "lucide-react";
import {
  importedEndpointTabID,
  importedRequestURL,
} from "../lib/openapi";
import { useLocale, useTranslation } from "../i18n";
import type { BootstrapData, HTTPMethod, RequestTab } from "../lib/types";
import { cn } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";
import { Button, MethodBadge } from "../shared/ui";

const sections = [
  { id: "requests", labelKey: "sidebar.requests", icon: FileJson2 },
  { id: "apis", labelKey: "sidebar.apis", icon: Waypoints },
] as const;

const sidebarRowHeight = 31;
const sidebarOverscan = 10;

function visibleRowRange(
  count: number,
  scrollTop: number,
  viewportHeight: number,
) {
  const effectiveHeight =
    viewportHeight > 0 ? viewportHeight : sidebarRowHeight * 20;
  const start = Math.max(
    0,
    Math.floor(scrollTop / sidebarRowHeight) - sidebarOverscan,
  );
  const end = Math.min(
    count,
    Math.ceil((scrollTop + effectiveHeight) / sidebarRowHeight) +
      sidebarOverscan,
  );
  return { start, end };
}

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
  const t = useTranslation();
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
            <FileJson2 size={15} /> {t("sidebar.openRequest")}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export function Sidebar({ bootstrap: _bootstrap }: { bootstrap: BootstrapData }) {
  const { locale, t } = useLocale();
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });
  const section = useWorkspaceStore((state) => state.sidebarSection);
  const setSection = useWorkspaceStore((state) => state.setSidebarSection);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const tabs = useWorkspaceStore((state) => state.tabs);
  const importedSpec = useWorkspaceStore((state) => state.latestImportedSpec);
  const itemCount =
    section === "apis" ? (importedSpec?.endpoints.length ?? 0) : tabs.length;

  const visibleNodes = useMemo<SidebarNode[]>(() => {
    const normalized = query.trim().toLocaleLowerCase(locale);
    if (section === "apis") {
      if (!importedSpec) return [];
      return importedSpec.endpoints
        .filter((endpoint) =>
          `${endpoint.summary} ${endpoint.method} ${endpoint.path} ${endpoint.tags.join(" ")}`
            .toLocaleLowerCase(locale)
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
          .toLocaleLowerCase(locale)
          .includes(normalized),
      )
      .map((tab) => ({
        id: tab.id,
        name: tab.name,
        method: tab.method,
        url: tab.url,
        openApi: tab.openApi,
      }));
  }, [importedSpec, locale, query, section, tabs]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const measure = () =>
      setViewport((current) => ({
        scrollTop: current.scrollTop,
        height: scrollElement.clientHeight,
      }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [visibleNodes.length]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setViewport((current) => ({ ...current, scrollTop: 0 }));
  }, [query, section]);

  const rowRange = visibleRowRange(
    visibleNodes.length,
    viewport.scrollTop,
    viewport.height,
  );
  const virtualRows = visibleNodes
    .slice(rowRange.start, rowRange.end)
    .map((node, offset) => ({
      node,
      index: rowRange.start + offset,
    }));

  return (
    <aside className="sidebar" aria-label={t("sidebar.navigation")}>
      <nav className="sidebar-sections" aria-label={t("sidebar.sections")}>
        {sections.map(({ id, labelKey, icon: Icon }) => {
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
              aria-label={t(labelKey)}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{t(labelKey)}</span>
              <span className="section-count">{count}</span>
            </button>
          );
        })}
      </nav>

      {section === "apis" && importedSpec && (
        <div className="sidebar-source" title={importedSpec.title}>
          <strong>{importedSpec.title || t("sidebar.importedOpenAPI")}</strong>
          <span>
            {t(
              importedSpec.endpoints.length === 1
                ? "sidebar.endpointCount.one"
                : "sidebar.endpointCount.many",
              { count: importedSpec.endpoints.length },
            )}
          </span>
        </div>
      )}

      {itemCount > 0 && (
        <div className="sidebar-toolbar">
          <label className="sidebar-search">
            <Search size={14} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                section === "apis"
                  ? t("sidebar.searchAPIs")
                  : t("sidebar.searchRequests")
              }
              aria-label={
                section === "apis"
                  ? t("sidebar.searchAPIs")
                  : t("sidebar.searchRequests")
              }
            />
          </label>
        </div>
      )}

      {visibleNodes.length > 0 ? (
        <div
          ref={scrollRef}
          className="tree-scroll"
          onScroll={(event) =>
            setViewport({
              scrollTop: event.currentTarget.scrollTop,
              height: event.currentTarget.clientHeight,
            })
          }
        >
          <div
            className="virtual-list"
            style={{ height: `${visibleNodes.length * sidebarRowHeight}px` }}
          >
            {virtualRows.map(({ node, index }) => {
              return (
                <RequestContext key={node.id} node={node}>
                  <button
                    className="tree-row"
                    style={{
                      transform: `translateY(${index * sidebarRowHeight}px)`,
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
              ? t("sidebar.noSearchResult")
              : section === "apis"
                ? t("sidebar.noImportedOpenAPI")
                : t("sidebar.noOpenRequest")}
          </strong>
          <span>
            {query.trim()
              ? t("sidebar.tryDifferentSearch")
              : section === "apis"
                ? t("sidebar.importOpenAPIHint")
                : t("sidebar.createFirstRequestHint")}
          </span>
          {!query.trim() && section === "requests" && (
            <Button
              size="sm"
              variant="primary"
              onClick={() =>
                openTab({
                  name: t("chrome.untitledRequest"),
                  url: "",
                  dirty: true,
                })
              }
            >
              <FilePlus2 size={14} /> {t("chrome.newRequest")}
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
