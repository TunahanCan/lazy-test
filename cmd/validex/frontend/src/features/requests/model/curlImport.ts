import {
  HTTP_METHODS,
  type HTTPMethod,
} from "../../../lib/http.js";

const maxCommandLength = 16 << 20;
const maxTokenCount = 4_096;
const maxHeaderCount = 512;
const maxHeaderLength = 64 << 10;
const maxBodyLength = 16 << 20;
const maxMethodLength = 64;

const supportedMethods = new Set<string>(HTTP_METHODS);
const httpMethodPattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", {
  fatal: true,
  ignoreBOM: true,
});
const shellOperators = new Set([";", "|", "&", "<", ">"]);
const noEffectFlags = new Set([
  "--fail",
  "--fail-with-body",
  "--globoff",
  "--include",
  "--no-buffer",
  "--progress-bar",
  "--show-error",
  "--silent",
  "--verbose",
  "-N",
  "-S",
  "-g",
  "-i",
  "-s",
  "-v",
]);
const warningFlags = new Map<string, CurlImportWarning>([
  ["--compressed", "compressed"],
  ["--http1.0", "http_version"],
  ["--http1.1", "http_version"],
  ["--http2", "http_version"],
  ["--http2-prior-knowledge", "http_version"],
  ["--http3", "http_version"],
  ["--insecure", "tls_policy"],
  ["--location", "redirect_policy"],
  ["--location-trusted", "redirect_policy"],
  ["--path-as-is", "path_as_is"],
  ["-0", "http_version"],
  ["-L", "redirect_policy"],
  ["-k", "tls_policy"],
]);

export type CurlImportWarning =
  | "accept_encoding"
  | "compressed"
  | "globoff"
  | "http_version"
  | "path_as_is"
  | "redirect_policy"
  | "tls_policy";

export type CurlImportErrorCode =
  | "empty"
  | "too_large"
  | "too_many_tokens"
  | "unterminated_quote"
  | "unsafe_shell"
  | "not_curl"
  | "missing_option_value"
  | "unsupported_option"
  | "unsupported_binary"
  | "unsupported_file"
  | "invalid_header"
  | "too_many_headers"
  | "missing_url"
  | "multiple_urls"
  | "unsupported_method"
  | "body_too_large"
  | "invalid_form";

export class CurlImportError extends Error {
  constructor(
    readonly code: CurlImportErrorCode,
    readonly detail = "",
  ) {
    super(detail || code);
    this.name = "CurlImportError";
  }
}

export interface ImportedCurlHeader {
  key: string;
  value: string;
}

export interface ImportedCurlRequest {
  method: HTTPMethod;
  url: string;
  headers: ImportedCurlHeader[];
  body: string;
  warnings: CurlImportWarning[];
}

interface FormPart {
  name: string;
  value: string;
}

function fail(code: CurlImportErrorCode, detail = ""): never {
  throw new CurlImportError(code, detail);
}

function isWhitespace(value: string): boolean {
  return /\s/.test(value);
}

function shellExpansionAt(
  source: string,
  index: number,
): string | undefined {
  if (source[index] !== "$") return;
  const next = source[index + 1];
  if (next === undefined) return;
  if (
    next === "(" ||
    next === "{" ||
    next === "[" ||
    next === '"' ||
    /^[A-Za-z0-9_?$#*@!$-]$/.test(next)
  ) {
    return source.slice(index, index + 2);
  }
  return undefined;
}

function hexadecimalValue(source: string, start: number, length: number) {
  const digits = source.slice(start, start + length);
  if (digits.length !== length || !/^[0-9a-f]+$/i.test(digits)) {
    return undefined;
  }
  return Number.parseInt(digits, 16);
}

function ansiEscape(
  source: string,
  index: number,
): { bytes: Uint8Array; next: number } {
  const character = source[index];
  if (character === undefined) fail("unterminated_quote");
  const simple: Record<string, string> = {
    a: "\u0007",
    b: "\b",
    e: "\u001b",
    E: "\u001b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
    "\\": "\\",
    "'": "'",
    '"': '"',
  };
  if (Object.hasOwn(simple, character)) {
    return {
      bytes: utf8Encoder.encode(simple[character]),
      next: index + 1,
    };
  }
  if (character === "\n") {
    return { bytes: new Uint8Array(), next: index + 1 };
  }
  if (character === "\r" && source[index + 1] === "\n") {
    return { bytes: new Uint8Array(), next: index + 2 };
  }
  if (character === "x") {
    let length = 0;
    while (
      length < 2 &&
      /^[0-9a-f]$/i.test(source[index + 1 + length] ?? "")
    ) {
      length += 1;
    }
    if (length === 0) {
      return {
        bytes: utf8Encoder.encode("\\x"),
        next: index + 1,
      };
    }
    const value = hexadecimalValue(source, index + 1, length)!;
    return {
      bytes: Uint8Array.of(value),
      next: index + 1 + length,
    };
  }
  if (character === "u" || character === "U") {
    const length = character === "u" ? 4 : 8;
    const value = hexadecimalValue(source, index + 1, length);
    if (
      value === undefined ||
      value > 0x10ffff ||
      (value >= 0xd800 && value <= 0xdfff)
    ) {
      return {
        bytes: utf8Encoder.encode(`\\${character}`),
        next: index + 1,
      };
    }
    return {
      bytes: utf8Encoder.encode(String.fromCodePoint(value)),
      next: index + 1 + length,
    };
  }
  if (/^[0-7]$/.test(character)) {
    let digits = character;
    while (
      digits.length < 3 &&
      /^[0-7]$/.test(source[index + digits.length] ?? "")
    ) {
      digits += source[index + digits.length];
    }
    return {
      bytes: Uint8Array.of(Number.parseInt(digits, 8) & 0xff),
      next: index + digits.length,
    };
  }
  return {
    bytes: utf8Encoder.encode(`\\${character}`),
    next: index + 1,
  };
}

function unsupportedBinaryData(): never {
  fail(
    "unsupported_binary",
    "ANSI-C binary data that cannot be represented as UTF-8 text",
  );
}

function ansiQuotedBytes(
  source: string,
  start: number,
): { bytes: Uint8Array; next: number } {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let index = start;
  let literalStart = start;
  const addLiteral = (end: number) => {
    if (literalStart === end) return;
    const bytes = utf8Encoder.encode(source.slice(literalStart, end));
    chunks.push(bytes);
    byteLength += bytes.length;
  };
  while (index < source.length) {
    const character = source[index];
    if (character === "'") {
      addLiteral(index);
      const bytes = new Uint8Array(byteLength);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return { bytes, next: index + 1 };
    }
    if (character !== "\\") {
      const codePoint = source.codePointAt(index);
      if (codePoint === undefined) fail("unterminated_quote");
      index += String.fromCodePoint(codePoint).length;
      continue;
    }
    addLiteral(index);
    const escaped = ansiEscape(source, index + 1);
    chunks.push(escaped.bytes);
    byteLength += escaped.bytes.length;
    index = escaped.next;
    literalStart = index;
  }
  fail("unterminated_quote");
}

function tokenizeBash(source: string): string[] {
  if (!source.trim()) fail("empty");
  if (source.length > maxCommandLength) fail("too_large");

  const tokens: string[] = [];
  let current = "";
  let byteChunks: Uint8Array[] | undefined;
  let started = false;
  let index = 0;

  const flushTextBytes = () => {
    if (!byteChunks || !current) return;
    byteChunks.push(utf8Encoder.encode(current));
    current = "";
  };
  const appendBytes = (bytes: Uint8Array) => {
    if (!byteChunks) byteChunks = [];
    flushTextBytes();
    byteChunks.push(bytes);
  };
  const push = () => {
    if (!started) return;
    let value = current;
    if (byteChunks) {
      flushTextBytes();
      const byteLength = byteChunks.reduce(
        (total, chunk) => total + chunk.length,
        0,
      );
      const bytes = new Uint8Array(byteLength);
      let offset = 0;
      for (const chunk of byteChunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      if (bytes.includes(0)) unsupportedBinaryData();
      try {
        value = utf8Decoder.decode(bytes);
      } catch {
        unsupportedBinaryData();
      }
    } else if (value.includes("\u0000")) {
      unsupportedBinaryData();
    }
    tokens.push(value);
    if (tokens.length > maxTokenCount) fail("too_many_tokens");
    current = "";
    byteChunks = undefined;
    started = false;
  };

  while (index < source.length) {
    const character = source[index];
    if (isWhitespace(character)) {
      push();
      index += 1;
      continue;
    }
    if (character === "#" && !started) {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (shellOperators.has(character) || character === "`") {
      fail("unsafe_shell", character);
    }
    if (character === "\\") {
      const next = source[index + 1];
      if (next === undefined) fail("unterminated_quote");
      if (next === "\n") {
        index += 2;
        continue;
      }
      if (next === "\r" && source[index + 2] === "\n") {
        index += 3;
        continue;
      }
      started = true;
      current += next;
      index += 2;
      continue;
    }
    if (character === "'") {
      started = true;
      const end = source.indexOf("'", index + 1);
      if (end < 0) fail("unterminated_quote");
      current += source.slice(index + 1, end);
      index = end + 1;
      continue;
    }
    if (character === "$" && source[index + 1] === "'") {
      started = true;
      const quoted = ansiQuotedBytes(source, index + 2);
      appendBytes(quoted.bytes);
      index = quoted.next;
      continue;
    }
    if (character === '"') {
      started = true;
      index += 1;
      let closed = false;
      while (index < source.length) {
        const quoted = source[index];
        if (quoted === '"') {
          index += 1;
          closed = true;
          break;
        }
        if (quoted === "`") fail("unsafe_shell", "`");
        const expansion = shellExpansionAt(source, index);
        if (expansion) fail("unsafe_shell", expansion);
        if (quoted === "\\") {
          const next = source[index + 1];
          if (next === undefined) fail("unterminated_quote");
          if (next === "\n") {
            index += 2;
            continue;
          }
          if (next === "\r" && source[index + 2] === "\n") {
            index += 3;
            continue;
          }
          if (['"', "\\", "$", "`"].includes(next)) {
            current += next;
          } else {
            current += `\\${next}`;
          }
          index += 2;
          continue;
        }
        current += quoted;
        index += 1;
      }
      if (!closed) fail("unterminated_quote");
      continue;
    }
    const expansion = shellExpansionAt(source, index);
    if (expansion) fail("unsafe_shell", expansion);
    started = true;
    current += character;
    index += 1;
  }
  push();
  return tokens;
}

function commandName(value: string): string {
  return value.replaceAll("\\", "/").split("/").at(-1)?.toLowerCase() ?? "";
}

export function looksLikeCurlBash(source: string): boolean {
  const firstLine = source.trimStart().split(/\r?\n/, 1)[0]?.trim() ?? "";
  return /^(?:[$%]\s+)?(?:command\s+)?(?:[^\s]+[/\\])?curl(?:\.exe)?(?:\s|$)/i.test(
    firstLine,
  );
}

function validatedHeader(
  header: ImportedCurlHeader,
): ImportedCurlHeader {
  const key = header.key.trim();
  if (
    !key ||
    key.length + header.value.length > maxHeaderLength ||
    !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(key) ||
    /[\u0000-\u0008\u000a-\u001f\u007f]/.test(header.value)
  ) {
    fail("invalid_header", key);
  }
  return { key, value: header.value };
}

function headerFrom(value: string): ImportedCurlHeader {
  if (value.startsWith("@")) fail("unsupported_file", "--header");
  let separator = value.indexOf(":");
  if (separator < 0 && value.endsWith(";")) separator = value.length - 1;
  if (separator <= 0) fail("invalid_header", value);
  const key = value.slice(0, separator).trim();
  const headerValue = value.slice(separator + 1).replace(/^[\t ]+/, "");
  return validatedHeader({
    key,
    value: headerValue,
  });
}

function utf8Base64(value: string): string {
  const bytes = utf8Encoder.encode(value);
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    encoded += alphabet[first >> 2];
    encoded += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)];
    encoded +=
      second === undefined
        ? "="
        : alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)];
    encoded += third === undefined ? "=" : alphabet[third & 63];
  }
  return encoded;
}

function percentEncoded(value: string): string {
  try {
    return encodeURIComponent(value)
      .replace(
        /[!'()*]/g,
        (character) =>
          `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      )
      .replaceAll("%20", "+");
  } catch {
    fail("unsupported_option", "--data-urlencode");
  }
}

function validatedMethod(value: string): string {
  if (
    !value ||
    value !== value.trim() ||
    value.length > maxMethodLength ||
    !httpMethodPattern.test(value)
  ) {
    fail("unsupported_method", value);
  }
  const standardMethod = value.toUpperCase();
  return supportedMethods.has(standardMethod) ? standardMethod : value;
}

function urlWithQuery(url: string, query: string): string {
  const fragmentIndex = url.indexOf("#");
  const base = fragmentIndex < 0 ? url : url.slice(0, fragmentIndex);
  const fragment = fragmentIndex < 0 ? "" : url.slice(fragmentIndex);
  const separator =
    base.endsWith("?") || base.endsWith("&")
      ? ""
      : base.includes("?")
        ? "&"
        : "?";
  return `${base}${separator}${query}${fragment}`;
}

function encodedData(value: string): string {
  const separator = value.indexOf("=");
  const at = value.indexOf("@");
  if (at >= 0 && (separator < 0 || at < separator)) {
    fail("unsupported_file", "--data-urlencode");
  }
  if (separator < 0) return percentEncoded(value);
  const name = value.slice(0, separator);
  const data = value.slice(separator + 1);
  if (!name) return percentEncoded(data);
  return `${name}=${percentEncoded(data)}`;
}

function formPart(value: string, literal: boolean): FormPart {
  const separator = value.indexOf("=");
  if (separator <= 0) fail("invalid_form", value);
  const name = value.slice(0, separator).trim();
  const formValue = value.slice(separator + 1);
  if (!name || /[\u0000-\u001f\u007f"\\]/.test(name)) {
    fail("invalid_form", name);
  }
  if (!literal && (formValue.startsWith("@") || formValue.startsWith("<"))) {
    fail("unsupported_file", "--form");
  }
  return { name, value: formValue };
}

function multipartBody(parts: readonly FormPart[]): {
  contentType: string;
  body: string;
} {
  let checksum = 2_166_136_261;
  for (const part of parts) {
    for (const character of `${part.name}\u0000${part.value}`) {
      checksum ^= character.charCodeAt(0);
      checksum = Math.imul(checksum, 16_777_619);
    }
  }
  let boundary = `----ValidexFormBoundary${(checksum >>> 0).toString(16)}`;
  while (parts.some((part) => part.value.includes(boundary))) {
    boundary += "x";
  }
  const body =
    parts
      .map(
        (part) =>
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${part.name}"\r\n\r\n` +
          `${part.value}\r\n`,
      )
      .join("") + `--${boundary}--\r\n`;
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body,
  };
}

function addWarning(
  warnings: Set<CurlImportWarning>,
  warning: CurlImportWarning,
) {
  warnings.add(warning);
}

function normalizeAcceptEncoding(
  headers: ImportedCurlHeader[],
  warnings: Set<CurlImportWarning>,
): ImportedCurlHeader[] {
  return headers.flatMap((header) => {
    if (header.key.toLowerCase() !== "accept-encoding") return [header];
    const supported = header.value
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^(?:gzip|deflate|identity)(?:\s*;|$)/i.test(value));
    if (supported.length === header.value.split(",").length) return [header];
    addWarning(warnings, "accept_encoding");
    return supported.length > 0
      ? [{ ...header, value: supported.join(", ") }]
      : [];
  });
}

export function parseCurlBash(source: string): ImportedCurlRequest {
  const tokens = tokenizeBash(source);
  if (tokens[0] === "$" || tokens[0] === "%") tokens.shift();
  if (tokens[0]?.toLowerCase() === "command") tokens.shift();
  if (!["curl", "curl.exe"].includes(commandName(tokens[0] ?? ""))) {
    fail("not_curl");
  }

  const headers: ImportedCurlHeader[] = [];
  const dataParts: Array<{ value: string; separator: "" | "&" }> = [];
  const forms: FormPart[] = [];
  const warnings = new Set<CurlImportWarning>();
  let url = "";
  let explicitMethod = "";
  let useGet = false;
  let useHead = false;
  let usedJSON = false;
  let hasURL = false;
  let index = 1;

  const takeValue = (option: string, inline?: string): string => {
    if (inline !== undefined) return inline;
    const value = tokens[index + 1];
    if (value === undefined) fail("missing_option_value", option);
    index += 1;
    return value;
  };
  const addHeader = (header: ImportedCurlHeader) => {
    headers.push(validatedHeader(header));
    if (headers.length > maxHeaderCount) fail("too_many_headers");
  };
  const setURL = (value: string) => {
    if (hasURL) fail("multiple_urls");
    hasURL = true;
    url = value;
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "--") {
      for (const positional of tokens.slice(index + 1)) setURL(positional);
      break;
    }
    if (!token.startsWith("-") || token === "-") {
      setURL(token);
      index += 1;
      continue;
    }

    let option = token;
    let inlineValue: string | undefined;
    if (token.startsWith("--")) {
      const equals = token.indexOf("=");
      if (equals > 2) {
        option = token.slice(0, equals);
        inlineValue = token.slice(equals + 1);
      }
    } else if (token.length > 2) {
      const valueOptions = ["-A", "-b", "-d", "-e", "-F", "-H", "-T", "-u", "-X"];
      const prefix = valueOptions.find((candidate) => token.startsWith(candidate));
      if (prefix) {
        option = prefix;
        inlineValue = token.slice(prefix.length);
      } else if (/^-[gikLNsSv]+$/.test(token)) {
        for (const flag of token.slice(1)) {
          const short = `-${flag}`;
          const warning = warningFlags.get(short);
          if (warning) addWarning(warnings, warning);
        }
        index += 1;
        continue;
      }
    }

    if (noEffectFlags.has(option)) {
      index += 1;
      continue;
    }
    const warning = warningFlags.get(option);
    if (warning) {
      addWarning(warnings, warning);
      index += 1;
      continue;
    }

    switch (option) {
      case "--url":
        setURL(takeValue(option, inlineValue));
        break;
      case "--request":
      case "-X":
        explicitMethod = validatedMethod(
          takeValue(option, inlineValue),
        );
        break;
      case "--header":
      case "-H":
        addHeader(headerFrom(takeValue(option, inlineValue)));
        break;
      case "--cookie":
      case "-b": {
        const value = takeValue(option, inlineValue);
        if (value.startsWith("@") || !value.includes("=")) {
          fail("unsupported_file", option);
        }
        addHeader({ key: "Cookie", value });
        break;
      }
      case "--user-agent":
      case "-A":
        addHeader({
          key: "User-Agent",
          value: takeValue(option, inlineValue),
        });
        break;
      case "--referer":
      case "-e":
        addHeader({
          key: "Referer",
          value: takeValue(option, inlineValue),
        });
        break;
      case "--user":
      case "-u": {
        const value = takeValue(option, inlineValue);
        if (!value.includes(":")) {
          fail("unsupported_option", `${option} (interactive password)`);
        }
        addHeader({
          key: "Authorization",
          value: `Basic ${utf8Base64(value)}`,
        });
        break;
      }
      case "--oauth2-bearer":
        addHeader({
          key: "Authorization",
          value: `Bearer ${takeValue(option, inlineValue)}`,
        });
        break;
      case "--data":
      case "--data-ascii":
      case "-d": {
        const value = takeValue(option, inlineValue);
        if (value.startsWith("@")) fail("unsupported_file", option);
        dataParts.push({ value, separator: "&" });
        break;
      }
      case "--data-raw":
        dataParts.push({
          value: takeValue(option, inlineValue),
          separator: "&",
        });
        break;
      case "--data-binary": {
        const value = takeValue(option, inlineValue);
        if (value.startsWith("@")) fail("unsupported_file", option);
        dataParts.push({ value, separator: "&" });
        break;
      }
      case "--data-urlencode":
        dataParts.push({
          value: encodedData(takeValue(option, inlineValue)),
          separator: "&",
        });
        break;
      case "--json": {
        const value = takeValue(option, inlineValue);
        if (value.startsWith("@")) fail("unsupported_file", option);
        dataParts.push({ value, separator: "" });
        usedJSON = true;
        break;
      }
      case "--form":
      case "-F":
        forms.push(formPart(takeValue(option, inlineValue), false));
        break;
      case "--form-string":
        forms.push(formPart(takeValue(option, inlineValue), true));
        break;
      case "--get":
      case "-G":
        useGet = true;
        break;
      case "--head":
      case "-I":
        useHead = true;
        break;
      case "--config":
      case "-K":
      case "--upload-file":
      case "-T":
        fail("unsupported_file", option);
      case "--cookie-jar":
      case "--output":
      case "--write-out":
        takeValue(option, inlineValue);
        break;
      default:
        fail("unsupported_option", option);
    }
    index += 1;
  }

  if (!url) fail("missing_url");
  if (forms.length > 0 && dataParts.length > 0) {
    fail("invalid_form", "form_and_data");
  }

  let body = dataParts
    .map(
      (part, partIndex) =>
        `${partIndex === 0 ? "" : part.separator}${part.value}`,
    )
    .join("");
  if (forms.length > 0) {
    const multipart = multipartBody(forms);
    body = multipart.body;
    if (
      !headers.some(
        (header) => header.key.toLowerCase() === "content-type",
      )
    ) {
      addHeader({ key: "Content-Type", value: multipart.contentType });
    }
  }
  if (usedJSON) {
    if (
      !headers.some(
        (header) => header.key.toLowerCase() === "content-type",
      )
    ) {
      addHeader({ key: "Content-Type", value: "application/json" });
    }
    if (!headers.some((header) => header.key.toLowerCase() === "accept")) {
      addHeader({ key: "Accept", value: "application/json" });
    }
  }

  if (body.length > maxBodyLength) fail("body_too_large");
  const usedDataOption = dataParts.length > 0;
  let method =
    explicitMethod ||
    (useHead
      ? "HEAD"
      : useGet
        ? "GET"
        : usedDataOption || forms.length > 0
          ? "POST"
          : "GET");
  if (
    method === "HEAD" &&
    (forms.length > 0 || (!useGet && dataParts.length > 0))
  ) {
    fail("unsupported_method", "HEAD with request body data");
  }
  if (useGet && body) {
    url = urlWithQuery(url, body);
    body = "";
    if (!explicitMethod && !useHead) method = "GET";
  }
  if (
    usedDataOption &&
    !useGet &&
    method !== "HEAD" &&
    !headers.some(
      (header) => header.key.toLowerCase() === "content-type",
    )
  ) {
    addHeader({
      key: "Content-Type",
      value: "application/x-www-form-urlencoded",
    });
  }

  const normalizedHeaders = normalizeAcceptEncoding(headers, warnings);
  if (
    warnings.has("compressed") &&
    !normalizedHeaders.some(
      (header) => header.key.toLowerCase() === "accept-encoding",
    )
  ) {
    if (normalizedHeaders.length >= maxHeaderCount) {
      fail("too_many_headers");
    }
    normalizedHeaders.push(
      validatedHeader({
        key: "Accept-Encoding",
        value: "gzip, deflate",
      }),
    );
  }

  return {
    method: method as HTTPMethod,
    url,
    headers: normalizedHeaders,
    body,
    warnings: [...warnings],
  };
}
