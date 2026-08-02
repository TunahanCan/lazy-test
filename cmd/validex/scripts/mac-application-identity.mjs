import { execFileSync } from "node:child_process";
import {
  lstat,
  readdir,
  rename,
  stat,
} from "node:fs/promises";
import { join } from "node:path";

export function macHelperIdentities(applicationName, bundleIdentifier) {
  return [
    {
      bundleIdentifier: `${bundleIdentifier}.helper`,
      sourceName: "Electron Helper",
      targetName: `${applicationName} Helper`,
    },
    {
      bundleIdentifier: `${bundleIdentifier}.helper.renderer`,
      sourceName: "Electron Helper (Renderer)",
      targetName: `${applicationName} Helper (Renderer)`,
    },
    {
      bundleIdentifier: `${bundleIdentifier}.helper.gpu`,
      sourceName: "Electron Helper (GPU)",
      targetName: `${applicationName} Helper (GPU)`,
    },
    {
      bundleIdentifier: `${bundleIdentifier}.helper.plugin`,
      sourceName: "Electron Helper (Plugin)",
      targetName: `${applicationName} Helper (Plugin)`,
    },
  ];
}

function plistPath(applicationPath) {
  return join(applicationPath, "Contents", "Info.plist");
}

function replaceOrInsertPlistString(plist, key, value) {
  const arguments_ = [key, "-string", value, plist];
  try {
    execFileSync("plutil", ["-replace", ...arguments_], {
      stdio: "ignore",
    });
  } catch {
    execFileSync("plutil", ["-insert", ...arguments_], {
      stdio: "inherit",
    });
  }
}

function removeOptionalPlistKey(plist, key) {
  try {
    execFileSync("plutil", ["-remove", key, plist], {
      stdio: "ignore",
    });
  } catch {
    // Electron versions may omit optional metadata.
  }
}

function readPlistValue(plist, key) {
  return execFileSync(
    "plutil",
    ["-extract", key, "raw", "-o", "-", plist],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

async function requireDirectory(path, label) {
  let information;
  try {
    information = await stat(path);
  } catch {
    throw new Error(`${label} does not exist: ${path}`);
  }
  if (!information.isDirectory()) {
    throw new Error(`${label} is not a directory: ${path}`);
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

async function requireMissing(path, label) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`${label} must not exist: ${path}`);
}

function assertPlistValue(plist, key, expected) {
  const actual = readPlistValue(plist, key);
  if (actual !== expected) {
    throw new Error(
      `${plist} has ${key}=${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`,
    );
  }
}

export async function rebrandMacApplication({
  applicationName,
  applicationPath,
  bundleIdentifier,
  preserveDefaultAppIntegrity,
  version,
}) {
  const mainPlist = plistPath(applicationPath);
  for (const [key, value] of [
    ["CFBundleDisplayName", applicationName],
    ["CFBundleExecutable", applicationName],
    ["CFBundleIdentifier", bundleIdentifier],
    ["CFBundleName", applicationName],
    ["CFBundleShortVersionString", version],
    ["CFBundleVersion", version],
    ["LSApplicationCategoryType", "public.app-category.developer-tools"],
  ]) {
    replaceOrInsertPlistString(mainPlist, key, value);
  }

  if (!preserveDefaultAppIntegrity) {
    removeOptionalPlistKey(mainPlist, "ElectronAsarIntegrity");
  }
  for (const key of [
    "NSAudioCaptureUsageDescription",
    "NSBluetoothAlwaysUsageDescription",
    "NSBluetoothPeripheralUsageDescription",
    "NSCameraUsageDescription",
    "NSMicrophoneUsageDescription",
  ]) {
    removeOptionalPlistKey(mainPlist, key);
  }
  execFileSync(
    "plutil",
    [
      "-replace",
      "NSAppTransportSecurity",
      "-json",
      '{"NSAllowsLocalNetworking":true}',
      mainPlist,
    ],
    { stdio: "inherit" },
  );

  const frameworks = join(applicationPath, "Contents", "Frameworks");
  for (const helper of macHelperIdentities(
    applicationName,
    bundleIdentifier,
  )) {
    const sourceApplication = join(
      frameworks,
      `${helper.sourceName}.app`,
    );
    const targetApplication = join(
      frameworks,
      `${helper.targetName}.app`,
    );
    await requireDirectory(sourceApplication, helper.sourceName);
    await requireMissing(targetApplication, helper.targetName);

    const helperPlist = plistPath(sourceApplication);
    const sourceExecutable = join(
      sourceApplication,
      "Contents",
      "MacOS",
      helper.sourceName,
    );
    const targetExecutable = join(
      sourceApplication,
      "Contents",
      "MacOS",
      helper.targetName,
    );
    await requireRegularFile(sourceExecutable, helper.sourceName);
    await rename(sourceExecutable, targetExecutable);

    for (const [key, value] of [
      ["CFBundleDisplayName", helper.targetName],
      ["CFBundleExecutable", helper.targetName],
      ["CFBundleIdentifier", helper.bundleIdentifier],
      ["CFBundleName", helper.targetName],
    ]) {
      replaceOrInsertPlistString(helperPlist, key, value);
    }
    await rename(sourceApplication, targetApplication);
  }
}

export async function verifyMacApplicationIdentity({
  applicationName,
  applicationPath,
  bundleIdentifier,
  iconName = "validex.icns",
  version,
}) {
  const mainPlist = plistPath(applicationPath);
  await requireRegularFile(mainPlist, "Validex application metadata");
  await requireRegularFile(
    join(applicationPath, "Contents", "MacOS", applicationName),
    "Validex application executable",
  );
  await requireMissing(
    join(applicationPath, "Contents", "MacOS", "Electron"),
    "unbranded Electron application executable",
  );
  await requireRegularFile(
    join(applicationPath, "Contents", "Resources", iconName),
    "Validex application icon",
  );
  for (const [key, value] of [
    ["CFBundleDisplayName", applicationName],
    ["CFBundleExecutable", applicationName],
    ["CFBundleIconFile", iconName],
    ["CFBundleIdentifier", bundleIdentifier],
    ["CFBundleName", applicationName],
    ["CFBundleShortVersionString", version],
    ["CFBundleVersion", version],
  ]) {
    assertPlistValue(mainPlist, key, value);
  }

  const frameworks = join(applicationPath, "Contents", "Frameworks");
  const entries = await readdir(frameworks);
  const leakedHelper = entries.find((entry) =>
    /^Electron Helper(?: \(.+\))?\.app$/.test(entry),
  );
  if (leakedHelper !== undefined) {
    throw new Error(`unbranded macOS helper remains: ${leakedHelper}`);
  }

  for (const helper of macHelperIdentities(
    applicationName,
    bundleIdentifier,
  )) {
    const helperApplication = join(
      frameworks,
      `${helper.targetName}.app`,
    );
    const helperPlist = plistPath(helperApplication);
    await requireDirectory(helperApplication, helper.targetName);
    await requireRegularFile(
      join(
        helperApplication,
        "Contents",
        "MacOS",
        helper.targetName,
      ),
      `${helper.targetName} executable`,
    );
    for (const [key, value] of [
      ["CFBundleDisplayName", helper.targetName],
      ["CFBundleExecutable", helper.targetName],
      ["CFBundleIdentifier", helper.bundleIdentifier],
      ["CFBundleName", helper.targetName],
    ]) {
      assertPlistValue(helperPlist, key, value);
    }
    await requireMissing(
      join(
        helperApplication,
        "Contents",
        "MacOS",
        helper.sourceName,
      ),
      `unbranded ${helper.sourceName} executable`,
    );
  }
}
