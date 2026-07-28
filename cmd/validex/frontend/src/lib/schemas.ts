import { HTTP_METHODS } from "./http.js";
import { isMaskedSecretValue } from "./secrets.js";
import type { HTTPMethod, RequestTab } from "./types.js";

const variableExpression = /\{\{\s*[A-Za-z_][A-Za-z0-9_.-]*\s*}}/g;
const variableAtStartExpression =
  /^\{\{\s*[A-Za-z_][A-Za-z0-9_.-]*\s*}}/;

function requestURLValidationCandidate(value: string): string {
  return value
    .replace(variableAtStartExpression, "https://validex.invalid")
    .replace(variableExpression, "validex");
}

export function requestURLValidationMessage(value: string): string | undefined {
  const candidate = value;
  if (!candidate) return "Request URL gerekli.";
  if (candidate.trim() !== candidate) {
    return "URL başında veya sonunda boşluk içeremez.";
  }
  if (!/^https?:\/\//i.test(candidate)) {
    return "URL açıkça http:// veya https:// ile başlamalı.";
  }
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "Yalnızca HTTP ve HTTPS URL’leri desteklenir.";
    }
    if (parsed.username || parsed.password) {
      return "URL kullanıcı bilgisi içeremez. Kimlik doğrulamayı Headers üzerinden yönetin.";
    }
    if (candidate.includes("#")) {
      return "URL fragment (#…) içeremez.";
    }
  } catch {
    return "Geçerli bir HTTP veya HTTPS URL’si girin.";
  }
  return undefined;
}

const requestMethods = new Set<HTTPMethod>(HTTP_METHODS);

const headerSources = new Set([
  "Manual",
  "OpenAPI",
  "Environment",
  "Extracted",
  "Generated",
]);

export interface RequestFormValues {
  method: HTTPMethod;
  url: string;
  body: string;
  headers: RequestTab["headers"];
  timeoutMs: number;
}

interface ValidationIssue {
  field: keyof RequestFormValues | "root";
  message: string;
}

type RequestParseResult =
  | { success: true; data: RequestFormValues }
  | { success: false; error: { issues: ValidationIssue[] } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestValidationIssues(value: unknown): ValidationIssue[] {
  if (!isRecord(value)) {
    return [{ field: "root", message: "Request verisi geçersiz." }];
  }

  const issues: ValidationIssue[] = [];
  if (
    typeof value.method !== "string" ||
    !requestMethods.has(value.method as HTTPMethod)
  ) {
    issues.push({ field: "method", message: "HTTP metodu geçersiz." });
  }
  if (typeof value.url !== "string") {
    issues.push({ field: "url", message: "Request URL gerekli." });
  } else {
    const message = requestURLValidationMessage(
      requestURLValidationCandidate(value.url),
    );
    if (message) issues.push({ field: "url", message });
  }
  if (typeof value.body !== "string") {
    issues.push({ field: "body", message: "Request body metin olmalı." });
  }
  if (
    !Number.isInteger(value.timeoutMs) ||
    (value.timeoutMs as number) <= 0 ||
    (value.timeoutMs as number) > 300_000
  ) {
    issues.push({
      field: "timeoutMs",
      message: "Timeout 1 ile 300000 ms arasında olmalı.",
    });
  }
  if (
    !Array.isArray(value.headers) ||
    value.headers.some(
      (header) =>
        !isRecord(header) ||
        typeof header.id !== "string" ||
        typeof header.enabled !== "boolean" ||
        typeof header.key !== "string" ||
        typeof header.value !== "string" ||
        (header.description !== undefined &&
          typeof header.description !== "string") ||
        (header.source !== undefined &&
          (typeof header.source !== "string" ||
            !headerSources.has(header.source))),
    )
  ) {
    issues.push({ field: "headers", message: "Request header verisi geçersiz." });
  }
  return issues;
}

export const requestSchema = {
  safeParse(value: unknown): RequestParseResult {
    const issues = requestValidationIssues(value);
    if (issues.length > 0) return { success: false, error: { issues } };
    return { success: true, data: value as RequestFormValues };
  },
};

export function missingVariables(
  value: string,
  variables: Record<string, string>,
): string[] {
  const missing = new Set<string>();
  for (const match of value.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*}}/g)) {
    const key = match[1];
    const candidate = variables[key];
    if (!candidate || isMaskedSecretValue(candidate)) missing.add(key);
  }
  return [...missing].sort();
}

export function resolveVariableReferences(
  value: string,
  variables: Record<string, string>,
): string {
  return value.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*}}/g,
    (reference, key: string) => variables[key] ?? reference,
  );
}
