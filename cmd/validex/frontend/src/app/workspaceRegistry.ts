import {
  Activity,
  Braces,
  ListChecks,
  RadioTower,
  SendHorizontal,
  ServerCog,
  type LucideIcon,
} from "lucide-react";
import type { TranslationKey } from "../i18n";
import type { WorkspaceView } from "../lib/types";

export type ToolWorkspaceView = Exclude<WorkspaceView, "requests">;

export interface WorkspaceDefinition {
  id: WorkspaceView;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  keywords: string;
  icon: LucideIcon;
}

export const workspaceDefinitions: readonly WorkspaceDefinition[] = [
  {
    id: "requests",
    labelKey: "workspace.requests.label",
    descriptionKey: "workspace.requests.description",
    keywords: "request istek http response",
    icon: SendHorizontal,
  },
  {
    id: "mock",
    labelKey: "workspace.mock.label",
    descriptionKey: "workspace.mock.description",
    keywords: "mock server openapi response route",
    icon: ServerCog,
  },
  {
    id: "json",
    labelKey: "workspace.json.label",
    descriptionKey: "workspace.json.description",
    keywords: "json format diff path schema dto",
    icon: Braces,
  },
  {
    id: "diagnostics",
    labelKey: "workspace.diagnostics.label",
    descriptionKey: "workspace.diagnostics.description",
    keywords: "spring actuator jwt trace thread coverage environment",
    icon: Activity,
  },
  {
    id: "protocols",
    labelKey: "workspace.protocols.label",
    descriptionKey: "workspace.protocols.description",
    keywords:
      "sse server sent events event stream olay akış connection bağlantı",
    icon: RadioTower,
  },
  {
    id: "automation",
    labelKey: "workspace.automation.label",
    descriptionKey: "workspace.automation.description",
    keywords:
      "automation collection runner assertion dns redirect openapi lint cli",
    icon: ListChecks,
  },
] as const;

export const toolWorkspaceDefinitions = workspaceDefinitions.filter(
  (
    definition,
  ): definition is WorkspaceDefinition & { id: ToolWorkspaceView } =>
    definition.id !== "requests",
);

export function workspaceDefinition(view: WorkspaceView): WorkspaceDefinition {
  return (
    workspaceDefinitions.find((definition) => definition.id === view) ??
    workspaceDefinitions[0]
  );
}
