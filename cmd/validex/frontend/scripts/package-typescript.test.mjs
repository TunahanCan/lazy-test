import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  commitStagedDirectory,
  packageStaticSite,
  validateEmittedModules,
} from "./package-typescript.mjs";

async function directoryIdentity(path) {
  const information = await lstat(path, { bigint: true });
  return {
    birthtimeMilliseconds: String(information.birthtimeMs),
    device: String(information.dev),
    inode: String(information.ino),
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "validex-typescript-packager-"));
  const emitDirectory = join(root, "emit");
  const publicDirectory = join(root, "public");
  await mkdir(join(emitDirectory, "features"), { recursive: true });
  await mkdir(publicDirectory);
  await writeFile(
    join(emitDirectory, "main.js"),
    'import { message } from "./features/message.js";\n' +
      'document.getElementById("root").textContent = message;\n',
  );
  await writeFile(
    join(emitDirectory, "features", "message.js"),
    'export const message = "Validex";\n',
  );
  await writeFile(join(publicDirectory, "appicon.svg"), "<svg></svg>\n");
  const stylesheet = join(root, "styles.css");
  await writeFile(stylesheet, "body { margin: 0; }\n");
  return { emitDirectory, publicDirectory, root, stylesheet };
}

test("packages emitted modules and static assets", async () => {
  const paths = await fixture();
  const outputDirectory = join(paths.root, "dist");
  const result = await packageStaticSite({
    emitDirectory: paths.emitDirectory,
    entry: "main.js",
    language: "tr",
    outputDirectory,
    publicDirectory: paths.publicDirectory,
    replace: false,
    rootID: "root",
    styles: [paths.stylesheet],
    title: "Validex",
  });

  assert.equal(result.moduleCount, 2);
  assert.match(
    await readFile(join(outputDirectory, "index.html"), "utf8"),
    /src="\.\/modules\/main\.js"/,
  );
  assert.equal(
    await readFile(join(outputDirectory, "modules", "features", "message.js"), "utf8"),
    'export const message = "Validex";\n',
  );
  assert.equal(
    await readFile(join(outputDirectory, "assets", "styles.css"), "utf8"),
    "body { margin: 0; }\n",
  );
  assert.equal(
    await readFile(join(outputDirectory, "appicon.svg"), "utf8"),
    "<svg></svg>\n",
  );
});

test("rejects bare package imports", async () => {
  const paths = await fixture();
  await writeFile(
    join(paths.emitDirectory, "main.js"),
    'import React from "react";\nvoid React;\n',
  );

  await assert.rejects(
    validateEmittedModules(paths.emitDirectory, "main.js"),
    /imports non-local module "react"/,
  );
});

test("rejects relative imports without browser extensions", async () => {
  const paths = await fixture();
  await writeFile(
    join(paths.emitDirectory, "main.js"),
    'import { message } from "./features/message";\nvoid message;\n',
  );

  await assert.rejects(
    validateEmittedModules(paths.emitDirectory, "main.js"),
    /must use an explicit \.js or \.mjs import/,
  );
});

test("rejects computed dynamic imports", async () => {
  const paths = await fixture();
  await writeFile(
    join(paths.emitDirectory, "main.js"),
    'const moduleName = "./features/message.js";\nawait import(moduleName);\n',
  );

  await assert.rejects(
    validateEmittedModules(paths.emitDirectory, "main.js"),
    /contains a computed dynamic import/,
  );
});

test("requires entry and imported module targets to be regular files", async () => {
  const entryPaths = await fixture();
  const entryPath = join(entryPaths.emitDirectory, "main.js");
  await rm(entryPath);
  await mkdir(entryPath);
  await writeFile(
    join(entryPath, "nested.js"),
    'export const nested = true;\n',
  );
  await assert.rejects(
    validateEmittedModules(entryPaths.emitDirectory, "main.js"),
    /entry module is not a regular file/,
  );

  const importPaths = await fixture();
  const importedPath = join(
    importPaths.emitDirectory,
    "features",
    "message.js",
  );
  await rm(importedPath);
  await mkdir(importedPath);
  await writeFile(
    join(importedPath, "nested.js"),
    'export const message = "nested";\n',
  );
  await assert.rejects(
    validateEmittedModules(importPaths.emitDirectory, "main.js"),
    /imports a path that is not a regular file/,
  );
});

test("parses commented dynamic and multiline static imports", async () => {
  const dynamicPaths = await fixture();
  await writeFile(
    join(dynamicPaths.emitDirectory, "main.js"),
    'await import/* policy bypass */("https://example.test/remote.js");\n',
  );
  await assert.rejects(
    validateEmittedModules(dynamicPaths.emitDirectory, "main.js"),
    /imports non-local module/,
  );

  const staticPaths = await fixture();
  await writeFile(
    join(staticPaths.emitDirectory, "main.js"),
    'import {\n  value\n} from "bare-dependency";\nvoid value;\n',
  );
  await assert.rejects(
    validateEmittedModules(staticPaths.emitDirectory, "main.js"),
    /imports non-local module/,
  );

  const commentPaths = await fixture();
  await writeFile(
    join(commentPaths.emitDirectory, "main.js"),
    '// import("remote-package");\n' +
      'const example = "export { value } from \\"bare-package\\"";\n' +
      'import "./features/message.js";\n' +
      "void example;\n",
  );
  await validateEmittedModules(
    commentPaths.emitDirectory,
    "main.js",
  );
});

test("validates cooked module specifiers with browser URL rules", async () => {
  const cases = [
    [
      'import "./%2e%2e/escape.js";\n',
      /percent encoding/,
    ],
    [
      String.raw`import "./nested\\..\\..\\escape.js";` + "\n",
      /backslash/,
    ],
    [
      String.raw`import "./\u002e\u002e/escape.js";` + "\n",
      /outside the browser module tree/,
    ],
    [
      'import "./features/message.js?raw";\n',
      /query or fragment/,
    ],
    [
      'import "./features/message.js#fragment";\n',
      /query or fragment/,
    ],
    [
      String.raw`import "./features/message.js\u0000";` + "\n",
      /control character/,
    ],
  ];

  for (const [source, expected] of cases) {
    const paths = await fixture();
    await writeFile(join(paths.emitDirectory, "main.js"), source);
    await assert.rejects(
      validateEmittedModules(paths.emitDirectory, "main.js"),
      expected,
    );
  }

  const paths = await fixture();
  await assert.rejects(
    validateEmittedModules(
      paths.emitDirectory,
      "%2e%2e/escape.js",
    ),
    /percent encoding/,
  );
  await assert.rejects(
    validateEmittedModules(
      paths.emitDirectory,
      String.raw`nested\..\..\escape.js`,
    ),
    /backslash/,
  );
});

test("production packaging rejects public source maps before replacement", async () => {
  const paths = await fixture();
  const outputDirectory = join(paths.root, "dist");
  await mkdir(outputDirectory);
  await writeFile(join(outputDirectory, "sentinel.txt"), "keep\n");
  await mkdir(join(paths.publicDirectory, "vendor"));
  await writeFile(
    join(
      paths.publicDirectory,
      "vendor",
      "application.js.map",
    ),
    JSON.stringify({
      version: 3,
      sources: ["private.ts"],
      sourcesContent: ["private source"],
      mappings: "",
    }),
  );

  await assert.rejects(
    packageStaticSite({
      emitDirectory: paths.emitDirectory,
      entry: "main.js",
      language: "en",
      outputDirectory,
      publicDirectory: paths.publicDirectory,
      replace: true,
      rootID: "root",
      styles: [paths.stylesheet],
      title: "Validex",
    }),
    /production artifact contains a source map/,
  );
  assert.equal(
    await readFile(join(outputDirectory, "sentinel.txt"), "utf8"),
    "keep\n",
  );
});

test("production packaging rejects map pragmas and development injection", async () => {
  for (const [name, content, expected] of [
    [
      "debug.js",
      "//# sourceMappingURL=data:application/json;base64,e30=\n",
      /references a source map/,
    ],
    [
      "debug.css",
      "/*# sourceMappingURL=data:application/json;base64,e30= */\n",
      /references a source map/,
    ],
    [
      "debug.html",
      "<script>window.__VALIDEX_DEV__ = true;</script>\n",
      /development injection/,
    ],
    [
      "dev-assignment.js",
      "window.__VALIDEX_DEV__=true;\n",
      /development injection/,
    ],
  ]) {
    const paths = await fixture();
    await writeFile(join(paths.publicDirectory, name), content);
    await assert.rejects(
      packageStaticSite({
        emitDirectory: paths.emitDirectory,
        entry: "main.js",
        language: "en",
        outputDirectory: join(paths.root, "dist"),
        publicDirectory: paths.publicDirectory,
        replace: false,
        rootID: "root",
        styles: [paths.stylesheet],
        title: "Validex",
      }),
      expected,
    );
  }
});

test("does not replace an artifact without an explicit flag", async () => {
  const paths = await fixture();
  const outputDirectory = join(paths.root, "dist");
  const options = {
    emitDirectory: paths.emitDirectory,
    entry: "main.js",
    language: "en",
    outputDirectory,
    publicDirectory: "",
    replace: false,
    rootID: "root",
    styles: [],
    title: "Validex",
  };
  await packageStaticSite(options);
  await assert.rejects(
    packageStaticSite(options),
    /output directory already exists/,
  );
});

test("restores the previous artifact when staged promotion fails", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "validex-typescript-rollback-"),
  );
  const outputDirectory = join(root, "dist");
  const stagingDirectory = join(root, ".dist-staging-test");
  await mkdir(outputDirectory);
  await mkdir(stagingDirectory);
  await writeFile(join(outputDirectory, "sentinel.txt"), "previous\n");
  await writeFile(join(stagingDirectory, "sentinel.txt"), "next\n");

  let renameCount = 0;
  await assert.rejects(
    commitStagedDirectory(stagingDirectory, outputDirectory, {
      replace: true,
      renameEntry: async (source, destination) => {
        renameCount += 1;
        if (renameCount === 2) {
          const error = new Error("simulated staging promotion failure");
          error.code = "EIO";
          throw error;
        }
        await rename(source, destination);
      },
    }),
    /simulated staging promotion failure/,
  );

  assert.equal(
    await readFile(join(outputDirectory, "sentinel.txt"), "utf8"),
    "previous\n",
  );
  assert.equal(
    await readFile(join(stagingDirectory, "sentinel.txt"), "utf8"),
    "next\n",
  );
  assert.deepEqual(
    (await readdir(root)).filter((entry) =>
      entry.startsWith(".dist-backup") ||
      entry === ".dist-swap.json"
    ),
    [],
  );
});

test("preserves the backup when an unexpected output blocks recovery", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "validex-typescript-blocked-recovery-"),
  );
  const outputDirectory = join(root, "dist");
  const backupDirectory = join(root, ".dist-backup");
  const stagingDirectory = join(root, ".dist-staging-test");
  await mkdir(outputDirectory);
  await mkdir(stagingDirectory);
  await writeFile(join(outputDirectory, "sentinel.txt"), "previous\n");
  await writeFile(join(stagingDirectory, "sentinel.txt"), "next\n");

  let renameCount = 0;
  await assert.rejects(
    commitStagedDirectory(stagingDirectory, outputDirectory, {
      replace: true,
      renameEntry: async (source, destination) => {
        renameCount += 1;
        if (renameCount === 2) {
          await mkdir(destination);
          await writeFile(join(destination, "sentinel.txt"), "unexpected\n");
          throw new Error("simulated staging promotion failure");
        }
        await rename(source, destination);
      },
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /backup preserved/);
      assert.equal(error.errors.length, 2);
      return true;
    },
  );

  assert.equal(
    await readFile(join(backupDirectory, "sentinel.txt"), "utf8"),
    "previous\n",
  );
  assert.equal(
    await readFile(join(outputDirectory, "sentinel.txt"), "utf8"),
    "unexpected\n",
  );
  assert.equal(
    await readFile(join(stagingDirectory, "sentinel.txt"), "utf8"),
    "next\n",
  );
});

test("recovers a verified orphan backup before the next promotion", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "validex-typescript-recovery-"),
  );
  const outputDirectory = join(root, "dist");
  const backupDirectory = join(root, ".dist-backup");
  const orphanedStaging = join(root, ".dist-staging-orphan");
  const currentStaging = join(root, ".dist-staging-current");
  await mkdir(backupDirectory);
  await mkdir(orphanedStaging);
  await mkdir(currentStaging);
  await writeFile(join(backupDirectory, "sentinel.txt"), "previous\n");
  await writeFile(join(orphanedStaging, "sentinel.txt"), "interrupted\n");
  await writeFile(join(currentStaging, "sentinel.txt"), "next\n");
  await writeFile(
    join(root, ".dist-swap.json"),
    `${JSON.stringify({
      backupName: ".dist-backup",
      outputName: "dist",
      previousIdentity: await directoryIdentity(backupDirectory),
      stagingIdentity: await directoryIdentity(orphanedStaging),
      stagingName: ".dist-staging-orphan",
      transaction: "00000000-0000-4000-8000-000000000000",
      version: 1,
    })}\n`,
  );

  await commitStagedDirectory(currentStaging, outputDirectory, {
    replace: true,
  });

  assert.equal(
    await readFile(join(outputDirectory, "sentinel.txt"), "utf8"),
    "next\n",
  );
  assert.deepEqual(
    (await readdir(root)).filter((entry) =>
      entry.startsWith(".dist-backup") ||
      entry.startsWith(".dist-staging-") ||
      entry === ".dist-swap.json"
    ),
    [],
  );
});

test("preserves an unverified deterministic backup", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "validex-typescript-unverified-backup-"),
  );
  const outputDirectory = join(root, "dist");
  const backupDirectory = join(root, ".dist-backup");
  const stagingDirectory = join(root, ".dist-staging-current");
  await mkdir(outputDirectory);
  await mkdir(backupDirectory);
  await mkdir(stagingDirectory);
  await writeFile(join(outputDirectory, "sentinel.txt"), "current\n");
  await writeFile(join(backupDirectory, "sentinel.txt"), "unknown\n");

  await assert.rejects(
    commitStagedDirectory(stagingDirectory, outputDirectory, {
      replace: true,
    }),
    /refusing to remove an unverified artifact backup/,
  );
  assert.equal(
    await readFile(join(backupDirectory, "sentinel.txt"), "utf8"),
    "unknown\n",
  );
});

test("refuses to replace a non-directory output entry", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "validex-typescript-safe-swap-"),
  );
  const outputDirectory = join(root, "dist");
  const stagingDirectory = join(root, ".dist-staging-test");
  await writeFile(outputDirectory, "keep\n");
  await mkdir(stagingDirectory);

  await assert.rejects(
    commitStagedDirectory(stagingDirectory, outputDirectory, {
      replace: true,
    }),
    /artifact output is not a regular directory/,
  );
  assert.equal(await readFile(outputDirectory, "utf8"), "keep\n");
});
