export interface URLQueryRow {
  id: string;
  index: number;
  key: string;
  value: string;
  hasEquals: boolean;
  rawKey: string;
  rawValue: string;
  rawSegment: string;
}

export interface URLQueryRowPatch {
  key?: string;
  value?: string;
  hasEquals?: boolean;
}

export interface NewURLQueryRow {
  key: string;
  value: string;
  hasEquals?: boolean;
}

interface RawURLParts {
  prefix: string;
  query: string | null;
  fragment: string;
}

const templateExpression =
  /\{\{\s*[A-Za-z_][A-Za-z0-9_.-]*\s*\}\}/g;

function splitRawURL(rawURL: string): RawURLParts {
  const fragmentIndex = rawURL.indexOf("#");
  const beforeFragment =
    fragmentIndex === -1 ? rawURL : rawURL.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? "" : rawURL.slice(fragmentIndex);
  const queryIndex = beforeFragment.indexOf("?");

  if (queryIndex === -1) {
    return { prefix: beforeFragment, query: null, fragment };
  }
  return {
    prefix: beforeFragment.slice(0, queryIndex),
    query: beforeFragment.slice(queryIndex + 1),
    fragment,
  };
}

function joinRawURL(parts: RawURLParts, query: string | null): string {
  return `${parts.prefix}${query === null ? "" : `?${query}`}${parts.fragment}`;
}

function safelyDecodeQueryComponent(rawValue: string): string {
  const withSpaces = rawValue.replace(/\+/g, " ");
  try {
    return decodeURIComponent(withSpaces);
  } catch {
    return withSpaces.replace(/(?:%[0-9A-Fa-f]{2})+/g, (encodedRun) => {
      try {
        return decodeURIComponent(encodedRun);
      } catch {
        return encodedRun;
      }
    });
  }
}

function encodeQueryComponent(value: string): string {
  let encoded = "";
  let cursor = 0;

  for (const match of value.matchAll(templateExpression)) {
    const index = match.index ?? cursor;
    encoded += encodeURIComponent(value.slice(cursor, index));
    encoded += match[0];
    cursor = index + match[0].length;
  }
  return encoded + encodeURIComponent(value.slice(cursor));
}

function rowFromSegment(rawSegment: string, index: number): URLQueryRow {
  const equalsIndex = rawSegment.indexOf("=");
  const hasEquals = equalsIndex !== -1;
  const rawKey = hasEquals ? rawSegment.slice(0, equalsIndex) : rawSegment;
  const rawValue = hasEquals ? rawSegment.slice(equalsIndex + 1) : "";

  return {
    id: `query-param-${index}`,
    index,
    key: safelyDecodeQueryComponent(rawKey),
    value: safelyDecodeQueryComponent(rawValue),
    hasEquals,
    rawKey,
    rawValue,
    rawSegment,
  };
}

function querySegments(parts: RawURLParts): string[] {
  if (parts.query === null || parts.query === "") return [];
  return parts.query.split("&");
}

export function parseURLQuery(rawURL: string): URLQueryRow[] {
  const parts = splitRawURL(rawURL);
  return querySegments(parts).map(rowFromSegment);
}

export function updateURLQueryRow(
  rawURL: string,
  rowIndex: number,
  patch: URLQueryRowPatch,
): string {
  const parts = splitRawURL(rawURL);
  const segments = querySegments(parts);
  if (
    !Number.isInteger(rowIndex) ||
    rowIndex < 0 ||
    rowIndex >= segments.length
  ) {
    return rawURL;
  }

  const current = rowFromSegment(segments[rowIndex], rowIndex);
  const changesKey = Object.hasOwn(patch, "key");
  const changesValue = Object.hasOwn(patch, "value");
  const rawKey = changesKey
    ? encodeQueryComponent(patch.key ?? "")
    : current.rawKey;
  const rawValue = changesValue
    ? encodeQueryComponent(patch.value ?? "")
    : current.rawValue;
  const hasEquals =
    patch.hasEquals ?? (changesValue ? true : current.hasEquals);

  segments[rowIndex] = hasEquals ? `${rawKey}=${rawValue}` : rawKey;
  return joinRawURL(parts, segments.join("&"));
}

export function addURLQueryRow(
  rawURL: string,
  row: NewURLQueryRow,
): string {
  const parts = splitRawURL(rawURL);
  const rawKey = encodeQueryComponent(row.key);
  const rawValue = encodeQueryComponent(row.value);
  const segment =
    row.hasEquals === false ? rawKey : `${rawKey}=${rawValue}`;
  const query =
    parts.query === null || parts.query === ""
      ? segment
      : parts.query.endsWith("&")
        ? `${parts.query}${segment}`
        : `${parts.query}&${segment}`;

  return joinRawURL(parts, query);
}

export function removeURLQueryRow(
  rawURL: string,
  rowIndex: number,
): string {
  const parts = splitRawURL(rawURL);
  const segments = querySegments(parts);
  if (
    !Number.isInteger(rowIndex) ||
    rowIndex < 0 ||
    rowIndex >= segments.length
  ) {
    return rawURL;
  }

  segments.splice(rowIndex, 1);
  return joinRawURL(parts, segments.length === 0 ? null : segments.join("&"));
}
