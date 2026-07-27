export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "TRACE",
] as const;

export type HTTPMethod = (typeof HTTP_METHODS)[number];

const BODY_METHODS: ReadonlySet<HTTPMethod> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

export function methodAllowsBody(method: HTTPMethod): boolean {
  return BODY_METHODS.has(method);
}
