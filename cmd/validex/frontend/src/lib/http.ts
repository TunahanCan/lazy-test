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

export type HTTPMethod = string;

const httpMethodPattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function methodAllowsBody(method: HTTPMethod): boolean {
  const normalized = method.trim().toUpperCase();
  return normalized !== "" && normalized !== "HEAD" && normalized !== "TRACE";
}

export function isValidHTTPMethod(method: unknown): method is HTTPMethod {
  return (
    typeof method === "string" &&
    method === method.trim() &&
    method.length > 0 &&
    method.length <= 64 &&
    httpMethodPattern.test(method)
  );
}

export function isStandardHTTPMethod(
  method: HTTPMethod,
): method is (typeof HTTP_METHODS)[number] {
  return (HTTP_METHODS as readonly string[]).includes(method);
}
