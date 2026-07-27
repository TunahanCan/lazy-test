import {
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "../../i18n";
import { cn } from "../../lib/utils";

export type NoticeTone = "success" | "error" | "info";

export function ToolNotice({
  tone = "info",
  title,
  children,
  hint,
  technical,
  className,
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  technical?: ReactNode;
  className?: string;
}) {
  const t = useTranslation();
  const Icon =
    tone === "error" ? AlertTriangle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div
      className={cn(
        "tool-notice",
        "tool-notice-row",
        tone !== "info" && tone,
        className,
      )}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      <Icon size={16} aria-hidden />
      <div className="tool-notice-content">
        {title && <strong>{title}</strong>}
        <span>{children}</span>
        {hint && <small>{hint}</small>}
        {technical && (
          <details>
            <summary>{t("common.technicalDetails")}</summary>
            <code>{technical}</code>
          </details>
        )}
      </div>
    </div>
  );
}
