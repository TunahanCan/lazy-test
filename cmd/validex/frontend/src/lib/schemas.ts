import { z } from "zod";
import { isMaskedSecretValue } from "./secrets";

const variableExpression = /\{\{\s*[A-Za-z_][A-Za-z0-9_.-]*\s*}}/g;
const variableBaseExpression =
  /^\{\{\s*[A-Za-z_][A-Za-z0-9_.-]*\s*}}(?:[/?#]|$)/;
const explicitSchemeExpression = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;

function usesPlainHTTP(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") return true;
  if (/^f[cd][0-9a-f:]+$/i.test(normalized)) return true;

  const octets = normalized.split(".");
  if (
    octets.length !== 4 ||
    octets.some(
      (octet) =>
        !/^\d{1,3}$/.test(octet) ||
        Number(octet) < 0 ||
        Number(octet) > 255,
    )
  ) {
    return false;
  }
  const [first, second] = octets.map(Number);
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function normalizeRequestURL(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || variableBaseExpression.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (explicitSchemeExpression.test(trimmed)) return trimmed;

  const authority = trimmed.split(/[/?#]/, 1)[0];
  const host = authority.startsWith("[")
    ? authority.slice(0, authority.indexOf("]") + 1)
    : authority.split(":")[0];
  const scheme = usesPlainHTTP(host) ? "http" : "https";
  return `${scheme}://${trimmed}`;
}

export const requestSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]),
  url: z
    .string()
    .trim()
    .min(1, "Request URL gerekli.")
    .superRefine((value, context) => {
      const candidate = normalizeRequestURL(value).replace(
        variableExpression,
        "https://example.test",
      );
      try {
        const parsed = new URL(candidate);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          context.addIssue({
            code: "custom",
            message: "Yalnızca HTTP ve HTTPS URL’leri desteklenir.",
          });
        }
      } catch {
        context.addIssue({
          code: "custom",
          message: "Geçerli bir URL veya {{variable}} ifadesi girin.",
        });
      }
    }),
  body: z.string(),
  headers: z.array(
    z.object({
      id: z.string(),
      enabled: z.boolean(),
      key: z.string(),
      value: z.string(),
      description: z.string().optional(),
      source: z
        .enum(["Manual", "OpenAPI", "Environment", "Extracted", "Generated"])
        .optional(),
    }),
  ),
  timeoutMs: z.number().int().positive().max(300_000),
});

export type RequestFormValues = z.infer<typeof requestSchema>;

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
