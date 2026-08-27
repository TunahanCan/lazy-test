import { contextBridge, ipcRenderer } from "electron";

// Sandboxed preload scripts can only require Electron and a small set of Node
// built-ins, so this file intentionally has no local runtime imports.
const bridgeChannel = "validex:bridge:invoke";
const clipboardWriteChannel = "validex:clipboard:write";

function invoke(method: string, ...args: unknown[]): Promise<unknown> {
  return ipcRenderer.invoke(bridgeChannel, { method, args });
}

const Bridge = Object.freeze({
  Bootstrap: () => invoke("Bootstrap"),
  LoadCollectionLibrary: () => invoke("LoadCollectionLibrary"),
  SaveCollectionLibrary: (data: unknown) =>
    invoke("SaveCollectionLibrary", data),
  ImportCollectionFile: () => invoke("ImportCollectionFile"),
  ExportCollectionFile: (input: unknown) =>
    invoke("ExportCollectionFile", input),
  SendRequest: (input: unknown) => invoke("SendRequest", input),
  CancelRequest: (requestID: unknown) =>
    invoke("CancelRequest", requestID),
  ImportOpenAPI: () => invoke("ImportOpenAPI"),
  ValidateOpenAPIResponse: (input: unknown) =>
    invoke("ValidateOpenAPIResponse", input),
  GetMockServer: () => invoke("GetMockServer"),
  UpdateMockRoutes: (routes: unknown) =>
    invoke("UpdateMockRoutes", routes),
  StartMockServer: (input: unknown) => invoke("StartMockServer", input),
  StopMockServer: () => invoke("StopMockServer"),
  ClearMockHits: () => invoke("ClearMockHits"),
  ImportMockOpenAPI: () => invoke("ImportMockOpenAPI"),
  RunSSE: (input: unknown) => invoke("RunSSE", input),
  CancelToolOperation: (operationID: unknown) =>
    invoke("CancelToolOperation", operationID),
  InspectActuator: (input: unknown) => invoke("InspectActuator", input),
  CompareEnvironments: (input: unknown) =>
    invoke("CompareEnvironments", input),
  AnalyzeThreadDump: (input: unknown) =>
    invoke("AnalyzeThreadDump", input),
  SearchTraceLog: (input: unknown) => invoke("SearchTraceLog", input),
  AnalyzeEndpointCoverage: (input: unknown) =>
    invoke("AnalyzeEndpointCoverage", input),
  RunCollection: (input: unknown) => invoke("RunCollection", input),
  AnalyzeNetwork: (input: unknown) => invoke("AnalyzeNetwork", input),
  LintOpenAPI: () => invoke("LintOpenAPI"),
  WriteClipboardText: (value: unknown) =>
    ipcRenderer.invoke(clipboardWriteChannel, value),
});

contextBridge.exposeInMainWorld("canbridge", Object.freeze({ Bridge }));
