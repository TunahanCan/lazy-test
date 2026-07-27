import { translate } from "../../i18n";
import type { Translate } from "../../i18n/LocaleProvider";

export type AutomationMode = "runner" | "network" | "openapi";

const variableNamePattern = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;
const maximumVariables = 10_000;
const defaultTranslate: Translate = (key, values) =>
  translate("tr", key, values);

export const sampleCollection = JSON.stringify(
  {
    name: "Local smoke",
    variables: {
      baseUrl: "http://localhost:8080",
    },
    requests: [
      {
        id: "health",
        name: "Actuator health",
        method: "GET",
        url: "{{baseUrl}}/actuator/health",
        timeoutMs: 5000,
        assertions: [
          {
            id: "health-status",
            name: "HTTP 200",
            target: "status",
            operator: "equals",
            expected: 200,
          },
          {
            id: "health-body",
            name: "Status UP",
            target: "json_path",
            operator: "equals",
            path: "$.status",
            expected: "UP",
          },
          {
            id: "health-duration",
            name: "Faster than two seconds",
            target: "duration_ms",
            operator: "less_than",
            expected: 2000,
          },
        ],
      },
    ],
  },
  null,
  2,
);

export function parseVariables(
  input: string,
  t: Translate = defaultTranslate,
): Record<string, string> {
  const trimmed = input.trim();
  if (!trimmed) return {};
  const parsed: unknown = JSON.parse(trimmed);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(t("automation.validation.variables.object"));
  }
  if (Object.keys(parsed).length > maximumVariables) {
    throw new Error(
      t("automation.validation.variables.maximum", {
        maximum: maximumVariables,
      }),
    );
  }
  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!variableNamePattern.test(key)) {
      throw new Error(
        t("automation.validation.variables.name", { name: key }),
      );
    }
    if (typeof value !== "string") {
      throw new Error(
        t("automation.validation.variables.string", { name: key }),
      );
    }
    variables[key] = value;
  }
  return variables;
}

export function positiveInteger(
  input: string,
  label: string,
  maximum: number,
  t: Translate = defaultTranslate,
): number {
  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new Error(
      t("automation.validation.integer", { label, maximum }),
    );
  }
  return value;
}

export function automationOperationID(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function durationLabel(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 2 : 1)} s`;
}

export function printable(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
