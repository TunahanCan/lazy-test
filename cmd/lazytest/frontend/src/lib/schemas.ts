import { z } from "zod";

const variableExpression = /\{\{\s*[A-Za-z_][A-Za-z0-9_.-]*\s*}}/g;

export const requestSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]),
  url: z
    .string()
    .trim()
    .min(1, "Request URL gerekli.")
    .superRefine((value, context) => {
      const candidate = value.replace(variableExpression, "https://example.test");
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
    if (!candidate || candidate === "••••••••") missing.add(key);
  }
  return [...missing].sort();
}
