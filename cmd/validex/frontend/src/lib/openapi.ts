export function importedRequestURL(
  baseURL: string | undefined,
  endpointPath: string,
): string {
  const trimmedBase = baseURL?.trim() ?? "";
  const asWorkspaceTemplate = (value: string) =>
    value.replace(
      /\{([^{}\/]+)\}/g,
      (match, name: string, offset: number, source: string) =>
        source[offset - 1] === "{" || source[offset + match.length] === "}"
          ? match
          : `{{${name}}}`,
    );
  const templatedBase = asWorkspaceTemplate(trimmedBase).replace(/\/+$/, "");
  const serverURL =
    /^https?:\/\//i.test(templatedBase) || templatedBase.startsWith("{{")
      ? templatedBase
      : ["{{baseUrl}}", templatedBase.replace(/^\/+/, "")]
          .filter(Boolean)
          .join("/");
  const templatedPath = asWorkspaceTemplate(endpointPath.trim());
  const path = templatedPath.startsWith("/")
    ? templatedPath
    : `/${templatedPath}`;
  return `${serverURL}${path}`;
}

export function importedEndpointTabID(
  specID: string,
  endpointID: string,
): string {
  return `openapi:${specID}:${endpointID}`;
}

export function requestURLMatchesOpenAPIPath(
  requestURL: string,
  endpointPath: string,
): boolean {
  const trimmedURL = requestURL.trim();
  const trimmedEndpoint = endpointPath.trim();
  if (!trimmedURL || !trimmedEndpoint.startsWith("/")) return false;

  const withoutQuery = trimmedURL.split(/[?#]/, 1)[0];
  let requestPath = "";
  const absoluteMatch = withoutQuery.match(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]+(\/.*)?$/);
  if (absoluteMatch) {
    requestPath = absoluteMatch[1] || "/";
  } else if (withoutQuery.startsWith("{{")) {
    const baseEnd = withoutQuery.indexOf("}}");
    requestPath = baseEnd >= 0 ? withoutQuery.slice(baseEnd + 2) || "/" : "";
  } else if (withoutQuery.startsWith("/")) {
    requestPath = withoutQuery;
  } else {
    try {
      requestPath = new URL(`http://${withoutQuery}`).pathname;
    } catch {
      return false;
    }
  }

  const endpointPattern = trimmedEndpoint
    .split("/")
    .map((segment) =>
      /^\{[^/{}]+\}$/.test(segment)
        ? "[^/]+"
        : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  return new RegExp(`${endpointPattern}/?$`).test(requestPath);
}
