import { strictEqual, throws } from "node:assert/strict";
import { test } from "node:test";

import { clipboardText, clipboardWriteChannel } from "./clipboard";

test("clipboard IPC accepts exact text and rejects structured payloads", () => {
  strictEqual(clipboardWriteChannel, "validex:clipboard:write");
  strictEqual(clipboardText("line 1\nİstanbul\n"), "line 1\nİstanbul\n");
  strictEqual(clipboardText(""), "");
  throws(() => clipboardText(null), /must be a string/);
  throws(() => clipboardText({ text: "unsafe" }), /must be a string/);
});
