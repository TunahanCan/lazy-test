import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createRebuildScheduler,
  createStaticServer,
  enableDevelopmentMode,
  parseDevArguments,
  startDevServer,
  watchProjectSources,
} from "./dev.mjs";

function listen(server) {
  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(
      { host: "127.0.0.1", port: 0, exclusive: true },
      () => resolvePromise(),
    );
  });
}

function close(server) {
  return new Promise((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error) rejectPromise(error);
      else resolvePromise();
    });
  });
}

function get(server, path, { headers = {}, method = "GET" } = {}) {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return new Promise((resolvePromise, rejectPromise) => {
    const request = httpRequest(
      {
        headers,
        host: "127.0.0.1",
        method,
        path,
        port: address.port,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolvePromise({
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers,
            status: response.statusCode,
          });
        });
      },
    );
    request.once("error", rejectPromise);
    request.end();
  });
}

async function staticFixture() {
  const root = await mkdtemp(join(tmpdir(), "validex-dev-static-"));
  const output = join(root, "dist");
  await mkdir(join(output, "modules"), { recursive: true });
  await mkdir(join(output, "assets"));
  await writeFile(
    join(output, "index.html"),
    '<!doctype html>\n<div id="root"></div>\n' +
      '<script type="module" src="./modules/main.js"></script>\n',
  );
  await writeFile(
    join(output, "modules", "main.js"),
    'document.body.dataset.ready = "true";\n',
  );
  await writeFile(
    join(output, "assets", "styles.css"),
    "body { margin: 0; }\n",
  );
  await writeFile(join(root, "secret.txt"), "outside\n");
  return { output, root };
}

test("parses host, port, debounce and watch arguments", () => {
  assert.deepEqual(
    parseDevArguments([
      "--host=localhost",
      "--port",
      "4123",
      "--debounce=45",
      "--no-watch",
    ]),
    {
      debounceMilliseconds: 45,
      help: false,
      host: "localhost",
      port: 4123,
      watch: false,
    },
  );
  assert.throws(
    () => parseDevArguments(["--port", "70000"]),
    /between 1 and 65535/,
  );
  assert.throws(
    () => parseDevArguments(["--host", "../remote"]),
    /valid host/,
  );
});

test("injects the development flag before the module and is idempotent", async () => {
  const fixture = await staticFixture();
  await enableDevelopmentMode(fixture.output);
  await enableDevelopmentMode(fixture.output);
  const source = await readFile(
    join(fixture.output, "index.html"),
    "utf8",
  );

  assert.equal(
    source.match(/window\.__VALIDEX_DEV__/g)?.length,
    1,
  );
  assert.ok(
    source.indexOf("window.__VALIDEX_DEV__") <
      source.indexOf('type="module"'),
  );
});

test("serves GET and HEAD with revalidation while rejecting traversal", async () => {
  const fixture = await staticFixture();
  const server = createStaticServer({
    rootDirectory: fixture.output,
  });
  await listen(server);
  try {
    const index = await get(server, "/");
    assert.equal(index.status, 200);
    assert.match(index.body, /modules\/main\.js/);
    assert.equal(
      index.headers["content-type"],
      "text/html; charset=utf-8",
    );
    assert.equal(
      index.headers["cache-control"],
      "no-cache, must-revalidate",
    );
    assert.ok(index.headers.etag);

    const fresh = await get(server, "/", {
      headers: { "If-None-Match": index.headers.etag },
    });
    assert.equal(fresh.status, 304);
    assert.equal(fresh.body, "");

    const weaklyMatching = await get(server, "/", {
      headers: {
        "If-None-Match": index.headers.etag.replace(/^W\//, ""),
      },
    });
    assert.equal(weaklyMatching.status, 304);

    const head = await get(server, "/assets/styles.css", {
      method: "HEAD",
    });
    assert.equal(head.status, 200);
    assert.equal(head.body, "");
    assert.equal(
      head.headers["content-type"],
      "text/css; charset=utf-8",
    );

    const traversal = await get(
      server,
      "/..%2Fsecret.txt",
    );
    assert.equal(traversal.status, 403);
    assert.doesNotMatch(traversal.body, /outside/);

    const malformed = await get(server, "/%E0%A4%A");
    assert.equal(malformed.status, 400);

    const missing = await get(server, "/missing.js");
    assert.equal(missing.status, 404);

    const post = await get(server, "/", { method: "POST" });
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, "GET, HEAD");
  } finally {
    await close(server);
  }
});

test("debounces rebuilds and queues a change received during a build", async () => {
  let builds = 0;
  let releaseFirst;
  const firstBuild = new Promise((resolvePromise) => {
    releaseFirst = resolvePromise;
  });
  const scheduler = createRebuildScheduler(
    async () => {
      builds += 1;
      if (builds === 1) await firstBuild;
    },
    { delay: 10, onError: assert.fail },
  );

  scheduler.schedule();
  scheduler.schedule();
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  assert.equal(builds, 1);
  scheduler.schedule();
  scheduler.schedule();
  releaseFirst();
  await scheduler.waitForIdle();
  assert.equal(builds, 2);
  scheduler.close();
});

test("watches nested source and public changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "validex-dev-watch-"));
  await mkdir(join(root, "src", "features"), {
    recursive: true,
  });
  await mkdir(join(root, "public"));
  await writeFile(
    join(root, "tsconfig.typescript-only.json"),
    "{}\n",
  );
  const featurePath = join(
    root,
    "src",
    "features",
    "feature.ts",
  );
  await writeFile(featurePath, "export const version = 1;\n");
  let resolveChanged;
  let rejectChanged;
  let armed = false;
  const changed = new Promise((resolvePromise, rejectPromise) => {
    resolveChanged = resolvePromise;
    rejectChanged = rejectPromise;
  });
  const timer = setTimeout(
    () => rejectChanged(new Error("watch event timed out")),
    5_000,
  );
  const watcher = await watchProjectSources(
    root,
    (path) => {
      if (!armed || !path.includes(`${join("src", "features")}`)) {
        return;
      }
      clearTimeout(timer);
      resolveChanged(path);
    },
    { onError: rejectChanged },
  );
  try {
    await new Promise((resolvePromise) =>
      setTimeout(resolvePromise, 50),
    );
    armed = true;
    await writeFile(featurePath, "export const version = 2;\n");
    assert.match(await changed, /src/);
  } finally {
    clearTimeout(timer);
    watcher.close();
  }
});

test("builds before listening and serves development HTML", async () => {
  const root = await mkdtemp(join(tmpdir(), "validex-dev-start-"));
  await mkdir(join(root, "src"));
  await mkdir(join(root, "public"));
  await mkdir(join(root, "dist"));
  await writeFile(
    join(root, "dist", "index.html"),
    "<h1>production sentinel</h1>\n",
  );
  await mkdir(join(root, "dist", "modules"));
  await writeFile(
    join(root, "dist", "modules", "main.js"),
    'export const mode = "production";\n',
  );
  let builds = 0;
  const server = await startDevServer({
    build: async () => {
      builds += 1;
      await mkdir(join(root, ".dev-dist", "modules"), {
        recursive: true,
      });
      await writeFile(
        join(root, ".dev-dist", "index.html"),
        '<div id="root"></div>\n' +
          '<script type="module" src="./modules/main.js"></script>\n',
      );
      await writeFile(
        join(root, ".dev-dist", "modules", "main.js"),
        'export const mode = "development";\n' +
          "//# sourceMappingURL=main.js.map\n",
      );
      await writeFile(
        join(root, ".dev-dist", "modules", "main.js.map"),
        JSON.stringify({
          version: 3,
          sources: ["main.ts"],
          sourcesContent: ["export {};"],
          mappings: "",
        }),
      );
    },
    host: "127.0.0.1",
    logger: { error() {}, info() {} },
    port: 0,
    projectRoot: root,
    watch: false,
  });
  try {
    assert.equal(builds, 1);
    const response = await get(server.server, "/");
    assert.equal(response.status, 200);
    assert.match(
      response.body,
      /window\.__VALIDEX_DEV__\s*=\s*true/,
    );
    const sourceMap = await get(
      server.server,
      "/modules/main.js.map",
    );
    assert.equal(sourceMap.status, 200);
    assert.equal(JSON.parse(sourceMap.body).version, 3);
    assert.equal(
      await readFile(join(root, "dist", "index.html"), "utf8"),
      "<h1>production sentinel</h1>\n",
    );
    assert.equal(
      await readFile(
        join(root, "dist", "modules", "main.js"),
        "utf8",
      ),
      'export const mode = "production";\n',
    );
    await assert.rejects(
      readFile(join(root, "dist", "modules", "main.js.map")),
      { code: "ENOENT" },
    );
  } finally {
    await server.close();
  }
});
