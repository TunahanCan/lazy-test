import {
  useEffect,
  useRef,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "../../lib/utils";

export function ToolPage({
  labelledBy,
  eyebrow,
  title,
  description,
  meta,
  className,
  children,
}: {
  labelledBy: string;
  eyebrow: string;
  title: string;
  description: ReactNode;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("tool-page", className)}
      aria-labelledby={labelledBy}
    >
      <header className="tool-page-header">
        <div>
          <span className="tool-eyebrow">{eyebrow}</span>
          <h1 id={labelledBy}>{title}</h1>
          <p>{description}</p>
        </div>
        {meta && <div className="tool-header-meta">{meta}</div>}
      </header>
      {children}
    </section>
  );
}

export interface ToolTabDefinition<T extends string> {
  id: T;
  label: string;
  description?: string;
  icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
}

export function ToolTabs<T extends string>({
  value,
  tabs,
  label,
  idBase,
  disabled = false,
  className,
  onChange,
}: {
  value: T;
  tabs: readonly ToolTabDefinition<T>[];
  label: string;
  idBase?: string;
  disabled?: boolean;
  className?: string;
  onChange: (value: T) => void;
}) {
  const tabListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = tabListRef.current?.querySelector<HTMLElement>(
      '[aria-selected="true"]',
    );
    active?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
  }, [value]);

  const moveFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    const lastIndex = tabs.length - 1;
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = lastIndex;
    if (nextIndex === undefined || disabled) return;
    event.preventDefault();
    onChange(tabs[nextIndex].id);
    const tabButtons =
      tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabButtons?.[nextIndex]?.focus();
  };

  return (
    <div
      ref={tabListRef}
      className={cn("tool-tabs", className)}
      role="tablist"
      aria-label={label}
    >
      {tabs.map(({ id, label: tabLabel, icon: Icon }, index) => (
        <button
          type="button"
          key={id}
          role="tab"
          className={cn(value === id && "active")}
          disabled={disabled}
          onClick={() => onChange(id)}
          onKeyDown={(event) => moveFocus(event, index)}
          aria-selected={value === id}
          aria-controls={idBase ? `${idBase}-panel-${id}` : undefined}
          id={idBase ? `${idBase}-tab-${id}` : undefined}
          tabIndex={value === id ? 0 : -1}
        >
          <Icon size={15} aria-hidden />
          {tabLabel}
        </button>
      ))}
    </div>
  );
}

export function ToolCardHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="tool-card-header">
      <div>
        <h2>{title}</h2>
        {description && <span>{description}</span>}
      </div>
      {actions}
    </header>
  );
}
