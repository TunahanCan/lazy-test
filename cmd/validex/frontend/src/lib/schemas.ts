import { z } from "zod";
import { isMaskedSecretValue } from "./secrets";

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

export const requestSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]),
  url: z
    .string()
    .superRefine((value, context) => {
      const message = requestURLValidationMessage(
        requestURLValidationCandidate(value),
      );
      if (message) {
        context.addIssue({
          code: "custom",
          message,
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

export function resolveVariableReferences(
  value: string,
  variables: Record<string, string>,
): string {
  return value.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*}}/g,
    (reference, key: string) => variables[key] ?? reference,
  );
}
