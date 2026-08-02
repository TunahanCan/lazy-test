import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";

import {
  macHelperIdentities,
  rebrandMacApplication,
  verifyMacApplicationIdentity,
} from "./mac-application-identity.mjs";

const applicationName = "Validex";
const applicationID = "com.validex.Validex.dev";

test("all Electron helper identities map to Validex", () => {
  assert.deepEqual(macHelperIdentities(applicationName, applicationID), [
    {
      bundleIdentifier: `${applicationID}.helper`,
      sourceName: "Electron Helper",
      targetName: "Validex Helper",
    },
    {
      bundleIdentifier: `${applicationID}.helper.renderer`,
      sourceName: "Electron Helper (Renderer)",
      targetName: "Validex Helper (Renderer)",
    },
    {
      bundleIdentifier: `${applicationID}.helper.gpu`,
      sourceName: "Electron Helper (GPU)",
      targetName: "Validex Helper (GPU)",
    },
    {
      bundleIdentifier: `${applicationID}.helper.plugin`,
      sourceName: "Electron Helper (Plugin)",
      targetName: "Validex Helper (Plugin)",
    },
  ]);
});

async function createMacApplicationFixture(root) {
  const applicationPath = join(root, "Validex.app");
  await mkdir(join(applicationPath, "Contents", "MacOS"), {
    recursive: true,
  });
  await mkdir(join(applicationPath, "Contents", "Frameworks"), {
    recursive: true,
  });
  await mkdir(join(applicationPath, "Contents", "Resources"), {
    recursive: true,
  });
  await writeFile(
    join(applicationPath, "Contents", "MacOS", applicationName),
    "fixture",
  );
  await writeFile(
    join(applicationPath, "Contents", "Resources", "validex.icns"),
    "fixture",
  );
  await writeFile(
    join(applicationPath, "Contents", "Info.plist"),
    JSON.stringify({
      CFBundleDisplayName: "Electron",
      CFBundleExecutable: "Electron",
      CFBundleIconFile: "validex.icns",
      CFBundleIdentifier: "com.github.Electron",
      CFBundleName: "Electron",
      CFBundleShortVersionString: "43.2.0",
      CFBundleVersion: "43.2.0",
      ElectronAsarIntegrity: {
        "Resources/default_app.asar": {
          algorithm: "SHA256",
          hash: "fixture",
        },
      },
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
      },
      NSCameraUsageDescription: "Electron camera fixture",
    }),
  );

  for (const helper of macHelperIdentities(
    applicationName,
    applicationID,
  )) {
    const helperRoot = join(
      applicationPath,
      "Contents",
      "Frameworks",
      `${helper.sourceName}.app`,
      "Contents",
    );
    await mkdir(join(helperRoot, "MacOS"), { recursive: true });
    await writeFile(
      join(helperRoot, "MacOS", helper.sourceName),
      "fixture",
    );
    await writeFile(
      join(helperRoot, "Info.plist"),
      JSON.stringify({
        CFBundleIdentifier: "com.github.Electron.helper",
        CFBundleName: helper.sourceName,
      }),
    );
  }
  return applicationPath;
}

test(
  "macOS bundle rebranding removes every user-visible Electron helper name",
  { skip: process.platform !== "darwin" },
  async () => {
    const temporaryRoot = await mkdtemp(
      join(tmpdir(), "validex-identity-test-"),
    );
    try {
      const applicationPath = await createMacApplicationFixture(
        temporaryRoot,
      );
      await rebrandMacApplication({
        applicationName,
        applicationPath,
        bundleIdentifier: applicationID,
        preserveDefaultAppIntegrity: false,
        version: "0.2.0",
      });
      await verifyMacApplicationIdentity({
        applicationName,
        applicationPath,
        bundleIdentifier: applicationID,
        version: "0.2.0",
      });

      const mainPlist = JSON.parse(
        await readFile(
          join(applicationPath, "Contents", "Info.plist"),
          "utf8",
        ),
      );
      assert.equal(mainPlist.ElectronAsarIntegrity, undefined);
      assert.equal(mainPlist.NSCameraUsageDescription, undefined);
      assert.deepEqual(mainPlist.NSAppTransportSecurity, {
        NSAllowsLocalNetworking: true,
      });
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  },
);
