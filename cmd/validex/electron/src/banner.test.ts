import { deepStrictEqual, match, doesNotMatch } from "node:assert/strict";
import { test } from "node:test";

import { startupBanner } from "./banner";

test("startup banner presents the Chromium desktop stack in one aligned box", () => {
  const banner = startupBanner({
    appVersion: "0.2.0",
    backendName: "validex-backend",
    chromiumVersion: "150.0.7871.129",
    electronVersion: "43.2.0",
    endpoint: "app://validex/",
    mode: "Production",
  });

  match(banner, /VALIDEX 0\.2\.0/);
  match(banner, /Electron 43\.2\.0 · Chromium 150\.0\.7871\.129/);
  match(banner, /browser-native TypeScript · Node isolated/);
  match(banner, /validex-backend · Go sidecar/);
  match(banner, /● Validex desktop ready/);
  doesNotMatch(banner, /native WebView|canbridge/i);

  const widths = banner.split("\n").map((line) => [...line].length);
  deepStrictEqual(new Set(widths).size, 1);
});
