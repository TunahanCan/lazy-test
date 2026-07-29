import {
  COLLECTION_NAME_LENGTH_LIMITS,
  SAVED_REQUEST_NAME_LENGTH_LIMITS,
  bySortOrder,
  type RequestCollection,
  type SavedRequest,
} from "./model.js";
import { isValidHTTPMethod } from "../../lib/http.js";
import {
  isSafeSecretReference,
  isSecretKey,
} from "../../lib/secrets.js";

export const POSTMAN_COLLECTION_V21_SCHEMA =
  "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

export interface ImportedHeader {
  enabled: boolean;
  key: string;
  value: string;
  description?: string;
  sensitive?: boolean;
}

export interface ImportedRequest {
  name: string;
  method: string;
  url: string;
  headers: ImportedHeader[];
  body: string;
  literalValues?: boolean;
}

export interface ImportedCollection {
  name: string;
  requests: ImportedRequest[];
}

export interface ImportedCollectionBatch {
  collections: ImportedCollection[];
}

export interface PostmanTransferWarning {
  code:
    | "folder_hierarchy_flattened"
    | "scripts_ignored"
    | "variables_ignored"
    | "auth_ignored"
    | "body_ignored"
    | "examples_ignored"
    | "request_ignored"
    | "transport_ignored";
  message: string;
  count: number;
}

type PostmanTransferWarningInput = Omit<
  PostmanTransferWarning,
  "count"
>;

export interface PostmanCollectionParseResult {
  batch: ImportedCollectionBatch;
  warnings: PostmanTransferWarning[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function transferableName(
  value: unknown,
  maximumLength: number,
  fallback: string,
): string {
  const normalized =
    typeof value === "string"
      ? value.trim().replace(/\s+/g, " ")
      : "";
  const name = normalized || fallback;
  if (name.length <= maximumLength) return name;
  return `${name.slice(0, Math.max(1, maximumLength - 1)).trimEnd()}…`;
}

function descriptionText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (
    isRecord(value) &&
    typeof value.content === "string" &&
    value.content.trim()
  ) {
    return value.content;
  }
  return undefined;
}

function safeExportHeader(requestHeader: SavedRequest["headers"][number]) {
  const secret =
    isSecretKey(requestHeader.key) &&
    !isSafeSecretReference(requestHeader.value);
  return {
    key: requestHeader.key,
    value: secret ? "" : requestHeader.value,
    type: "text",
    disabled: secret || !requestHeader.enabled,
    ...(requestHeader.description
      ? { description: requestHeader.description }
      : {}),
  };
}

export function serializePostmanCollection(
  collection: RequestCollection,
  requests: readonly SavedRequest[],
): string {
  const document = {
    info: {
      _postman_id: collection.id,
      name: collection.name,
      schema: POSTMAN_COLLECTION_V21_SCHEMA,
    },
    item: [...requests].sort(bySortOrder).map((request) => ({
      name: request.name,
      request: {
        method: request.method,
        header: request.headers.map(safeExportHeader),
        ...(request.body
          ? {
              body: {
                mode: "raw",
                raw: request.body,
              },
            }
          : {}),
        url: request.url,
      },
    })),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

function postmanV21Schema(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /(?:json\/collection|collection\/json)\/v2\.1\.0\//i.test(value)
  );
}

function postmanValue(entries: unknown, key: string): unknown {
  if (!Array.isArray(entries)) return undefined;
  const entry = entries.find(
    (candidate) =>
      isRecord(candidate) &&
      typeof candidate.key === "string" &&
      candidate.key.toLowerCase() === key.toLowerCase(),
  );
  return isRecord(entry) ? entry.value : undefined;
}

function postmanURL(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (!isRecord(value)) return undefined;

  let raw = typeof value.raw === "string" ? value.raw.trim() : "";
  if (!raw) {
    const protocol =
      typeof value.protocol === "string" ? value.protocol.trim() : "";
    const host = Array.isArray(value.host)
      ? value.host.filter((part): part is string => typeof part === "string")
          .join(".")
      : typeof value.host === "string"
        ? value.host
        : "";
    const port =
      typeof value.port === "string" && value.port.trim()
        ? `:${value.port.trim()}`
        : "";
    const path = Array.isArray(value.path)
      ? value.path
          .map((part) =>
            typeof part === "string"
              ? part
              : isRecord(part) && typeof part.value === "string"
                ? part.value
                : "",
          )
          .filter(Boolean)
          .join("/")
      : typeof value.path === "string"
        ? value.path.replace(/^\/+/, "")
        : "";
    if (protocol && host) {
      const hash =
        typeof value.hash === "string" && value.hash
          ? `#${value.hash}`
          : "";
      raw = `${protocol}://${host}${port}${path ? `/${path}` : ""}${hash}`;
    }
  }
  if (!raw) return undefined;

  if (Array.isArray(value.variable)) {
    for (const candidate of value.variable) {
      if (
        !isRecord(candidate) ||
        typeof candidate.key !== "string" ||
        typeof candidate.value !== "string" ||
        candidate.disabled === true
      ) {
        continue;
      }
      const escaped = candidate.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      raw = raw.replace(
        new RegExp(`:${escaped}(?=/|\\?|#|$)`, "g"),
        candidate.value,
      );
    }
  }

  if (Array.isArray(value.query)) {
    const query = value.query
      .filter(
        (candidate) =>
          isRecord(candidate) &&
          candidate.disabled !== true &&
          typeof candidate.key === "string" &&
          candidate.key.length > 0,
      )
      .map((candidate) => {
        const entry = candidate as Record<string, unknown>;
        const key = encodeCollectionURLComponent(entry.key as string);
        return typeof entry.value === "string"
          ? `${key}=${encodeCollectionURLComponent(entry.value)}`
          : key;
      })
      .join("&");
    const queryStart = raw.indexOf("?");
    const fragmentStart = raw.indexOf("#");
    const suffixStart = [queryStart, fragmentStart]
      .filter((index) => index >= 0)
      .reduce((earliest, index) => Math.min(earliest, index), raw.length);
    const fragment =
      fragmentStart >= 0 ? raw.slice(fragmentStart) : "";
    raw = `${raw.slice(0, suffixStart)}${query ? `?${query}` : ""}${fragment}`;
  }
  return raw;
}

function encodeCollectionURLComponent(value: string): string {
  return value
    .split(/(\{\{\s*[A-Za-z_][A-Za-z0-9_.-]*\s*}})/g)
    .map((part) => (/^\{\{/.test(part) ? part : encodeURIComponent(part)))
    .join("");
}

function importedHeaders(value: unknown): ImportedHeader[] {
  if (typeof value === "string") {
    const headers: ImportedHeader[] = [];
    for (const line of value.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const separator = line.indexOf(":");
      if (separator <= 0) continue;
      const key = line.slice(0, separator).trim();
      if (!key) continue;
      headers.push({
        enabled: true,
        key,
        value: line.slice(separator + 1).trim(),
      });
    }
    return headers;
  }
  if (!Array.isArray(value)) return [];
  const headers: ImportedHeader[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      typeof candidate.key !== "string" ||
      typeof candidate.value !== "string"
    ) {
      continue;
    }
    const key = candidate.key.trim();
    if (!key) continue;
    const description = descriptionText(candidate.description);
    headers.push({
      enabled: candidate.disabled !== true,
      key,
      value: candidate.value,
      ...(description ? { description } : {}),
    });
  }
  return headers;
}

function hasHeader(headers: readonly ImportedHeader[], key: string): boolean {
  return headers.some(
    (header) => header.key.trim().toLowerCase() === key.toLowerCase(),
  );
}

function addHeader(
  headers: ImportedHeader[],
  key: string,
  value: string,
): void {
  if (!hasHeader(headers, key)) {
    headers.push({ enabled: true, key, value });
  }
}

function addSensitiveHeader(
  headers: ImportedHeader[],
  key: string,
  value: string,
): void {
  const existing = headers.find(
    (header) => header.key.trim().toLowerCase() === key.toLowerCase(),
  );
  if (existing) {
    existing.enabled = true;
    existing.value = value;
    existing.sensitive = true;
    return;
  }
  headers.push({
    enabled: true,
    key,
    value,
    sensitive: true,
  });
}

function formURLEncodedBody(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .filter(
      (candidate) =>
        isRecord(candidate) &&
        candidate.disabled !== true &&
        typeof candidate.key === "string" &&
        candidate.key.length > 0,
    )
    .map((candidate) => {
      const entry = candidate as Record<string, unknown>;
      const key = encodeCollectionURLComponent(entry.key as string);
      const rawValue =
        typeof entry.value === "string" ? entry.value : "";
      return `${key}=${encodeCollectionURLComponent(rawValue)}`;
    })
    .join("&");
}

function graphqlBody(value: unknown): string {
  if (!isRecord(value) || typeof value.query !== "string") return "";
  let variables: unknown = {};
  if (typeof value.variables === "string" && value.variables.trim()) {
    try {
      variables = JSON.parse(value.variables);
    } catch {
      variables = value.variables;
    }
  } else if (isRecord(value.variables)) {
    variables = value.variables;
  }
  return JSON.stringify({
    query: value.query,
    variables,
  });
}

function importedBody(
  body: unknown,
  headers: ImportedHeader[],
  warn: (warning: PostmanTransferWarningInput) => void,
): string {
  if (!isRecord(body)) return "";
  if (body.disabled === true) return "";
  switch (body.mode) {
    case undefined:
    case "none":
      return "";
    case "raw":
      if (typeof body.raw === "string") return body.raw;
      warn({
        code: "body_ignored",
        message: "A raw request body without text content was skipped.",
      });
      return "";
    case "urlencoded": {
      const encoded = formURLEncodedBody(body.urlencoded);
      if (encoded) {
        addHeader(
          headers,
          "Content-Type",
          "application/x-www-form-urlencoded",
        );
      }
      return encoded;
    }
    case "graphql": {
      const encoded = graphqlBody(body.graphql);
      if (encoded) addHeader(headers, "Content-Type", "application/json");
      return encoded;
    }
    default:
      warn({
        code: "body_ignored",
        message: `The ${String(body.mode)} request body mode is not supported and was skipped.`,
      });
      return "";
  }
}

function importedAuth(
  auth: unknown,
  headers: ImportedHeader[],
  warn: (warning: PostmanTransferWarningInput) => void,
): void {
  if (!isRecord(auth)) return;
  const type = typeof auth.type === "string" ? auth.type.toLowerCase() : "";
  if (!type || type === "noauth") return;
  if (type === "bearer") {
    const token = postmanValue(auth.bearer, "token");
    if (typeof token === "string" && token) {
      addSensitiveHeader(
        headers,
        "Authorization",
        `Bearer ${token}`,
      );
      return;
    }
  }
  if (type === "apikey") {
    const key = postmanValue(auth.apikey, "key");
    const value = postmanValue(auth.apikey, "value");
    const location = postmanValue(auth.apikey, "in");
    if (
      typeof key === "string" &&
      key &&
      typeof value === "string" &&
      String(location).toLowerCase() !== "query"
    ) {
      addSensitiveHeader(headers, key, value);
      return;
    }
  }
  warn({
    code: "auth_ignored",
    message: `The ${type || "configured"} authentication settings must be configured again in Validex.`,
  });
}

function scriptEvents(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function configuredTransport(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (!isRecord(value)) return true;
  return value.disabled !== true && Object.keys(value).length > 0;
}

export function parsePostmanCollection(
  data: string | unknown,
): PostmanCollectionParseResult {
  let document: unknown = data;
  if (typeof data === "string") {
    try {
      document = JSON.parse(data);
    } catch {
      throw new Error("The selected file is not valid JSON.");
    }
  }
  if (
    !isRecord(document) ||
    !isRecord(document.info) ||
    typeof document.info.name !== "string" ||
    !postmanV21Schema(document.info.schema) ||
    !Array.isArray(document.item)
  ) {
    throw new Error(
      "The selected file is not a Postman Collection v2.1 document.",
    );
  }

  const warnings: PostmanTransferWarning[] = [];
  const warningByCode = new Map<
    PostmanTransferWarning["code"],
    PostmanTransferWarning
  >();
  const warn = (warning: PostmanTransferWarningInput) => {
    const existing = warningByCode.get(warning.code);
    if (existing) {
      existing.count += 1;
      return;
    }
    const counted = { ...warning, count: 1 };
    warningByCode.set(warning.code, counted);
    warnings.push(counted);
  };
  if (
    Array.isArray(document.variable) &&
    document.variable.length > 0
  ) {
    warn({
      code: "variables_ignored",
      message: "Collection variable values were not imported; references were preserved.",
    });
  }
  if (scriptEvents(document.event)) {
    warn({
      code: "scripts_ignored",
      message: "Collection scripts and tests were not imported.",
    });
  }

  const requests: ImportedRequest[] = [];
  const visit = (
    items: readonly unknown[],
    folders: readonly string[],
    inheritedAuth: unknown,
  ) => {
    for (const item of items) {
      if (!isRecord(item)) {
        warn({
          code: "request_ignored",
          message: "An invalid collection item was skipped.",
        });
        continue;
      }
      const itemName = transferableName(
        item.name,
        SAVED_REQUEST_NAME_LENGTH_LIMITS[1],
        "Untitled request",
      );
      if (Array.isArray(item.variable) && item.variable.length > 0) {
        warn({
          code: "variables_ignored",
          message: "Item variable values were not imported; references were preserved.",
        });
      }
      if (Array.isArray(item.item)) {
        warn({
          code: "folder_hierarchy_flattened",
          message: "Folder hierarchy was preserved in request names.",
        });
        if (scriptEvents(item.event)) {
          warn({
            code: "scripts_ignored",
            message: "Collection scripts and tests were not imported.",
          });
        }
        visit(
          item.item,
          [...folders, itemName],
          item.auth ?? inheritedAuth,
        );
        continue;
      }
      const request =
        typeof item.request === "string"
          ? {
              method: "GET",
              url: item.request,
            }
          : item.request;
      if (!isRecord(request)) {
        warn({
          code: "request_ignored",
          message: "A non-HTTP collection item was skipped.",
        });
        continue;
      }
      const method =
        typeof request.method === "string"
          ? request.method.trim().toUpperCase()
          : "";
      const url = postmanURL(request.url);
      if (!isValidHTTPMethod(method) || !url) {
        warn({
          code: "request_ignored",
          message: "A request without a valid HTTP method or URL was skipped.",
        });
        continue;
      }
      if (
        Array.isArray(request.variable) &&
        request.variable.length > 0
      ) {
        warn({
          code: "variables_ignored",
          message: "Request variable values were not imported; references were preserved.",
        });
      }
      if (
        configuredTransport(request.proxy) ||
        configuredTransport(request.certificate)
      ) {
        warn({
          code: "transport_ignored",
          message: "Request proxy or client-certificate settings must be configured again in Validex.",
        });
      }
      const headers = importedHeaders(request.header);
      importedAuth(
        request.auth ?? item.auth ?? inheritedAuth,
        headers,
        warn,
      );
      const body = importedBody(request.body, headers, warn);
      if (scriptEvents(item.event)) {
        warn({
          code: "scripts_ignored",
          message: "Collection scripts and tests were not imported.",
        });
      }
      if (Array.isArray(item.response) && item.response.length > 0) {
        warn({
          code: "examples_ignored",
          message: "Saved response examples were not imported.",
        });
      }
      requests.push({
        name: transferableName(
          [...folders, itemName].join(" / "),
          SAVED_REQUEST_NAME_LENGTH_LIMITS[1],
          itemName,
        ),
        method,
        url,
        headers,
        body,
      });
    }
  };
  visit(document.item, [], document.auth);

  return {
    batch: {
      collections: [
        {
          name: transferableName(
            document.info.name,
            COLLECTION_NAME_LENGTH_LIMITS[1],
            "Imported collection",
          ),
          requests,
        },
      ],
    },
    warnings,
  };
}
