import { deepStrictEqual, equal } from "node:assert/strict";
import { test } from "node:test";

import {
  configureGraphicsCompatibility,
  requiresWaylandGraphicsFallback,
} from "./graphics";

test("native Linux Wayland uses the stable software graphics path", () => {
  equal(
    requiresWaylandGraphicsFallback({
      arguments: ["electron", "/app"],
      environment: {
        DISPLAY: ":0",
        WAYLAND_DISPLAY: "wayland-0",
        XDG_SESSION_TYPE: "wayland",
      },
      platform: "linux",
    }),
    true,
  );
  equal(
    requiresWaylandGraphicsFallback({
      arguments: ["electron", "/app"],
      environment: { WAYLAND_DISPLAY: "wayland-1" },
      platform: "linux",
    }),
    true,
  );
});

test("an explicit X11 runtime keeps Linux hardware acceleration", () => {
  const environment = {
    WAYLAND_DISPLAY: "wayland-0",
    XDG_SESSION_TYPE: "wayland",
  };
  equal(
    requiresWaylandGraphicsFallback({
      arguments: ["electron", "/app", "--ozone-platform=x11"],
      environment,
      platform: "linux",
    }),
    false,
  );
  equal(
    requiresWaylandGraphicsFallback({
      arguments: ["electron", "/app", "--ozone-platform", "x11"],
      environment,
      platform: "linux",
    }),
    false,
  );
  equal(
    requiresWaylandGraphicsFallback({
      arguments: ["electron", "/app"],
      environment: {
        ...environment,
        ELECTRON_OZONE_PLATFORM_HINT: "x11",
      },
      platform: "linux",
    }),
    false,
  );
});

test("an explicit Wayland runtime enables fallback independently of session metadata", () => {
  equal(
    requiresWaylandGraphicsFallback({
      arguments: ["electron", "/app", "--ozone-platform=wayland"],
      environment: { XDG_SESSION_TYPE: "x11" },
      platform: "linux",
    }),
    true,
  );
});

test("X11 and non-Linux runtimes keep hardware acceleration", () => {
  for (const options of [
    {
      arguments: ["electron", "/app"],
      environment: { DISPLAY: ":0", XDG_SESSION_TYPE: "x11" },
      platform: "linux",
    },
    {
      arguments: ["electron", "/app", "--ozone-platform=wayland"],
      environment: { XDG_SESSION_TYPE: "wayland" },
      platform: "darwin",
    },
    {
      arguments: ["electron", "/app"],
      environment: { XDG_SESSION_TYPE: "wayland" },
      platform: "win32",
    },
  ] as const) {
    equal(requiresWaylandGraphicsFallback(options), false);
  }
});

test("graphics compatibility configures Electron only when required", () => {
  const calls: string[] = [];
  const application = {
    disableHardwareAcceleration() {
      calls.push("disable-hardware-acceleration");
    },
  };

  equal(
    configureGraphicsCompatibility(application, {
      arguments: ["electron", "/app"],
      environment: { XDG_SESSION_TYPE: "wayland" },
      platform: "linux",
    }),
    true,
  );
  equal(
    configureGraphicsCompatibility(application, {
      arguments: ["electron", "/app"],
      environment: { XDG_SESSION_TYPE: "x11" },
      platform: "linux",
    }),
    false,
  );
  deepStrictEqual(calls, ["disable-hardware-acceleration"]);
});
