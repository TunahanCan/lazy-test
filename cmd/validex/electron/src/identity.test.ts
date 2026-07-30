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
  configureMacDockIcon,
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
    join(resourcesRoot, "validex.icns"),
  );
});

test("development macOS replaces and reinforces the Electron dock icon", async () => {
  const calls: string[] = [];
  const reinforce = await configureMacDockIcon({
    applicationRoot,
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

test("packaged macOS reinforces the bundle icon without hiding the dock", async () => {
  const calls: string[] = [];
  const reinforce = await configureMacDockIcon({
    applicationRoot,
    dock: recordingDock(calls),
    loadIcon: (path) => path,
    packaged: true,
    platform: "darwin",
    resourcesRoot,
  });
  reinforce();

  deepStrictEqual(calls, [
    `set:${join(resourcesRoot, "validex.icns")}`,
    `set:${join(resourcesRoot, "validex.icns")}`,
  ]);
});

test("dock is restored when a development icon cannot be loaded", async () => {
  const calls: string[] = [];
  await rejects(
    configureMacDockIcon({
      applicationRoot,
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
