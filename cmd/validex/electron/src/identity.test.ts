import {
  deepStrictEqual,
  equal,
  match,
  rejects,
} from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  applicationIconPath,
  applicationName,
  applyApplicationProcessIdentity,
  configureMacDockIcon,
  developmentApplicationID,
  developmentRuntimeMarkerSchema,
  isBrandedMacRuntime,
  isPackagedApplicationRuntime,
  macDockIconPath,
  type MacDock,
} from "./identity";

const applicationRoot = resolve(__dirname, "..", "..");
const resourcesRoot = resolve("/runtime", "resources");

function recordingDock(
  calls: string[],
  setIconError?: Error,
): MacDock {
  return {
    hide() {
      calls.push("hide");
    },
    setIcon(icon) {
      calls.push(`set:${icon}`);
      if (setIconError !== undefined) throw setIconError;
    },
    async show() {
      calls.push("show");
    },
  };
}

test("application icon paths follow development and packaged layouts", () => {
  equal(
    applicationIconPath({
      applicationRoot,
      packaged: false,
      resourcesRoot,
    }),
    join(applicationRoot, "build", "appicon.png"),
  );
  equal(
    applicationIconPath({
      applicationRoot,
      packaged: true,
      resourcesRoot,
    }),
    join(resourcesRoot, "frontend", "appicon.png"),
  );
  equal(
    macDockIconPath({
      applicationRoot,
      packaged: false,
      resourcesRoot,
    }),
    join(applicationRoot, "build", "appicon.png"),
  );
  equal(
    macDockIconPath({
      applicationRoot,
      packaged: true,
      resourcesRoot,
    }),
    join(resourcesRoot, "frontend", "appicon.png"),
  );
});

test("application process identity is always branded as Validex", () => {
  const identity = { title: "Electron" };
  applyApplicationProcessIdentity(identity);

  equal(identity.title, applicationName);
  equal(
    isBrandedMacRuntime("darwin", "/runtime/Validex.app/Contents/MacOS/Validex"),
    true,
  );
  equal(
    isBrandedMacRuntime("darwin", "/runtime/Electron.app/Contents/MacOS/Electron"),
    false,
  );
  equal(isBrandedMacRuntime("linux", "/runtime/Validex"), false);
  equal(
    isPackagedApplicationRuntime({
      applicationVersion: "0.2.0",
      architecture: "arm64",
      developmentMarker: {
        applicationID: developmentApplicationID,
        applicationName,
        applicationVersion: "0.2.0",
        architecture: "arm64",
        electronVersion: "43.2.0",
        platform: "darwin",
        schema: developmentRuntimeMarkerSchema,
      },
      developmentRuntime: "1",
      electronPackaged: true,
      electronVersion: "43.2.0",
      executablePath: "/runtime/Validex.app/Contents/MacOS/Validex",
      platform: "darwin",
    }),
    false,
  );
  equal(
    isPackagedApplicationRuntime({
      applicationVersion: "0.2.0",
      architecture: "arm64",
      developmentMarker: undefined,
      developmentRuntime: undefined,
      electronPackaged: true,
      electronVersion: "43.2.0",
      executablePath: "/Applications/Validex.app/Contents/MacOS/Validex",
      platform: "darwin",
    }),
    true,
  );
  equal(
    isPackagedApplicationRuntime({
      applicationVersion: "0.2.0",
      architecture: "arm64",
      developmentMarker: undefined,
      developmentRuntime: "1",
      electronPackaged: true,
      electronVersion: "43.2.0",
      executablePath: "/Applications/Validex.app/Contents/MacOS/Validex",
      platform: "darwin",
    }),
    true,
  );
});

test("JavaScript and npm product names stay aligned", async () => {
  const manifest = JSON.parse(
    await readFile(join(applicationRoot, "package.json"), "utf8"),
  );
  equal(manifest.productName, applicationName);
});

test("unbranded development macOS replaces and reinforces the Electron dock icon", async () => {
  const calls: string[] = [];
  const reinforce = await configureMacDockIcon({
    applicationRoot,
    brandedRuntime: false,
    dock: recordingDock(calls),
    loadIcon: (path) => path,
    packaged: false,
    platform: "darwin",
    resourcesRoot,
  });
  reinforce();

  deepStrictEqual(calls, [
    "hide",
    `set:${join(applicationRoot, "build", "appicon.png")}`,
    "show",
    `set:${join(applicationRoot, "build", "appicon.png")}`,
    `set:${join(applicationRoot, "build", "appicon.png")}`,
  ]);
});

test("branded development macOS keeps the Validex dock item visible", async () => {
  const calls: string[] = [];
  const reinforce = await configureMacDockIcon({
    applicationRoot,
    brandedRuntime: true,
    dock: recordingDock(calls),
    loadIcon: (path) => path,
    packaged: false,
    platform: "darwin",
    resourcesRoot,
  });
  reinforce();

  deepStrictEqual(calls, [
    `set:${join(applicationRoot, "build", "appicon.png")}`,
    `set:${join(applicationRoot, "build", "appicon.png")}`,
  ]);
});

test("packaged macOS reinforces the bundle icon without hiding the dock", async () => {
  const calls: string[] = [];
  const reinforce = await configureMacDockIcon({
    applicationRoot,
    brandedRuntime: true,
    dock: recordingDock(calls),
    loadIcon: (path) => path,
    packaged: true,
    platform: "darwin",
    resourcesRoot,
  });
  reinforce();

  deepStrictEqual(calls, [
    `set:${join(resourcesRoot, "frontend", "appicon.png")}`,
    `set:${join(resourcesRoot, "frontend", "appicon.png")}`,
  ]);
});

test("dock is restored when a development icon cannot be loaded", async () => {
  const calls: string[] = [];
  await rejects(
    configureMacDockIcon({
      applicationRoot,
      brandedRuntime: false,
      dock: recordingDock(calls, new Error("invalid icon")),
      loadIcon: (path) => path,
      packaged: false,
      platform: "darwin",
      resourcesRoot,
    }),
    /invalid icon/,
  );
  deepStrictEqual(calls, [
    "hide",
    `set:${join(applicationRoot, "build", "appicon.png")}`,
    "show",
  ]);
});

test("desktop and frontend icon assets stay identical", async () => {
  const [desktopPNG, frontendPNG, desktopSVG, frontendSVG] =
    await Promise.all([
      readFile(join(applicationRoot, "build", "appicon.png")),
      readFile(join(applicationRoot, "frontend", "public", "appicon.png")),
      readFile(join(applicationRoot, "build", "appicon.svg"), "utf8"),
      readFile(
        join(applicationRoot, "frontend", "public", "appicon.svg"),
        "utf8",
      ),
    ]);

  deepStrictEqual(frontendPNG, desktopPNG);
  equal(desktopPNG.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  equal(desktopPNG.readUInt32BE(16), 1024);
  equal(desktopPNG.readUInt32BE(20), 1024);
  equal(frontendSVG, desktopSVG);
  match(desktopSVG, /viewBox="0 0 1024 1024"/);
});
