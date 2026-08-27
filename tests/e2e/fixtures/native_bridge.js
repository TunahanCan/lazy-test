(() => {
  "use strict";

  const clone = (value) =>
    value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const userError = (code, title, message, hint = "") => ({
    code,
    title,
    message,
    ...(hint ? { hint } : {}),
  });

  const richResponse = (input = {}) => {
    const requestId = input.id || "request-e2e";
    const url = input.url || "https://api.example.test/orders";
    return {
      requestId,
      statusCode: 200,
      status: "OK",
      durationMs: 42,
      sizeBytes: 156,
      contentType: "application/json; charset=utf-8",
      protocol: "HTTP/2",
      remoteAddr: "203.0.113.10:443",
      tls: "TLS 1.3",
      traceId: "trace-e2e-42",
      headers: {
        "content-type": ["application/json; charset=utf-8"],
        "cache-control": ["no-store"],
        "x-request-id": ["trace-e2e-42"],
        "set-cookie": [
          "session=e2e; Path=/; HttpOnly; Secure",
        ],
      },
      cookies: [
        {
          name: "session",
          value: "e2e",
          path: "/",
          domain: "api.example.test",
          httpOnly: true,
          secure: true,
        },
      ],
      body:
        '{"order":{"id":"order-42","status":"READY"},"items":[{"sku":"SKU-1","quantity":2}]}',
      rawBody:
        'HTTP/2 200 OK\r\ncontent-type: application/json; charset=utf-8\r\nx-request-id: trace-e2e-42\r\n\r\n{"order":{"id":"order-42","status":"READY"},"items":[{"sku":"SKU-1","quantity":2}]}',
      bodyEncoding: "utf8",
      timeline: [
        {
          id: "dns",
          label: "DNS",
          durationMs: 5,
          percent: 12,
          description: "Resolved api.example.test",
        },
        {
          id: "connect",
          label: "Connect",
          durationMs: 10,
          percent: 24,
          description: "TLS connection",
        },
        {
          id: "server",
          label: "Server",
          durationMs: 27,
          percent: 64,
          description: "Waiting for response",
        },
      ],
      resolvedUrl: url,
      contract: {
        available: true,
        ok: true,
        truncated: false,
        method: input.method || "GET",
        path: "/orders",
        findings: [],
      },
    };
  };

  const initialMock = () => ({
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
  });

  const collectionStorageKey = "validex.e2e.collectionData";
  const readCollectionData = () => {
    try {
      return sessionStorage.getItem(collectionStorageKey) || "";
    } catch {
      return "";
    }
  };
  const writeCollectionData = (data) => {
    try {
      sessionStorage.setItem(collectionStorageKey, String(data));
    } catch {
      // The in-memory value remains available when storage is unavailable.
    }
  };

  const state = {
    calls: [],
    clipboard: "",
    collectionData: readCollectionData(),
    overrides: {},
    deferredNames: new Set(),
    deferredCounts: new Map(),
    pending: new Map(),
    mock: initialMock(),
  };

  const enqueuePending = (method, pending) => {
    const queue = state.pending.get(method) || [];
    queue.push(pending);
    state.pending.set(method, queue);
  };

  const takePending = (method, predicate = () => true) => {
    const queue = state.pending.get(method) || [];
    const index = queue.findIndex(predicate);
    if (index < 0) return undefined;
    const [pending] = queue.splice(index, 1);
    if (queue.length === 0) state.pending.delete(method);
    else state.pending.set(method, queue);
    return pending;
  };

  const pendingMatches = (candidate, selector) => {
    if (selector === undefined) return true;
    if (
      selector !== null &&
      typeof selector === "object" &&
      !Array.isArray(selector)
    ) {
      return Object.entries(selector).every(
        ([key, value]) => candidate.input?.[key] === value,
      );
    }
    return (
      candidate.input?.operationId === selector ||
      candidate.input?.id === selector
    );
  };

  const record = (method, input) => {
    state.calls.push({
      method,
      input: clone(input),
      at: now(),
    });
  };

  const configuredValue = async (method, input, fallback) => {
    const deferredCount = state.deferredCounts.get(method) || 0;
    if (deferredCount > 0) {
      if (deferredCount === 1) state.deferredCounts.delete(method);
      else state.deferredCounts.set(method, deferredCount - 1);
      return new Promise((resolve, reject) => {
        enqueuePending(method, { resolve, reject, input: clone(input) });
      });
    }
    if (state.deferredNames.has(method)) {
      return new Promise((resolve, reject) => {
        enqueuePending(method, { resolve, reject, input: clone(input) });
      });
    }
    if (!Object.prototype.hasOwnProperty.call(state.overrides, method)) {
      return clone(typeof fallback === "function" ? fallback() : fallback);
    }
    let value = state.overrides[method];
    if (Array.isArray(value)) {
      value = value.length > 1 ? value.shift() : value[0];
    }
    if (
      value &&
      typeof value === "object" &&
      Object.prototype.hasOwnProperty.call(value, "__delayMs")
    ) {
      const delay = Number(value.__delayMs) || 0;
      const delayedValue = value.value;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return clone(delayedValue);
    }
    if (value && typeof value === "object" && value.__reject) {
      throw new Error(String(value.__reject));
    }
    return clone(value);
  };

  const call = async (method, input, fallback) => {
    record(method, input);
    return configuredValue(method, input, fallback);
  };

  const bootstrap = {
    appVersion: "0.2.0-e2e",
    workspaceId: "validex-e2e",
    workspaceName: "Validex E2E Workspace",
    environments: [
      { id: "none", name: "No Environment", variables: {} },
      {
        id: "local",
        name: "Local",
        variables: { baseUrl: "http://localhost:8080" },
      },
    ],
    collections: [],
    history: [],
    recentUrls: [],
    onboardingSteps: [],
  };

  const bridge = {
    Bootstrap: () => call("Bootstrap", undefined, bootstrap),
    LoadCollectionLibrary: () =>
      call("LoadCollectionLibrary", undefined, () => ({
        data: state.collectionData,
        found: state.collectionData !== "",
      })),
    SaveCollectionLibrary: async (data) => {
      record("SaveCollectionLibrary", data);
      const controlled =
        state.deferredNames.has("SaveCollectionLibrary") ||
        Object.prototype.hasOwnProperty.call(
          state.overrides,
          "SaveCollectionLibrary",
        );
      const result = controlled
        ? await configuredValue(
            "SaveCollectionLibrary",
            data,
            { saved: true },
          )
        : { saved: true };
      if (result?.saved && !result.error) {
        state.collectionData = String(data);
        writeCollectionData(state.collectionData);
      }
      return result;
    },
    ImportCollectionFile: () =>
      call("ImportCollectionFile", undefined, {
        data: "",
        path: "",
        canceled: true,
      }),
    ExportCollectionFile: (input) =>
      call("ExportCollectionFile", input, {
        exported: true,
        path: `/fixtures/${input?.suggestedName || "collection.json"}`,
        canceled: false,
      }),
    SendRequest: (input) =>
      call("SendRequest", input, () => ({ response: richResponse(input) })),
    CancelRequest: async (requestID) => {
      record("CancelRequest", requestID);
      const configured =
        (state.deferredCounts.get("CancelRequest") || 0) > 0 ||
        state.deferredNames.has("CancelRequest") ||
        Object.prototype.hasOwnProperty.call(
          state.overrides,
          "CancelRequest",
        );
      if (
        configured &&
        !(await configuredValue("CancelRequest", requestID, true))
      ) {
        return false;
      }
      const pending = takePending(
        "SendRequest",
        (candidate) => candidate.input?.id === requestID,
      );
      if (!pending) return false;
      state.deferredNames.delete("SendRequest");
      pending.resolve({
        error: userError(
          "request_canceled",
          "Request canceled",
          "The active request was canceled.",
        ),
      });
      return true;
    },
    ImportOpenAPI: () =>
      call("ImportOpenAPI", undefined, {
        specId: "orders-api",
        path: "/fixtures/orders.openapi.yaml",
        title: "Orders API",
        version: "1.0.0",
        baseUrl: "https://api.example.test",
        endpoints: [
          {
            id: "listOrders",
            method: "GET",
            path: "/orders",
            summary: "List orders",
            tags: ["Orders"],
          },
          {
            id: "createOrder",
            method: "POST",
            path: "/orders",
            summary: "Create order",
            tags: ["Orders"],
          },
        ],
        canceled: false,
      }),
    ValidateOpenAPIResponse: (input) =>
      call("ValidateOpenAPIResponse", input, {
        available: true,
        ok: true,
        truncated: false,
        method: input.method,
        path: input.path,
        findings: [],
      }),
    GetMockServer: () =>
      call("GetMockServer", undefined, () => state.mock),
    UpdateMockRoutes: async (routes) => {
      record("UpdateMockRoutes", routes);
      if (Object.prototype.hasOwnProperty.call(state.overrides, "UpdateMockRoutes")) {
        return configuredValue("UpdateMockRoutes", routes, state.mock);
      }
      state.mock.routes = clone(routes);
      state.mock.state.routeCount = routes.length;
      state.mock.state.enabledCount = routes.filter((route) => route.enabled).length;
      return clone(state.mock);
    },
    StartMockServer: async (input) => {
      record("StartMockServer", input);
      if (Object.prototype.hasOwnProperty.call(state.overrides, "StartMockServer")) {
        return configuredValue("StartMockServer", input, state.mock);
      }
      state.mock.state.running = true;
      state.mock.state.port = input.port || 43117;
      state.mock.state.baseUrl = `http://127.0.0.1:${state.mock.state.port}`;
      state.mock.state.startedAt = now();
      return clone(state.mock);
    },
    StopMockServer: async () => {
      record("StopMockServer", undefined);
      if (Object.prototype.hasOwnProperty.call(state.overrides, "StopMockServer")) {
        return configuredValue("StopMockServer", undefined, state.mock);
      }
      state.mock.state.running = false;
      state.mock.state.baseUrl = "";
      state.mock.state.startedAt = undefined;
      return clone(state.mock);
    },
    ClearMockHits: async () => {
      record("ClearMockHits", undefined);
      state.mock.hits = [];
      state.mock.state.hitCount = 0;
      state.mock.state.totalHits = 0;
      return clone(state.mock);
    },
    ImportMockOpenAPI: async () => {
      record("ImportMockOpenAPI", undefined);
      if (Object.prototype.hasOwnProperty.call(state.overrides, "ImportMockOpenAPI")) {
        return configuredValue("ImportMockOpenAPI", undefined, state.mock);
      }
      state.mock.routes = [
        {
          id: "openapi-list-orders",
          method: "GET",
          path: "/orders",
          status: 200,
          headers: { "Content-Type": "application/json" },
          body: '{"items":[]}',
          delayMs: 0,
          enabled: true,
        },
        {
          id: "openapi-order",
          method: "GET",
          path: "/orders/{id}",
          status: 200,
          headers: { "Content-Type": "application/json" },
          body: '{"id":"order-42"}',
          delayMs: 0,
          enabled: true,
        },
      ];
      state.mock.state.routeCount = 2;
      state.mock.state.enabledCount = 2;
      return { ...clone(state.mock), importedPath: "/fixtures/orders.openapi.yaml" };
    },
    RunSSE: (input) =>
      call("RunSSE", input, {
        statusCode: 200,
        headers: { "content-type": ["text/event-stream"] },
        events: [
          {
            event: "order.created",
            id: "evt-1",
            data: '{"id":"order-42"}',
            retryMillis: 1500,
            hasRetry: true,
          },
          {
            event: "heartbeat",
            id: "evt-2",
            data: "alive",
            retryMillis: 0,
            hasRetry: false,
          },
        ],
        durationMs: 85,
      }),
    CancelToolOperation: async (operationID) => {
      record("CancelToolOperation", operationID);
      const configured =
        (state.deferredCounts.get("CancelToolOperation") || 0) > 0 ||
        state.deferredNames.has("CancelToolOperation") ||
        Object.prototype.hasOwnProperty.call(
          state.overrides,
          "CancelToolOperation",
        );
      if (
        configured &&
        !(await configuredValue("CancelToolOperation", operationID, true))
      ) {
        return false;
      }
      for (const method of ["RunSSE", "RunCollection", "AnalyzeNetwork"]) {
        const pending = takePending(
          method,
          (candidate) => candidate.input?.operationId === operationID,
        );
        if (!pending) continue;
        state.deferredNames.delete(method);
        if (method === "RunSSE") {
          pending.resolve({
            statusCode: 0,
            headers: {},
            events: [],
            durationMs: 0,
            error: userError(
              "operation_canceled",
              "Operation canceled",
              "The active operation was canceled.",
            ),
          });
        } else {
          pending.resolve({
            error: userError(
              "operation_canceled",
              "Operation canceled",
              "The active operation was canceled.",
            ),
          });
        }
        return true;
      }
      return false;
    },
    InspectActuator: (input) =>
      call("InspectActuator", input, {
        health: {
          status: "UP",
          data: { status: "UP", components: { db: { status: "UP" } } },
        },
        mappings: {
          data: { contexts: { application: { mappings: {} } } },
        },
        metrics: {
          capturedAt: now(),
          metrics: {
            "jvm.memory.used": {
              name: "jvm.memory.used",
              description: "JVM memory used",
              baseUnit: "bytes",
              measurements: { VALUE: 1048576 },
            },
            "process.cpu.usage": {
              name: "process.cpu.usage",
              measurements: { VALUE: 0.21 },
            },
          },
        },
        deltas: input.before
          ? [
              {
                metric: "jvm.memory.used",
                statistic: "VALUE",
                before: 900000,
                after: 1048576,
                delta: 148576,
                percentChange: 16.5,
              },
            ]
          : [],
      }),
    CompareEnvironments: (input) =>
      call("CompareEnvironments", input, {
        method: input.method,
        path: input.path,
        responses: input.targets.map((target, index) => ({
          name: target.name,
          url: `${target.baseUrl}${input.path}`,
          statusCode: index === 2 ? 503 : 200,
          durationMs: 20 + index,
          headers: { "content-type": ["application/json"] },
          body: JSON.stringify({ environment: target.name, ready: index !== 2 }),
          contentType: "application/json",
          truncated: false,
        })),
        comparisons: [
          {
            baseline: input.targets[0]?.name || "Local",
            candidate: input.targets[1]?.name || "Test",
            statusMatch: true,
            baselineStatus: 200,
            candidateStatus: 200,
            headerDifferences: [],
            headerDifferencesTruncated: false,
            bodyEqual: false,
            bodyMode: "json",
            jsonDifferences: [
              {
                path: "$.environment",
                kind: "changed",
                baseline: "Local",
                candidate: "Test",
              },
            ],
            jsonDifferencesTruncated: false,
          },
        ],
      }),
    AnalyzeThreadDump: (input) =>
      call("AnalyzeThreadDump", input, {
        threadCount: 3,
        stateCounts: { RUNNABLE: 1, BLOCKED: 2 },
        blockedThreads: [
          { name: "worker-2", state: "BLOCKED", clues: ["waiting for monitor"] },
        ],
        deadlockDetected: false,
        repeatedStacks: [
          {
            count: 2,
            frames: ["com.example.Worker.run(Worker.java:42)"],
            threads: ["worker-1", "worker-2"],
          },
        ],
        truncated: false,
      }),
    SearchTraceLog: (input) =>
      call("SearchTraceLog", input, {
        query: input.query,
        matches: [
          {
            lineNumber: 2,
            line: `2026-07-29 INFO traceId=${input.query} order created`,
          },
        ],
        scannedLines: 3,
        truncated: false,
      }),
    AnalyzeEndpointCoverage: (input) =>
      call("AnalyzeEndpointCoverage", input, {
        totalKnown: input.known.length,
        covered: Math.min(input.known.length, input.observed.length),
        coveragePercent: input.known.length ? 50 : 0,
        endpoints: input.known.map((endpoint, index) => ({
          method: endpoint.method,
          path: endpoint.path,
          hitCount: index === 0 ? 3 : 0,
          observedPaths: index === 0 ? [endpoint.path] : [],
          observedPathsTruncated: false,
        })),
        unknownObserved: [],
      }),
    RunCollection: (input) =>
      call("RunCollection", input, {
        report: {
          name: "E2E collection",
          startedAt: now(),
          durationMs: 64,
          passed: 1,
          failed: 1,
          results: [
            {
              id: "health",
              name: "Health",
              method: "GET",
              url: "https://api.example.test/health",
              statusCode: 200,
              headers: { "content-type": ["application/json"] },
              body: '{"status":"UP"}',
              durationMs: 20,
              assertions: [
                {
                  assertion: {
                    target: "status",
                    operator: "equals",
                    expected: 200,
                  },
                  passed: true,
                  exists: true,
                  actual: 200,
                },
              ],
              passed: true,
            },
            {
              id: "orders",
              name: "Orders",
              method: "GET",
              url: "https://api.example.test/orders",
              statusCode: 500,
              durationMs: 44,
              assertions: [
                {
                  assertion: {
                    target: "status",
                    operator: "equals",
                    expected: 200,
                  },
                  passed: false,
                  exists: true,
                  actual: 500,
                  message: "expected 200",
                },
              ],
              passed: false,
            },
          ],
        },
      }),
    AnalyzeNetwork: (input) =>
      call("AnalyzeNetwork", input, {
        report: {
          inputUrl: input.url,
          dnsLookups: [
            {
              host: "api.example.test",
              ips: ["203.0.113.10", "2001:db8::10"],
              durationMs: 4,
            },
          ],
          hops: [
            {
              url: input.url,
              method: "HEAD",
              statusCode: 301,
              location: "https://api.example.test/v2",
              durationMs: 12,
            },
            {
              url: "https://api.example.test/v2",
              method: "HEAD",
              statusCode: 200,
              durationMs: 18,
            },
          ],
          finalUrl: "https://api.example.test/v2",
          finalStatusCode: 200,
          totalDurationMs: 34,
          usedGetFallback: false,
        },
      }),
    LintOpenAPI: () =>
      call("LintOpenAPI", undefined, {
        path: "/fixtures/orders.openapi.yaml",
        canceled: false,
        report: {
          issues: [
            {
              code: "operation.summary",
              severity: "warning",
              path: "/paths/~1orders/get",
              message: "Operation summary should be more descriptive.",
              hint: "Use a user-facing summary.",
            },
            {
              code: "response.error",
              severity: "error",
              path: "/paths/~1orders/post/responses",
              message: "An error response is required.",
            },
            {
              code: "document.info",
              severity: "info",
              path: "/info",
              message: "Contact information is recommended.",
            },
          ],
          summary: {
            paths: 1,
            operations: 2,
            total: 3,
            errors: 1,
            warnings: 1,
            infos: 1,
          },
          truncated: false,
        },
      }),
    WriteClipboardText: async (value) => {
      state.clipboard = String(value);
      return true;
    },
  };

  const control = {
    calls: state.calls,
    get clipboard() {
      return state.clipboard;
    },
    get collectionData() {
      return state.collectionData;
    },
    configure(config = {}) {
      if (config.overrides && typeof config.overrides === "object") {
        Object.assign(state.overrides, clone(config.overrides));
      } else {
        Object.assign(state.overrides, clone(config));
      }
      if (typeof config.collectionData === "string") {
        state.collectionData = config.collectionData;
        writeCollectionData(state.collectionData);
      }
      if (config.mock) state.mock = clone(config.mock);
    },
    defer(method) {
      state.deferredNames.add(String(method));
    },
    deferNext(method) {
      const name = String(method);
      state.deferredCounts.set(
        name,
        (state.deferredCounts.get(name) || 0) + 1,
      );
    },
    resolve(method, value, selector) {
      const name = String(method);
      const pending = takePending(
        name,
        (candidate) => pendingMatches(candidate, selector),
      );
      if (!pending) return false;
      state.deferredNames.delete(name);
      pending.resolve(clone(value));
      return true;
    },
    resolveAt(method, index, value) {
      const name = String(method);
      const queue = state.pending.get(name) || [];
      const position = Number(index);
      if (
        !Number.isInteger(position) ||
        position < 0 ||
        position >= queue.length
      ) {
        return false;
      }
      const [pending] = queue.splice(position, 1);
      if (queue.length === 0) state.pending.delete(name);
      else state.pending.set(name, queue);
      state.deferredNames.delete(name);
      pending.resolve(clone(value));
      return true;
    },
    reject(method, message, selector) {
      const name = String(method);
      const pending = takePending(
        name,
        (candidate) => pendingMatches(candidate, selector),
      );
      if (!pending) return false;
      state.deferredNames.delete(name);
      pending.reject(new Error(String(message)));
      return true;
    },
    takeCalls() {
      return state.calls.splice(0, state.calls.length);
    },
    pendingCount(method) {
      return (state.pending.get(String(method)) || []).length;
    },
    pendingInputs(method) {
      return clone(
        (state.pending.get(String(method)) || []).map(
          (pending) => pending.input,
        ),
      );
    },
    reset() {
      state.calls.splice(0, state.calls.length);
      state.clipboard = "";
      state.collectionData = "";
      try {
        sessionStorage.removeItem(collectionStorageKey);
      } catch {
        // Ignore unavailable scenario storage.
      }
      state.overrides = {};
      state.deferredNames.clear();
      state.deferredCounts.clear();
      state.pending.clear();
      state.mock = initialMock();
    },
    setMockHit(hit) {
      state.mock.hits = [clone(hit)];
      state.mock.state.hitCount = 1;
      state.mock.state.totalHits += 1;
    },
    setMockLastError(message) {
      const normalized = String(message || "");
      if (normalized) state.mock.state.lastError = normalized;
      else delete state.mock.state.lastError;
    },
  };

  const initial = globalThis.__VALIDEX_E2E_INITIAL__;
  if (initial && typeof initial === "object") control.configure(initial);

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      async writeText(text) {
        state.clipboard = String(text);
      },
      async readText() {
        return state.clipboard;
      },
    },
  });

  globalThis.__VALIDEX_E2E__ = control;
  globalThis.canbridge = { Bridge: bridge };
})();
