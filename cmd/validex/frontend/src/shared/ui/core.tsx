import type { ButtonHTMLAttributes, ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  AlertTriangle,
  CheckCircle2,
  FilePlus2,
  Inbox,
  XCircle,
} from "lucide-react";
import { useTranslation } from "../../i18n";
import type { HTTPMethod } from "../../lib/types";
import { cn } from "../../lib/utils";

export function Button({
  className,
  variant = "secondary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      className={cn("button", `button-${variant}`, `button-${size}`, className)}
      {...props}
    />
  );
}

export function IconButton({
  label,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className={cn("icon-button", className)}
          aria-label={label}
          {...props}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={7}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function MethodBadge({
  method,
  compact = false,
}: {
  method: HTTPMethod;
  compact?: boolean;
}) {
  const t = useTranslation();
  return (
    <span
      className={cn("method-badge", `method-${method.toLowerCase()}`, {
        "method-compact": compact,
      })}
      aria-label={t("common.httpMethod", { method })}
    >
      {method}
    </span>
  );
}

export function StatusMark({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger";
  children: ReactNode;
}) {
  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "warning"
        ? AlertTriangle
        : XCircle;
  return (
    <span className={cn("status-mark", `status-${tone}`)}>
      <Icon size={14} aria-hidden="true" />
      {children}
    </span>
  );
}

export function EmptyState({
  icon = "empty",
  title,
  description,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: {
  icon?: "empty" | "error" | "new";
  title: string;
  description: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
}) {
  const Icon = icon === "error" ? AlertTriangle : icon === "new" ? FilePlus2 : Inbox;
  return (
    <section className="empty-state">
      <div className={cn("empty-icon", icon === "error" && "empty-icon-error")}>
        <Icon size={24} aria-hidden="true" />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {(primaryLabel || secondaryLabel) && (
        <div className="empty-actions">
          {primaryLabel && (
            <Button variant="primary" onClick={onPrimary}>
              {primaryLabel}
            </Button>
          )}
          {secondaryLabel && (
            <Button onClick={onSecondary}>{secondaryLabel}</Button>
          )}
        </div>
      )}
    </section>
  );
}

export function CountBadge({ children }: { children: ReactNode }) {
  return <span className="count-badge">{children}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}
