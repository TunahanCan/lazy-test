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
  assert.equal(clampResponseSize(Number.NaN), 42);
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
