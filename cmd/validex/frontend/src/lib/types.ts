import type { HTTPMethod } from "./http";

export type { HTTPMethod } from "./http";

export type ThemePreference = "system" | "light" | "dark";
export type ResponsePlacement = "vertical" | "horizontal";
export type WorkspaceView =
  | "requests"
  | "mock"
  | "json"
  | "diagnostics"
  | "protocols"
  | "automation";

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
  contract?: ContractCheckResult;
}

export interface UserError {
  code: string;
  title: string;
  message: string;
  hint?: string;
  technical?: string;
}

export interface CollectionLibraryLoadResult {
  data: string;
  found: boolean;
  error?: UserError;
}

export interface CollectionLibrarySaveResult {
  saved: boolean;
  error?: UserError;
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
  specId: string;
  path: string;
  title: string;
  version: string;
  baseUrl: string;
  endpoints: ImportedEndpoint[];
  canceled: boolean;
  error?: UserError;
}

export interface ContractFinding {
  path: string;
  type: "missing" | "extra" | "type_mismatch" | "enum_violation";
  expected?: string;
  actual?: string;
  allowed?: string[];
}

export interface ContractCheckResult {
  available: boolean;
  ok: boolean;
  truncated: boolean;
  method: string;
  path: string;
  findings: ContractFinding[];
  error?: UserError;
}

export interface ContractCheckInput {
  specId: string;
  method: HTTPMethod;
  path: string;
  statusCode: number;
  contentType: string;
  body: string;
}

export interface MockRoute {
  id: string;
  method: string;
  path: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  delayMs: number;
  enabled: boolean;
}

export interface MockHit {
  id: number;
  routeId?: string;
  method: string;
  path: string;
  rawQuery?: string;
  status: number;
  matched: boolean;
  pathParams?: Record<string, string>;
  timestamp: string;
  durationMs: number;
}

export interface MockServerState {
  running: boolean;
  host: string;
  port: number;
  baseUrl: string;
  routeCount: number;
  enabledCount: number;
  hitCount: number;
  totalHits: number;
  startedAt?: string;
  lastError?: string;
}

export interface MockServerSnapshot {
  state: MockServerState;
  routes: MockRoute[];
  hits: MockHit[];
  importedPath?: string;
  canceled: boolean;
  error?: UserError;
}

export interface SSEInput {
  operationId: string;
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
  maxEvents: number;
  insecureSkipVerify?: boolean;
}

export interface SSEResult {
  statusCode: number;
  headers: Record<string, string[]>;
  events: Array<{
    event: string;
    id: string;
    data: string;
    retryMillis: number;
    hasRetry: boolean;
  }>;
  durationMs: number;
  error?: UserError;
}

export interface WebSocketInput {
  operationId: string;
  url: string;
  headers: Record<string, string>;
  subprotocols: string[];
  send: Array<{
    type: "text" | "binary";
    data: string;
    encoding?: "utf-8" | "base64";
  }>;
  timeoutMs: number;
  maxMessages: number;
  insecureSkipVerify?: boolean;
}

export interface WebSocketResult {
  statusCode: number;
  headers: Record<string, string[]>;
  protocol: string;
  messages: Array<{
    type: "text" | "binary";
    data: string;
    encoding: "utf-8" | "base64";
    sizeBytes: number;
  }>;
  durationMs: number;
  error?: UserError;
}

export interface GRPCInput {
  operationId: string;
  address: string;
  metadata: Record<string, string>;
  timeoutMs: number;
  useTLS: boolean;
  serverName: string;
  insecureSkipVerify: boolean;
}

export interface GRPCResult {
  services: string[];
  reflectionVersion: string;
  connectionState: string;
  durationMs: number;
  error?: UserError;
}

export interface ActuatorMetricSample {
  name: string;
  description?: string;
  baseUnit?: string;
  measurements: Record<string, number>;
  availableTags?: Array<{ tag: string; values: string[] }>;
}

export interface ActuatorMetricSnapshot {
  capturedAt: string;
  metrics: Record<string, ActuatorMetricSample>;
  failures?: Record<string, string>;
}

export interface ActuatorInspectInput {
  baseUrl: string;
  headers: Record<string, string>;
  timeoutMs: number;
  metricNames: string[];
  includeMappings: boolean;
  before?: ActuatorMetricSnapshot;
}

export interface ActuatorInspectResult {
  health?: {
    status: string;
    components?: Record<string, unknown>;
    groups?: string[];
    data: Record<string, unknown>;
  };
  mappings?: {
    contexts?: Record<string, unknown>;
    data: Record<string, unknown>;
  };
  metrics: ActuatorMetricSnapshot;
  deltas: Array<{
    metric: string;
    statistic: string;
    before?: number;
    after?: number;
    delta?: number;
    percentChange?: number;
  }>;
  error?: UserError;
}

export interface EnvironmentCompareInput {
  method: string;
  path: string;
  headers: Record<string, string[]>;
  body: string;
  targets: Array<{ name: string; baseUrl: string }>;
  ignoreJsonPaths: string[];
  ignoreHeaders: string[];
  allowUnsafe: boolean;
  timeoutMs: number;
}

export interface EnvironmentCompareResult {
  method: string;
  path: string;
  responses: Array<{
    name: string;
    url: string;
    statusCode: number;
    durationMs: number;
    headers?: Record<string, string[]>;
    body?: string;
    contentType?: string;
    truncated: boolean;
    error?: string;
  }>;
  comparisons: Array<{
    baseline: string;
    candidate: string;
    statusMatch: boolean;
    baselineStatus: number;
    candidateStatus: number;
    headerDifferences?: string[];
    headerDifferencesTruncated: boolean;
    bodyEqual: boolean;
    bodyMode: string;
    jsonDifferences?: Array<{
      path: string;
      kind: string;
      baseline?: unknown;
      candidate?: unknown;
    }>;
    jsonDifferencesTruncated: boolean;
    error?: string;
  }>;
  error?: UserError;
}

export interface ThreadDumpResult {
  threadCount: number;
  stateCounts: Record<string, number>;
  blockedThreads?: Array<{ name: string; state: string; clues?: string[] }>;
  deadlockDetected: boolean;
  deadlockClues?: string[];
  repeatedStacks?: Array<{
    count: number;
    frames: string[];
    threads: string[];
  }>;
  truncated: boolean;
  error?: UserError;
}

export interface LogSearchResult {
  query: string;
  matches: Array<{ lineNumber: number; line: string }>;
  scannedLines: number;
  truncated: boolean;
  error?: UserError;
}

export interface CoverageInput {
  known: Array<{ method: string; path: string }>;
  observed: Array<{ method: string; path: string; count: number }>;
}

export interface CoverageResult {
  totalKnown: number;
  covered: number;
  coveragePercent: number;
  endpoints: Array<{
    method: string;
    path: string;
    hitCount: number;
    observedPaths?: string[];
  }>;
  unknownObserved?: Array<{ method: string; path: string; count: number }>;
  error?: UserError;
}

export interface CollectionRunInput {
  operationId: string;
  definition: string;
  variables: Record<string, string>;
}

export interface CollectionAssertion {
  id?: string;
  name?: string;
  target: "status" | "header" | "body" | "json_path" | "duration_ms";
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "exists"
    | "not_exists"
    | "less_than"
    | "greater_than"
    | "matches";
  path?: string;
  expected?: unknown;
}

export interface CollectionAssertionResult {
  assertion: CollectionAssertion;
  passed: boolean;
  actual?: unknown;
  message?: string;
  error?: string;
}

export interface CollectionRequestResult {
  id?: string;
  name?: string;
  method: string;
  url: string;
  statusCode?: number;
  headers?: Record<string, string[]>;
  headersTruncated?: boolean;
  body?: string;
  bodyTruncated?: boolean;
  durationMs: number;
  assertions: CollectionAssertionResult[];
  passed: boolean;
  failure?: {
    code: string;
    message: string;
    hint?: string;
  };
}

export interface CollectionRunReport {
  name?: string;
  startedAt: string;
  durationMs: number;
  results: CollectionRequestResult[];
  passed: number;
  failed: number;
}

export interface CollectionRunResult {
  report?: CollectionRunReport;
  error?: UserError;
}

export interface NetworkInspectInput {
  operationId: string;
  url: string;
  timeoutMs: number;
  maxRedirects: number;
  insecureSkipVerify: boolean;
}

export interface DNSLookup {
  host: string;
  ips: string[];
  durationMs: number;
}

export interface RedirectHop {
  url: string;
  method: string;
  statusCode: number;
  location?: string;
  durationMs: number;
}

export interface NetworkReport {
  inputUrl: string;
  dnsLookups: DNSLookup[];
  hops: RedirectHop[];
  finalUrl?: string;
  finalStatusCode?: number;
  totalDurationMs: number;
  usedGetFallback: boolean;
}

export interface NetworkInspectResult {
  report?: NetworkReport;
  error?: UserError;
}

export interface OpenAPILintIssue {
  code: string;
  severity: "error" | "warning" | "info";
  path: string;
  message: string;
  hint?: string;
}

export interface OpenAPILintReport {
  issues: OpenAPILintIssue[];
  summary: {
    paths: number;
    operations: number;
    total: number;
    errors: number;
    warnings: number;
    infos: number;
  };
  truncated: boolean;
}

export interface OpenAPILintResult {
  path: string;
  report?: OpenAPILintReport;
  canceled: boolean;
  error?: UserError;
}

export interface RequestTab {
  id: string;
  savedRequestId?: string;
  collectionId?: string;
  name: string;
  method: HTTPMethod;
  url: string;
  body: string;
  headers: KeyValue[];
  dirty: boolean;
  running: boolean;
  error: boolean;
  pinned: boolean;
  requestSection: "params" | "headers" | "body" | "variables";
  responseSection:
    | "body"
    | "headers"
    | "cookies"
    | "timeline"
    | "contract"
    | "raw";
  response?: ResponseEnvelope;
  userError?: UserError;
  openApi?: {
    specId: string;
    path: string;
  };
}
