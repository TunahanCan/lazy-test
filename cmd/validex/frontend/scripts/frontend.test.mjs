import assert from "node:assert/strict";
import test from "node:test";

import {
  automationOperationID,
  durationLabel,
  parseVariables,
  positiveInteger,
  sampleCollection,
} from "../.typescript-build/esm/features/automation/model.js";
import {
  COLLECTION_NAME_LENGTH_LIMITS,
  SAVED_REQUEST_NAME_LENGTH_LIMITS,
  bySortOrder,
  createOpenRequestSnapshot,
  normalizedLibraryName,
} from "../.typescript-build/esm/features/collections/model.js";
import { issueFrom } from "../.typescript-build/esm/features/protocols/model.js";
import {
  appendURLPerformanceReport,
  formatURLPerformanceDuration,
  jwtErrorText,
  summarizeURLPerformance,
  urlPerformanceLimits,
  validateURLPerformanceOptions,
  validateURLPerformanceTarget,
} from "../.typescript-build/esm/features/diagnostics/model.js";
import { parseMockServerPort } from "../.typescript-build/esm/features/mock-server/model.js";
import { createPersistedStore, createStore } from "../.typescript-build/esm/core/store.js";
import { localizedBootstrapData } from "../.typescript-build/esm/lib/bootstrap.js";
import {
  localizeUserError,
  userErrorTechnicalDetails,
} from "../.typescript-build/esm/lib/userErrors.js";
import {
  FEEDBACK_TONE,
  notify,
  subscribeFeedback,
} from "../.typescript-build/esm/core/feedback.js";
import {
  messages,
  translate,
} from "../.typescript-build/esm/i18n/messages.js";
import {
  backendUserErrorHintKeys,
  backendUserErrorMessageKeys,
} from "../.typescript-build/esm/i18n/messages/backendErrors.js";
import {
  backendAutomationErrorHintKeys,
  backendAutomationErrorMessageKeys,
} from "../.typescript-build/esm/i18n/messages/backendErrorsAutomation.js";
import {
  backendRequestErrorHintKeys,
  backendRequestErrorMessageKeys,
} from "../.typescript-build/esm/i18n/messages/backendErrorsRequest.js";
import {
  backendToolsErrorHintKeys,
  backendToolsErrorMessageKeys,
} from "../.typescript-build/esm/i18n/messages/backendErrorsTools.js";
import {
  analyzeJWT,
  analyzeSpringError,
  compareJSON,
  DeveloperToolError,
  formatJSON,
  inferJSONSchema,
  javaDTOToJSONExample,
  minifyJSON,
  queryJSONPath,
  sortJSON,
} from "../.typescript-build/esm/lib/developerTools.js";
import {
  importedEndpointTabID,
  importedRequestURL,
  requestURLMatchesOpenAPIPath,
} from "../.typescript-build/esm/lib/openapi.js";
import {
  missingVariables,
  REQUEST_URL_VALIDATION_CODE,
  requestSchema,
  requestURLValidationCode,
  requestURLValidationMessage,
  resolveVariableReferences,
} from "../.typescript-build/esm/lib/schemas.js";
import {
  addURLQueryRow,
  parseURLQuery,
  removeURLQueryRow,
  updateURLQueryRow,
} from "../.typescript-build/esm/lib/urlQuery.js";
import { requestNameFromURL } from "../.typescript-build/esm/features/requests/model/requestName.js";
import {
  fitPanelWidths,
  horizontalCenterMinWidth,
  panelResizerWidth,
} from "../.typescript-build/esm/native/chrome/layout.js";
import {
  VIRTUAL_LIST_NAVIGATION_KEY,
  virtualNavigationTarget,
  virtualWindowRange,
} from "../.typescript-build/esm/native/chrome/sidebarVirtualization.js";
import { matchesSidebarSearch } from "../.typescript-build/esm/native/chrome/sidebarSearch.js";

test("built-in bootstrap labels follow locale without replacing custom names", () => {
  const bootstrap = {
    appVersion: "0.2.0",
    workspaceId: "validex-workspace",
    workspaceName: "Validex Workspace",
    environments: [
      { id: "none", name: "No Environment", variables: {} },
      { id: "local", name: "Local", variables: { baseUrl: "http://localhost" } },
      { id: "custom", name: "QA özel", variables: {} },
    ],
    collections: [],
    history: [],
    recentUrls: [],
    onboardingSteps: [],
  };
  const english = localizedBootstrapData(
    bootstrap,
    (key, values) => translate("en", key, values),
  );
  const turkish = localizedBootstrapData(
    bootstrap,
    (key, values) => translate("tr", key, values),
  );
  assert.equal(english.workspaceName, "Validex Workspace");
  assert.deepEqual(
    english.environments.map((environment) => environment.name),
    ["No environment", "Local", "QA özel"],
  );
  assert.equal(turkish.workspaceName, "Validex Çalışma Alanı");
  assert.deepEqual(
    turkish.environments.map((environment) => environment.name),
    ["Ortam yok", "Yerel", "QA özel"],
  );
  assert.deepEqual(turkish.onboardingSteps, [
    "İlk isteğini gönder",
    "OpenAPI contract farklarını incele",
    "Mock server başlat",
  ]);
});

test("application feedback publishes normalized visible messages", () => {
  const received = [];
  const unsubscribe = subscribeFeedback((feedback) => received.push(feedback));
  notify("  Saved to collection  ");
  notify({
    message: "Write failed",
    tone: FEEDBACK_TONE.ERROR,
    durationMs: 250,
  });
  notify({
    message: "  Needs attention  ",
    tone: FEEDBACK_TONE.ERROR,
  });
  notify("   ");
  unsubscribe();

  assert.equal(received.length, 3);
  assert.equal(received[0].message, "Saved to collection");
  assert.equal(received[0].tone, FEEDBACK_TONE.INFO);
  assert.ok(received[0].durationMs >= 1_500);
  assert.equal(received[1].tone, FEEDBACK_TONE.ERROR);
  assert.equal(received[1].durationMs, 1_500);
  assert.ok(received[1].id > received[0].id);
  assert.equal(received[2].message, "Needs attention");
  assert.equal(received[2].tone, FEEDBACK_TONE.ERROR);
  assert.equal(received[2].durationMs, 0);
  assert.ok(received[2].id > received[1].id);
});

test("virtual API navigation renders and reveals off-window endpoints", () => {
  const metrics = {
    count: 1_000,
    scrollTop: 0,
    viewportHeight: 330,
    rowHeight: 33,
    overscan: 10,
  };
  const initialWindow = virtualWindowRange(metrics);
  assert.deepEqual(initialWindow, { start: 0, end: 20 });

  const afterRenderedEdge = virtualNavigationTarget({
    ...metrics,
    currentIndex: initialWindow.end - 1,
    key: VIRTUAL_LIST_NAVIGATION_KEY.NEXT,
  });
  assert.equal(afterRenderedEdge?.index, initialWindow.end);
  assert.ok((afterRenderedEdge?.scrollTop ?? 0) > 0);
  assert.ok(
    afterRenderedEdge !== undefined &&
      afterRenderedEdge.index >= afterRenderedEdge.window.start &&
      afterRenderedEdge.index < afterRenderedEdge.window.end,
  );

  const last = virtualNavigationTarget({
    ...metrics,
    currentIndex: 0,
    key: VIRTUAL_LIST_NAVIGATION_KEY.LAST,
  });
  assert.equal(last?.index, metrics.count - 1);
  assert.equal(last?.window.end, metrics.count);
  assert.ok(
    last !== undefined &&
      last.index >= last.window.start &&
      last.index < last.window.end,
  );

  const beforeLast = virtualNavigationTarget({
    ...metrics,
    currentIndex: last?.index ?? 0,
    scrollTop: last?.scrollTop ?? 0,
    key: VIRTUAL_LIST_NAVIGATION_KEY.PREVIOUS,
  });
  assert.equal(beforeLast?.index, metrics.count - 2);
  assert.ok(
    beforeLast !== undefined &&
      beforeLast.index >= beforeLast.window.start &&
      beforeLast.index < beforeLast.window.end,
  );

  const first = virtualNavigationTarget({
    ...metrics,
    currentIndex: last?.index ?? 0,
    scrollTop: last?.scrollTop ?? 0,
    key: VIRTUAL_LIST_NAVIGATION_KEY.FIRST,
  });
  assert.equal(first?.index, 0);
  assert.equal(first?.scrollTop, 0);
  assert.equal(first?.window.start, 0);
});

test("sidebar search combines independent method and URL terms", () => {
  const fields = [
    "Update order",
    "PATCH",
    "https://api.example.test/orders/42",
  ];

  assert.equal(matchesSidebarSearch(fields, "PATCH orders/42", "en"), true);
  assert.equal(matchesSidebarSearch(fields, "update PATCH", "en"), true);
  assert.equal(matchesSidebarSearch(fields, "GET orders/42", "en"), false);
  assert.equal(matchesSidebarSearch(fields, "   ", "en"), true);
});

test("URL query helpers preserve raw duplicate parameters", () => {
  const url =
    "https://api.example.test/search?tag=java&tag=spring%20boot&empty=&flag&scope={{scope}}#results";
  const rows = parseURLQuery(url);
  assert.deepEqual(
    rows.map(({ key, value, hasEquals, rawSegment }) => ({
      key,
      value,
      hasEquals,
      rawSegment,
    })),
    [
      { key: "tag", value: "java", hasEquals: true, rawSegment: "tag=java" },
      {
        key: "tag",
        value: "spring boot",
        hasEquals: true,
        rawSegment: "tag=spring%20boot",
      },
      { key: "empty", value: "", hasEquals: true, rawSegment: "empty=" },
      { key: "flag", value: "", hasEquals: false, rawSegment: "flag" },
      {
        key: "scope",
        value: "{{scope}}",
        hasEquals: true,
        rawSegment: "scope={{scope}}",
      },
    ],
  );
});

test("URL query edits preserve untouched encoding and fragments", () => {
  const source =
    "https://api.example.test/search?tag=spring%20boot&tag={{scope}}&q=a+b#results";
  assert.equal(
    updateURLQueryRow(source, 0, { value: "Spring & Java" }),
    "https://api.example.test/search?tag=Spring%20%26%20Java&tag={{scope}}&q=a+b#results",
  );
  assert.equal(
    addURLQueryRow("{{baseUrl}}/orders#summary", {
      key: "owner",
      value: "{{user}}",
    }),
    "{{baseUrl}}/orders?owner={{user}}#summary",
  );
  assert.equal(
    removeURLQueryRow(
      "https://api.example.test/search?tag=java&tag=spring%20boot#results",
      1,
    ),
    "https://api.example.test/search?tag=java#results",
  );
});

test("request schema accepts templated HTTP URLs and TRACE", () => {
  for (const method of ["GET", "TRACE"]) {
    assert.equal(
      requestSchema.safeParse({
        method,
        url: "{{baseUrl}}/v1/users",
        body: "",
        headers: [],
        timeoutMs: 30_000,
      }).success,
      true,
    );
  }
});

test("manual mock server ports accept only the TCP port range", () => {
  assert.equal(parseMockServerPort("4010"), 4010);
  assert.equal(parseMockServerPort(" 65535 "), 65535);
  for (const value of ["", "0", "65536", "40.1", "four-thousand"]) {
    assert.equal(parseMockServerPort(value), null);
  }
});

test("request schema rejects implicit schemes, credentials and fragments", () => {
  assert.equal(
    requestURLValidationCode("localhost:8080/health"),
    REQUEST_URL_VALIDATION_CODE.SCHEME,
  );
  assert.equal(
    requestURLValidationCode("https://user:secret@example.test/users"),
    REQUEST_URL_VALIDATION_CODE.USER_INFO,
  );
  assert.equal(
    requestURLValidationCode("https://example.test/users#details"),
    REQUEST_URL_VALIDATION_CODE.FRAGMENT,
  );
  assert.equal(
    requestURLValidationMessage("localhost:8080/health"),
    "URL açıkça http:// veya https:// ile başlamalı.",
  );
  assert.match(
    requestURLValidationMessage("https://user:secret@example.test/users") ?? "",
    /kullanıcı bilgisi/,
  );
  assert.match(
    requestURLValidationMessage("https://example.test/users#details") ?? "",
    /fragment/,
  );
});

test("variable resolution preserves unknowns and rejects masked secrets", () => {
  assert.deepEqual(
    missingVariables("{{baseUrl}}/{{token}}", {
      baseUrl: "https://example.test",
      token: "••••••••••••",
    }),
    ["token"],
  );
  assert.equal(
    resolveVariableReferences("{{baseUrl}}/{{id}}/{{unknown}}", {
      baseUrl: "https://example.test",
      id: "42",
    }),
    "https://example.test/42/{{unknown}}",
  );
});

test("OpenAPI helpers create stable tabs and editable URLs", () => {
  assert.equal(
    importedEndpointTabID("orders", "get-order"),
    "openapi:orders:get-order",
  );
  assert.equal(
    importedRequestURL("/api/v1/", "/users/{id}"),
    "{{baseUrl}}/api/v1/users/{{id}}",
  );
  assert.equal(
    requestURLMatchesOpenAPIPath(
      "https://api.example.test/v1/orders/42?expand=true",
      "/orders/{id}",
    ),
    true,
  );
  assert.equal(
    requestURLMatchesOpenAPIPath(
      "https://api.example.test/v1/customers/42",
      "/orders/{id}",
    ),
    false,
  );
});

test("automation inputs stay bounded and sample remains executable", () => {
  const sample = JSON.parse(sampleCollection);
  assert.equal(sample.requests.length, 1);
  assert.equal(sample.requests[0].assertions.length, 3);
  assert.deepEqual(
    parseVariables('{"baseUrl":"http://localhost:8080"}'),
    { baseUrl: "http://localhost:8080" },
  );
  assert.throws(() => parseVariables('{"port":8080}'), /string/);
  assert.equal(positiveInteger("10", "Timeout", 30), 10);
  assert.throws(() => positiveInteger("4.2", "Timeout", 30), /tam sayı/);
  assert.equal(durationLabel(1_250), "1.25 s");
  assert.match(automationOperationID("runner"), /^runner-[0-9a-f-]{36}$/);
});

test("collection snapshots are normalized, cloned and deterministic", () => {
  assert.equal(
    normalizedLibraryName(
      "  Platform   API  ",
      COLLECTION_NAME_LENGTH_LIMITS,
    ),
    "Platform API",
  );
  assert.equal(
    normalizedLibraryName(
      "r".repeat(SAVED_REQUEST_NAME_LENGTH_LIMITS[1] + 1),
      SAVED_REQUEST_NAME_LENGTH_LIMITS,
    ),
    undefined,
  );
  const saved = {
    id: "request-1",
    collectionId: "collection-1",
    name: "List users",
    method: "GET",
    url: "https://example.test/users",
    headers: [
      {
        id: "accept",
        enabled: true,
        key: "Accept",
        value: "application/json",
      },
    ],
    body: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    sortOrder: 0,
  };
  const snapshot = createOpenRequestSnapshot(saved);
  assert.notEqual(snapshot.headers, saved.headers);
  assert.notEqual(snapshot.headers[0], saved.headers[0]);
  assert.equal("response" in snapshot, false);
  const values = [
    { sortOrder: 3, createdAt: "2026-01-02T00:00:00.000Z" },
    { sortOrder: 3, createdAt: "2026-01-01T00:00:00.000Z" },
  ].sort(bySortOrder);
  assert.equal(values[0].createdAt, "2026-01-01T00:00:00.000Z");
});

test("developer JSON tools format, compare and query safely", () => {
  const input = '{"z":{"b":1,"a":2},"a":true}';
  assert.equal(minifyJSON(formatJSON(input)), input);
  assert.match(sortJSON(input), /^\{\n  "a": true,/);
  const differences = compareJSON(
    '{"id":"a","items":[1]}',
    '{"id":"b","items":["1",2]}',
    ["$.id"],
  );
  assert.equal(differences.some((item) => item.path === "$.id"), false);
  assert.equal(
    differences.some(
      (item) => item.path === "$.items[0]" && item.kind === "type",
    ),
    true,
  );
  assert.equal(
    queryJSONPath('{"users":[{"name":"Ada"}]}', "$.users[0].name"),
    "Ada",
  );
  assert.throws(
    () => queryJSONPath("{}", "$..name"),
    (error) =>
      error instanceof DeveloperToolError &&
      error.code === "jsonpath.unsupported",
  );
});

test("Spring and JWT analyzers expose structured diagnostics", () => {
  const spring = analyzeSpringError(
    JSON.stringify({
      title: "Validation failed",
      status: 400,
      detail: "Invalid fields",
      errors: [{ field: "email", defaultMessage: "invalid" }],
    }),
    400,
    { "X-Trace-ID": ["trace-42"] },
  );
  assert.equal(spring.recognized, true);
  assert.equal(spring.fieldErrors[0].field, "email");
  assert.equal(spring.traceId, "trace-42");

  const base64url = (value) =>
    Buffer.from(JSON.stringify(value))
      .toString("base64url");
  const token = [
    base64url({ alg: "RS256" }),
    base64url({
      sub: "user-1",
      exp: 2_000,
      scope: "orders:read orders:write",
      realm_access: { roles: ["admin"] },
    }),
    "signature",
  ].join(".");
  const jwt = analyzeJWT(token, 1_000_000);
  assert.equal(jwt.active, true);
  assert.deepEqual(jwt.roles, ["admin"]);
  assert.deepEqual(jwt.scopes, ["orders:read", "orders:write"]);
  assert.equal(jwt.signaturePresent, true);
  for (const locale of ["en", "tr"]) {
    const translator = (key, values) => translate(locale, key, values);
    assert.equal(
      jwtErrorText(new DeveloperToolError("jwt.threeParts"), translator),
      translator("diagnostics.jwt.threeParts"),
    );
    assert.equal(
      jwtErrorText(new DeveloperToolError("jwt.invalidBase64"), translator),
      translator("diagnostics.jwt.invalidBase64"),
    );
    assert.equal(
      jwtErrorText(new DeveloperToolError("jwt.invalidJSON"), translator),
      translator("diagnostics.jwt.invalidJSON"),
    );
  }
  assert.throws(
    () => analyzeJWT("e30.ew.signature"),
    (error) =>
      error instanceof DeveloperToolError && error.code === "jwt.invalidJSON",
  );
});

test("URL performance diagnostics accept professional run sizes safely", () => {
  const translator = (key, values) => translate("en", key, values);
  assert.equal(
    validateURLPerformanceTarget(
      "  https://api.example.test/health  ",
      translator,
    ),
    "https://api.example.test/health",
  );
  for (const invalid of [
    "ftp://api.example.test/health",
    "https://user:secret@api.example.test/health",
    "https://api.example.test/health#details",
  ]) {
    assert.throws(() => validateURLPerformanceTarget(invalid, translator));
  }
  assert.doesNotThrow(() =>
    validateURLPerformanceOptions(25_000, 3_600_000, translator),
  );
  for (const [samples, timeout] of [
    [0, 5_000],
    [1.5, 5_000],
    [Number.MAX_SAFE_INTEGER + 1, 5_000],
    [3, 0],
    [3, 1.5],
    [3, urlPerformanceLimits.maximumRepresentableTimeoutMs + 1],
  ]) {
    assert.throws(() =>
      validateURLPerformanceOptions(samples, timeout, translator),
    );
  }

  const report = (duration, status, finalUrl) => ({
    inputUrl: "https://api.example.test/start",
    dnsLookups: [],
    hops: [],
    finalUrl,
    finalStatusCode: status,
    totalDurationMs: duration,
    usedGetFallback: false,
  });
  const summary = summarizeURLPerformance([
    report(12, 200, "https://api.example.test/health"),
    report(4, 204, "https://api.example.test/health"),
    report(8, 200, "https://api.example.test/health"),
  ]);
  assert.ok(summary);
  assert.equal(summary.completedSamples, 3);
  assert.equal(summary.fastestMs, 4);
  assert.equal(summary.averageMs, 8);
  assert.equal(summary.slowestMs, 12);
  assert.deepEqual(
    summary.samples.map((sample) => sample.statusCode),
    [200, 204, 200],
  );

  const longSummary = summarizeURLPerformance(
    Array.from({ length: 1_000 }, (_, index) =>
      report(
        (index % 20) + 1,
        200,
        `https://api.example.test/health/${index + 1}`,
      ),
    ),
  );
  assert.ok(longSummary);
  assert.equal(longSummary.completedSamples, 1_000);
  assert.equal(
    longSummary.samples.length,
    urlPerformanceLimits.retainedSampleDetails,
  );
  assert.equal(longSummary.samples[0].number, 751);
  assert.equal(longSummary.samples.at(-1).number, 1_000);
  assert.equal(longSummary.fastestMs, 1);
  assert.ok(Math.abs(longSummary.averageMs - 10.5) < Number.EPSILON * 20);
  assert.equal(longSummary.slowestMs, 20);

  const appended = appendURLPerformanceReport(
    undefined,
    report(7, 202, "https://api.example.test/accepted"),
  );
  assert.equal(appended.completedSamples, 1);
  assert.equal(appended.samples[0].number, 1);
  assert.equal(formatURLPerformanceDuration(0, "en"), "< 1 ms");
  assert.equal(formatURLPerformanceDuration(8.25, "en"), "8.3 ms");
  assert.equal(summarizeURLPerformance([]), undefined);
});

test("schema inference and Java DTO examples remain dependency-free", () => {
  const schema = JSON.parse(
    inferJSONSchema('{"id":42,"tags":["api"],"active":true}'),
  );
  assert.equal(schema.properties.id.type, "integer");
  assert.equal(schema.properties.tags.items.type, "string");
  const example = JSON.parse(
    javaDTOToJSONExample(`
      public record OrderResponse(
        UUID id,
        List<OrderLineResponse> lines,
        OrderStatus status
      ) {}
      record OrderLineResponse(String sku, BigDecimal price) {}
      enum OrderStatus { CREATED, SHIPPED }
    `),
  );
  assert.deepEqual(example, {
    id: "00000000-0000-0000-0000-000000000001",
    lines: [{ sku: "example", price: 0 }],
    status: "CREATED",
  });
});

test("protocol errors localize backend failures and retain technical context", () => {
  for (const locale of ["en", "tr"]) {
    const translator = (key, values) => translate(locale, key, values);
    const issue = issueFrom(
      {
        code: "sse_failed",
        title: "RAW backend title",
        message: "RAW backend message",
        hint: "RAW backend hint",
        technical: "raw stack",
      },
      translator,
    );
    assert.equal(issue.title, translator("protocol.error.sseFailedTitle"));
    assert.equal(issue.message, translator("protocol.error.sseFailedMessage"));
    assert.equal(issue.technical, "raw stack");
    assert.doesNotMatch(issue.technical ?? "", /RAW backend title/);
  }
});

test("semantic backend errors localize without leaking fallback text", () => {
  const backendError = {
    code: "network_operation_invalid",
    messageKey: "backend.error.automation.network.operation_invalid",
    title: "Ağ analizi başlatılamadı",
    message: "DNS ve redirect işlemi başlatılamadı.",
    hint:
      "Aynı operationId ile çalışan başka bir işlem olmadığını kontrol edin.",
    technical: "operation network-1 is already running",
  };

  const english = localizeUserError(
    backendError,
    (key, values) => translate("en", key, values),
  );
  assert.equal(english.title, "Network analysis could not be started");
  assert.equal(
    english.message,
    "The DNS and redirect operation could not be started.",
  );
  assert.doesNotMatch(english.title, /Ağ/);
  assert.equal(
    userErrorTechnicalDetails(backendError),
    "operation network-1 is already running",
  );

  const turkish = localizeUserError(
    backendError,
    (key, values) => translate("tr", key, values),
  );
  assert.equal(turkish.title, backendError.title);
  assert.equal(turkish.message, backendError.message);
});

test("backend error catalogs interpolate request, collection, and tool contexts", () => {
  const english = (key, values) => translate("en", key, values);
  const headerError = localizeUserError(
    {
      code: "invalid_request",
      messageKey: "backend.error.request.contentLengthMismatch",
      params: {
        headerName: "Content-Length",
        declaredLength: "10",
        bodyLength: "8",
      },
      title: "fallback",
      message: "fallback",
    },
    english,
  );
  assert.equal(headerError.title, "Content-Length header is invalid");
  assert.match(headerError.message, /10/);
  assert.match(headerError.message, /8 bytes/);

  const collectionError = localizeUserError(
    {
      code: "collection_file_read_failed",
      messageKey: "backend.error.collectionFile.readFailed",
      title: "fallback",
      message: "fallback",
    },
    english,
  );
  assert.equal(collectionError.title, "Collection file could not be read");

  const protocolIssue = issueFrom(
    {
      code: "tool_timeout",
      messageKey: "backend.error.protocol.sse.read.timeout",
      title: "fallback",
      message: "fallback",
      technical: "context deadline exceeded",
    },
    english,
  );
  assert.equal(protocolIssue.title, "The SSE stream could not be completed");
  assert.equal(protocolIssue.technical, "context deadline exceeded");
});

test("every registered backend error has complete EN and TR catalog fields", () => {
  const catalogs = [
    [backendUserErrorMessageKeys, backendUserErrorHintKeys],
    [backendAutomationErrorMessageKeys, backendAutomationErrorHintKeys],
    [backendRequestErrorMessageKeys, backendRequestErrorHintKeys],
    [backendToolsErrorMessageKeys, backendToolsErrorHintKeys],
  ];
  for (const [messageKeys, hintKeys] of catalogs) {
    for (const messageKey of messageKeys) {
      for (const locale of ["en", "tr"]) {
        assert.ok(messages[locale][`${messageKey}.title`]);
        assert.ok(messages[locale][`${messageKey}.message`]);
        if (hintKeys.has(messageKey)) {
          assert.ok(messages[locale][`${messageKey}.hint`]);
        }
      }
    }
  }
});

test("request naming chooses a useful path segment", () => {
  assert.equal(
    requestNameFromURL("https://api.example.test/v1/orders/42"),
    "Orders",
  );
  assert.equal(
    requestNameFromURL("{{baseUrl}}/user-profiles/{{id}}"),
    "User profiles",
  );
});

test("panel fitting never violates the center workspace minimum", () => {
  const result = fitPanelWidths(
    1_200,
    horizontalCenterMinWidth,
    true,
    true,
    340,
    320,
  );
  assert.ok(
    result.left +
      result.right +
      horizontalCenterMinWidth +
      panelResizerWidth * 2 <=
      1_200,
  );
});

test("internal stores notify once and persist after hydration", async () => {
  const notifications = [];
  const store = createStore((set) => ({
    count: 0,
    increment() {
      set((state) => ({ count: state.count + 1 }));
    },
  }));
  store.subscribe((state, previous) => {
    notifications.push([previous.count, state.count]);
  });
  store.getState().increment();
  assert.deepEqual(notifications, [[0, 1]]);

  const documents = new Map([
    ["counter", JSON.stringify({ state: { count: 4 }, version: 1 })],
  ]);
  const persisted = createPersistedStore(
    (set) => ({
      count: 0,
      increment() {
        set((state) => ({ count: state.count + 1 }));
      },
    }),
    {
      name: "counter",
      version: 1,
      storage: {
        getItem: (name) => documents.get(name) ?? null,
        setItem: (name, value) => documents.set(name, value),
      },
      partialize: ({ count }) => ({ count }),
    },
  );
  await persisted.hydrated;
  assert.equal(persisted.getState().count, 4);
  persisted.getState().increment();
  await Promise.resolve();
  assert.deepEqual(JSON.parse(documents.get("counter")).state, { count: 5 });
});
