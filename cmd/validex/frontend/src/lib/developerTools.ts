export interface JSONDifference {
  path: string;
  kind: "added" | "removed" | "changed" | "type";
  left?: unknown;
  right?: unknown;
}

export interface SpringFieldError {
  field: string;
  message: string;
  rejectedValue?: unknown;
}

export interface SpringErrorAnalysis {
  recognized: boolean;
  category:
    | "problem-detail"
    | "validation"
    | "unauthorized"
    | "forbidden"
    | "not-found"
    | "conflict"
    | "server-error"
    | "http-error";
  title: string;
  detail: string;
  status: number;
  type?: string;
  instance?: string;
  exception?: string;
  traceId?: string;
  fieldErrors: SpringFieldError[];
}

export interface JWTAnalysis {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  algorithm?: string;
  subject?: string;
  issuer?: string;
  audience: string[];
  roles: string[];
  scopes: string[];
  issuedAt?: number;
  expiresAt?: number;
  notBefore?: number;
  expired: boolean;
  active: boolean;
  signaturePresent: boolean;
}

function parseJSON(input: string): unknown {
  if (!input.trim()) throw new Error("JSON içeriği boş.");
  try {
    return JSON.parse(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Geçersiz JSON: ${message}`);
  }
}

export function formatJSON(input: string): string {
  return JSON.stringify(parseJSON(input), null, 2);
}

export function minifyJSON(input: string): string {
  return JSON.stringify(parseJSON(input));
}

function sortedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortedValue(item)]),
  );
}

export function sortJSON(input: string): string {
  return JSON.stringify(sortedValue(parseJSON(input)), null, 2);
}

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function ignored(path: string, ignorePaths: string[]): boolean {
  return ignorePaths.some(
    (candidate) => path === candidate || path.startsWith(`${candidate}.`),
  );
}

export function compareJSON(
  leftInput: string,
  rightInput: string,
  ignorePaths: string[] = [],
): JSONDifference[] {
  const differences: JSONDifference[] = [];
  const walk = (left: unknown, right: unknown, path: string) => {
    if (ignored(path, ignorePaths)) return;
    const leftType = valueType(left);
    const rightType = valueType(right);
    if (leftType !== rightType) {
      differences.push({ path, kind: "type", left, right });
      return;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      const length = Math.max(left.length, right.length);
      for (let index = 0; index < length; index += 1) {
        const childPath = `${path}[${index}]`;
        if (index >= left.length) {
          differences.push({
            path: childPath,
            kind: "added",
            right: right[index],
          });
        } else if (index >= right.length) {
          differences.push({
            path: childPath,
            kind: "removed",
            left: left[index],
          });
        } else {
          walk(left[index], right[index], childPath);
        }
      }
      return;
    }
    if (left && right && leftType === "object") {
      const leftObject = left as Record<string, unknown>;
      const rightObject = right as Record<string, unknown>;
      const keys = new Set([
        ...Object.keys(leftObject),
        ...Object.keys(rightObject),
      ]);
      [...keys].sort().forEach((key) => {
        const childPath = path === "$" ? `$.${key}` : `${path}.${key}`;
        if (!(key in leftObject)) {
          differences.push({
            path: childPath,
            kind: "added",
            right: rightObject[key],
          });
        } else if (!(key in rightObject)) {
          differences.push({
            path: childPath,
            kind: "removed",
            left: leftObject[key],
          });
        } else {
          walk(leftObject[key], rightObject[key], childPath);
        }
      });
      return;
    }
    if (!Object.is(left, right)) {
      differences.push({ path, kind: "changed", left, right });
    }
  };
  walk(parseJSON(leftInput), parseJSON(rightInput), "$");
  return differences;
}

function jsonPathParts(path: string): Array<string | number> {
  const trimmed = path.trim();
  if (!trimmed.startsWith("$")) {
    throw new Error("JSONPath $ ile başlamalıdır.");
  }
  const parts: Array<string | number> = [];
  const expression = /(?:\.([A-Za-z_$][\w$-]*))|\[(\d+)\]|\[['"]([^'"]+)['"]\]/g;
  let cursor = 1;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(trimmed)) !== null) {
    if (match.index !== cursor) {
      throw new Error("Bu JSONPath ifadesi desteklenmiyor.");
    }
    if (match[1] !== undefined) parts.push(match[1]);
    else if (match[2] !== undefined) parts.push(Number(match[2]));
    else parts.push(match[3]);
    cursor = expression.lastIndex;
  }
  if (cursor !== trimmed.length) {
    throw new Error("Bu JSONPath ifadesi desteklenmiyor.");
  }
  return parts;
}

export function queryJSONPath(input: string, path: string): unknown {
  let current = parseJSON(input);
  for (const part of jsonPathParts(path)) {
    if (
      current === null ||
      typeof current !== "object" ||
      !(part in current)
    ) {
      throw new Error(`${path} için değer bulunamadı.`);
    }
    current = (current as Record<string | number, unknown>)[part];
  }
  return current;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  );
}

function fieldErrorsFrom(value: unknown): SpringFieldError[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const candidate = record(item);
    if (!candidate) return [];
    const field = firstString(
      candidate.field,
      candidate.property,
      candidate.path,
      candidate.fieldName,
    );
    const message = firstString(
      candidate.defaultMessage,
      candidate.message,
      candidate.reason,
    );
    if (!field || !message) return [];
    return [
      {
        field,
        message,
        rejectedValue: candidate.rejectedValue ?? candidate.invalidValue,
      },
    ];
  });
}

function traceFromHeaders(headers: Record<string, string[]>): string | undefined {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const traceparent = normalized.traceparent?.[0]?.trim();
  const traceparentMatch = traceparent?.match(
    /^(?!ff)[0-9a-f]{2}-((?!0{32})[0-9a-f]{32})-((?!0{16})[0-9a-f]{16})-[0-9a-f]{2}$/i,
  );
  return firstString(
    traceparentMatch?.[1],
    normalized["x-trace-id"]?.[0],
    normalized["x-request-id"]?.[0],
  );
}

export function analyzeSpringError(
  rawBody: string,
  status: number,
  headers: Record<string, string[]> = {},
): SpringErrorAnalysis {
  let body: Record<string, unknown> = {};
  try {
    body = record(JSON.parse(rawBody)) ?? {};
  } catch {
    body = {};
  }
  const fieldErrors = [
    ...fieldErrorsFrom(body.errors),
    ...fieldErrorsFrom(body.fieldErrors),
    ...fieldErrorsFrom(body.violations),
  ];
  const type = firstString(body.type);
  const instance = firstString(body.instance, body.path);
  const exception = firstString(body.exception, body.errorClass);
  const traceId = firstString(
    body.traceId,
    body.traceID,
    body.requestId,
    traceFromHeaders(headers),
  );
  const problemDetail =
    typeof body.title === "string" &&
    typeof body.status === "number" &&
    (typeof body.detail === "string" || Boolean(type || instance));
  const validation = fieldErrors.length > 0;
  const category: SpringErrorAnalysis["category"] = problemDetail
    ? "problem-detail"
    : validation
      ? "validation"
      : status === 401
        ? "unauthorized"
        : status === 403
          ? "forbidden"
          : status === 404
            ? "not-found"
            : status === 409
              ? "conflict"
              : status >= 500
                ? "server-error"
                : "http-error";
  const defaultTitles: Record<SpringErrorAnalysis["category"], string> = {
    "problem-detail": "Problem Detail",
    validation: "Bean Validation hatası",
    unauthorized: "Kimlik doğrulama gerekli",
    forbidden: "Bu işlem için yetki yok",
    "not-found": "Kaynak veya endpoint bulunamadı",
    conflict: "Kaynak çakışması",
    "server-error": "Sunucu hatası",
    "http-error": "HTTP hatası",
  };
  return {
    recognized:
      problemDetail ||
      validation ||
      status === 401 ||
      status === 403 ||
      status === 404 ||
      status === 409 ||
      status >= 500,
    category,
    title: firstString(body.title, body.error, defaultTitles[category])!,
    detail: firstString(
      body.detail,
      body.message,
      body.error_description,
      "Response ayrıntı içermiyor.",
    )!,
    status:
      typeof body.status === "number" ? body.status : status,
    type,
    instance,
    exception,
    traceId,
    fieldErrors,
  };
}

function decodeBase64URL(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return new TextDecoder().decode(bytes);
  } catch {
    throw new Error("JWT bölümü base64url olarak çözülemedi.");
  }
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    return value.split(/[,\s]+/).filter(Boolean);
  }
  return [];
}

export function analyzeJWT(input: string, now = Date.now()): JWTAnalysis {
  const token = input.trim().replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("JWT üç bölümden oluşmalıdır.");
  }
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = record(JSON.parse(decodeBase64URL(parts[0]))) ?? {};
    payload = record(JSON.parse(decodeBase64URL(parts[1]))) ?? {};
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  const nowSeconds = Math.floor(now / 1000);
  const expiresAt = typeof payload.exp === "number" ? payload.exp : undefined;
  const notBefore = typeof payload.nbf === "number" ? payload.nbf : undefined;
  const realmAccess = record(payload.realm_access);
  const resourceAccess = record(payload.resource_access);
  const nestedRoles = [
    ...stringList(realmAccess?.roles),
    ...Object.values(resourceAccess ?? {}).flatMap((item) =>
      stringList(record(item)?.roles),
    ),
  ];
  const roles = [
    ...stringList(payload.roles),
    ...stringList(payload.authorities),
    ...nestedRoles,
  ];
  return {
    header,
    payload,
    algorithm:
      typeof header.alg === "string" ? header.alg : undefined,
    subject:
      typeof payload.sub === "string" ? payload.sub : undefined,
    issuer:
      typeof payload.iss === "string" ? payload.iss : undefined,
    audience: stringList(payload.aud),
    roles: [...new Set(roles)],
    scopes: [
      ...new Set([
        ...stringList(payload.scope),
        ...stringList(payload.scp),
      ]),
    ],
    issuedAt: typeof payload.iat === "number" ? payload.iat : undefined,
    expiresAt,
    notBefore,
    expired: expiresAt !== undefined && expiresAt <= nowSeconds,
    active:
      (expiresAt === undefined || expiresAt > nowSeconds) &&
      (notBefore === undefined || notBefore <= nowSeconds),
    signaturePresent: parts[2].length > 0,
  };
}

function inferSchemaValue(value: unknown): Record<string, unknown> {
  if (value === null) return { type: ["null"] };
  if (Array.isArray(value)) {
    return {
      type: "array",
      items:
        value.length > 0
          ? inferSchemaValue(value[0])
          : {},
    };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return {
      type: "object",
      properties: Object.fromEntries(
        entries.map(([key, item]) => [key, inferSchemaValue(item)]),
      ),
      required: entries.map(([key]) => key),
    };
  }
  if (typeof value === "number") {
    return { type: Number.isInteger(value) ? "integer" : "number" };
  }
  return { type: typeof value };
}

export function inferJSONSchema(input: string): string {
  return JSON.stringify(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      ...inferSchemaValue(parseJSON(input)),
    },
    null,
    2,
  );
}

interface JavaDTOField {
  name: string;
  type: string;
}

interface JavaDTOType {
  name: string;
  fields: JavaDTOField[];
  enumValues?: string[];
  position: number;
}

function matchingDelimiter(
  source: string,
  start: number,
  open: string,
  close: string,
): number {
  let depth = 0;
  let quote = "";
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index - 1] !== "\\") quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    if (character === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitJavaTopLevel(source: string): string[] {
  const result: string[] = [];
  let start = 0;
  let angle = 0;
  let parentheses = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "<") angle += 1;
    else if (character === ">") angle = Math.max(0, angle - 1);
    else if (character === "(") parentheses += 1;
    else if (character === ")") parentheses = Math.max(0, parentheses - 1);
    else if (character === "," && angle === 0 && parentheses === 0) {
      result.push(source.slice(start, index));
      start = index + 1;
    }
  }
  result.push(source.slice(start));
  return result.map((item) => item.trim()).filter(Boolean);
}

function javaPropertyName(source: string, fallback: string): string {
  return (
    source.match(/@JsonProperty\s*\(\s*"([^"]+)"\s*\)/)?.[1] ?? fallback
  );
}

function cleanJavaType(source: string): string {
  return source
    .replace(/@\w+(?:\.\w+)*(?:\s*\([^)]*\))?\s*/g, "")
    .replace(/\b(?:final|volatile)\b\s*/g, "")
    .replace(/\?\s+extends\s+/g, "")
    .replace(/\?\s+super\s+/g, "")
    .trim();
}

function recordFields(parameters: string): JavaDTOField[] {
  return splitJavaTopLevel(parameters).flatMap((parameter) => {
    if (/@JsonIgnore\b/.test(parameter)) return [];
    const cleaned = cleanJavaType(parameter);
    const match = cleaned.match(/^(.+?)\s+([A-Za-z_$][\w$]*)$/);
    if (!match) return [];
    return [{
      name: javaPropertyName(parameter, match[2]),
      type: match[1].trim(),
    }];
  });
}

function classFields(body: string): JavaDTOField[] {
  const fields: JavaDTOField[] = [];
  const fieldPattern =
    /((?:@\w+(?:\.\w+)*(?:\s*\([^)]*\))?\s*)*)(?:private|protected|public)\s+((?:(?!\bstatic\b|\btransient\b)[\w.$?<>,\s\[\]])+?)\s+([A-Za-z_$][\w$]*)\s*(?:=[^;]*)?;/g;
  let match: RegExpExecArray | null;
  while ((match = fieldPattern.exec(body)) !== null) {
    const annotations = match[1] ?? "";
    const name = match[3];
    if (
      /@JsonIgnore\b/.test(annotations) ||
      name === "serialVersionUID"
    ) {
      continue;
    }
    fields.push({
      name: javaPropertyName(annotations, name),
      type: cleanJavaType(match[2]),
    });
  }
  return fields;
}

function parseJavaDTOs(input: string): JavaDTOType[] {
  const source = input
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
  const types: JavaDTOType[] = [];
  const declaration = /\b(record|class|enum)\s+([A-Za-z_$][\w$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(source)) !== null) {
    const kind = match[1];
    const name = match[2];
    if (kind === "record") {
      const open = source.indexOf("(", declaration.lastIndex);
      if (open < 0) continue;
      const close = matchingDelimiter(source, open, "(", ")");
      if (close < 0) continue;
      types.push({
        name,
        fields: recordFields(source.slice(open + 1, close)),
        position: match.index,
      });
      declaration.lastIndex = close + 1;
      continue;
    }
    const open = source.indexOf("{", declaration.lastIndex);
    if (open < 0) continue;
    const close = matchingDelimiter(source, open, "{", "}");
    if (close < 0) continue;
    const body = source.slice(open + 1, close);
    if (kind === "enum") {
      const constants = body
        .split(";")[0]
        .split(",")
        .map((item) => item.trim().match(/^([A-Za-z_$][\w$]*)/)?.[1])
        .filter((item): item is string => Boolean(item));
      types.push({
        name,
        fields: [],
        enumValues: constants,
        position: match.index,
      });
    } else {
      types.push({
        name,
        fields: classFields(body),
        position: match.index,
      });
    }
    declaration.lastIndex = close + 1;
  }
  return types.sort((left, right) => left.position - right.position);
}

function genericJavaType(type: string): {
  raw: string;
  arguments: string[];
} {
  const normalized = cleanJavaType(type)
    .replace(/^java\.(?:lang|util|time|math)\./, "")
    .trim();
  const open = normalized.indexOf("<");
  if (open < 0 || !normalized.endsWith(">")) {
    return { raw: normalized, arguments: [] };
  }
  return {
    raw: normalized.slice(0, open).trim(),
    arguments: splitJavaTopLevel(normalized.slice(open + 1, -1)),
  };
}

function javaTypeSample(
  sourceType: string,
  definitions: Map<string, JavaDTOType>,
  seen: Set<string>,
): unknown {
  const type = cleanJavaType(sourceType);
  if (type.endsWith("[]")) {
    return [javaTypeSample(type.slice(0, -2), definitions, seen)];
  }
  const { raw, arguments: genericArguments } = genericJavaType(type);
  const simple = raw.split(".").at(-1) ?? raw;
  if (
    ["List", "Set", "Collection", "Iterable", "Stream"].includes(simple)
  ) {
    return [javaTypeSample(genericArguments[0] ?? "Object", definitions, seen)];
  }
  if (["Optional", "ResponseEntity", "Mono", "CompletableFuture"].includes(simple)) {
    return javaTypeSample(genericArguments[0] ?? "Object", definitions, seen);
  }
  if (["Flux"].includes(simple)) {
    return [javaTypeSample(genericArguments[0] ?? "Object", definitions, seen)];
  }
  if (["Map", "HashMap", "LinkedHashMap"].includes(simple)) {
    return {
      key: javaTypeSample(genericArguments[1] ?? "Object", definitions, seen),
    };
  }
  if (["Page", "Slice"].includes(simple)) {
    return {
      content: [
        javaTypeSample(genericArguments[0] ?? "Object", definitions, seen),
      ],
      totalElements: 1,
      totalPages: 1,
      size: 20,
      number: 0,
    };
  }
  if (["boolean", "Boolean"].includes(simple)) return false;
  if (["byte", "short", "int", "long", "Byte", "Short", "Integer", "Long", "BigInteger", "AtomicInteger", "AtomicLong"].includes(simple)) {
    return 0;
  }
  if (["float", "double", "Float", "Double", "BigDecimal", "Number"].includes(simple)) {
    return 0.0;
  }
  if (["char", "Character"].includes(simple)) return "A";
  if (["String", "CharSequence"].includes(simple)) return "example";
  if (simple === "UUID") return "00000000-0000-0000-0000-000000000001";
  if (simple === "LocalDate") return "2026-01-01";
  if (simple === "LocalTime") return "12:00:00";
  if (["Instant", "OffsetDateTime", "ZonedDateTime"].includes(simple)) {
    return "2026-01-01T12:00:00Z";
  }
  if (simple === "LocalDateTime") return "2026-01-01T12:00:00";
  if (["URI", "URL"].includes(simple)) return "https://example.test/resource";
  const definition = definitions.get(simple);
  if (!definition) return {};
  if (definition.enumValues) return definition.enumValues[0] ?? "VALUE";
  if (seen.has(simple)) return {};
  const nextSeen = new Set(seen).add(simple);
  return Object.fromEntries(
    definition.fields.map((field) => [
      field.name,
      javaTypeSample(field.type, definitions, nextSeen),
    ]),
  );
}

// javaDTOToJSONExample converts pasted Java response DTO declarations into a
// deterministic JSON example. It does not write Java source or project files.
export function javaDTOToJSONExample(input: string): string {
  if (!input.trim()) throw new Error("Java response DTO içeriği boş.");
  const types = parseJavaDTOs(input);
  const root = types.find((type) => type.fields.length > 0);
  if (!root) {
    throw new Error(
      "Desteklenen record veya field içeren class bulunamadı.",
    );
  }
  const definitions = new Map(types.map((type) => [type.name, type]));
  return JSON.stringify(
    javaTypeSample(root.name, definitions, new Set()),
    null,
    2,
  );
}
