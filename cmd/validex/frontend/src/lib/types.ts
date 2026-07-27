export type HTTPMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

export type ThemePreference = "system" | "light" | "dark";
export type ResponsePlacement = "vertical" | "horizontal";

export interface KeyValue {
  id: string;
  enabled: boolean;
  key: string;
  value: string;
  description?: string;
  source?: "Manual" | "OpenAPI" | "Environment" | "Extracted" | "Generated";
}

export interface RequestInput {
  id: string;
  name: string;
  method: HTTPMethod;
  url: string;
  headers: Omit<KeyValue, "id">[];
  body: string;
  variables: Record<string, string>;
  timeoutMs: number;
  saveHistory: boolean;
}

export interface TimelinePhase {
  id: string;
  label: string;
  durationMs: number;
  percent: number;
  description?: string;
}

export interface ResponseCookie {
  name: string;
  value: string;
  path: string;
  domain: string;
  expires?: string;
  httpOnly: boolean;
  secure: boolean;
}

export interface ResponseEnvelope {
  requestId: string;
  statusCode: number;
  status: string;
  durationMs: number;
  sizeBytes: number;
  contentType: string;
  protocol: string;
  remoteAddr: string;
  tls: string;
  traceId: string;
  headers: Record<string, string[]>;
  cookies: ResponseCookie[];
  body: string;
  rawBody: string;
  timeline: TimelinePhase[];
  resolvedUrl: string;
}

export interface UserError {
  code: string;
  title: string;
  message: string;
  hint?: string;
  technical?: string;
}

export interface SendResult {
  response?: ResponseEnvelope;
  error?: UserError;
}

export interface CollectionNode {
  id: string;
  parentId?: string;
  kind:
    | "workspace"
    | "collection"
    | "folder"
    | "request"
    | "flow"
    | "operation"
    | "example"
    | "mock";
  name: string;
  method?: HTTPMethod;
  url?: string;
  depth: number;
  expanded?: boolean;
  favorite?: boolean;
}

export interface EnvironmentSummary {
  id: string;
  name: string;
  variables: Record<string, string>;
}

export interface HistoryEntry {
  id: string;
  requestName: string;
  method: HTTPMethod;
  url: string;
  statusCode: number;
  durationMs: number;
  environment: string;
  createdAt: string;
  assertionsOk: boolean;
  traceId?: string;
  resolvedValues: number;
}

export interface BootstrapData {
  appVersion: string;
  workspaceId: string;
  workspaceName: string;
  environments: EnvironmentSummary[];
  collections: CollectionNode[];
  history: HistoryEntry[];
  recentUrls: string[];
  onboardingSteps: string[];
}

export interface ImportedEndpoint {
  id: string;
  method: HTTPMethod;
  path: string;
  summary: string;
  tags: string[];
}

export interface ImportSpecResult {
  path: string;
  title: string;
  version: string;
  baseUrl: string;
  endpoints: ImportedEndpoint[];
  canceled: boolean;
  error?: UserError;
}

export interface GeneratedFile {
  name: string;
  relativePath: string;
  content: string;
}

export interface FileWriteResult {
  path: string;
  count: number;
  canceled: boolean;
  error?: UserError;
}

export interface RequestTab {
  id: string;
  name: string;
  method: HTTPMethod;
  url: string;
  body: string;
  headers: KeyValue[];
  dirty: boolean;
  running: boolean;
  error: boolean;
  pinned: boolean;
  requestSection:
    | "params"
    | "authorization"
    | "headers"
    | "body"
    | "scripts"
    | "assertions"
    | "settings"
    | "documentation";
  responseSection:
    | "body"
    | "headers"
    | "cookies"
    | "assertions"
    | "timeline"
    | "contract"
    | "console"
    | "raw";
  response?: ResponseEnvelope;
  userError?: UserError;
}
