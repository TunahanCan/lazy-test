import {
  Activity,
  Braces,
  RadioTower,
  SendHorizontal,
  ServerCog,
} from "lucide-react";
import type { WorkspaceView } from "../lib/types";
import { cn } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";

const destinations: Array<{
  id: WorkspaceView;
  label: string;
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
}> = [
  { id: "requests", label: "Requests", icon: SendHorizontal },
  { id: "mock", label: "Mock Server", icon: ServerCog },
  { id: "json", label: "JSON Lab", icon: Braces },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
  { id: "protocols", label: "Protocols", icon: RadioTower },
];

export function ActivityBar() {
  const activeView = useWorkspaceStore((state) => state.activeView);
  const setActiveView = useWorkspaceStore((state) => state.setActiveView);

  return (
    <nav className="activity-bar" aria-label="Validex çalışma alanları">
      {destinations.map(({ id, label, icon: Icon }) => (
        <button
          type="button"
          key={id}
          className={cn("activity-item", activeView === id && "active")}
          onClick={() => setActiveView(id)}
          aria-current={activeView === id ? "page" : undefined}
          aria-label={label}
          title={label}
        >
          <Icon size={19} aria-hidden />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
