import { AlertCircle, CircleDot, Files, LoaderCircle } from "lucide-react";
import { useTranslation } from "../i18n";
import type { BootstrapData } from "../lib/types";
import { useWorkspaceStore } from "../stores/workspace";

export function StatusBar({ bootstrap }: { bootstrap: BootstrapData }) {
  const t = useTranslation();
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabID = useWorkspaceStore((state) => state.activeTabID);
  const active = tabs.find((tab) => tab.id === activeTabID);
  const runningCount = tabs.filter((tab) => tab.running).length;
  const failedCount = tabs.filter((tab) => tab.error && !tab.running).length;
  const activeStatus = active?.running
    ? t("status.requestRunning")
    : active?.error
      ? t("status.requestFailed")
      : active?.response
        ? t("status.responseReceived", {
            status: active.response.statusCode,
          })
        : active?.dirty
          ? t("status.draftSaved")
          : active
            ? t("status.requestReady")
            : t("status.noActiveRequest");

  return (
    <footer className="statusbar">
      <div>
        <span>
          <Files size={12} aria-hidden="true" />
          {t(
            tabs.length === 1
              ? "status.openRequest.one"
              : "status.openRequest.many",
            { count: tabs.length },
          )}
        </span>
        {runningCount > 0 && (
          <span>
            <LoaderCircle className="spin" size={12} aria-hidden="true" />
            {t(
              runningCount === 1
                ? "status.running.one"
                : "status.running.many",
              { count: runningCount },
            )}
          </span>
        )}
        {failedCount > 0 && (
          <span>
            <AlertCircle size={12} aria-hidden="true" />
            {t(
              failedCount === 1 ? "status.failed.one" : "status.failed.many",
              { count: failedCount },
            )}
          </span>
        )}
      </div>
      <div>
        <span>
          <CircleDot size={11} aria-hidden="true" />
          {activeStatus}
        </span>
        <span>Validex {bootstrap.appVersion}</span>
      </div>
    </footer>
  );
}
