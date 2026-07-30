# TypeScript-only frontend toolchain

Validex frontend code remains browser-native TypeScript with zero runtime
dependencies. The desktop package at `cmd/validex` owns the npm toolchain and
pins exactly two direct development dependencies: Electron 43.2.0 and
TypeScript 5.9.3. React, Vite, Vitest, jsdom, bundlers and UI/component
packages are not part of the source or generated frontend artifact.

Run `npm ci` from `cmd/validex` before using the desktop or frontend commands.
The lockfile fixes the complete installation, while TypeScript is used only
during type checking and builds. Neither TypeScript nor Electron is copied
into the browser-native `frontend/dist` artifact.

The nested `frontend/package.json` retains `"type": "module"` as the module
boundary for frontend scripts. Source modules use explicit browser paths such
as `./native/app.js`. `moduleResolution: NodeNext` resolves those paths to
`.ts` during compilation while preserving `.js` specifiers for the browser.

Common commands from `cmd/validex`:

```bash
npm run frontend:typecheck
npm run frontend:build
npm run frontend:test
npm run frontend:dev
```

`frontend/scripts/build.mjs` removes only the fixed TypeScript emit directory,
invokes the TypeScript compiler installed in the parent `node_modules`, rejects
production source maps, and calls `frontend/scripts/package-typescript.mjs`.
The packager uses Node’s standard library and the same npm-installed TypeScript
compiler API. It:

- parses and validates every emitted import as a relative `.js` or `.mjs` path;
- rejects bare/remote, computed, missing and out-of-tree imports;
- rejects symlinks and unsafe output overlap;
- copies public assets and `src/styles.css`;
- rejects source maps, source-map directives and development bootstrap code
  anywhere in the complete production staging tree;
- promotes the validated staging tree with rollback and next-run recovery,
  then exposes it as `dist` with a generated `index.html`.

`frontend/scripts/typecheck.mjs` loads the pinned npm TypeScript CLI directly
and does not emit JavaScript. `frontend/scripts/dev.mjs` uses the same compiler
and packager, but writes only to `.typescript-build/dev-esm` and `.dev-dist`.
It enables the explicit development backend fallback, watches source/public
files and serves the isolated development artifact from a bounded static HTTP
server. Production `dist` is never touched by the development loop.

Tests use Node’s built-in `node:test` runner. Pure application models and
stores are tested from emitted ES modules; packager/build/dev security
boundaries have their own standard-library tests. `npm run frontend:test`
builds first so tests importing emitted application modules see current
source.

Compiler updates must change the exact version in the parent `package.json`
and regenerate `package-lock.json` together. Globally installed compilers and
unlocked fallback resolution are not supported.
