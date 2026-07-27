import type {
  ActuatorInspectResult,
  ContractCheckResult,
  CoverageResult,
  EnvironmentCompareResult,
  GRPCResult,
  ImportSpecResult,
  LogSearchResult,
  MockServerSnapshot,
  SSEResult,
  ThreadDumpResult,
  WebSocketResult,
} from "./types";

function listOrEmpty<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function recordOrEmpty<T>(
  value: Record<string, T> | null | undefined,
): Record<string, T> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

// Native bridge bindings are not runtime type checks. These adapters keep
// required UI collections stable across errors and desktop/web version skew.
export function normalizeImportSpecResult(
  result: ImportSpecResult,
): ImportSpecResult {
  return {
    ...result,
    endpoints: listOrEmpty(result.endpoints).map((endpoint) => ({
      ...endpoint,
      tags: listOrEmpty(endpoint.tags),
    })),
  };
}

export function normalizeContractCheckResult(
  result: ContractCheckResult,
): ContractCheckResult {
  return { ...result, findings: listOrEmpty(result.findings) };
}

export function normalizeMockServerSnapshot(
  result: MockServerSnapshot,
): MockServerSnapshot {
  return {
    ...result,
    routes: listOrEmpty(result.routes).map((route) => ({
      ...route,
      headers: recordOrEmpty(route.headers),
    })),
    hits: listOrEmpty(result.hits),
  };
}

export function normalizeSSEResult(result: SSEResult): SSEResult {
  return {
    ...result,
    headers: recordOrEmpty(result.headers),
    events: listOrEmpty(result.events),
  };
}

export function normalizeWebSocketResult(
  result: WebSocketResult,
): WebSocketResult {
  return {
    ...result,
    headers: recordOrEmpty(result.headers),
    messages: listOrEmpty(result.messages),
  };
}

export function normalizeGRPCResult(result: GRPCResult): GRPCResult {
  return { ...result, services: listOrEmpty(result.services) };
}

export function normalizeActuatorInspectResult(
  result: ActuatorInspectResult,
): ActuatorInspectResult {
  const metrics = result.metrics ?? { capturedAt: "", metrics: {} };
  return {
    ...result,
    health: result.health
      ? { ...result.health, data: recordOrEmpty(result.health.data) }
      : undefined,
    mappings: result.mappings
      ? { ...result.mappings, data: recordOrEmpty(result.mappings.data) }
      : undefined,
    metrics: {
      ...metrics,
      metrics: recordOrEmpty(metrics.metrics),
    },
    deltas: listOrEmpty(result.deltas),
  };
}

export function normalizeEnvironmentCompareResult(
  result: EnvironmentCompareResult,
): EnvironmentCompareResult {
  return {
    ...result,
    responses: listOrEmpty(result.responses),
    comparisons: listOrEmpty(result.comparisons),
  };
}

export function normalizeThreadDumpResult(
  result: ThreadDumpResult,
): ThreadDumpResult {
  return { ...result, stateCounts: recordOrEmpty(result.stateCounts) };
}

export function normalizeLogSearchResult(
  result: LogSearchResult,
): LogSearchResult {
  return { ...result, matches: listOrEmpty(result.matches) };
}

export function normalizeCoverageResult(
  result: CoverageResult,
): CoverageResult {
  return { ...result, endpoints: listOrEmpty(result.endpoints) };
}
