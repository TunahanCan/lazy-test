import { useEffect, useRef } from "react";
import { workspaceDefinitions } from "../app/workspaceRegistry";
import { useTranslation } from "../i18n";
import { cn } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";

export function ActivityBar() {
  const t = useTranslation();
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const activeView = useWorkspaceStore((state) => state.activeView);
  const setActiveView = useWorkspaceStore((state) => state.setActiveView);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeView]);

  return (
    <nav className="activity-bar" aria-label={t("workspace.navigation")}>
      {workspaceDefinitions.map(
        ({ id, labelKey, descriptionKey, icon: Icon }) => (
        <button
          type="button"
          key={id}
          ref={activeView === id ? activeItemRef : undefined}
          className={cn("activity-item", activeView === id && "active")}
          onClick={() => setActiveView(id)}
          aria-current={activeView === id ? "page" : undefined}
          aria-label={t(labelKey)}
          title={`${t(labelKey)} — ${t(descriptionKey)}`}
        >
          <Icon size={19} aria-hidden />
          <span>{t(labelKey)}</span>
        </button>
        ),
      )}
    </nav>
  );
}
