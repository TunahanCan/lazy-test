import assert from "node:assert/strict";
import {
  readFile,
  readdir,
} from "node:fs/promises";
import {
  dirname,
  extname,
  join,
  resolve,
} from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = resolve(projectRoot, "..");

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function sourceFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await sourceFiles(path));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}

test("desktop npm metadata keeps only Electron and TypeScript direct dependencies", async () => {
  const frontendManifest = await json(join(projectRoot, "package.json"));
  assert.deepEqual(frontendManifest, {
    name: "validex-frontend",
    private: true,
    version: "0.2.0",
    type: "module",
    engines: {
      node: ">=20",
    },
  });

  const desktopManifest = await json(join(desktopRoot, "package.json"));
  assert.equal(desktopManifest.private, true);
  assert.equal(desktopManifest.productName, "Validex");
  assert.equal(desktopManifest.type, "commonjs");
  assert.equal(desktopManifest.main, "electron/dist/main.js");
  assert.deepEqual(desktopManifest.devDependencies, {
    electron: "43.2.0",
    typescript: "5.9.3",
  });
  for (const dependencyField of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
    "bundledDependencies",
  ]) {
    assert.equal(
      Object.hasOwn(desktopManifest, dependencyField),
      false,
      `desktop package exposes direct ${dependencyField}`,
    );
  }

  const lock = await json(join(desktopRoot, "package-lock.json"));
  assert.deepEqual(lock.packages[""].devDependencies, {
    electron: "43.2.0",
    typescript: "5.9.3",
  });
  assert.equal(lock.packages["node_modules/electron"].version, "43.2.0");
  assert.equal(lock.packages["node_modules/typescript"].version, "5.9.3");

  for (const nestedMetadata of [
    join(projectRoot, "package-lock.json"),
    join(projectRoot, "npm-shrinkwrap.json"),
    join(desktopRoot, "electron", "package.json"),
    join(desktopRoot, "electron", "package-lock.json"),
  ]) {
    await assert.rejects(readFile(nestedMetadata), { code: "ENOENT" });
  }
});

test("frontend tooling resolves the pinned npm TypeScript installation", async () => {
  const installedManifest = await json(
    join(desktopRoot, "node_modules", "typescript", "package.json"),
  );
  assert.equal(installedManifest.version, "5.9.3");
  assert.equal(installedManifest.license, "Apache-2.0");

  await assert.rejects(
    readdir(join(projectRoot, "third_party", "typescript")),
    { code: "ENOENT" },
  );

  const buildScript = await readFile(
    join(projectRoot, "scripts", "build.mjs"),
    "utf8",
  );
  assert.match(
    buildScript,
    /["']node_modules["'][\s\S]*["']typescript["'][\s\S]*["']bin["'][\s\S]*["']tsc["']/,
  );
  assert.match(
    await readFile(
      join(projectRoot, "scripts", "typecheck.mjs"),
      "utf8",
    ),
    /\.\.\/\.\.\/node_modules\/typescript\/lib\/tsc\.js/,
  );
  assert.match(
    await readFile(
      join(projectRoot, "scripts", "package-typescript.mjs"),
      "utf8",
    ),
    /from ["']typescript["']/,
  );
});

test("frontend application source uses TypeScript without JavaScript or JSX", async () => {
  const files = await sourceFiles(join(projectRoot, "src"));
  const forbidden = files.filter((path) =>
    [".js", ".cjs", ".mjs", ".jsx", ".tsx"].includes(extname(path)),
  );
  assert.deepEqual(forbidden, []);
  assert.ok(files.includes(join(projectRoot, "src", "main.ts")));
});

test("application chrome renders the shipped Validex brand icon", async () => {
  const topBar = await readFile(
    join(projectRoot, "src", "native", "chrome", "topBar.ts"),
    "utf8",
  );
  assert.match(
    topBar,
    /<img\s+class="brand-mark"\s+src="\.\/appicon\.svg"/,
  );
  assert.doesNotMatch(topBar, /<span class="brand-mark">V<\/span>/);
});
