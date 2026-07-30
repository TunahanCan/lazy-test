export const bridgeChannel = "validex:bridge:invoke";

export const bridgeMethods = {
  Bootstrap: 0,
  LoadCollectionLibrary: 0,
  SaveCollectionLibrary: 1,
  ImportCollectionFile: 0,
  ExportCollectionFile: 1,
  SendRequest: 1,
  CancelRequest: 1,
  ImportOpenAPI: 0,
  ValidateOpenAPIResponse: 1,
  GetMockServer: 0,
  UpdateMockRoutes: 1,
  StartMockServer: 1,
  StopMockServer: 0,
  ClearMockHits: 0,
  ImportMockOpenAPI: 0,
  RunSSE: 1,
  CancelToolOperation: 1,
  InspectActuator: 1,
  CompareEnvironments: 1,
  AnalyzeThreadDump: 1,
  SearchTraceLog: 1,
  AnalyzeEndpointCoverage: 1,
  RunCollection: 1,
  AnalyzeNetwork: 1,
  LintOpenAPI: 0,
} as const;

export type BridgeMethod = keyof typeof bridgeMethods;

export interface RendererInvocation {
  method: BridgeMethod;
  args: unknown[];
}

export function isBridgeMethod(value: unknown): value is BridgeMethod {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(bridgeMethods, value)
  );
}

