import {
  ArrowUpRight,
  FilePlus2,
  Import,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import {
  toolWorkspaceDefinitions,
  type ToolWorkspaceView,
} from "../../app/workspaceRegistry";
import { useTranslation } from "../../i18n";
import { shortcutLabel } from "../../lib/shortcuts";
import { cn } from "../../lib/utils";
import { Button } from "../../shared/ui";

export interface WelcomeImportNotice {
  message: string;
  tone: "success" | "error";
}

export function WelcomeWorkspace({
  importPending,
  importNotice,
  onCreateRequest,
  onImportOpenAPI,
  onOpenTool,
}: {
  importPending: boolean;
  importNotice: WelcomeImportNotice | null;
  onCreateRequest: () => void;
  onImportOpenAPI: () => void;
  onOpenTool: (view: ToolWorkspaceView) => void;
}) {
  const t = useTranslation();

  return (
    <section
      className="welcome-state"
      aria-labelledby="welcome-workspace-title"
    >
      <div className="welcome-mark">
        <Sparkles size={24} />
      </div>
      <p className="eyebrow">{t("requests.welcome.eyebrow")}</p>
      <h1 id="welcome-workspace-title">{t("requests.welcome.title")}</h1>
      <p>{t("requests.welcome.description")}</p>
      <div className="welcome-actions">
        <Button variant="primary" onClick={onCreateRequest}>
          <FilePlus2 size={15} /> {t("requests.welcome.newRequest")}
        </Button>
        <Button disabled={importPending} onClick={onImportOpenAPI}>
          {importPending ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <Import size={15} />
          )}
          {importPending
            ? t("requests.welcome.importing")
            : t("requests.welcome.importOpenAPI")}
        </Button>
      </div>
      {importNotice && (
        <p
          className={cn(
            "welcome-import-notice",
            importNotice.tone === "error" && "danger",
          )}
          role={importNotice.tone === "error" ? "alert" : "status"}
        >
          {importNotice.message}
        </p>
      )}
      <section className="welcome-tools" aria-labelledby="welcome-tools-title">
        <div className="welcome-tools-heading">
          <div>
            <h2 id="welcome-tools-title">
              {t("requests.welcome.quickTools")}
            </h2>
            <p>{t("requests.welcome.quickToolsDescription")}</p>
          </div>
        </div>
        <div className="welcome-tool-grid">
          {toolWorkspaceDefinitions.map(
            ({ id, labelKey, descriptionKey, icon: Icon }) => {
              const label = t(labelKey);
              return (
                <button
                  type="button"
                  className="welcome-tool-card"
                  key={id}
                  aria-label={t("requests.welcome.openTool", { tool: label })}
                  aria-describedby={`welcome-tool-${id}-description`}
                  onClick={() => onOpenTool(id)}
                >
                  <span className="welcome-tool-icon" aria-hidden="true">
                    <Icon size={17} />
                  </span>
                  <span className="welcome-tool-copy">
                    <strong>{label}</strong>
                    <span id={`welcome-tool-${id}-description`}>
                      {t(descriptionKey)}
                    </span>
                  </span>
                  <ArrowUpRight
                    className="welcome-tool-arrow"
                    size={14}
                    aria-hidden="true"
                  />
                </button>
              );
            },
          )}
        </div>
      </section>
      <div className="welcome-shortcuts">
        <span>
          <strong>{shortcutLabel("K")}</strong>{" "}
          {t("requests.welcome.searchCommands")}
        </span>
        <span>
          <strong>{shortcutLabel("N")}</strong>{" "}
          {t("requests.welcome.newRequest")}
        </span>
        <span>
          <strong>{shortcutLabel("T", { shift: true })}</strong>{" "}
          {t("requests.welcome.reopenTab")}
        </span>
      </div>
    </section>
  );
}
