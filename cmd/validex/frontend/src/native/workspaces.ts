import type { Disposable } from "../core/dom.js";
import type { IconName } from "../core/icons.js";
import type { TranslationKey } from "../i18n/messages.js";
import { isWorkspaceView, type WorkspaceView } from "../lib/types.js";

export type WorkspaceGroup = "primary" | "tools";
export type ToolWorkspaceView = Exclude<WorkspaceView, "requests">;
export type WorkspaceMount = (root: HTMLElement) => Disposable;

interface WorkspaceDefinitionBase {
  id: WorkspaceView;
  labelKey: TranslationKey;
  compactLabelKey: TranslationKey;
  descriptionKey: TranslationKey;
  keywords: string;
  icon: IconName;
  group: WorkspaceGroup;
}

export interface PrimaryWorkspaceDefinition extends WorkspaceDefinitionBase {
  id: "requests";
  group: "primary";
}

export interface ToolWorkspaceDefinition extends WorkspaceDefinitionBase {
  id: ToolWorkspaceView;
  group: "tools";
  load(): Promise<WorkspaceMount>;
}

export type WorkspaceDefinition =
  | PrimaryWorkspaceDefinition
  | ToolWorkspaceDefinition;

export const workspaceDefinitions = [
  {
    id: "requests",
    labelKey: "workspace.requests.label",
    compactLabelKey: "workspace.requests.compactLabel",
    descriptionKey: "workspace.requests.description",
    keywords: "request istek http response",
    icon: "request",
    group: "primary",
  },
  {
    id: "mock",
    labelKey: "workspace.mock.label",
    compactLabelKey: "workspace.mock.compactLabel",
    descriptionKey: "workspace.mock.description",
    keywords: "mock server openapi response route",
    icon: "mock",
    group: "tools",
    load: async () =>
      (await import("./features/mockServer.js")).mountMockServerLab,
  },
  {
    id: "json",
    labelKey: "workspace.json.label",
    compactLabelKey: "workspace.json.compactLabel",
    descriptionKey: "workspace.json.description",
    keywords: "json format diff path schema dto",
    icon: "braces",
    group: "tools",
    load: async () => (await import("./features/json-lab.js")).mountJSONLab,
  },
  {
    id: "diagnostics",
    labelKey: "workspace.diagnostics.label",
    compactLabelKey: "workspace.diagnostics.compactLabel",
    descriptionKey: "workspace.diagnostics.description",
    keywords: "spring actuator jwt trace thread coverage environment",
    icon: "activity",
    group: "tools",
    load: async () =>
      (await import("./features/diagnostics.js")).mountDiagnosticsLab,
  },
  {
    id: "performance",
    labelKey: "workspace.performance.label",
    compactLabelKey: "workspace.performance.compactLabel",
    descriptionKey: "workspace.performance.description",
    keywords:
      "performance load latency throughput percentile url test performans yük gecikme",
    icon: "history",
    group: "tools",
    load: async () =>
      (await import("./features/performance.js")).mountPerformanceLab,
  },
  {
    id: "protocols",
    labelKey: "workspace.protocols.label",
    compactLabelKey: "workspace.protocols.compactLabel",
    descriptionKey: "workspace.protocols.description",
    keywords: "sse server sent events event stream olay akış connection bağlantı",
    icon: "protocols",
    group: "tools",
    load: async () => (await import("./features/protocol-lab.js")).mountProtocolLab,
  },
  {
    id: "automation",
    labelKey: "workspace.automation.label",
    compactLabelKey: "workspace.automation.compactLabel",
    descriptionKey: "workspace.automation.description",
    keywords: "automation collection runner assertion dns redirect openapi lint cli",
    icon: "automation",
    group: "tools",
    load: async () =>
      (await import("./features/automation.js")).mountAutomationLab,
  },
] as const satisfies readonly WorkspaceDefinition[];

type RegisteredToolWorkspaceDefinition = Extract<
  (typeof workspaceDefinitions)[number],
  { readonly group: "tools" }
>;

export const toolWorkspaceDefinitions = workspaceDefinitions.filter(
  (definition): definition is RegisteredToolWorkspaceDefinition =>
    definition.group === "tools",
);

export function isToolWorkspaceView(
  view: unknown,
): view is ToolWorkspaceView {
  return isWorkspaceView(view) && view !== "requests";
}

export function workspaceDefinition(view: WorkspaceView): WorkspaceDefinition {
  const definition = workspaceDefinitions.find(
    (candidate) => candidate.id === view,
  );
  if (!definition) throw new Error(`Unknown workspace: ${view}`);
  return definition;
}

export function toolWorkspaceDefinition(
  view: ToolWorkspaceView,
): ToolWorkspaceDefinition {
  const definition = toolWorkspaceDefinitions.find(
    (candidate) => candidate.id === view,
  );
  if (!definition) throw new Error(`Unknown tool workspace: ${view}`);
  return definition;
}
