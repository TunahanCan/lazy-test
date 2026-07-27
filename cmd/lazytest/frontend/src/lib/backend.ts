import {
  type BootstrapData,
  type FileWriteResult,
  type GeneratedFile,
  type ImportSpecResult,
  type RequestInput,
  type SendResult,
} from "./types";

interface WailsBridge {
  Bootstrap(): Promise<BootstrapData>;
  SendRequest(input: RequestInput): Promise<SendResult>;
  CancelRequest(requestID: string): Promise<boolean>;
  ImportOpenAPI(): Promise<ImportSpecResult>;
  SaveGeneratedFile(input: {
    suggestedName: string;
    content: string;
  }): Promise<FileWriteResult>;
  ExportGeneratedProject(input: {
    projectName: string;
    files: GeneratedFile[];
  }): Promise<FileWriteResult>;
}

declare global {
  interface Window {
    go?: {
      wailsapp?: {
        Bridge?: WailsBridge;
      };
    };
  }
}

const sampleBootstrap: BootstrapData = {
  appVersion: "0.2.0-dev",
  workspaceId: "sample-workspace",
  workspaceName: "Commerce API",
  environments: [
    {
      id: "local",
      name: "Local",
      variables: { baseUrl: "http://localhost:8080", token: "••••••••" },
    },
    {
      id: "development",
      name: "Development",
      variables: { baseUrl: "https://api.example.com", token: "••••••••" },
    },
    {
      id: "staging",
      name: "Staging",
      variables: {
        baseUrl: "https://staging.example.com",
        token: "••••••••",
      },
    },
  ],
  collections: [
    { id: "commerce", kind: "collection", name: "Commerce API", depth: 0, expanded: true },
    { id: "users", parentId: "commerce", kind: "folder", name: "Users", depth: 1, expanded: true },
    { id: "list-users", parentId: "users", kind: "request", name: "List users", method: "GET", url: "{{baseUrl}}/v1/users", depth: 2, favorite: true },
    { id: "create-user", parentId: "users", kind: "request", name: "Create user", method: "POST", url: "{{baseUrl}}/v1/users", depth: 2 },
    { id: "orders", parentId: "commerce", kind: "folder", name: "Orders", depth: 1, expanded: true },
    { id: "list-orders", parentId: "orders", kind: "request", name: "List orders", method: "GET", url: "{{baseUrl}}/v1/orders", depth: 2 },
    { id: "create-order", parentId: "orders", kind: "request", name: "Create order", method: "POST", url: "{{baseUrl}}/v1/orders", depth: 2 },
    { id: "health", parentId: "commerce", kind: "request", name: "Service health", method: "GET", url: "{{baseUrl}}/health", depth: 1 },
    { id: "admin", kind: "collection", name: "Admin API", depth: 0, expanded: true },
    { id: "audit", parentId: "admin", kind: "request", name: "Audit events", method: "GET", url: "{{baseUrl}}/v1/audit", depth: 1 },
  ],
  history: [
    { id: "h-1", requestName: "List users", method: "GET", url: "/v1/users", statusCode: 200, durationMs: 184, environment: "Development", createdAt: new Date(Date.now() - 12 * 60_000).toISOString(), assertionsOk: true, traceId: "8f31c1a2", resolvedValues: 2 },
    { id: "h-2", requestName: "Create order", method: "POST", url: "/v1/orders", statusCode: 201, durationMs: 326, environment: "Staging", createdAt: new Date(Date.now() - 47 * 60_000).toISOString(), assertionsOk: true, traceId: "b712d43e", resolvedValues: 3 },
    { id: "h-3", requestName: "Service health", method: "GET", url: "/health", statusCode: 503, durationMs: 1203, environment: "Local", createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), assertionsOk: false, traceId: "d913ee71", resolvedValues: 1 },
  ],
  recentUrls: [
    "{{baseUrl}}/v1/users",
    "{{baseUrl}}/v1/orders",
    "{{baseUrl}}/health",
  ],
  onboardingSteps: [
    "Bir workspace oluştur",
    "İlk request’ini gönder",
    "Environment oluştur",
    "Assertion ekle",
    "Java testi üret",
  ],
};

const demoRequests = new Map<string, AbortController>();

function nativeBridge(): WailsBridge | undefined {
  return window.go?.wailsapp?.Bridge;
}

function resolveDemoURL(url: string, variables: Record<string, string>) {
  return url.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*}}/g, (_, key: string) => {
    return variables[key] && variables[key] !== "••••••••"
      ? variables[key]
      : `{{${key}}}`;
  });
}

async function demoSend(input: RequestInput): Promise<SendResult> {
  const controller = new AbortController();
  demoRequests.set(input.id, controller);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 720);
      controller.signal.addEventListener("abort", () => {
        window.clearTimeout(timer);
        reject(new DOMException("Canceled", "AbortError"));
      });
    });
  } catch {
    return {
      error: {
        code: "request_canceled",
        title: "Request iptal edildi",
        message: "İstek kullanıcı tarafından durduruldu.",
        hint: "URL ve düzenlemeleriniz bu sekmede korunuyor.",
      },
    };
  } finally {
    demoRequests.delete(input.id);
  }

  const resolvedUrl = resolveDemoURL(input.url, input.variables);
  const payload = {
    data: [
      {
        id: "usr_01J8AN4C",
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "admin",
        active: true,
      },
      {
        id: "usr_01J8AP2K",
        name: "Grace Hopper",
        email: "grace@example.com",
        role: "developer",
        active: true,
      },
    ],
    meta: { page: 1, pageSize: 20, total: 2 },
  };
  const body = JSON.stringify(payload, null, 2);
  return {
    response: {
      requestId: input.id,
      statusCode: input.method === "POST" ? 201 : 200,
      status: input.method === "POST" ? "201 Created" : "200 OK",
      durationMs: 184,
      sizeBytes: new Blob([body]).size,
      contentType: "application/json; charset=utf-8",
      protocol: "HTTP/2",
      remoteAddr: "203.0.113.42:443",
      tls: "TLS 1.3 · AES_128_GCM",
      traceId: "8f31c1a2d94b",
      headers: {
        "Content-Type": ["application/json; charset=utf-8"],
        "Cache-Control": ["no-store"],
        "X-Request-ID": ["8f31c1a2d94b"],
        "X-RateLimit-Remaining": ["98"],
      },
      cookies: [],
      body,
      rawBody: JSON.stringify(payload),
      resolvedUrl,
      timeline: [
        { id: "variables", label: "Variable resolution", durationMs: 1, percent: 0.5 },
        { id: "dns", label: "DNS", durationMs: 12, percent: 6.5 },
        { id: "tcp", label: "TCP connection", durationMs: 18, percent: 9.8 },
        { id: "tls", label: "TLS handshake", durationMs: 24, percent: 13 },
        { id: "preparation", label: "Request preparation", durationMs: 3, percent: 1.6 },
        {
          id: "server",
          label: "Server wait",
          durationMs: 114,
          percent: 62,
          description: "Toplam sürenin %62’si sunucu yanıtını beklerken geçti.",
        },
        { id: "download", label: "Response download", durationMs: 12, percent: 6.5 },
        { id: "assertions", label: "Assertion execution", durationMs: 0, percent: 0 },
        { id: "contract", label: "Contract validation", durationMs: 0, percent: 0 },
      ],
    },
  };
}

export const backend = {
  async bootstrap(): Promise<BootstrapData> {
    const native = nativeBridge();
    if (native) return native.Bootstrap();
    if (import.meta.env.DEV) return sampleBootstrap;
    throw new Error("Wails backend binding is unavailable.");
  },

  async sendRequest(input: RequestInput): Promise<SendResult> {
    const native = nativeBridge();
    if (native) return native.SendRequest(input);
    if (import.meta.env.DEV) return demoSend(input);
    return {
      error: {
        code: "backend_unavailable",
        title: "Desktop backend bağlantısı yok",
        message: "LazyTest native servislerine ulaşılamadı.",
        hint: "Uygulamayı kapatıp yeniden açın.",
      },
    };
  },

  async cancelRequest(requestID: string): Promise<boolean> {
    const native = nativeBridge();
    if (native) return native.CancelRequest(requestID);
    if (!import.meta.env.DEV) return false;
    const controller = demoRequests.get(requestID);
    if (!controller) return false;
    controller.abort();
    return true;
  },

  async importOpenAPI(): Promise<ImportSpecResult> {
    const native = nativeBridge();
    if (native) return native.ImportOpenAPI();
    if (!import.meta.env.DEV) {
      return {
        path: "",
        title: "",
        version: "",
        endpoints: [],
        canceled: false,
        error: {
          code: "backend_unavailable",
          title: "Dosya seçici kullanılamıyor",
          message: "Native backend bağlantısı kurulamadı.",
        },
      };
    }
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    return {
      path: "/sample/openapi.yaml",
      title: "Sample Commerce API",
      version: "1.0.0",
      canceled: false,
      endpoints: [
        { id: "listPets", method: "GET", path: "/pets", summary: "List pets", tags: ["pets"] },
        { id: "createPet", method: "POST", path: "/pets", summary: "Create pet", tags: ["pets"] },
      ],
    };
  },

  async saveGeneratedFile(
    suggestedName: string,
    content: string,
  ): Promise<FileWriteResult> {
    const native = nativeBridge();
    if (native) return native.SaveGeneratedFile({ suggestedName, content });
    if (!import.meta.env.DEV) {
      return {
        path: "",
        count: 0,
        canceled: false,
        error: {
          code: "backend_unavailable",
          title: "Dosya kaydedilemedi",
          message: "Native backend bağlantısı kurulamadı.",
        },
      };
    }
    downloadTextFile(suggestedName, content);
    return { path: suggestedName, count: 1, canceled: false };
  },

  async exportGeneratedProject(
    projectName: string,
    files: GeneratedFile[],
  ): Promise<FileWriteResult> {
    const native = nativeBridge();
    if (native) return native.ExportGeneratedProject({ projectName, files });
    if (!import.meta.env.DEV) {
      return {
        path: "",
        count: 0,
        canceled: false,
        error: {
          code: "backend_unavailable",
          title: "Proje dışa aktarılamadı",
          message: "Native backend bağlantısı kurulamadı.",
        },
      };
    }
    downloadTextFile(
      `${projectName || "lazytest-generated"}.json`,
      JSON.stringify({ projectName, files }, null, 2),
    );
    return {
      path: `${projectName || "lazytest-generated"}.json`,
      count: files.length,
      canceled: false,
    };
  },
};

function downloadTextFile(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
