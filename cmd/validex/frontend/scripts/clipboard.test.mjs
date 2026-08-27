import assert from "node:assert/strict";
import test from "node:test";

import { writeClipboardText } from "../.typescript-build/esm/native/clipboard.js";

test("clipboard writes prefer the first successful implementation", async () => {
  const calls = [];
  const copied = await writeClipboardText("response body", [
    async (value) => {
      calls.push(`native:${value}`);
      throw new Error("native unavailable");
    },
    async (value) => {
      calls.push(`browser:${value}`);
      return true;
    },
    async (value) => {
      calls.push(`legacy:${value}`);
      return true;
    },
  ]);

  assert.equal(copied, true);
  assert.deepEqual(calls, [
    "native:response body",
    "browser:response body",
  ]);
  assert.equal(
    await writeClipboardText("void writer", [async () => undefined]),
    true,
  );
  assert.equal(await writeClipboardText("response body", []), false);
});
