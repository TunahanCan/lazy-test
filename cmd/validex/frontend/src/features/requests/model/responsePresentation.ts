export const RESPONSE_SYNTAX_MAX_BYTES = 256 << 10;
export const RESPONSE_SYNTAX_MAX_TOKENS = 20_000;

export type ResponseBodyViewKind = "json" | "xml" | "text" | "base64";
export type ResponseBodySection = "body" | "raw";
export type ResponseBodyEncoding = "utf8" | "base64";

export type ResponseSyntaxTokenKind =
  | "plain"
  | "punctuation"
  | "key"
  | "string"
  | "number"
  | "literal"
  | "tag"
  | "attribute"
  | "comment"
  | "cdata"
  | "declaration";

export interface ResponseSyntaxToken {
  kind: ResponseSyntaxTokenKind;
  text: string;
}

export interface ResponseTokenization {
  tokens: ResponseSyntaxToken[];
  highlighted: boolean;
}

export interface ResponseBodyPresentationInput {
  body: string;
  rawBody: string;
  contentType: string;
  bodyEncoding?: ResponseBodyEncoding;
  bodyKind?: ResponseBodyViewKind | "binary";
  bodyFormatted?: boolean;
}

export interface ResponseBodyViewModel {
  text: string;
  kind: ResponseBodyViewKind;
  encoding: ResponseBodyEncoding;
  raw: boolean;
  formatted: boolean;
  tokens: ResponseSyntaxToken[];
  highlighted: boolean;
}

class BoundedTokenBuilder {
  readonly tokens: ResponseSyntaxToken[] = [];

  push(kind: ResponseSyntaxTokenKind, text: string): boolean {
    if (!text) return true;
    const previous = this.tokens.at(-1);
    if (previous?.kind === kind) {
      previous.text += text;
      return true;
    }
    if (this.tokens.length >= RESPONSE_SYNTAX_MAX_TOKENS) return false;
    this.tokens.push({ kind, text });
    return true;
  }
}

function plainTokenization(text: string): ResponseTokenization {
  return {
    tokens: [{ kind: "plain", text }],
    highlighted: false,
  };
}

function fitsHighlightByteBudget(text: string): boolean {
  if (text.length > RESPONSE_SYNTAX_MAX_BYTES) return false;
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charCodeAt(index);
    if (character <= 0x7f) {
      bytes += 1;
    } else if (character <= 0x7ff) {
      bytes += 2;
    } else if (
      character >= 0xd800 &&
      character <= 0xdbff &&
      index + 1 < text.length
    ) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
    if (bytes > RESPONSE_SYNTAX_MAX_BYTES) return false;
  }
  return true;
}

function isJSONWhitespace(character: string | undefined): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\r"
  );
}

function isJSONPunctuation(character: string | undefined): boolean {
  return (
    character === "{" ||
    character === "}" ||
    character === "[" ||
    character === "]" ||
    character === "," ||
    character === ":"
  );
}

function isDecimalDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

function scanJSONString(source: string, start: number): number {
  let index = start + 1;
  while (index < source.length) {
    const character = source[index];
    if (character === "\\") {
      index = Math.min(source.length, index + 2);
      continue;
    }
    index += 1;
    if (character === '"') break;
  }
  return index;
}

function scanJSONNumber(source: string, start: number): number {
  let index = start;
  if (source[index] === "-") index += 1;
  if (source[index] === "0") {
    index += 1;
  } else {
    const integerStart = index;
    while (isDecimalDigit(source[index])) index += 1;
    if (index === integerStart) return start;
  }
  if (source[index] === ".") {
    const fractionStart = index + 1;
    index = fractionStart;
    while (isDecimalDigit(source[index])) index += 1;
    if (index === fractionStart) return start;
  }
  if (source[index] === "e" || source[index] === "E") {
    index += 1;
    if (source[index] === "+" || source[index] === "-") index += 1;
    const exponentStart = index;
    while (isDecimalDigit(source[index])) index += 1;
    if (index === exponentStart) return start;
  }
  return index;
}

function jsonLiteralEnd(source: string, start: number): number {
  for (const literal of ["true", "false", "null"]) {
    if (!source.startsWith(literal, start)) continue;
    const next = source[start + literal.length];
    if (
      next === undefined ||
      isJSONWhitespace(next) ||
      isJSONPunctuation(next)
    ) {
      return start + literal.length;
    }
  }
  return start;
}

function startsJSONToken(source: string, index: number): boolean {
  const character = source[index];
  if (
    isJSONWhitespace(character) ||
    isJSONPunctuation(character) ||
    character === '"'
  ) {
    return true;
  }
  if (isDecimalDigit(character)) return true;
  if (
    character === "-" &&
    isDecimalDigit(source[index + 1])
  ) {
    return true;
  }
  return jsonLiteralEnd(source, index) > index;
}

function tokenizeJSON(source: string): ResponseSyntaxToken[] | undefined {
  const builder = new BoundedTokenBuilder();
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (isJSONWhitespace(character)) {
      let end = index + 1;
      while (isJSONWhitespace(source[end])) end += 1;
      if (!builder.push("plain", source.slice(index, end))) return;
      index = end;
      continue;
    }
    if (isJSONPunctuation(character)) {
      if (!builder.push("punctuation", character ?? "")) return;
      index += 1;
      continue;
    }
    if (character === '"') {
      const end = scanJSONString(source, index);
      let lookahead = end;
      while (isJSONWhitespace(source[lookahead])) lookahead += 1;
      const kind = source[lookahead] === ":" ? "key" : "string";
      if (!builder.push(kind, source.slice(index, end))) return;
      index = end;
      continue;
    }
    const numberEnd = scanJSONNumber(source, index);
    if (numberEnd > index) {
      if (!builder.push("number", source.slice(index, numberEnd))) return;
      index = numberEnd;
      continue;
    }
    const literalEnd = jsonLiteralEnd(source, index);
    if (literalEnd > index) {
      if (!builder.push("literal", source.slice(index, literalEnd))) return;
      index = literalEnd;
      continue;
    }
    let end = index + 1;
    while (end < source.length && !startsJSONToken(source, end)) end += 1;
    if (!builder.push("plain", source.slice(index, end))) return;
    index = end;
  }
  return builder.tokens;
}

function isXMLWhitespace(character: string | undefined): boolean {
  return isJSONWhitespace(character);
}

function scanXMLName(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    const character = source[index];
    if (
      isXMLWhitespace(character) ||
      character === "/" ||
      character === ">" ||
      character === "="
    ) {
      break;
    }
    index += 1;
  }
  return index;
}

function scanXMLDeclaration(source: string, start: number): number {
  let quote = "";
  let bracketDepth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index] ?? "";
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "[") {
      bracketDepth += 1;
      continue;
    }
    if (character === "]" && bracketDepth > 0) {
      bracketDepth -= 1;
      continue;
    }
    if (character === ">" && bracketDepth === 0) return index + 1;
  }
  return source.length;
}

function tokenizeXML(source: string): ResponseSyntaxToken[] | undefined {
  const builder = new BoundedTokenBuilder();
  let index = 0;
  while (index < source.length) {
    if (source[index] !== "<") {
      const nextTag = source.indexOf("<", index);
      const end = nextTag < 0 ? source.length : nextTag;
      if (!builder.push("plain", source.slice(index, end))) return;
      index = end;
      continue;
    }
    if (source.startsWith("<!--", index)) {
      const closing = source.indexOf("-->", index + 4);
      const end = closing < 0 ? source.length : closing + 3;
      if (!builder.push("comment", source.slice(index, end))) return;
      index = end;
      continue;
    }
    if (source.startsWith("<![CDATA[", index)) {
      const closing = source.indexOf("]]>", index + 9);
      const end = closing < 0 ? source.length : closing + 3;
      if (!builder.push("cdata", source.slice(index, end))) return;
      index = end;
      continue;
    }
    if (source.startsWith("<?", index)) {
      const closing = source.indexOf("?>", index + 2);
      const end = closing < 0 ? source.length : closing + 2;
      if (!builder.push("declaration", source.slice(index, end))) return;
      index = end;
      continue;
    }
    if (source.startsWith("<!", index)) {
      const end = scanXMLDeclaration(source, index + 2);
      if (!builder.push("declaration", source.slice(index, end))) return;
      index = end;
      continue;
    }

    const closingTag = source.startsWith("</", index);
    const openingEnd = index + (closingTag ? 2 : 1);
    if (!builder.push("punctuation", source.slice(index, openingEnd))) return;
    index = openingEnd;
    const tagEnd = scanXMLName(source, index);
    if (tagEnd > index) {
      if (!builder.push("tag", source.slice(index, tagEnd))) return;
      index = tagEnd;
    }

    while (index < source.length) {
      if (source.startsWith("/>", index)) {
        if (!builder.push("punctuation", "/>")) return;
        index += 2;
        break;
      }
      if (source[index] === ">") {
        if (!builder.push("punctuation", ">")) return;
        index += 1;
        break;
      }
      if (isXMLWhitespace(source[index])) {
        let whitespaceEnd = index + 1;
        while (isXMLWhitespace(source[whitespaceEnd])) whitespaceEnd += 1;
        if (!builder.push("plain", source.slice(index, whitespaceEnd))) return;
        index = whitespaceEnd;
        continue;
      }
      if (closingTag) {
        if (!builder.push("plain", source[index] ?? "")) return;
        index += 1;
        continue;
      }

      const attributeEnd = scanXMLName(source, index);
      if (attributeEnd === index) {
        if (!builder.push("plain", source[index] ?? "")) return;
        index += 1;
        continue;
      }
      if (!builder.push("attribute", source.slice(index, attributeEnd))) return;
      index = attributeEnd;
      while (isXMLWhitespace(source[index])) {
        let whitespaceEnd = index + 1;
        while (isXMLWhitespace(source[whitespaceEnd])) whitespaceEnd += 1;
        if (!builder.push("plain", source.slice(index, whitespaceEnd))) return;
        index = whitespaceEnd;
      }
      if (source[index] !== "=") continue;
      if (!builder.push("punctuation", "=")) return;
      index += 1;
      while (isXMLWhitespace(source[index])) {
        let whitespaceEnd = index + 1;
        while (isXMLWhitespace(source[whitespaceEnd])) whitespaceEnd += 1;
        if (!builder.push("plain", source.slice(index, whitespaceEnd))) return;
        index = whitespaceEnd;
      }
      const quote = source[index];
      if (quote === '"' || quote === "'") {
        let valueEnd = index + 1;
        while (valueEnd < source.length && source[valueEnd] !== quote) {
          valueEnd += 1;
        }
        if (valueEnd < source.length) valueEnd += 1;
        if (!builder.push("string", source.slice(index, valueEnd))) return;
        index = valueEnd;
        continue;
      }
      let valueEnd = index;
      while (
        valueEnd < source.length &&
        !isXMLWhitespace(source[valueEnd]) &&
        source[valueEnd] !== ">"
      ) {
        valueEnd += 1;
      }
      if (valueEnd === index) continue;
      if (!builder.push("string", source.slice(index, valueEnd))) return;
      index = valueEnd;
    }
  }
  return builder.tokens;
}

export function tokenizeResponseBody(
  text: string,
  kind: ResponseBodyViewKind,
): ResponseTokenization {
  if (
    !text ||
    kind === "text" ||
    kind === "base64" ||
    !fitsHighlightByteBudget(text)
  ) {
    return plainTokenization(text);
  }
  const tokens = kind === "json" ? tokenizeJSON(text) : tokenizeXML(text);
  if (!tokens || tokens.length === 0) return plainTokenization(text);
  return { tokens, highlighted: true };
}

function normalizedContentType(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function structuredKindFromContentType(
  contentType: string,
): "json" | "xml" | undefined {
  const baseType = normalizedContentType(contentType);
  const separator = baseType.indexOf("/");
  if (separator <= 0 || separator === baseType.length - 1) return;
  const subtype = baseType.slice(separator + 1);
  if (baseType === "application/json" || subtype.endsWith("+json")) {
    return "json";
  }
  if (
    baseType === "application/xml" ||
    baseType === "text/xml" ||
    baseType === "image/svg+xml" ||
    subtype.endsWith("+xml")
  ) {
    return "xml";
  }
  return;
}

function looksLikeJSON(text: string): boolean {
  if (!text || !fitsHighlightByteBudget(text)) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function backendBodyWasFormatted(
  input: ResponseBodyPresentationInput,
): boolean {
  if (input.body.length !== input.rawBody.length) return true;
  if (input.body.length > RESPONSE_SYNTAX_MAX_BYTES) return false;
  return input.body !== input.rawBody;
}

function inferredBodyKind(
  input: ResponseBodyPresentationInput,
  text: string,
  encoding: ResponseBodyEncoding,
): ResponseBodyViewKind {
  if (encoding === "base64" || input.bodyKind === "binary") return "base64";
  if (input.bodyKind) return input.bodyKind;
  const declaredKind = structuredKindFromContentType(input.contentType);
  if (declaredKind) return declaredKind;
  if (looksLikeJSON(text)) return "json";
  const baseType = normalizedContentType(input.contentType);
  const backendFormattedBody = backendBodyWasFormatted(input);
  const prefix = text.slice(0, 512).trimStart();
  if (
    (backendFormattedBody || !baseType || baseType === "text/plain") &&
    (prefix.startsWith("<?xml") || /^<[A-Za-z_][^>]*>/.test(prefix))
  ) {
    return "xml";
  }
  return "text";
}

export function responseBodyViewModel(
  input: ResponseBodyPresentationInput,
  section: ResponseBodySection = "body",
): ResponseBodyViewModel {
  const encoding = input.bodyEncoding ?? "utf8";
  const raw = section === "raw";
  const text = raw ? input.rawBody : input.body;
  const kind = inferredBodyKind(input, text, encoding);
  const tokenization = tokenizeResponseBody(text, kind);
  const formatted =
    !raw &&
    kind !== "base64" &&
    kind !== "text" &&
    (input.bodyFormatted ?? backendBodyWasFormatted(input));
  return {
    text,
    kind,
    encoding,
    raw,
    formatted,
    tokens: tokenization.tokens,
    highlighted: tokenization.highlighted,
  };
}
