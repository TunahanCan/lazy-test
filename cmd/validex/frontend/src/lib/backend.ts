import {
  type ActuatorInspectInput,
  type ActuatorInspectResult,
  type BootstrapData,
  type ContractCheckInput,
  type ContractCheckResult,
  type CoverageInput,
  type CoverageResult,
  type EnvironmentCompareInput,
  type EnvironmentCompareResult,
  type GRPCInput,
  type GRPCResult,
  type ImportSpecResult,
  type LogSearchResult,
  type MockRoute,
  type MockServerSnapshot,
  type RequestInput,
  type SendResult,
  type SSEInput,
  type SSEResult,
  type ThreadDumpResult,
  type WebSocketInput,
  type WebSocketResult,
} from "./types";

interface CanbridgeAPI {
  Bootstrap(): Promise<BootstrapData>;
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
  RunWebSocket(input: WebSocketInput): Promise<WebSocketResult>;
  InspectGRPC(input: GRPCInput): Promise<GRPCResult>;
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
}

declare global {
  interface Window {
    canbridge?: {
      Bridge?: CanbridgeAPI;
    };
  }
}

const developmentBootstrap: BootstrapData = {
  appVersion: "0.2.0-dev",
  workspaceId: "validex-workspace",
  workspaceName: "Validex Workspace",
  environments: [
    {
      id: "none",
      name: "No Environment",
      variables: {},
    },
    {
      id: "local",
      name: "Local",
      variables: { baseUrl: "http://localhost:8080", token: "" },
    },
  ],
  collections: [],
  history: [],
  recentUrls: [],
  onboardingSteps: [
    "İlk request’ini gönder",
    "OpenAPI contract farklarını incele",
    "Mock server başlat",
  ],
};

function nativeBridge(): CanbridgeAPI | undefined {
  return window.canbridge?.Bridge;
}

export const backend = {
  async bootstrap(): Promise<BootstrapData> {
    const native = nativeBridge();
    if (native) return native.Bootstrap();
    if (import.meta.env.DEV) return developmentBootstrap;
    throw new Error("canbridge backend binding is unavailable.");
  },

  async sendRequest(input: RequestInput): Promise<SendResult> {
    const native = nativeBridge();
    if (native) return native.SendRequest(input);
    return {
      error: {
        code: "backend_unavailable",
        title: "Desktop backend bağlantısı yok",
        message: "Request gönderimi Validex masaüstü backend’ine ulaşamadı.",
        hint: "Gerçek istek göndermek için uygulamayı `make dev` ile canbridge içinde açın.",
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
    if (native) return native.ImportOpenAPI();
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
        title: "Dosya seçici kullanılamıyor",
        message: "OpenAPI içe aktarma Validex masaüstü backend’inde çalışır.",
        hint: "Uygulamayı `make dev` ile canbridge içinde açın.",
      },
    };
  },

  async validateOpenAPIResponse(
    input: ContractCheckInput,
  ): Promise<ContractCheckResult> {
    const native = nativeBridge();
    if (native) return native.ValidateOpenAPIResponse(input);
    return {
      available: false,
      ok: false,
      truncated: false,
      method: input.method,
      path: input.path,
      findings: [],
      error: {
        code: "backend_unavailable",
        title: "Contract doğrulaması kullanılamıyor",
        message: "OpenAPI doğrulaması native masaüstü backend’inde çalışır.",
      },
    };
  },

  async getMockServer(): Promise<MockServerSnapshot> {
    const native = nativeBridge();
    if (native) return native.GetMockServer();
    throw new Error("Mock server yalnızca Validex masaüstü uygulamasında çalışır.");
  },

  async updateMockRoutes(routes: MockRoute[]): Promise<MockServerSnapshot> {
    const native = nativeBridge();
    if (native) return native.UpdateMockRoutes(routes);
    return unavailableMockSnapshot("Mock route’ları native backend olmadan uygulanamaz.");
  },

  async startMockServer(input: {
    port: number;
    enableCors: boolean;
  }): Promise<MockServerSnapshot> {
    const native = nativeBridge();
    if (native) return native.StartMockServer(input);
    return unavailableMockSnapshot("Mock server native backend olmadan başlatılamaz.");
  },

  async stopMockServer(): Promise<MockServerSnapshot> {
    const native = nativeBridge();
    if (native) return native.StopMockServer();
    return unavailableMockSnapshot("Mock server native backend bağlantısı olmadan durdurulamaz.");
  },

  async clearMockHits(): Promise<MockServerSnapshot> {
    const native = nativeBridge();
    if (native) return native.ClearMockHits();
    return unavailableMockSnapshot("Mock hit geçmişine native backend olmadan erişilemez.");
  },

  async importMockOpenAPI(): Promise<MockServerSnapshot> {
    const native = nativeBridge();
    if (native) return native.ImportMockOpenAPI();
    return unavailableMockSnapshot("OpenAPI dosya seçici yalnızca masaüstü uygulamasında çalışır.");
  },

  async runSSE(input: SSEInput): Promise<SSEResult> {
    const native = nativeBridge();
    if (native) return native.RunSSE(input);
    return {
      statusCode: 0,
      headers: {},
      events: [],
      durationMs: 0,
      error: backendUnavailable("SSE istemcisi"),
    };
  },

  async runWebSocket(input: WebSocketInput): Promise<WebSocketResult> {
    const native = nativeBridge();
    if (native) return native.RunWebSocket(input);
    return {
      statusCode: 0,
      headers: {},
      protocol: "",
      messages: [],
      durationMs: 0,
      error: backendUnavailable("WebSocket istemcisi"),
    };
  },

  async inspectGRPC(input: GRPCInput): Promise<GRPCResult> {
    const native = nativeBridge();
    if (native) return native.InspectGRPC(input);
    return {
      services: [],
      reflectionVersion: "",
      connectionState: "",
      durationMs: 0,
      error: backendUnavailable("gRPC reflection"),
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
    if (native) return native.InspectActuator(input);
    return {
      metrics: { capturedAt: "", metrics: {} },
      deltas: [],
      error: backendUnavailable("Spring Actuator tanılaması"),
    };
  },

  async compareEnvironments(
    input: EnvironmentCompareInput,
  ): Promise<EnvironmentCompareResult> {
    const native = nativeBridge();
    if (native) return native.CompareEnvironments(input);
    return {
      method: input.method,
      path: input.path,
      responses: [],
      comparisons: [],
      error: backendUnavailable("Ortam karşılaştırması"),
    };
  },

  async analyzeThreadDump(input: { text: string }): Promise<ThreadDumpResult> {
    const native = nativeBridge();
    if (native) return native.AnalyzeThreadDump(input);
    return {
      threadCount: 0,
      stateCounts: {},
      deadlockDetected: false,
      truncated: false,
      error: backendUnavailable("Thread dump analizörü"),
    };
  },

  async searchTraceLog(input: {
    text: string;
    query: string;
    caseSensitive: boolean;
  }): Promise<LogSearchResult> {
    const native = nativeBridge();
    if (native) return native.SearchTraceLog(input);
    return {
      query: input.query,
      matches: [],
      scannedLines: 0,
      truncated: false,
      error: backendUnavailable("Trace log araması"),
    };
  },

  async analyzeEndpointCoverage(input: CoverageInput): Promise<CoverageResult> {
    const native = nativeBridge();
    if (native) return native.AnalyzeEndpointCoverage(input);
    return {
      totalKnown: input.known.length,
      covered: 0,
      coveragePercent: 0,
      endpoints: [],
      error: backendUnavailable("Endpoint coverage"),
    };
  },
};

function backendUnavailable(feature: string) {
  return {
    code: "backend_unavailable",
    title: `${feature} kullanılamıyor`,
    message: "Bu araç Validex masaüstü backend’inde çalışır.",
    hint: "Uygulamayı canbridge masaüstü sürümüyle açın.",
  };
}

function unavailableMockSnapshot(message: string): MockServerSnapshot {
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
      ...backendUnavailable("Mock server"),
      message,
    },
  };
}
