import { AlertCircle, CircleDot, Files, LoaderCircle } from "lucide-react";
import { useTranslation } from "../i18n";
import type { BootstrapData } from "../lib/types";
import {
  COLLECTION_LIBRARY_PERSISTENCE_PHASE,
  useCollectionLibraryPersistence,
} from "../stores/collectionLibraryStorage";
import { useWorkspaceStore } from "../stores/workspace";

export function StatusBar({ bootstrap }: { bootstrap: BootstrapData }) {
  const t = useTranslation();
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabID = useWorkspaceStore((state) => state.activeTabID);
  const collectionPersistence =
    useCollectionLibraryPersistence();
  const active = tabs.find((tab) => tab.id === activeTabID);
  const runningCount = tabs.filter((tab) => tab.running).length;
  const failedCount = tabs.filter((tab) => tab.error && !tab.running).length;
  const activeStatus = active?.running
    ? t("status.requestRunning")
    : collectionPersistence.phase ===
        COLLECTION_LIBRARY_PERSISTENCE_PHASE.SAVING
      ? t("status.collectionSaving")
      : collectionPersistence.phase ===
          COLLECTION_LIBRARY_PERSISTENCE_PHASE.ERROR
        ? t(
            collectionPersistence.operation === "read"
              ? "status.collectionLoadFailed"
              : "status.collectionSaveFailed",
          )
        : active?.error
          ? t("status.requestFailed")
          : active?.dirty
            ? t("status.draftSaved")
            : active?.response
              ? t("status.responseReceived", {
                  status: active.response.statusCode,
                })
              : active?.savedRequestId
                ? t("status.savedRequest")
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
