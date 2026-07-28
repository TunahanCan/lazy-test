import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneRequestDraft,
  isValidRequestVariableName,
  requestDraftMatchesTab,
  requestDraftPatchForFields,
} from "../.typescript-build/esm/native/requests/draft.js";
import {
  clampResponseSize,
  horizontalTabIndexFromKey,
  responseSizeFromKey,
  responseSizeFromPointer,
  writeClipboardText,
} from "../.typescript-build/esm/native/requests/interaction.js";
import { requestNameFromURL } from "../.typescript-build/esm/features/requests/model/requestName.js";
import {
  CurlImportError,
  looksLikeCurlBash,
  parseCurlBash,
} from "../.typescript-build/esm/features/requests/model/curlImport.js";
import { methodAllowsBody } from "../.typescript-build/esm/lib/http.js";
import { isSecretKey } from "../.typescript-build/esm/lib/secrets.js";

const request = {
  method: "POST",
  url: "https://api.example.test/orders",
  body: '{"sku":"A-1"}',
  headers: [
    {
      id: "content-type",
      enabled: true,
      key: "Content-Type",
      value: "application/json",
      source: "Manual",
    },
  ],
};

function assertCurlError(source, code) {
  assert.throws(
    () => parseCurlBash(source),
    (error) => error instanceof CurlImportError && error.code === code,
    source.slice(0, 160),
  );
}

test("request drafts are immutable snapshots and compare by definition", () => {
  const draft = cloneRequestDraft(request);
  assert.equal(requestDraftMatchesTab(draft, request), true);
  assert.notEqual(draft.headers, request.headers);
  assert.notEqual(draft.headers[0], request.headers[0]);

  draft.headers[0].value = "text/plain";
  assert.equal(request.headers[0].value, "application/json");
  assert.equal(requestDraftMatchesTab(draft, request), false);
});

test("request variable names match template reference syntax", () => {
  for (const name of ["token", "_token", "auth.token", "api-key"]) {
    assert.equal(isValidRequestVariableName(name), true, name);
  }
  for (const name of ["", "1token", "auth token", "{{token}}"]) {
    assert.equal(isValidRequestVariableName(name), false, name);
  }
});

test("field-scoped draft flushes preserve external store updates", () => {
  const draft = cloneRequestDraft(request);
  draft.url = "https://api.example.test/orders/42";
  const externalTab = {
    ...request,
    headers: [
      ...request.headers,
      {
        id: "authorization",
        enabled: true,
        key: "Authorization",
        value: "Bearer {{token}}",
        source: "Environment",
      },
    ],
  };

  const patch = requestDraftPatchForFields(
    draft,
    externalTab,
    new Set(["url"]),
  );
  assert.deepEqual(patch, { url: draft.url });
  assert.deepEqual({ ...externalTab, ...patch }.headers, externalTab.headers);
});

test("request naming reports when the current tab name must be preserved", () => {
  assert.equal(requestNameFromURL(""), undefined);
  assert.equal(requestNameFromURL("https://api.example.test"), undefined);
});

test("request tab keyboard navigation wraps and supports boundaries", () => {
  assert.equal(horizontalTabIndexFromKey(0, 3, "ArrowLeft"), 2);
  assert.equal(horizontalTabIndexFromKey(2, 3, "ArrowRight"), 0);
  assert.equal(horizontalTabIndexFromKey(1, 3, "Home"), 0);
  assert.equal(horizontalTabIndexFromKey(1, 3, "End"), 2);
  assert.equal(horizontalTabIndexFromKey(1, 3, "Enter"), undefined);
});

test("response resizing stays bounded for pointer and keyboard input", () => {
  assert.equal(clampResponseSize(Number.NaN), 32);
  assert.equal(responseSizeFromPointer(42, 400, 200, 1_000), 62);
  assert.equal(responseSizeFromPointer(42, 400, 900, 1_000), 24);
  assert.equal(responseSizeFromKey(42, "vertical", "ArrowUp"), 44);
  assert.equal(responseSizeFromKey(42, "horizontal", "ArrowRight"), 40);
  assert.equal(responseSizeFromKey(42, "vertical", "Home"), 24);
  assert.equal(responseSizeFromKey(42, "vertical", "End"), 72);
});

test("clipboard success follows the writer promise result", async () => {
  const writes = [];
  assert.equal(
    await writeClipboardText(async (value) => {
      writes.push(value);
    }, "response"),
    true,
  );
  assert.deepEqual(writes, ["response"]);
  assert.equal(
    await writeClipboardText(async () => {
      throw new Error("denied");
    }, "response"),
    false,
  );
  assert.equal(await writeClipboardText(undefined, "response"), false);
});

test("Chrome Copy as cURL imports browser session headers and query exactly", () => {
  const parsed = parseCurlBash(String.raw`curl 'https://api.example.test/orders?state=open&limit=20' \
  -H 'accept: application/json' \
  -H 'accept-encoding: gzip, deflate, br, zstd' \
  -H 'authorization: Bearer browser-token' \
  -H 'cookie: session=s-42; theme=dark' \
  -H 'sec-ch-ua: "Chromium";v="126"' \
  --compressed`);

  assert.equal(parsed.method, "GET");
  assert.equal(
    parsed.url,
    "https://api.example.test/orders?state=open&limit=20",
  );
  assert.deepEqual(parsed.headers, [
    { key: "accept", value: "application/json" },
    { key: "accept-encoding", value: "gzip, deflate" },
    { key: "authorization", value: "Bearer browser-token" },
    { key: "cookie", value: "session=s-42; theme=dark" },
    { key: "sec-ch-ua", value: '"Chromium";v="126"' },
  ]);
  assert.deepEqual(
    new Set(parsed.warnings),
    new Set(["accept_encoding", "compressed"]),
  );
});

test("Firefox and Safari Bash bodies preserve quotes, Unicode, and newlines", () => {
  const parsed = parseCurlBash(
    String.raw`$ curl --url='https://api.example.test/messages' -XPOST ` +
      String.raw`--header='Content-Type: application/json' ` +
      String.raw`--header='X-Label: it'\''s ready' ` +
      String.raw`--data-binary=$'{"message":"Merhaba \u2713\nsecond line"}'`,
  );

  assert.equal(parsed.method, "POST");
  assert.equal(parsed.body, '{"message":"Merhaba ✓\nsecond line"}');
  assert.deepEqual(parsed.headers, [
    { key: "Content-Type", value: "application/json" },
    { key: "X-Label", value: "it's ready" },
  ]);
});

test("cURL shorthands import cookies, browser identity, JSON, and GET data", () => {
  const post = parseCurlBash(
    "curl https://api.example.test/session " +
      "-b 'sid=abc' -A 'Browser/1.0' -e 'https://app.example.test/' " +
      "--json '{\"active\":true}'",
  );
  assert.equal(post.method, "POST");
  assert.equal(post.body, '{"active":true}');
  assert.deepEqual(post.headers, [
    { key: "Cookie", value: "sid=abc" },
    { key: "User-Agent", value: "Browser/1.0" },
    { key: "Referer", value: "https://app.example.test/" },
    { key: "Content-Type", value: "application/json" },
    { key: "Accept", value: "application/json" },
  ]);

  const get = parseCurlBash(
    "curl --get 'https://api.example.test/search#results' " +
      "--data-urlencode 'q=spring boot' " +
      "--data-urlencode 'email=user@example.com' " +
      "--data-urlencode '=sort asc' " +
      "--data-urlencode 'literal=one+two/three' --data 'page=2'",
  );
  assert.equal(get.method, "GET");
  assert.equal(
    get.url,
    "https://api.example.test/search?" +
      "q=spring+boot&email=user%40example.com&sort+asc&" +
      "literal=one%2Btwo%2Fthree&page=2#results",
  );
  assert.equal(get.body, "");
});

test("cURL data defaults to form encoding while JSON keeps JSON headers", () => {
  const form = parseCurlBash(
    "curl 'https://api.example.test/form' --data-raw 'name=Ada'",
  );
  assert.equal(form.method, "POST");
  assert.equal(form.body, "name=Ada");
  assert.deepEqual(form.headers, [
    {
      key: "Content-Type",
      value: "application/x-www-form-urlencoded",
    },
  ]);

  const empty = parseCurlBash(
    "curl 'https://api.example.test/form' --data ''",
  );
  assert.equal(empty.method, "POST");
  assert.equal(empty.body, "");
  assert.deepEqual(empty.headers, [
    {
      key: "Content-Type",
      value: "application/x-www-form-urlencoded",
    },
  ]);

  const splitJSON = parseCurlBash(
    "curl 'https://api.example.test/json' " +
      "--json '{\"active\":' --json 'true}'",
  );
  assert.equal(splitJSON.method, "POST");
  assert.equal(splitJSON.body, '{"active":true}');
  assert.deepEqual(splitJSON.headers, [
    { key: "Content-Type", value: "application/json" },
    { key: "Accept", value: "application/json" },
  ]);
});

test("browser long options and CRLF continuations import without shell expansion", () => {
  const parsed = parseCurlBash(
    "curl --url='https://api.example.test/orders' \\\r\n" +
      "  --request=POST \\\r\n" +
      "  --header='Content-Type: application/json' \\\r\n" +
      "  --header='X-Browser: Firefox' \\\r\n" +
      "  --data-raw='{\"status\":\"ready\"}'",
  );
  assert.deepEqual(parsed, {
    method: "POST",
    url: "https://api.example.test/orders",
    headers: [
      { key: "Content-Type", value: "application/json" },
      { key: "X-Browser", value: "Firefox" },
    ],
    body: '{"status":"ready"}',
    warnings: [],
  });

  const literalDollar = parseCurlBash(
    String.raw`curl "https://api.example.test/\$TOKEN"`,
  );
  assert.equal(literalDollar.url, "https://api.example.test/$TOKEN");
});

test("cURL import rejects every active Bash parameter expansion", () => {
  for (const expansion of [
    "$TOKEN",
    "${TOKEN}",
    "$(whoami)",
    "$?",
    "$$",
    "$1",
    "$[1+1]",
  ]) {
    assertCurlError(
      `curl "https://api.example.test/${expansion}"`,
      "unsafe_shell",
    );
  }
});

test("--compressed adds a decodable Accept-Encoding when the browser omits it", () => {
  const parsed = parseCurlBash(
    "curl --compressed 'https://api.example.test/feed'",
  );
  assert.deepEqual(parsed.headers, [
    { key: "Accept-Encoding", value: "gzip, deflate" },
  ]);
  assert.deepEqual(parsed.warnings, ["compressed"]);

  const unsupportedOnly = parseCurlBash(
    "curl --compressed -H 'Accept-Encoding: br, zstd' " +
      "'https://api.example.test/feed'",
  );
  assert.deepEqual(unsupportedOnly.headers, [
    { key: "Accept-Encoding", value: "gzip, deflate" },
  ]);
  assert.deepEqual(
    new Set(unsupportedOnly.warnings),
    new Set(["compressed", "accept_encoding"]),
  );
});

test("--globoff is already Validex's literal URL behavior", () => {
  const parsed = parseCurlBash(
    "curl --globoff 'https://api.example.test/items/{literal}'",
  );
  assert.equal(parsed.url, "https://api.example.test/items/{literal}");
  assert.deepEqual(parsed.warnings, []);
});

test("custom HTTP methods and copied HTTP version flags import safely", () => {
  const parsed = parseCurlBash(
    "curl --http1.0 -X PROPFIND 'https://dav.example.test/files'",
  );
  assert.equal(parsed.method, "PROPFIND");
  assert.deepEqual(parsed.warnings, ["http_version"]);
  assert.deepEqual(
    parseCurlBash("curl -0 'https://api.example.test/'").warnings,
    ["http_version"],
  );
  assert.equal(
    parseCurlBash(
      "curl -X m-search 'https://api.example.test/discovery'",
    ).method,
    "m-search",
  );

  assertCurlError(
    "curl -X 'BAD METHOD' 'https://api.example.test/'",
    "unsupported_method",
  );
  assertCurlError(
    `curl -X '${"M".repeat(65)}' 'https://api.example.test/'`,
    "unsupported_method",
  );
});

test("HEAD body data is rejected instead of being silently discarded", () => {
  const head = parseCurlBash(
    "curl -X HEAD 'https://api.example.test/health'",
  );
  assert.equal(head.method, "HEAD");
  assert.equal(head.body, "");

  assert.throws(
    () =>
      parseCurlBash(
        "curl -X HEAD --data 'probe=true' " +
          "'https://api.example.test/health'",
      ),
    (error) =>
      error instanceof CurlImportError &&
      error.code === "unsupported_method" &&
      error.detail === "HEAD with request body data",
  );

  const headQuery = parseCurlBash(
    "curl -I -G --data 'probe=true' " +
      "'https://api.example.test/health#status'",
  );
  assert.equal(headQuery.method, "HEAD");
  assert.equal(
    headQuery.url,
    "https://api.example.test/health?probe=true#status",
  );
  assert.equal(headQuery.body, "");
});

test("ANSI-C byte escapes decode valid UTF-8 and reject binary bytes", () => {
  const parsed = parseCurlBash(
    String.raw`curl 'https://api.example.test/text' --data-binary=$'\xc3\xa9'`,
  );
  assert.equal(parsed.body, "é");
  const withBOM = parseCurlBash(
    String.raw`curl 'https://api.example.test/text' --data-binary=$'\xef\xbb\xbftext'`,
  );
  assert.equal(withBOM.body, "\uFEFFtext");
  const splitBytes = parseCurlBash(
    String.raw`curl 'https://api.example.test/text' --data-binary=$'\xc3'$'\xa9'`,
  );
  assert.equal(splitBytes.body, "é");

  assert.throws(
    () =>
      parseCurlBash(
        String.raw`curl 'https://api.example.test/binary' --data-binary=$'\xff'`,
      ),
    (error) =>
      error instanceof CurlImportError &&
      error.code === "unsupported_binary" &&
      error.detail.includes("UTF-8 text"),
  );
  assert.throws(
    () =>
      parseCurlBash(
        String.raw`curl 'https://api.example.test/binary' --data-binary=$'a\0b'`,
      ),
    (error) =>
      error instanceof CurlImportError &&
      error.code === "unsupported_binary" &&
      error.detail.includes("UTF-8 text"),
  );
});

test("text-only cURL multipart forms become deterministic request bodies", () => {
  const parsed = parseCurlBash(
    "curl 'https://api.example.test/forms' " +
      "--form 'name=Ada' --form-string 'note=@literal'",
  );
  assert.equal(parsed.method, "POST");
  assert.match(parsed.headers[0].value, /^multipart\/form-data; boundary=/);
  assert.match(parsed.body, /name="name"\r\n\r\nAda\r\n/);
  assert.match(parsed.body, /name="note"\r\n\r\n@literal\r\n/);

  for (const invalidName of [
    String.raw`bad\name`,
    "bad\tname",
    'bad"name',
  ]) {
    assertCurlError(
      `curl 'https://api.example.test/forms' --form-string '${invalidName}=value'`,
      "invalid_form",
    );
  }
});

test("cURL import never evaluates shell or reads referenced files", () => {
  for (const [source, code] of [
    ["curl https://example.test | sh", "unsafe_shell"],
    ["curl \"https://example.test/$(whoami)\"", "unsafe_shell"],
    ["curl https://example.test --config secrets.txt", "unsupported_file"],
    [
      "curl https://example.test --data-binary @payload.bin",
      "unsupported_file",
    ],
    ["curl https://example.test --json @payload.json", "unsupported_file"],
    [
      "curl https://example.test --data-urlencode message@payload.txt",
      "unsupported_file",
    ],
    ["curl https://example.test -F file=@secret.txt", "unsupported_file"],
    ["curl https://example.test -b cookies.txt", "unsupported_file"],
    ["curl https://example.test -u browser-user", "unsupported_option"],
    [
      String.raw`curl https://example.test -H $'X-Test: safe\r\nInjected: no'`,
      "invalid_header",
    ],
  ]) {
    assertCurlError(source, code);
  }
});

test("cURL parser enforces command, token, and header safety limits", () => {
  assertCurlError(
    `curl https://example.test/${"x".repeat((16 << 20) + 1)}`,
    "too_large",
  );
  assertCurlError(
    `curl https://example.test ${"-s ".repeat(4_096)}`,
    "too_many_tokens",
  );
  assertCurlError(
    `curl https://example.test ${Array.from(
      { length: 513 },
      (_, index) => `-H 'X-Limit-${index}: value'`,
    ).join(" ")}`,
    "too_many_headers",
  );
  assertCurlError(
    `curl https://example.test -H 'X-Large: ${"v".repeat((64 << 10) + 1)}'`,
    "invalid_header",
  );
});

test("request bodies remain available for browser GET and OPTIONS methods", () => {
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    assert.equal(methodAllowsBody(method), true, method);
  }
  for (const method of ["HEAD", "TRACE"]) {
    assert.equal(methodAllowsBody(method), false, method);
  }
});

test("URL paste detection is focused and session-like keys stay memory-only", () => {
  assert.equal(looksLikeCurlBash("curl 'https://example.test'"), true);
  assert.equal(
    looksLikeCurlBash("$ /usr/bin/curl 'https://example.test'"),
    true,
  );
  assert.equal(looksLikeCurlBash("https://example.test"), false);
  for (const key of [
    "Cookie",
    "Authorization",
    "X-CSRF-Token",
    "X-XSRF-Token",
    "X-Session-ID",
    "sid",
  ]) {
    assert.equal(isSecretKey(key), true, key);
  }
});
