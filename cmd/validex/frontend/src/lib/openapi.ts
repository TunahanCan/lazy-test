export function importedRequestURL(
  baseURL: string | undefined,
  endpointPath: string,
): string {
  const trimmedBase = baseURL?.trim() ?? "";
  const serverURL =
    /^https?:\/\//i.test(trimmedBase) && !trimmedBase.includes("{")
      ? trimmedBase.replace(/\/+$/, "")
      : "{{baseUrl}}";
  const path = endpointPath.startsWith("/")
    ? endpointPath
    : `/${endpointPath}`;
  return `${serverURL}${path}`;
}
