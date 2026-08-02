import type {
  MockRoute,
  MockServerSnapshot,
  UserError,
} from "../../lib/types.js";
import { HTTP_METHODS } from "../../lib/http.js";
import { translate, type Locale } from "../../i18n/messages.js";
import type { Translate } from "../../i18n/locale.js";
import {
  hasLocalizedUserError,
  localizeUserError,
  userErrorTechnicalDetails,
} from "../../lib/userErrors.js";

export interface EditableRoute extends Omit<MockRoute, "headers"> {
  headersText: string;
}

export type MockOperationResult =
  | MockServerSnapshot
  | (Partial<Pick<MockServerSnapshot, "canceled">> & {
      error?: MockServerSnapshot["error"] | string;
    })
  | void;

export interface ToolIssue {
  title: string;
  message: string;
  hint?: string;
  technical?: string;
}

export interface ToolNotice {
  tone: "error" | "success";
  text?: string;
  issue?: ToolIssue;
}

export const mockHTTPMethods = HTTP_METHODS;

const defaultTranslate: Translate = (key, values) =>
  translate("tr", key, values);

export function parseMockServerPort(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535
    ? port
    : null;
}

const mockErrorTranslations = {
  mock_routes_invalid: "mock.error.routes",
  mock_already_running: "mock.error.alreadyRunning",
  mock_start_failed: "mock.error.start",
  mock_stop_failed: "mock.error.stop",
  backend_unavailable: "mock.error.runtime",
  runtime_unavailable: "mock.error.runtime",
  file_dialog_failed: "mock.error.fileDialog",
  invalid_openapi: "mock.error.invalidOpenAPI",
} as const;

export function toEditableRoute(route: MockRoute): EditableRoute {
  return {
    ...route,
    headersText: JSON.stringify(route.headers ?? {}, null, 2),
  };
}

function issueFromUserError(
  error: UserError,
  t: Translate,
): ToolIssue {
  return {
    title: error.title || t("mock.operation.title"),
    message: error.message,
    hint: error.hint,
    technical: error.technical,
  };
}

export function operationError(
  result: MockOperationResult,
  t: Translate = defaultTranslate,
): ToolIssue | null {
  if (!result?.error) return null;
  if (typeof result.error === "string") {
    return {
      title: t("mock.operation.title"),
      message: t("mock.operation.resultMessage"),
      technical: result.error,
    };
  }
  if (hasLocalizedUserError(result.error)) {
    const localized = localizeUserError(result.error, t);
    return {
      title: localized.title,
      message: localized.message,
      hint: localized.hint,
      technical: userErrorTechnicalDetails(result.error),
    };
  }
  const translatedMessage = mockErrorTranslations[
    result.error.code as keyof typeof mockErrorTranslations
  ];
  if (translatedMessage) {
    return {
      title: t("mock.operation.title"),
      message: t(translatedMessage),
      hint: t("mock.error.hint"),
      technical: result.error.technical,
    };
  }
  return issueFromUserError(result.error, t);
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function bridgeIssue(
  error: unknown,
  message: string,
  t: Translate = defaultTranslate,
): ToolIssue {
  return {
    title: t("mock.backend.title"),
    message,
    hint: t("mock.backend.hint"),
    technical: errorText(error),
  };
}

export function isMockSnapshot(
  result: MockOperationResult,
): result is MockServerSnapshot {
  if (!result || !("state" in result)) return false;
  const candidate = result as Partial<MockServerSnapshot>;
  return Boolean(
    candidate.state &&
      Array.isArray(candidate.routes) &&
      Array.isArray(candidate.hits),
  );
}

export function formatTimestamp(
  value: string,
  locale: Locale = "tr",
): string {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? value || "—"
    : timestamp.toLocaleTimeString(
        locale === "tr" ? "tr-TR" : "en-US",
        {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        },
      );
}

export function createRouteDraft(): EditableRoute {
  const suffix =
    globalThis.crypto?.randomUUID?.().slice(0, 8) ??
    Math.random().toString(36).slice(2, 10);
  return {
    id: `route-${suffix}`,
    method: "GET",
    path: "/example",
    status: 200,
    headersText: '{\n  "Content-Type": "application/json; charset=utf-8"\n}',
    body: '{\n  "message": "Validex mock response"\n}',
    delayMs: 0,
    enabled: true,
  };
}

export function parseRoutes(
  routes: EditableRoute[],
  t: Translate = defaultTranslate,
): MockRoute[] {
  const ids = new Set<string>();
  const signatures = new Set<string>();

  return routes.map((route, index) => {
    const label = t("mock.validation.routeLabel", {
      index: index + 1,
    });
    const id = route.id.trim();
    const method = route.method.trim().toUpperCase();
    const path = route.path.trim();

    if (!id) {
      throw new Error(t("mock.validation.idRequired", { label }));
    }
    if (ids.has(id)) {
      throw new Error(
        t("mock.validation.idDuplicate", { label, id }),
      );
    }
    ids.add(id);
    if (!method) {
      throw new Error(t("mock.validation.methodRequired", { label }));
    }
    if (!path.startsWith("/")) {
      throw new Error(t("mock.validation.path", { label }));
    }
    const signature = `${method} ${path}`;
    if (signatures.has(signature)) {
      throw new Error(
        t("mock.validation.signatureDuplicate", {
          label,
          signature,
        }),
      );
    }
    signatures.add(signature);
    if (
      !Number.isInteger(route.status) ||
      route.status < 200 ||
      route.status > 599
    ) {
      throw new Error(t("mock.validation.status", { label }));
    }
    if (
      !Number.isInteger(route.delayMs) ||
      route.delayMs < 0 ||
      route.delayMs > 600_000
    ) {
      throw new Error(t("mock.validation.delay", { label }));
    }

    let headers: unknown;
    try {
      headers = JSON.parse(route.headersText.trim() || "{}");
    } catch {
      throw new Error(
        t("mock.validation.headersObject", { label }),
      );
    }
    if (!headers || Array.isArray(headers) || typeof headers !== "object") {
      throw new Error(
        t("mock.validation.headersObject", { label }),
      );
    }
    for (const [key, value] of Object.entries(headers)) {
      if (!key.trim() || typeof value !== "string") {
        throw new Error(t("mock.validation.headersString", { label }));
      }
    }
    if (route.body.trim()) {
      try {
        JSON.parse(route.body);
      } catch {
        throw new Error(t("mock.validation.body", { label }));
      }
    }

    return {
      id,
      method,
      path,
      status: route.status,
      headers: headers as Record<string, string>,
      body: route.body,
      delayMs: route.delayMs,
      enabled: route.enabled,
    };
  });
}
