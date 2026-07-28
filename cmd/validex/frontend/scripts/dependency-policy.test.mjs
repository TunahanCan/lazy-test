import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  readFile,
  readdir,
} from "node:fs/promises";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = join(projectRoot, "third_party", "typescript");

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

function containedPath(parent, candidate) {
  const fromParent = relative(parent, candidate);
  return (
    fromParent !== "" &&
    fromParent !== ".." &&
    !fromParent.startsWith(`..${sep}`) &&
    !isAbsolute(fromParent)
  );
}

test("frontend package metadata has no package-manager surface", async () => {
  assert.deepEqual(
    await json(join(projectRoot, "package.json")),
    {
      name: "validex-frontend",
      private: true,
      version: "0.2.0",
      type: "module",
      engines: {
        node: ">=20",
      },
    },
  );

  for (const lockName of ["package-lock.json", "npm-shrinkwrap.json"]) {
    await assert.rejects(
      readFile(join(projectRoot, lockName)),
      { code: "ENOENT" },
    );
  }
});

test("TypeScript compiler is pinned, licensed, and checksummed in-tree", async () => {
  const manifest = await json(join(vendorRoot, "package.json"));
  assert.equal(manifest.name, "typescript");
  assert.equal(manifest.version, "5.9.3");
  assert.equal(manifest.license, "Apache-2.0");
  assert.equal(manifest.private, true);
  assert.equal(manifest.type, "commonjs");
  assert.match(
    manifest._validexNotice,
    /package metadata was reduced/,
  );
  for (const dependencyField of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
    "bundledDependencies",
    "scripts",
    "packageManager",
  ]) {
    assert.equal(
      Object.hasOwn(manifest, dependencyField),
      false,
      `vendored compiler metadata exposes ${dependencyField}`,
    );
  }

  const license = await readFile(join(vendorRoot, "LICENSE.txt"), "utf8");
  const thirdPartyNotice = await readFile(
    join(vendorRoot, "ThirdPartyNoticeText.txt"),
    "utf8",
  );
  assert.match(license, /Apache License/);
  assert.ok(thirdPartyNotice.trim().length > 0);

  const checksumLines = (
    await readFile(join(vendorRoot, "SHA256SUMS"), "utf8")
  ).trim().split("\n");
  assert.ok(checksumLines.length > 0);

  const checkedFiles = new Set();
  for (const line of checksumLines) {
    const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line);
    assert.ok(match, `invalid SHA256SUMS line: ${line}`);
    const [, expectedHash, listedPath] = match;
    assert.equal(isAbsolute(listedPath), false);
    const candidate = resolve(vendorRoot, listedPath);
    assert.ok(
      containedPath(vendorRoot, candidate),
      `checksum path escapes vendor directory: ${listedPath}`,
    );

    const contents = await readFile(candidate);
    assert.equal(
      createHash("sha256").update(contents).digest("hex"),
      expectedHash,
      `checksum mismatch: ${listedPath}`,
    );
    checkedFiles.add(
      listedPath.startsWith("./") ? listedPath.slice(2) : listedPath,
    );
  }

  for (const requiredPath of [
    "bin/tsc",
    "lib/_tsc.js",
    "package.json",
    "LICENSE.txt",
    "ThirdPartyNoticeText.txt",
  ]) {
    assert.ok(
      checkedFiles.has(requiredPath),
      `SHA256SUMS does not cover ${requiredPath}`,
    );
  }

  const vendoredFiles = (await sourceFiles(vendorRoot))
    .map((path) => relative(vendorRoot, path))
    .filter((path) => path !== "SHA256SUMS")
    .sort();
  assert.deepEqual(
    [...checkedFiles].sort(),
    vendoredFiles,
    "SHA256SUMS must cover every vendored TypeScript file",
  );
});

test("frontend tooling and application source never resolve installed packages", async () => {
  const files = [
    ...await sourceFiles(join(projectRoot, "src")),
    ...(
      await sourceFiles(join(projectRoot, "scripts"))
    ).filter((path) => !path.endsWith(".test.mjs")),
  ];
  const installedPackageDirectory = new RegExp(
    ["node", "modules"].join("_"),
  );

  for (const path of files) {
    assert.doesNotMatch(
      await readFile(path, "utf8"),
      installedPackageDirectory,
      path,
    );
  }
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
