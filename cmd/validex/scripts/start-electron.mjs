#!/usr/bin/env node

import { spawn } from "node:child_process";
import { constants as operatingSystemConstants } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { buildMacIcon } from "./build-mac-icon.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDirectory = dirname(scriptPath);
export const defaultApplicationRoot = resolve(scriptsDirectory, "..");

export function electronLaunchPlan({
  applicationRoot = defaultApplicationRoot,
  arguments: forwardedArguments = [],
  platform = process.platform,
} = {}) {
  const root = resolve(applicationRoot);
  if (platform === "darwin") {
    return {
      arguments: [
        root,
        "--validex-development-runtime=1",
        ...forwardedArguments,
      ],
      command: join(
        root,
        "build",
        "dev",
        "Validex.app",
        "Contents",
        "MacOS",
        "Validex",
      ),
      preparation: [
        process.execPath,
        join(root, "scripts", "package-electron.mjs"),
        "--development-runtime",
      ],
    };
  }
  return {
    arguments: [root, ...forwardedArguments],
    command: process.execPath,
    preparation: undefined,
    runtimeArguments: [
      join(root, "node_modules", "electron", "cli.js"),
    ],
  };
}

function cleanEnvironment() {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  return environment;
}

function forwardedSignals(platform = process.platform) {
  return platform === "win32"
    ? ["SIGINT", "SIGTERM"]
    : ["SIGINT", "SIGTERM", "SIGUSR2"];
}

function signalExitCode(signal) {
  const signalNumber = operatingSystemConstants.signals[signal];
  return typeof signalNumber === "number" ? 128 + signalNumber : 1;
}

export function runChildProcess(command, arguments_, options = {}) {
  const {
    onSpawn,
    signalSource = process,
    ...spawnOptions
  } = options;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, arguments_, {
      env: cleanEnvironment(),
      stdio: "inherit",
      ...spawnOptions,
    });
    let settled = false;
    const signalHandlers = new Map();
    const cleanUp = () => {
      for (const [signal, handler] of signalHandlers) {
        signalSource.removeListener(signal, handler);
      }
      signalHandlers.clear();
    };
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      cleanUp();
      reject(error);
    };
    const resolveOnce = (code) => {
      if (settled) return;
      settled = true;
      cleanUp();
      resolvePromise(code);
    };

    for (const signal of forwardedSignals()) {
      const handler = () => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill(signal);
        }
      };
      signalHandlers.set(signal, handler);
      signalSource.once(signal, handler);
    }
    child.once("error", rejectOnce);
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        resolveOnce(signalExitCode(signal));
        return;
      }
      resolveOnce(code ?? 1);
    });
    onSpawn?.(child);
  });
}

export async function startElectron({
  applicationRoot = defaultApplicationRoot,
  arguments: forwardedArguments = process.argv.slice(2),
  platform = process.platform,
} = {}) {
  const plan = electronLaunchPlan({
    applicationRoot,
    arguments: forwardedArguments,
    platform,
  });
  if (platform === "darwin") {
    await buildMacIcon(applicationRoot);
    const [preparationCommand, ...preparationArguments] = plan.preparation;
    const preparationExitCode = await runChildProcess(
      preparationCommand,
      preparationArguments,
      { cwd: applicationRoot },
    );
    if (preparationExitCode !== 0) return preparationExitCode;
  }

  return runChildProcess(
    plan.command,
    [
      ...(plan.runtimeArguments ?? []),
      ...plan.arguments,
    ],
    { cwd: applicationRoot },
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === scriptPath) {
  try {
    process.exitCode = await startElectron();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
