#!/usr/bin/env node

import {
  chmod,
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const applicationRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(applicationRoot, "..", "..");
const buildRoot = join(applicationRoot, "build");
const outputRoot = join(buildRoot, "bin");

const applicationName = "Validex";
const applicationID = "com.validex.Validex";
const applicationManifest = JSON.parse(
  await readFile(join(applicationRoot, "package.json"), "utf8"),
);
if (
  typeof applicationManifest.version !== "string" ||
  applicationManifest.version.trim() === ""
) {
  throw new Error("Validex package version is missing");
}
const applicationVersion = applicationManifest.version;

function containedPath(parent, candidate) {
  const fromParent = relative(parent, candidate);
  return (
    fromParent !== "" &&
    fromParent !== ".." &&
    !fromParent.startsWith(
      `..${process.platform === "win32" ? "\\" : "/"}`,
    ) &&
    !isAbsolute(fromParent)
  );
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

function executableName() {
  return process.platform === "win32"
    ? "validex-backend.exe"
    : "validex-backend";
}

function packagedApplicationPath() {
  if (process.platform === "darwin") {
    return join(outputRoot, `${applicationName}.app`);
  }
  return join(outputRoot, applicationName);
}

function stagingApplicationPath(stagingRoot) {
  if (process.platform === "darwin") {
    return join(stagingRoot, `${applicationName}.app`);
  }
  return join(stagingRoot, applicationName);
}

function electronRuntimePath() {
  const runtimeRoot = join(
    applicationRoot,
    "node_modules",
    "electron",
    "dist",
  );
  if (process.platform === "darwin") {
    return join(runtimeRoot, "Electron.app");
  }
  return runtimeRoot;
}

function packageResourcesPath(applicationPath) {
  if (process.platform === "darwin") {
    return join(applicationPath, "Contents", "Resources");
  }
  return join(applicationPath, "resources");
}

function packageExecutablePath(applicationPath) {
  if (process.platform === "darwin") {
    return join(applicationPath, "Contents", "MacOS", applicationName);
  }
  return join(
    applicationPath,
    process.platform === "win32" ? "validex.exe" : "validex",
  );
}

async function copyRuntime(applicationPath) {
  const runtimePath = electronRuntimePath();
  await requireDirectory(runtimePath, "Electron runtime");
  await cp(runtimePath, applicationPath, {
    errorOnExist: true,
    force: false,
    recursive: true,
    verbatimSymlinks: true,
  });

  if (process.platform === "darwin") {
    await rename(
      join(applicationPath, "Contents", "MacOS", "Electron"),
      packageExecutablePath(applicationPath),
    );
    return;
  }

  await rename(
    join(
      applicationPath,
      process.platform === "win32" ? "electron.exe" : "electron",
    ),
    packageExecutablePath(applicationPath),
  );
}

async function copyApplicationFiles(applicationPath) {
  const resources = packageResourcesPath(applicationPath);
  const appDirectory = join(resources, "app");
  const shellOutput = join(applicationRoot, "electron", "dist");
  const frontendOutput = join(applicationRoot, "frontend", "dist");
  const backend = join(outputRoot, executableName());
  const notices = join(repositoryRoot, "THIRD_PARTY_NOTICES.md");
  const electronDistribution = join(
    applicationRoot,
    "node_modules",
    "electron",
    "dist",
  );

  for (const [path, label] of [
    [join(shellOutput, "main.js"), "Electron main process"],
    [join(shellOutput, "preload.js"), "Electron preload"],
    [join(shellOutput, "banner.js"), "Electron startup banner"],
    [join(shellOutput, "bridge.js"), "Electron bridge catalog"],
    [join(shellOutput, "identity.js"), "Electron application identity"],
    [join(shellOutput, "sidecar.js"), "Electron sidecar client"],
    [join(frontendOutput, "index.html"), "frontend artifact"],
    [join(frontendOutput, "appicon.png"), "desktop PNG icon"],
    [join(frontendOutput, "appicon.svg"), "desktop SVG icon"],
    [backend, "Go backend"],
    [notices, "third-party notices"],
    [join(electronDistribution, "LICENSE"), "Electron license"],
    [
      join(electronDistribution, "LICENSES.chromium.html"),
      "Chromium licenses",
    ],
  ]) {
    await requireRegularFile(path, label);
  }

  await rm(join(resources, "default_app.asar"), { force: true });
  await mkdir(join(appDirectory, "electron", "dist"), { recursive: true });
  await writeFile(
    join(appDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "validex",
        productName: applicationName,
        version: applicationVersion,
        private: true,
        main: "electron/dist/main.js",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  for (const filename of [
    "main.js",
    "preload.js",
    "banner.js",
    "bridge.js",
    "identity.js",
    "sidecar.js",
  ]) {
    await cp(
      join(shellOutput, filename),
      join(appDirectory, "electron", "dist", filename),
    );
  }

  await cp(frontendOutput, join(resources, "frontend"), {
    errorOnExist: true,
    force: false,
    recursive: true,
  });
  await cp(backend, join(resources, executableName()));
  if (process.platform !== "win32") {
    await chmod(join(resources, executableName()), 0o755);
  }
  await cp(notices, join(resources, "THIRD_PARTY_NOTICES.md"));
  await cp(
    join(electronDistribution, "LICENSE"),
    join(resources, "LICENSE.electron"),
  );
  await cp(
    join(electronDistribution, "LICENSES.chromium.html"),
    join(resources, "LICENSES.chromium.html"),
  );
}

function updateMacMetadata(applicationPath) {
  const plist = join(applicationPath, "Contents", "Info.plist");
  const replaceString = (key, value) => {
    execFileSync(
      "plutil",
      ["-replace", key, "-string", value, plist],
      { stdio: "inherit" },
    );
  };
  replaceString("CFBundleDisplayName", applicationName);
  replaceString("CFBundleExecutable", applicationName);
  replaceString("CFBundleIdentifier", applicationID);
  replaceString("CFBundleName", applicationName);
  replaceString("CFBundleShortVersionString", applicationVersion);
  replaceString("CFBundleVersion", applicationVersion);
  replaceString(
    "LSApplicationCategoryType",
    "public.app-category.developer-tools",
  );

  for (const key of [
    "ElectronAsarIntegrity",
    "NSAudioCaptureUsageDescription",
    "NSBluetoothAlwaysUsageDescription",
    "NSBluetoothPeripheralUsageDescription",
    "NSCameraUsageDescription",
    "NSMicrophoneUsageDescription",
  ]) {
    try {
      execFileSync("plutil", ["-remove", key, plist], {
        stdio: "ignore",
      });
    } catch {
      // Electron versions may omit optional metadata.
    }
  }
  execFileSync(
    "plutil",
    [
      "-replace",
      "NSAppTransportSecurity",
      "-json",
      '{"NSAllowsLocalNetworking":true}',
      plist,
    ],
    { stdio: "inherit" },
  );

  for (const [helperName, identifier] of [
    ["Electron Helper", `${applicationID}.helper`],
    ["Electron Helper (Renderer)", `${applicationID}.helper.renderer`],
    ["Electron Helper (GPU)", `${applicationID}.helper.gpu`],
    ["Electron Helper (Plugin)", `${applicationID}.helper.plugin`],
  ]) {
    execFileSync(
      "plutil",
      [
        "-replace",
        "CFBundleIdentifier",
        "-string",
        identifier,
        join(
          applicationPath,
          "Contents",
          "Frameworks",
          `${helperName}.app`,
          "Contents",
          "Info.plist",
        ),
      ],
      { stdio: "inherit" },
    );
  }
}

async function installMacIcon(applicationPath) {
  const icon = join(buildRoot, "Validex.icns");
  await requireRegularFile(icon, "Validex ICNS icon");
  const resources = packageResourcesPath(applicationPath);
  await cp(icon, join(resources, "validex.icns"));
  await rm(join(resources, "electron.icns"), { force: true });
  execFileSync(
    "plutil",
    [
      "-replace",
      "CFBundleIconFile",
      "-string",
      "validex.icns",
      join(applicationPath, "Contents", "Info.plist"),
    ],
    { stdio: "inherit" },
  );
}

async function packageApplication() {
  if (!containedPath(applicationRoot, buildRoot)) {
    throw new Error("unsafe Validex build output path");
  }
  await mkdir(outputRoot, { recursive: true });
  const stagingRoot = join(
    buildRoot,
    `.electron-package-${process.pid}-${randomUUID()}`,
  );
  if (!containedPath(buildRoot, stagingRoot)) {
    throw new Error("unsafe Electron staging path");
  }
  const stagingApplication = stagingApplicationPath(stagingRoot);
  const outputApplication = packagedApplicationPath();

  await mkdir(stagingRoot);
  try {
    await copyRuntime(stagingApplication);
    await copyApplicationFiles(stagingApplication);
    if (process.platform === "darwin") {
      updateMacMetadata(stagingApplication);
      await installMacIcon(stagingApplication);
    }
    await chmod(packageExecutablePath(stagingApplication), 0o755);
    await rm(outputApplication, { force: true, recursive: true });
    await rename(stagingApplication, outputApplication);
  } finally {
    await rm(stagingRoot, { force: true, recursive: true });
  }

  const version = (
    await readFile(
      join(
        applicationRoot,
        "node_modules",
        "electron",
        "dist",
        "version",
      ),
      "utf8",
    )
  ).trim();
  process.stdout.write(
    `Packaged ${applicationName} with Electron ${version}: ${outputApplication}\n`,
  );
}

await packageApplication();
