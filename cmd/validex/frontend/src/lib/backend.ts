import {
  type ActuatorInspectInput,
  type ActuatorInspectResult,
  type BootstrapData,
  type CollectionFileExportInput,
  type CollectionFileExportResult,
  type CollectionFileImportResult,
  type CollectionLibraryLoadResult,
  type CollectionLibrarySaveResult,
  type CollectionRunInput,
  type CollectionRunResult,
  type ContractCheckInput,
  type ContractCheckResult,
  type CoverageInput,
  type CoverageResult,
  type EnvironmentCompareInput,
  type EnvironmentCompareResult,
  type ImportSpecResult,
  type LogSearchResult,
  type MockRoute,
  type MockServerSnapshot,
  type NetworkInspectInput,
  type NetworkInspectResult,
  type OpenAPILintResult,
  type RequestInput,
  type SendResult,
  type SSEInput,
  type SSEResult,
  type ThreadDumpResult,
} from "./types.js";
import {
  normalizeActuatorInspectResult,
  normalizeContractCheckResult,
  normalizeCoverageResult,
  normalizeEnvironmentCompareResult,
  normalizeImportSpecResult,
  normalizeLogSearchResult,
  normalizeMockServerSnapshot,
  normalizeSendResult,
  normalizeSSEResult,
  normalizeThreadDumpResult,
} from "./bridge-contract.js";
import { t } from "../i18n/locale.js";
import type { TranslationKey } from "../i18n/messages.js";
import { localizedBootstrapData } from "./bootstrap.js";

interface CanbridgeAPI {
  Bootstrap(): Promise<BootstrapData>;
  LoadCollectionLibrary(): Promise<CollectionLibraryLoadResult>;
  SaveCollectionLibrary(data: string): Promise<CollectionLibrarySaveResult>;
  ImportCollectionFile(): Promise<CollectionFileImportResult>;
  ExportCollectionFile(
    input: CollectionFileExportInput,
  ): Promise<CollectionFileExportResult>;
  SendRequest(input: RequestInput): Promise<SendResult>;
  CancelRequest(requestID: string): Promise<boolean>;
  ImportOpenAPI(): Promise<ImportSpecResult>;
  ValidateOpenAPIResponse(
    input: ContractCheckInput,
  ): Promise<ContractCheckResult>;
  GetMockServer(): Promise<MockServerSnapshot>;
  UpdateMockRoutes(routes: MockRoute[]): Promise<MockServerSnapshot>;
  StartMockServer(input: {
    port: number;
    enableCors: boolean;
  }): Promise<MockServerSnapshot>;
  StopMockServer(): Promise<MockServerSnapshot>;
  ClearMockHits(): Promise<MockServerSnapshot>;
  ImportMockOpenAPI(): Promise<MockServerSnapshot>;
  RunSSE(input: SSEInput): Promise<SSEResult>;
  CancelToolOperation(operationID: string): Promise<boolean>;
  InspectActuator(input: ActuatorInspectInput): Promise<ActuatorInspectResult>;
  CompareEnvironments(
    input: EnvironmentCompareInput,
  ): Promise<EnvironmentCompareResult>;
  AnalyzeThreadDump(input: { text: string }): Promise<ThreadDumpResult>;
  SearchTraceLog(input: {
    text: string;
    query: string;
    caseSensitive: boolean;
  }): Promise<LogSearchResult>;
  AnalyzeEndpointCoverage(input: CoverageInput): Promise<CoverageResult>;
  RunCollection(input: CollectionRunInput): Promise<CollectionRunResult>;
  AnalyzeNetwork(input: NetworkInspectInput): Promise<NetworkInspectResult>;
  LintOpenAPI(): Promise<OpenAPILintResult>;
}

declare global {
  interface Window {
    __VALIDEX_DEV__?: boolean;
    canbridge?: {
      Bridge?: CanbridgeAPI;
    };
  }
}

function developmentBootstrap(): BootstrapData {
  return {
    appVersion: "0.2.0-dev",
    workspaceId: "validex-workspace",
    workspaceName: t("backend.bootstrap.workspaceName"),
    environments: [
      {
        id: "none",
        name: t("backend.bootstrap.environment.none"),
        variables: {},
      },
      {
        id: "local",
        name: t("backend.bootstrap.environment.local"),
        variables: { baseUrl: "http://localhost:8080" },
      },
    ],
    collections: [],
    history: [],
    recentUrls: [],
    onboardingSteps: [
      t("backend.bootstrap.onboarding.sendRequest"),
      t("backend.bootstrap.onboarding.reviewContract"),
      t("backend.bootstrap.onboarding.startMockServer"),
    ],
  };
}

function nativeBridge(): CanbridgeAPI | undefined {
  return window.canbridge?.Bridge;
}

export const backend = {
  hasNativeCollectionLibrary(): boolean {
    const native = nativeBridge();
    return Boolean(
      native?.LoadCollectionLibrary && native.SaveCollectionLibrary,
    );
  },

  async bootstrap(): Promise<BootstrapData> {
    const native = nativeBridge();
    if (native) return localizedBootstrapData(await native.Bootstrap());
    if (window.__VALIDEX_DEV__) {
      return localizedBootstrapData(developmentBootstrap());
    }
    throw new Error(t("backend.error.bindingUnavailable"));
  },

  async loadCollectionLibrary(): Promise<CollectionLibraryLoadResult> {
    const native = nativeBridge();
    if (native) return native.LoadCollectionLibrary();
    return {
      data: "",
      found: false,
      error: backendUnavailable("backend.feature.collectionStorage"),
    };
  },

  async saveCollectionLibrary(
    data: string,
  ): Promise<CollectionLibrarySaveResult> {
    const native = nativeBridge();
    if (native) return native.SaveCollectionLibrary(data);
    void data;
    return {
      saved: false,
      error: backendUnavailable("backend.feature.collectionStorage"),
    };
  },

  async importCollectionFile(): Promise<CollectionFileImportResult> {
    const native = nativeBridge();
    if (native?.ImportCollectionFile) {
      return native.ImportCollectionFile();
    }
    return {
      data: "",
      path: "",
      canceled: false,
      error: backendUnavailable("backend.feature.collectionImport"),
    };
  },

  async exportCollectionFile(
    input: CollectionFileExportInput,
  ): Promise<CollectionFileExportResult> {
    const native = nativeBridge();
    if (native?.ExportCollectionFile) {
      return native.ExportCollectionFile(input);
    }
    void input;
    return {
      exported: false,
      path: "",
      canceled: false,
      error: backendUnavailable("backend.feature.collectionExport"),
    };
  },

  async sendRequest(input: RequestInput): Promise<SendResult> {
    const native = nativeBridge();
    if (native) return normalizeSendResult(await native.SendRequest(input));
    return {
      error: {
        code: "backend_unavailable",
        title: t("backend.error.request.title"),
        message: t("backend.error.request.message"),
        hint: t("backend.error.request.hint"),
      },
    };
  },

  async cancelRequest(requestID: string): Promise<boolean> {
    const native = nativeBridge();
    if (native) return native.CancelRequest(requestID);
    void requestID;
    return false;
  },

  async importOpenAPI(): Promise<ImportSpecResult> {
    const native = nativeBridge();
    if (native) {
      return normalizeImportSpecResult(await native.ImportOpenAPI());
    }
    return {
      specId: "",
      path: "",
      title: "",
      version: "",
      baseUrl: "",
      endpoints: [],
      canceled: false,
      error: {
        code: "backend_unavailable",
        title: t("backend.error.openAPIImport.title"),
        message: t("backend.error.openAPIImport.message"),
        hint: t("backend.error.openAPIImport.hint"),
      },
    };
  },

  async validateOpenAPIResponse(
    input: ContractCheckInput,
  ): Promise<ContractCheckResult> {
    const native = nativeBridge();
    if (native) {
      return normalizeContractCheckResult(
        await native.ValidateOpenAPIResponse(input),
      );
    }
    return {
      available: false,
      ok: false,
      truncated: false,
      method: input.method,
      path: input.path,
      findings: [],
      error: {
        code: "backend_unavailable",
        title: t("backend.error.contractValidation.title"),
        message: t("backend.error.contractValidation.message"),
      },
    };
  },

  async getMockServer(): Promise<MockServerSnapshot> {
    const native = nativeBridge();
    if (native) {
      return normalizeMockServerSnapshot(await native.GetMockServer());
    }
    throw new Error(t("backend.error.mock.desktopOnly"));
  },

  async updateMockRoutes(routes: MockRoute[]): Promise<MockServerSnapshot> {
    const native = nativeBridge();
    if (native) {
      return normalizeMockServerSnapshot(
        await native.UpdateMockRoutes(routes),
      );
    }
    return unavailableMockSnapshot("backend.error.mock.routesUnavailable");
  },

  async startMockServer(input: {
    port: number;
    enableCors: boolean;
  }): Promise<MockServerSnapshot> {
    const native = nativeBridge();
    if (native) {
      return normalizeMockServerSnapshot(await native.StartMockServer(input));
    }
    return unavailableMockSnapshot("backend.error.mock.startUnavailable");
  },

  async stopMockServer(): Promise<MockServerSnapshot> {
    const native = nativeBridge();
    if (native) {
      return normalizeMockServerSnapshot(await native.StopMockServer());
    }
    return unavailableMockSnapshot("backend.error.mock.stopUnavailable");
  },

  async clearMockHits(): Promise<MockServerSnapshot> {
    const native = nativeBridge();
    if (native) {
      return normalizeMockServerSnapshot(await native.ClearMockHits());
    }
    return unavailableMockSnapshot("backend.error.mock.hitsUnavailable");
  },

  async importMockOpenAPI(): Promise<MockServerSnapshot> {
    const native = nativeBridge();
    if (native) {
      return normalizeMockServerSnapshot(await native.ImportMockOpenAPI());
    }
    return unavailableMockSnapshot("backend.error.mock.importUnavailable");
  },

  async runSSE(input: SSEInput): Promise<SSEResult> {
    const native = nativeBridge();
    if (native) return normalizeSSEResult(await native.RunSSE(input));
    return {
      statusCode: 0,
      headers: {},
      events: [],
      durationMs: 0,
      error: backendUnavailable("backend.feature.sseClient"),
    };
  },

  async cancelToolOperation(operationID: string): Promise<boolean> {
    const native = nativeBridge();
    if (native) return native.CancelToolOperation(operationID);
    void operationID;
    return false;
  },

  async inspectActuator(
    input: ActuatorInspectInput,
  ): Promise<ActuatorInspectResult> {
    const native = nativeBridge();
    if (native) {
      return normalizeActuatorInspectResult(
        await native.InspectActuator(input),
      );
    }
    return {
      metrics: { capturedAt: "", metrics: {} },
      deltas: [],
      error: backendUnavailable("backend.feature.springActuatorDiagnostics"),
    };
  },

  async compareEnvironments(
    input: EnvironmentCompareInput,
  ): Promise<EnvironmentCompareResult> {
    const native = nativeBridge();
    if (native) {
      return normalizeEnvironmentCompareResult(
        await native.CompareEnvironments(input),
      );
    }
    return {
      method: input.method,
      path: input.path,
      responses: [],
      comparisons: [],
      error: backendUnavailable("backend.feature.environmentComparison"),
    };
  },

  async analyzeThreadDump(input: { text: string }): Promise<ThreadDumpResult> {
    const native = nativeBridge();
    if (native) {
      return normalizeThreadDumpResult(await native.AnalyzeThreadDump(input));
    }
    return {
      threadCount: 0,
      stateCounts: {},
      deadlockDetected: false,
      truncated: false,
      error: backendUnavailable("backend.feature.threadDumpAnalyzer"),
    };
  },

  async searchTraceLog(input: {
    text: string;
    query: string;
    caseSensitive: boolean;
  }): Promise<LogSearchResult> {
    const native = nativeBridge();
    if (native) {
      return normalizeLogSearchResult(await native.SearchTraceLog(input));
    }
    return {
      query: input.query,
      matches: [],
      scannedLines: 0,
      truncated: false,
      error: backendUnavailable("backend.feature.traceLogSearch"),
    };
  },

  async analyzeEndpointCoverage(input: CoverageInput): Promise<CoverageResult> {
    const native = nativeBridge();
    if (native) {
      return normalizeCoverageResult(
        await native.AnalyzeEndpointCoverage(input),
      );
    }
    return {
      totalKnown: input.known.length,
      covered: 0,
      coveragePercent: 0,
      endpoints: [],
      error: backendUnavailable("backend.feature.endpointCoverage"),
    };
  },

  async runCollection(input: CollectionRunInput): Promise<CollectionRunResult> {
    const native = nativeBridge();
    if (native) return native.RunCollection(input);
    return { error: backendUnavailable("backend.feature.collectionRunner") };
  },

  async analyzeNetwork(
    input: NetworkInspectInput,
  ): Promise<NetworkInspectResult> {
    const native = nativeBridge();
    if (native) return native.AnalyzeNetwork(input);
    return { error: backendUnavailable("backend.feature.networkAnalysis") };
  },

  async lintOpenAPI(): Promise<OpenAPILintResult> {
    const native = nativeBridge();
    if (native) return native.LintOpenAPI();
    return {
      path: "",
      canceled: false,
      error: backendUnavailable("backend.feature.openAPILint"),
    };
  },
};

function backendUnavailable(featureKey: TranslationKey) {
  const feature = t(featureKey);
  return {
    code: "backend_unavailable",
    title: t("backend.error.unavailable.title", { feature }),
    message: t("backend.error.unavailable.message"),
    hint: t("backend.error.unavailable.hint"),
  };
}

function unavailableMockSnapshot(
  messageKey: TranslationKey,
): MockServerSnapshot {
  return {
    state: {
      running: false,
      host: "127.0.0.1",
      port: 0,
      baseUrl: "",
      routeCount: 0,
      enabledCount: 0,
      hitCount: 0,
      totalHits: 0,
    },
    routes: [],
    hits: [],
    canceled: false,
    error: {
      ...backendUnavailable("backend.feature.mockServer"),
      message: t(messageKey),
    },
  };
}
