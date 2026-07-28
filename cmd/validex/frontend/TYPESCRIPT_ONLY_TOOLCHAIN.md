# TypeScript-only frontend toolchain

Validex frontend code is browser-native TypeScript. It has zero runtime
dependencies and exactly one build dependency: the TypeScript 5.9.3 compiler
vendored at `third_party/typescript`. React, Vite, Vitest, jsdom and
UI/component packages are not part of the source or generated artifact.

No package manager, install step or registry access is required. After the
repository is cloned, frontend typecheck, test, development and production
build commands can run offline with Node.js 20+ and the vendored compiler.
The compiler is build-only; it is not copied into `dist` or loaded by the
application at runtime.

Source modules use explicit browser paths such as `./native/app.js`.
`moduleResolution: NodeNext` resolves those paths to `.ts` during compilation
while preserving `.js` specifiers for the browser.

Common commands:

```bash
node scripts/typecheck.mjs
node scripts/build.mjs
node --test
node scripts/dev.mjs --host 127.0.0.1 --port 34116
```

`scripts/build.mjs` removes only the fixed TypeScript emit directory, invokes
the vendored compiler, rejects production source maps, and calls
`scripts/package-typescript.mjs`. The packager uses Node’s standard library
and the same vendored TypeScript compiler API; it adds no dependency. It:

- parses and validates every emitted import as a relative `.js` or `.mjs` path;
- rejects bare/remote, computed, missing and out-of-tree imports;
- rejects symlinks and unsafe output overlap;
- copies public assets and `src/styles.css`;
- rejects source maps, source-map directives and development bootstrap code
  anywhere in the complete production staging tree;
- promotes the validated staging tree with rollback and next-run recovery,
  then exposes it as `dist` with a generated `index.html`.

`scripts/typecheck.mjs` loads the vendored TypeScript CLI directly and does
not emit JavaScript. `scripts/dev.mjs` uses the same compiler and
packager, but writes only to
`.typescript-build/dev-esm` and `.dev-dist`. It enables the explicit
development backend fallback, watches source/public files and serves the
isolated development artifact from a bounded static HTTP server. Production
`dist` is never touched by the development loop, so a concurrent Go build
cannot embed source maps or the browser-only fallback. This does not add a
runtime dependency or a second compilation pipeline.

Tests use Node’s built-in `node:test` runner. Pure application models and stores
are tested from emitted ES modules; packager/build/dev security boundaries have
their own standard-library tests. Run `node scripts/build.mjs` before
`node --test` so tests that import emitted application modules use the current
source.

The vendored snapshot’s upstream version, license and checksums are part of
the repository. A compiler update must replace the snapshot and update those
records together; silently falling back to a globally installed compiler is
not supported.
