#!/usr/bin/env node

// TypeScript is vendored so type checking is deterministic and offline.
// The upstream CLI reads the original arguments directly from process.argv.
await import("../third_party/typescript/lib/tsc.js");
