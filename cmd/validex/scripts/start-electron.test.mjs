import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  defaultApplicationRoot,
  electronLaunchPlan,
  runChildProcess,
} from "./start-electron.mjs";

const applicationRoot = resolve("/workspace", "cmd", "validex");

test("macOS development launches the branded Validex application bundle", () => {
  const plan = electronLaunchPlan({
    applicationRoot,
    arguments: ["--dev-url=http://127.0.0.1:34116"],
    platform: "darwin",
  });

  assert.equal(
    plan.command,
    join(
      applicationRoot,
      "build",
      "dev",
      "Validex.app",
      "Contents",
      "MacOS",
      "Validex",
    ),
  );
  assert.deepEqual(plan.arguments, [
    applicationRoot,
    "--validex-development-runtime=1",
    "--dev-url=http://127.0.0.1:34116",
  ]);
  assert.deepEqual(plan.preparation?.slice(1), [
    join(applicationRoot, "scripts", "package-electron.mjs"),
    "--development-runtime",
  ]);
  assert.doesNotMatch(plan.command, /Electron\.app|node_modules/);
});

test("non-macOS development keeps the platform Electron launcher", () => {
  const plan = electronLaunchPlan({
    applicationRoot,
    arguments: ["--backend=/tmp/validex-backend"],
    platform: "linux",
  });

  assert.equal(plan.command, process.execPath);
  assert.deepEqual(plan.runtimeArguments, [
    join(applicationRoot, "node_modules", "electron", "cli.js"),
  ]);
  assert.deepEqual(plan.arguments, [
    applicationRoot,
    "--backend=/tmp/validex-backend",
  ]);
  assert.equal(plan.preparation, undefined);
});

test("desktop start scripts never launch the stock Electron bundle directly", async () => {
  const manifest = JSON.parse(
    await readFile(join(defaultApplicationRoot, "package.json"), "utf8"),
  );

  assert.equal(manifest.scripts.start, "node scripts/start-electron.mjs");
  assert.equal(
    manifest.scripts["electron:start"],
    "node scripts/start-electron.mjs",
  );
  assert.match(
    manifest.scripts["electron:dev"],
    /node scripts\/start-electron\.mjs/,
  );
  assert.doesNotMatch(
    `${manifest.scripts.start} ${manifest.scripts["electron:start"]} ${manifest.scripts["electron:dev"]}`,
    /(?:^|\s)electron\s+\./,
  );
});

test("desktop launcher forwards termination signals and removes listeners", async () => {
  const signalSource = new EventEmitter();
  let child;
  const execution = runChildProcess(
    process.execPath,
    [
      "-e",
      [
        'process.once("SIGTERM", () => process.exit(42));',
        'process.stdout.write("ready\\n");',
        "setTimeout(() => process.exit(99), 1500);",
      ].join(""),
    ],
    {
      onSpawn(spawnedChild) {
        child = spawnedChild;
      },
      signalSource,
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  assert.ok(child?.stdout);
  await once(child.stdout, "data");
  signalSource.emit("SIGTERM");

  assert.equal(await execution, 42);
  assert.equal(child.exitCode, 42);
  assert.equal(signalSource.listenerCount("SIGINT"), 0);
  assert.equal(signalSource.listenerCount("SIGTERM"), 0);
  assert.equal(signalSource.listenerCount("SIGUSR2"), 0);
});
