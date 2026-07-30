#!/usr/bin/env node

import { fileURLToPath } from "node:url";

// TypeScript is installed by the desktop package one directory above the
// frontend. The upstream CLI reads the original arguments from process.argv.
if (process.argv.length === 2) {
  process.argv.push(
    "-p",
    fileURLToPath(new URL("../tsconfig.json", import.meta.url)),
  );
}
await import("../../node_modules/typescript/lib/tsc.js");
