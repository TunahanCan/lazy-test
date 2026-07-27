import { AlertCircle, CircleDot, Files, LoaderCircle } from "lucide-react";
import type { BootstrapData } from "../lib/types";
import { useWorkspaceStore } from "../stores/workspace";

export function StatusBar({ bootstrap }: { bootstrap: BootstrapData }) {
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabID = useWorkspaceStore((state) => state.activeTabID);
  const active = tabs.find((tab) => tab.id === activeTabID);
  const runningCount = tabs.filter((tab) => tab.running).length;
  const failedCount = tabs.filter((tab) => tab.error && !tab.running).length;
  const activeStatus = active?.running
    ? "Request running"
    : active?.error
      ? "Request failed"
      : active?.response
        ? `${active.response.statusCode} response received`
        : active?.dirty
          ? "Draft edited"
          : active
            ? "Request ready"
            : "No active request";

  return (
    <footer className="statusbar">
      <div>
        <span>
          <Files size={12} aria-hidden="true" />
          {tabs.length} open {tabs.length === 1 ? "request" : "requests"}
        </span>
        {runningCount > 0 && (
          <span>
            <LoaderCircle className="spin" size={12} aria-hidden="true" />
            {runningCount} running
          </span>
        )}
        {failedCount > 0 && (
          <span>
            <AlertCircle size={12} aria-hidden="true" />
            {failedCount} failed
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
