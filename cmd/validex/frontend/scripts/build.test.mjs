import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  acquireBuildLock,
  buildTypeScriptSite,
  cleanEmitDirectory,
} from "./build.mjs";

const fakeCompiler = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.writeFileSync(
  path.join(process.cwd(), "compiler-args.json"),
  JSON.stringify(args),
);
const emit = path.resolve(
  process.cwd(),
  args[args.indexOf("--outDir") + 1],
);
fs.mkdirSync(path.join(emit, "features"), { recursive: true });
const sourceMaps =
  args[args.indexOf("--sourceMap") + 1] === "true";
fs.writeFileSync(
  path.join(emit, "main.js"),
  'import { value } from "./features/value.js";\n' +
    'document.getElementById("root").textContent = value;\n' +
    (sourceMaps ? "//# sourceMappingURL=main.js.map\n" : ""),
);
fs.writeFileSync(
  path.join(emit, "features", "value.js"),
  'export const value = "Validex";\n',
);
if (sourceMaps) {
  fs.writeFileSync(
    path.join(emit, "main.js.map"),
    JSON.stringify({ version: 3, sources: ["main.ts"], mappings: "" }),
  );
}
`;

async function buildFixture() {
  const packageRoot = await mkdtemp(
    join(tmpdir(), "validex-typescript-build-"),
  );
  const root = join(packageRoot, "frontend");
  await mkdir(
    join(packageRoot, "node_modules", "typescript", "bin"),
    { recursive: true },
  );
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "public"));
  await mkdir(join(root, ".typescript-build", "esm"), {
    recursive: true,
  });
  await mkdir(join(root, "dist"));
  await writeFile(
    join(packageRoot, "node_modules", "typescript", "bin", "tsc"),
    fakeCompiler,
  );
  await writeFile(
    join(root, "tsconfig.typescript-only.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        outDir: ".typescript-build/esm",
      },
    }),
  );
  await writeFile(
    join(root, "src", "main.ts"),
    "export {};\n",
  );
  await writeFile(
    join(root, "src", "styles.css"),
    "body { margin: 0; }\n",
  );
  await writeFile(
    join(root, "public", "appicon.svg"),
    "<svg></svg>\n",
  );
  await writeFile(
    join(root, ".typescript-build", "esm", "stale.js"),
    "throw new Error('stale');\n",
  );
  await writeFile(join(root, "dist", "old.txt"), "old\n");
  return root;
}

test("builds a production artifact with npm TypeScript and no source maps", async () => {
  const root = await buildFixture();
  const result = await buildTypeScriptSite({
    projectRoot: root,
    stdio: "pipe",
  });

  assert.equal(result.moduleCount, 2);
  assert.equal(
    await readFile(
      join(root, "dist", "modules", "features", "value.js"),
      "utf8",
    ),
    'export const value = "Validex";\n',
  );
  assert.equal(
    await readFile(
      join(root, "dist", "assets", "styles.css"),
      "utf8",
    ),
    "body { margin: 0; }\n",
  );
  assert.equal(
    await readFile(join(root, "dist", "appicon.svg"), "utf8"),
    "<svg></svg>\n",
  );
  await assert.rejects(
    readFile(join(root, "dist", "old.txt")),
    { code: "ENOENT" },
  );
  await assert.rejects(
    readFile(
      join(root, ".typescript-build", "esm", "stale.js"),
    ),
    { code: "ENOENT" },
  );
  await assert.rejects(
    readFile(join(root, "dist", "modules", "main.js.map")),
    { code: "ENOENT" },
  );

  const compilerArguments = JSON.parse(
    await readFile(join(root, "compiler-args.json"), "utf8"),
  );
  assert.deepEqual(
    compilerArguments.slice(-4),
    ["--sourceMap", "false", "--inlineSources", "false"],
  );
  assert.equal(
    compilerArguments[compilerArguments.indexOf("-p") + 1],
    join(root, "tsconfig.typescript-only.json"),
  );
  assert.equal(
    compilerArguments[compilerArguments.indexOf("--outDir") + 1],
    join(root, ".typescript-build", "esm"),
  );
  assert.doesNotMatch(
    await readFile(join(root, "dist", "index.html"), "utf8"),
    /__VALIDEX_DEV__/,
  );
});

test("can retain compiler source maps for the development build", async () => {
  const root = await buildFixture();
  await buildTypeScriptSite({
    development: true,
    projectRoot: root,
    sourceMaps: true,
    stdio: "pipe",
  });

  assert.equal(
    JSON.parse(
      await readFile(
        join(root, ".dev-dist", "modules", "main.js.map"),
        "utf8",
      ),
    ).version,
    3,
  );
  assert.equal(
    await readFile(join(root, "dist", "old.txt"), "utf8"),
    "old\n",
  );
  assert.equal(
    await readFile(
      join(root, ".typescript-build", "esm", "stale.js"),
      "utf8",
    ),
    "throw new Error('stale');\n",
  );
});

test("preserves the previous artifact when the compiler fails", async () => {
  const root = await buildFixture();
  await writeFile(
    join(
      root,
      "..",
      "node_modules",
      "typescript",
      "bin",
      "tsc",
    ),
    "process.exit(7);\n",
  );

  await assert.rejects(
    buildTypeScriptSite({
      projectRoot: root,
      stdio: "pipe",
    }),
    /exit code 7/,
  );
  assert.equal(
    await readFile(join(root, "dist", "old.txt"), "utf8"),
    "old\n",
  );
});

test("refuses to recursively clean through a symlinked build parent", async (context) => {
  const root = await mkdtemp(
    join(tmpdir(), "validex-typescript-clean-"),
  );
  const external = await mkdtemp(
    join(tmpdir(), "validex-typescript-external-"),
  );
  await mkdir(join(external, "esm"));
  await writeFile(join(external, "esm", "sentinel.txt"), "keep\n");
  try {
    await symlink(external, join(root, ".typescript-build"), "dir");
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") {
      context.skip("directory symlinks are not available");
      return;
    }
    throw error;
  }

  await assert.rejects(
    cleanEmitDirectory(root),
    /symbolic link/,
  );
  assert.equal(
    await readFile(join(external, "esm", "sentinel.txt"), "utf8"),
    "keep\n",
  );
});

test("serializes builds that share an emit directory", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "validex-typescript-lock-"),
  );
  const first = await acquireBuildLock(root);
  let secondAcquired = false;
  const secondPromise = acquireBuildLock(root, {
    pollMilliseconds: 5,
    timeoutMilliseconds: 1_000,
  }).then((lock) => {
    secondAcquired = true;
    return lock;
  });

  await new Promise((resolvePromise) =>
    setTimeout(resolvePromise, 25),
  );
  assert.equal(secondAcquired, false);

  await first.release();
  const second = await secondPromise;
  assert.equal(secondAcquired, true);
  await second.release();
});
