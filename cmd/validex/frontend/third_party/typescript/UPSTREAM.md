# Vendored TypeScript

- Project: TypeScript
- Version: 5.9.3
- Upstream: https://github.com/microsoft/TypeScript
- Published archive: https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz
- Published archive integrity: `sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==`
- License: Apache-2.0 (`LICENSE.txt`)

The official TypeScript 5.9.3 package is checked into this directory so Validex
frontend builds do not require npm, a package registry, or network access.
`SHA256SUMS` records the exact vendored file contents used by the build.

Validex replaces the published `package.json` with minimal, private CommonJS
metadata. This removes upstream-only scripts, package-manager configuration and
development dependency declarations. Compiler JavaScript, declaration files,
documentation, licenses and third-party notices are otherwise unchanged from
the published archive.

To update this snapshot, review the upstream release and notices, replace the
directory from the official published archive, update this file, regenerate
`SHA256SUMS`, and run the complete frontend and Go test suites.
