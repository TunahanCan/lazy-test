import type { IconName } from "../core/icons.js";
import type { TranslationKey } from "../i18n/messages.js";
import type { WorkspaceView } from "../lib/types.js";

export interface WorkspaceDefinition {
  id: WorkspaceView;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  keywords: string;
  icon: IconName;
}

export const workspaceDefinitions: readonly WorkspaceDefinition[] = [
  {
    id: "requests",
    labelKey: "workspace.requests.label",
    descriptionKey: "workspace.requests.description",
    keywords: "request istek http response",
    icon: "request",
  },
  {
    id: "mock",
    labelKey: "workspace.mock.label",
    descriptionKey: "workspace.mock.description",
    keywords: "mock server openapi response route",
    icon: "mock",
  },
  {
    id: "json",
    labelKey: "workspace.json.label",
    descriptionKey: "workspace.json.description",
    keywords: "json format diff path schema dto",
    icon: "braces",
  },
  {
    id: "diagnostics",
    labelKey: "workspace.diagnostics.label",
    descriptionKey: "workspace.diagnostics.description",
    keywords: "spring actuator jwt trace thread coverage environment",
    icon: "activity",
  },
  {
    id: "performance",
    labelKey: "workspace.performance.label",
    descriptionKey: "workspace.performance.description",
    keywords:
      "performance load latency throughput percentile url test performans yük gecikme",
    icon: "history",
  },
  {
    id: "protocols",
    labelKey: "workspace.protocols.label",
    descriptionKey: "workspace.protocols.description",
    keywords: "sse server sent events event stream olay akış connection bağlantı",
    icon: "protocols",
  },
  {
    id: "automation",
    labelKey: "workspace.automation.label",
    descriptionKey: "workspace.automation.description",
    keywords: "automation collection runner assertion dns redirect openapi lint cli",
    icon: "automation",
  },
] as const;

export function workspaceDefinition(view: WorkspaceView): WorkspaceDefinition {
  return (
    workspaceDefinitions.find((definition) => definition.id === view) ??
    workspaceDefinitions[0]
  );
}
