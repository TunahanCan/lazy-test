#!/usr/bin/env node

import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { packageStaticSite } from "./package-typescript.mjs";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
export const defaultProjectRoot = resolve(scriptsDirectory, "..");

function isContained(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent !== "" &&
    pathFromParent !== ".." &&
    !pathFromParent.startsWith(
      `..${process.platform === "win32" ? "\\" : "/"}`,
    ) &&
    !isAbsolute(pathFromParent)
  );
}

async function pathInformation(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function requireRegularFile(path, label) {
  let information;
  try {
    information = await stat(path);
  } catch {
    throw new Error(`${label} does not exist: ${path}`);
  }
  if (!information.isFile()) {
    throw new Error(`${label} is not a regular file: ${path}`);
  }
}

export function buildPaths(
  projectRoot = defaultProjectRoot,
  { development = false } = {},
) {
  const root = resolve(projectRoot);
  const buildDirectory = join(root, ".typescript-build");
  const emitDirectory = join(
    buildDirectory,
    development ? "dev-esm" : "esm",
  );
  const outputDirectory = join(
    root,
    development ? ".dev-dist" : "dist",
  );
  return {
    buildDirectory,
    compiler: join(
      root,
      "..",
      "node_modules",
      "typescript",
      "bin",
      "tsc",
    ),
    config: join(root, "tsconfig.typescript-only.json"),
    emitDirectory,
    lockDirectory: join(
      buildDirectory,
      development ? ".dev-build-lock" : ".build-lock",
    ),
    outputDirectory,
    projectRoot: root,
    publicDirectory: join(root, "public"),
    stylesheet: join(root, "src", "styles.css"),
  };
}

async function prepareBuildParent(paths) {
  if (
    !isContained(paths.projectRoot, paths.buildDirectory) ||
    !isContained(paths.projectRoot, paths.emitDirectory) ||
    dirname(paths.emitDirectory) !== paths.buildDirectory
  ) {
    throw new Error("refusing to clean an unsafe TypeScript emit path");
  }

  const buildInformation = await pathInformation(paths.buildDirectory);
  if (buildInformation?.isSymbolicLink()) {
    throw new Error(
      `refusing to clean through a symbolic link: ${paths.buildDirectory}`,
    );
  }
  if (buildInformation && !buildInformation.isDirectory()) {
    throw new Error(
      `TypeScript build parent is not a directory: ${paths.buildDirectory}`,
    );
  }

  const emitInformation = await pathInformation(paths.emitDirectory);
  if (emitInformation?.isSymbolicLink()) {
    throw new Error(
      `refusing to clean a symbolic link: ${paths.emitDirectory}`,
    );
  }
  if (emitInformation && !emitInformation.isDirectory()) {
    throw new Error(
      `TypeScript emit path is not a directory: ${paths.emitDirectory}`,
    );
  }

  await mkdir(paths.buildDirectory, { recursive: true });
}

/**
 * Removes only the fixed TypeScript emit directory. A symlinked build parent
 * is rejected so recursive deletion can never cross the project boundary.
 */
export async function cleanEmitDirectory(
  projectRoot = defaultProjectRoot,
  { development = false } = {},
) {
  const paths = buildPaths(projectRoot, { development });
  await prepareBuildParent(paths);
  await rm(paths.emitDirectory, { force: true, recursive: true });
}

async function lockIsStale(lockDirectory, staleMilliseconds) {
  let information;
  try {
    information = await lstat(lockDirectory);
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new Error(
      `unsafe TypeScript build lock entry: ${lockDirectory}`,
    );
  }

  try {
    const owner = JSON.parse(
      await readFile(join(lockDirectory, "owner.json"), "utf8"),
    );
    if (Number.isInteger(owner.pid) && owner.pid > 0) {
      try {
        process.kill(owner.pid, 0);
        return false;
      } catch (error) {
        if (error?.code === "ESRCH") return true;
        if (error?.code === "EPERM") return false;
        throw error;
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) {
      throw error;
    }
  }
  return Date.now() - information.mtimeMs > staleMilliseconds;
}

/**
 * Serializes builds within the selected production or development output
 * tree. The trees use separate locks because their emit and artifact paths are
 * disjoint. The owner token prevents an old releaser from deleting a newer
 * process's lock.
 */
export async function acquireBuildLock(
  projectRoot = defaultProjectRoot,
  {
    development = false,
    pollMilliseconds = 50,
    staleMilliseconds = 5 * 60_000,
    timeoutMilliseconds = 60_000,
  } = {},
) {
  const paths = buildPaths(projectRoot, { development });
  await prepareBuildParent(paths);
  const token = randomUUID();
  const startedAt = Date.now();

  while (true) {
    try {
      await mkdir(paths.lockDirectory);
      try {
        await writeFile(
          join(paths.lockDirectory, "owner.json"),
          JSON.stringify({
            pid: process.pid,
            startedAt: new Date().toISOString(),
            token,
          }),
          "utf8",
        );
      } catch (error) {
        await rm(paths.lockDirectory, {
          force: true,
          recursive: true,
        });
        throw error;
      }
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (
        await lockIsStale(
          paths.lockDirectory,
          staleMilliseconds,
        )
      ) {
        await rm(paths.lockDirectory, {
          force: true,
          recursive: true,
        });
        continue;
      }
      if (Date.now() - startedAt >= timeoutMilliseconds) {
        throw new Error(
          `timed out waiting for TypeScript build lock: ${paths.lockDirectory}`,
        );
      }
      await delay(pollMilliseconds);
    }
  }

  let released = false;
  return {
    path: paths.lockDirectory,
    async release() {
      if (released) return;
      released = true;
      try {
        const owner = JSON.parse(
          await readFile(
            join(paths.lockDirectory, "owner.json"),
            "utf8",
          ),
        );
        if (owner.token !== token) return;
      } catch (error) {
        if (error?.code === "ENOENT") return;
        throw error;
      }
      await rm(paths.lockDirectory, {
        force: true,
        recursive: true,
      });
    },
  };
}

export function runProcess(
  executable,
  argumentsList,
  {
    cwd,
    environment = process.env,
    stdio = "inherit",
  } = {},
) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, argumentsList, {
      cwd,
      env: environment,
      stdio,
    });
    let standardError = "";
    if (child.stdout) child.stdout.resume();
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        if (standardError.length < 16_384) {
          standardError += chunk.slice(
            0,
            16_384 - standardError.length,
          );
        }
      });
    }
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      const outcome = signal
        ? `signal ${signal}`
        : `exit code ${code ?? "unknown"}`;
      rejectPromise(
        new Error(
          `TypeScript compiler failed with ${outcome}${
            standardError.trim()
              ? `: ${standardError.trim()}`
              : ""
          }`,
        ),
      );
    });
  });
}

async function emittedFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, {
    withFileTypes: true,
  })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `symbolic links are not allowed in compiler output: ${path}`,
      );
    }
    if (entry.isDirectory()) {
      files.push(...(await emittedFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    } else {
      throw new Error(`unsupported compiler output entry: ${path}`);
    }
  }
  return files;
}

async function assertNoProductionSourceMaps(emitDirectory) {
  const files = await emittedFiles(emitDirectory);
  for (const file of files) {
    if (file.endsWith(".map")) {
      throw new Error(
        `production compiler output contains a source map: ${file}`,
      );
    }
    if (!file.endsWith(".js") && !file.endsWith(".mjs")) continue;
    const source = await readFile(file, "utf8");
    if (/^[ \t]*\/\/[#@]\s*sourceMappingURL=/m.test(source)) {
      throw new Error(
        `production compiler output references a source map: ${file}`,
      );
    }
  }
}

export async function buildTypeScriptSite({
  development = false,
  lockTimeoutMilliseconds = 60_000,
  projectRoot = defaultProjectRoot,
  sourceMaps = development,
  stdio = "inherit",
} = {}) {
  if (!development && sourceMaps) {
    throw new Error(
      "source maps are allowed only for a development artifact",
    );
  }
  const paths = buildPaths(projectRoot, { development });
  await requireRegularFile(
    paths.compiler,
    "local TypeScript compiler",
  );
  await requireRegularFile(paths.config, "TypeScript config");
  await requireRegularFile(paths.stylesheet, "application stylesheet");
  const lock = await acquireBuildLock(paths.projectRoot, {
    development,
    timeoutMilliseconds: lockTimeoutMilliseconds,
  });
  try {
    await cleanEmitDirectory(paths.projectRoot, { development });

    await runProcess(
      process.execPath,
      [
        paths.compiler,
        "-p",
        paths.config,
        "--outDir",
        paths.emitDirectory,
        "--sourceMap",
        String(sourceMaps),
        "--inlineSources",
        String(sourceMaps),
      ],
      {
        cwd: paths.projectRoot,
        stdio,
      },
    );

    if (!sourceMaps) {
      await assertNoProductionSourceMaps(paths.emitDirectory);
    }

    const result = await packageStaticSite({
      emitDirectory: paths.emitDirectory,
      entry: "main.js",
      language: "en",
      outputDirectory: paths.outputDirectory,
      production: !development,
      publicDirectory: paths.publicDirectory,
      replace: true,
      rootID: "root",
      styles: [paths.stylesheet],
      title: "Validex",
    });

    return {
      ...result,
      compiler: paths.compiler,
      emitDirectory: paths.emitDirectory,
    };
  } finally {
    await lock.release();
  }
}

async function main() {
  try {
    const result = await buildTypeScriptSite();
    process.stdout.write(
      `Built ${result.moduleCount} browser-native modules at ${result.outputDirectory}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `typescript-build: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  await main();
}
