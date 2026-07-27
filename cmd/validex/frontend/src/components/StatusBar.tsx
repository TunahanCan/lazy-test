import { Check, CircleDot, GitBranch, Wifi } from "lucide-react";
import type { BootstrapData } from "../lib/types";
import { useWorkspaceStore } from "../stores/workspace";

export function StatusBar({ bootstrap }: { bootstrap: BootstrapData }) {
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabID = useWorkspaceStore((state) => state.activeTabID);
  const active = tabs.find((tab) => tab.id === activeTabID);
  return (
    <footer className="statusbar">
      <div>
        <span className="connection-ok">
          <Wifi size={12} aria-hidden="true" /> Connected
        </span>
        <span>
          <Check size={12} aria-hidden="true" /> Workspace saved
        </span>
        <span>
          <GitBranch size={12} aria-hidden="true" /> main
        </span>
      </div>
      <div>
        {active && (
          <span>
            <CircleDot size={11} aria-hidden="true" />
            {active.dirty ? "Unsaved changes" : "Request saved"}
          </span>
        )}
        <span>Validex {bootstrap.appVersion}</span>
      </div>
    </footer>
  );
}
