#!/usr/bin/env node

import {
  createReadStream,
  watch as watchFileSystem,
} from "node:fs";
import {
  lstat,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildTypeScriptSite,
  defaultProjectRoot,
} from "./build.mjs";

const defaultHost = "127.0.0.1";
const defaultPort = 34_116;
const defaultDebounceMilliseconds = 120;

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
]);

function usage() {
  return `Usage:
  node scripts/dev.mjs [--host <host>] [--port <port>]

Options:
  --host <host>         Listen host (default: ${defaultHost})
  --port <port>         Listen port (default: ${defaultPort})
  --debounce <ms>       Rebuild debounce interval (default: ${defaultDebounceMilliseconds})
  --no-watch            Build and serve without watching files
  --help                Show this help`;
}

function optionValue(argumentsList, index, option) {
  const value = argumentsList[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parseInteger(value, option, minimum, maximum) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${option} must be an integer`);
  }
  const number = Number(value);
  if (
    !Number.isSafeInteger(number) ||
    number < minimum ||
    number > maximum
  ) {
    throw new Error(
      `${option} must be between ${minimum} and ${maximum}`,
    );
  }
  return number;
}

export function parseDevArguments(argumentsList) {
  const options = {
    debounceMilliseconds: defaultDebounceMilliseconds,
    help: false,
    host: defaultHost,
    port: defaultPort,
    watch: true,
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    const equalsIndex = argument.indexOf("=");
    const name =
      equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument;
    const inlineValue =
      equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : undefined;
    switch (name) {
      case "--host": {
        const value =
          inlineValue ?? optionValue(argumentsList, index, name);
        if (inlineValue === undefined) index += 1;
        if (
          !value ||
          /[\s/\\\0]/.test(value)
        ) {
          throw new Error("--host must be a valid host name or address");
        }
        options.host = value;
        break;
      }
      case "--port": {
        const value =
          inlineValue ?? optionValue(argumentsList, index, name);
        if (inlineValue === undefined) index += 1;
        options.port = parseInteger(
          value,
          "--port",
          1,
          65_535,
        );
        break;
      }
      case "--debounce": {
        const value =
          inlineValue ?? optionValue(argumentsList, index, name);
        if (inlineValue === undefined) index += 1;
        options.debounceMilliseconds = parseInteger(
          value,
          "--debounce",
          10,
          10_000,
        );
        break;
      }
      case "--no-watch":
        if (inlineValue !== undefined) {
          throw new Error("--no-watch does not accept a value");
        }
        options.watch = false;
        break;
      case "--help":
        if (inlineValue !== undefined) {
          throw new Error("--help does not accept a value");
        }
        options.help = true;
        break;
      default:
        throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

export function createRebuildScheduler(
  rebuild,
  {
    delay = defaultDebounceMilliseconds,
    onError = (error) => {
      process.stderr.write(
        `typescript-dev rebuild failed: ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
    },
  } = {},
) {
  let closed = false;
  let pending = false;
  let running = false;
  let timer;
  const idleResolvers = new Set();

  const resolveIdle = () => {
    if (timer || running || pending) return;
    for (const resolvePromise of idleResolvers) resolvePromise();
    idleResolvers.clear();
  };

  const execute = async () => {
    timer = undefined;
    if (closed) {
      pending = false;
      resolveIdle();
      return;
    }
    if (running) {
      pending = true;
      return;
    }
    running = true;
    pending = false;
    try {
      await rebuild();
    } catch (error) {
      onError(error);
    } finally {
      running = false;
      if (pending && !closed) {
        timer = setTimeout(execute, delay);
      } else {
        pending = false;
        resolveIdle();
      }
    }
  };

  return {
    schedule() {
      if (closed) return;
      pending = true;
      if (running) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(execute, delay);
    },
    waitForIdle() {
      if (!timer && !running && !pending) return Promise.resolve();
      return new Promise((resolvePromise) => {
        idleResolvers.add(resolvePromise);
      });
    },
    close() {
      if (closed) return;
      closed = true;
      pending = false;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      resolveIdle();
    },
  };
}

async function pathInformation(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function directoriesInTree(root) {
  const information = await pathInformation(root);
  if (!information) return [];
  if (information.isSymbolicLink()) {
    throw new Error(`refusing to watch a symbolic link: ${root}`);
  }
  if (!information.isDirectory()) {
    throw new Error(`watch root is not a directory: ${root}`);
  }

  const directories = [root];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      directories.push(...(await directoriesInTree(join(root, entry.name))));
    }
  }
  return directories;
}

/**
 * Cross-platform recursive watching built from non-recursive fs.watch
 * instances. Rename events rescan the tree so newly created directories are
 * observed without relying on platform-specific recursive watch support.
 */
export async function watchProjectSources(
  projectRoot,
  onChange,
  {
    onError = (error) => {
      process.stderr.write(
        `typescript-dev watcher failed: ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
    },
  } = {},
) {
  const root = resolve(projectRoot);
  const directoryRoots = [
    join(root, "src"),
    join(root, "public"),
  ];
  const watchedDirectories = new Map();
  let closed = false;
  let refreshTimer;
  let refreshing;

  const refresh = async () => {
    if (closed) return;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const desired = new Set();
        for (const watchRoot of directoryRoots) {
          for (const directory of await directoriesInTree(watchRoot)) {
            desired.add(directory);
          }
        }
        for (const [directory, watcher] of watchedDirectories) {
          if (desired.has(directory)) continue;
          watcher.close();
          watchedDirectories.delete(directory);
        }
        for (const directory of desired) {
          if (watchedDirectories.has(directory)) continue;
          const watcher = watchFileSystem(
            directory,
            { persistent: true },
            (eventType, filename) => {
              if (closed) return;
              const changedPath = filename
                ? join(directory, String(filename))
                : directory;
              onChange(changedPath);
              if (eventType === "rename") {
                if (refreshTimer) clearTimeout(refreshTimer);
                refreshTimer = setTimeout(() => {
                  refreshTimer = undefined;
                  void refresh();
                }, 25);
              }
            },
          );
          watcher.on("error", onError);
          watchedDirectories.set(directory, watcher);
        }
      } finally {
        refreshing = undefined;
      }
    })();
    return refreshing;
  };

  await refresh();

  const configPath = join(root, "tsconfig.typescript-only.json");
  const configWatcher = watchFileSystem(
    root,
    { persistent: true },
    (_eventType, filename) => {
      if (
        !closed &&
        filename &&
        basename(String(filename)) === basename(configPath)
      ) {
        onChange(configPath);
      }
    },
  );
  configWatcher.on("error", onError);

  return {
    close() {
      if (closed) return;
      closed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      configWatcher.close();
      for (const watcher of watchedDirectories.values()) {
        watcher.close();
      }
      watchedDirectories.clear();
    },
  };
}

export async function enableDevelopmentMode(outputDirectory) {
  const indexPath = join(resolve(outputDirectory), "index.html");
  const source = await readFile(indexPath, "utf8");
  const assignment =
    "    <script>window.__VALIDEX_DEV__ = true;</script>";
  const existingExpression =
    /^[ \t]*<script>window\.__VALIDEX_DEV__\s*=\s*true;<\/script>[ \t]*$/m;
  const next = existingExpression.test(source)
    ? source.replace(existingExpression, assignment)
    : source.replace(
        /^([ \t]*<script\s+type=["']module["'])/m,
        `${assignment}\n$1`,
      );
  if (next === source && !existingExpression.test(source)) {
    throw new Error(
      `could not locate the module script in ${indexPath}`,
    );
  }

  const temporaryPath = join(
    dirname(indexPath),
    `.index.html-dev-${process.pid}-${randomUUID()}`,
  );
  try {
    await writeFile(temporaryPath, next, "utf8");
    await rename(temporaryPath, indexPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return indexPath;
}

class StaticRequestError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function decodedPathSegments(requestURL) {
  const rawPath = String(requestURL || "/").split(/[?#]/, 1)[0];
  if (!rawPath.startsWith("/")) {
    throw new StaticRequestError(400, "Invalid request target");
  }
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new StaticRequestError(400, "Malformed URL encoding");
  }
  if (decoded.includes("\0")) {
    throw new StaticRequestError(400, "Invalid path");
  }
  const segments = decoded
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment && segment !== ".");
  if (segments.includes("..")) {
    throw new StaticRequestError(403, "Path traversal is forbidden");
  }
  return segments;
}

function isWithinOrEqual(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent === "" ||
    (pathFromParent !== ".." &&
      !pathFromParent.startsWith(
        `..${process.platform === "win32" ? "\\" : "/"}`,
      ) &&
      !isAbsolute(pathFromParent))
  );
}

async function staticFile(rootDirectory, requestURL) {
  const root = await realpath(resolve(rootDirectory));
  const segments = decodedPathSegments(requestURL);
  let candidate = join(root, ...segments);
  let information;
  try {
    information = await stat(candidate);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      throw new StaticRequestError(404, "Not found");
    }
    throw error;
  }
  if (information.isDirectory()) {
    candidate = join(candidate, "index.html");
  }

  let canonical;
  try {
    canonical = await realpath(candidate);
    information = await stat(canonical);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      throw new StaticRequestError(404, "Not found");
    }
    throw error;
  }
  if (!isWithinOrEqual(root, canonical)) {
    throw new StaticRequestError(403, "Path traversal is forbidden");
  }
  if (!information.isFile()) {
    throw new StaticRequestError(404, "Not found");
  }
  return { information, path: canonical };
}

function etagFor(information) {
  return `W/"${information.size.toString(16)}-${Math.trunc(
    information.mtimeMs,
  ).toString(16)}"`;
}

function isFresh(request, etag, information) {
  const ifNoneMatch = request.headers["if-none-match"];
  if (ifNoneMatch) {
    const weakValue = (value) => value.replace(/^W\//, "");
    const current = weakValue(etag);
    return ifNoneMatch
      .split(",")
      .map((value) => value.trim())
      .some(
        (value) =>
          value === "*" || weakValue(value) === current,
      );
  }
  const ifModifiedSince = request.headers["if-modified-since"];
  if (!ifModifiedSince) return false;
  const since = Date.parse(ifModifiedSince);
  return (
    Number.isFinite(since) &&
    Math.trunc(information.mtimeMs / 1000) * 1000 <= since
  );
}

function sendError(request, response, statusCode, message) {
  const body = `${message}\n`;
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

export async function serveStaticRequest(
  rootDirectory,
  request,
  response,
) {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendError(request, response, 405, "Method not allowed");
    return;
  }

  try {
    const file = await staticFile(rootDirectory, request.url ?? "/");
    const etag = etagFor(file.information);
    const headers = {
      "Cache-Control": "no-cache, must-revalidate",
      "Content-Length": file.information.size,
      "Content-Type":
        contentTypes.get(extname(file.path).toLowerCase()) ??
        "application/octet-stream",
      ETag: etag,
      "Last-Modified": file.information.mtime.toUTCString(),
      "X-Content-Type-Options": "nosniff",
    };
    if (isFresh(request, etag, file.information)) {
      delete headers["Content-Length"];
      response.writeHead(304, headers);
      response.end();
      return;
    }
    response.writeHead(200, headers);
    if (method === "HEAD") {
      response.end();
      return;
    }
    const stream = createReadStream(file.path);
    stream.once("error", (error) => {
      response.destroy(error);
    });
    stream.pipe(response);
  } catch (error) {
    if (error instanceof StaticRequestError) {
      sendError(
        request,
        response,
        error.statusCode,
        error.message,
      );
      return;
    }
    sendError(request, response, 500, "Internal server error");
  }
}

export function createStaticServer({ rootDirectory }) {
  const root = resolve(rootDirectory);
  return createServer((request, response) => {
    void serveStaticRequest(root, request, response);
  });
}

function listen(server, host, port) {
  return new Promise((resolvePromise, rejectPromise) => {
    const onError = (error) => {
      server.off("listening", onListening);
      rejectPromise(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolvePromise();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host, port, exclusive: true });
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error) rejectPromise(error);
      else resolvePromise();
    });
  });
}

function displayHost(host) {
  return host.includes(":") && !host.startsWith("[")
    ? `[${host}]`
    : host;
}

export async function startDevServer({
  build = ({ projectRoot: root }) =>
    buildTypeScriptSite({
      development: true,
      projectRoot: root,
      sourceMaps: true,
    }),
  debounceMilliseconds = defaultDebounceMilliseconds,
  host = defaultHost,
  logger = console,
  port = defaultPort,
  projectRoot = defaultProjectRoot,
  watch = true,
} = {}) {
  const root = resolve(projectRoot);
  const outputDirectory = join(root, ".dev-dist");
  const runBuild = async () => {
    await build({ projectRoot: root });
    await enableDevelopmentMode(outputDirectory);
  };

  await runBuild();
  const server = createStaticServer({ rootDirectory: outputDirectory });
  const scheduler = createRebuildScheduler(
    async () => {
      logger.info?.("Source changed; rebuilding TypeScript frontend…");
      await runBuild();
      logger.info?.("TypeScript frontend rebuilt.");
    },
    {
      delay: debounceMilliseconds,
      onError: (error) => {
        logger.error?.(
          `TypeScript rebuild failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      },
    },
  );
  let sourceWatcher;
  try {
    if (watch) {
      sourceWatcher = await watchProjectSources(
        root,
        () => scheduler.schedule(),
        {
          onError: (error) =>
            logger.error?.(
              `Source watcher failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            ),
        },
      );
    }
    await listen(server, host, port);
  } catch (error) {
    sourceWatcher?.close();
    scheduler.close();
    await closeServer(server);
    throw error;
  }

  const address = server.address();
  const selectedPort =
    typeof address === "object" && address ? address.port : port;
  let closePromise;
  const handle = {
    host,
    port: selectedPort,
    server,
    url: `http://${displayHost(host)}:${selectedPort}`,
    close() {
      if (closePromise) return closePromise;
      closePromise = (async () => {
        sourceWatcher?.close();
        scheduler.close();
        await Promise.all([
          scheduler.waitForIdle(),
          closeServer(server),
        ]);
      })();
      return closePromise;
    },
  };
  return handle;
}

async function main() {
  try {
    const options = parseDevArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const server = await startDevServer(options);
    process.stdout.write(
      `TypeScript development server listening at ${server.url}\n`,
    );
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      void server.close().catch((error) => {
        process.stderr.write(
          `typescript-dev shutdown failed: ${
            error instanceof Error ? error.message : String(error)
          }\n`,
        );
        process.exitCode = 1;
      });
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    await new Promise((resolvePromise) => {
      server.server.once("close", resolvePromise);
    });
  } catch (error) {
    process.stderr.write(
      `typescript-dev: ${
        error instanceof Error ? error.message : String(error)
      }\n\n${usage()}\n`,
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
