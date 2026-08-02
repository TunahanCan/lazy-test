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

import {
  rebrandMacApplication,
  verifyMacApplicationIdentity,
} from "./mac-application-identity.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const applicationRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(applicationRoot, "..", "..");
const buildRoot = join(applicationRoot, "build");
const outputRoot = join(buildRoot, "bin");
const developmentOutputRoot = join(buildRoot, "dev");

const applicationName = "Validex";
const applicationID = "com.validex.Validex";
const developmentApplicationID = `${applicationID}.dev`;
const developmentRuntimeMarkerSchema = 2;
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
if (applicationManifest.productName !== applicationName) {
  throw new Error(
    `Validex productName must be ${JSON.stringify(applicationName)}`,
  );
}
const developmentRuntimeMode = process.argv.slice(2).includes(
  "--development-runtime",
);
const unknownArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--development-runtime");
if (unknownArguments.length > 0) {
  throw new Error(
    `Unknown Electron packaging argument: ${unknownArguments.join(" ")}`,
  );
}

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

function developmentApplicationPath() {
  return join(developmentOutputRoot, `${applicationName}.app`);
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

async function electronVersion() {
  return (
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
}

function developmentRuntimeMarker(applicationPath) {
  return join(
    packageResourcesPath(applicationPath),
    ".validex-development-runtime.json",
  );
}

async function developmentRuntimeIsCurrent(applicationPath, version) {
  try {
    await verifyMacApplicationIdentity({
      applicationName,
      applicationPath,
      bundleIdentifier: developmentApplicationID,
      version: applicationVersion,
    });
    await requireRegularFile(
      join(packageResourcesPath(applicationPath), "default_app.asar"),
      "Electron development application loader",
    );
    const marker = JSON.parse(
      await readFile(developmentRuntimeMarker(applicationPath), "utf8"),
    );
    if (
      marker.schema !== developmentRuntimeMarkerSchema ||
      marker.applicationID !== developmentApplicationID ||
      marker.applicationName !== applicationName ||
      marker.applicationVersion !== applicationVersion ||
      marker.architecture !== process.arch ||
      marker.platform !== process.platform ||
      marker.electronVersion !== version
    ) {
      return false;
    }
    const [sourceIcon, installedIcon] = await Promise.all([
      readFile(join(buildRoot, "Validex.icns")),
      readFile(
        join(packageResourcesPath(applicationPath), "validex.icns"),
      ),
    ]);
    if (!sourceIcon.equals(installedIcon)) return false;
    execFileSync(
      "codesign",
      ["--verify", "--deep", "--strict", applicationPath],
      { stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

function signDevelopmentRuntime(applicationPath) {
  execFileSync(
    "codesign",
    ["--force", "--deep", "--sign", "-", applicationPath],
    { stdio: "inherit" },
  );
  execFileSync(
    "codesign",
    ["--verify", "--deep", "--strict", applicationPath],
    { stdio: "inherit" },
  );
}

async function packageDevelopmentRuntime() {
  if (process.platform !== "darwin") {
    throw new Error(
      "The branded Electron development runtime is available only on macOS",
    );
  }
  if (!containedPath(applicationRoot, buildRoot)) {
    throw new Error("unsafe Validex development runtime path");
  }
  await requireRegularFile(
    join(buildRoot, "Validex.icns"),
    "Validex ICNS icon",
  );
  await mkdir(developmentOutputRoot, { recursive: true });
  const outputApplication = developmentApplicationPath();
  const version = await electronVersion();
  if (await developmentRuntimeIsCurrent(outputApplication, version)) {
    process.stdout.write(
      `Using branded ${applicationName} development runtime: ${outputApplication}\n`,
    );
    return;
  }

  const stagingRoot = join(
    buildRoot,
    `.electron-development-${process.pid}-${randomUUID()}`,
  );
  if (!containedPath(buildRoot, stagingRoot)) {
    throw new Error("unsafe Electron development staging path");
  }
  const stagingApplication = stagingApplicationPath(stagingRoot);
  await mkdir(stagingRoot);
  try {
    await copyRuntime(stagingApplication);
    await rebrandMacApplication({
      applicationName,
      applicationPath: stagingApplication,
      bundleIdentifier: developmentApplicationID,
      preserveDefaultAppIntegrity: true,
      version: applicationVersion,
    });
    await installMacIcon(stagingApplication);
    await chmod(packageExecutablePath(stagingApplication), 0o755);
    await writeFile(
      developmentRuntimeMarker(stagingApplication),
      `${JSON.stringify(
        {
          applicationID: developmentApplicationID,
          applicationName,
          applicationVersion,
          architecture: process.arch,
          electronVersion: version,
          platform: process.platform,
          schema: developmentRuntimeMarkerSchema,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await verifyMacApplicationIdentity({
      applicationName,
      applicationPath: stagingApplication,
      bundleIdentifier: developmentApplicationID,
      version: applicationVersion,
    });
    await rm(outputApplication, { force: true, recursive: true });
    await rename(stagingApplication, outputApplication);
  } finally {
    await rm(stagingRoot, { force: true, recursive: true });
  }
  signDevelopmentRuntime(outputApplication);
  process.stdout.write(
    `Prepared branded ${applicationName} development runtime with Electron ${version}: ${outputApplication}\n`,
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
      await rebrandMacApplication({
        applicationName,
        applicationPath: stagingApplication,
        bundleIdentifier: applicationID,
        preserveDefaultAppIntegrity: false,
        version: applicationVersion,
      });
      await installMacIcon(stagingApplication);
      await verifyMacApplicationIdentity({
        applicationName,
        applicationPath: stagingApplication,
        bundleIdentifier: applicationID,
        version: applicationVersion,
      });
    }
    await chmod(packageExecutablePath(stagingApplication), 0o755);
    await rm(outputApplication, { force: true, recursive: true });
    await rename(stagingApplication, outputApplication);
  } finally {
    await rm(stagingRoot, { force: true, recursive: true });
  }

  const version = await electronVersion();
  process.stdout.write(
    `Packaged ${applicationName} with Electron ${version}: ${outputApplication}\n`,
  );
}

if (developmentRuntimeMode) {
  await packageDevelopmentRuntime();
} else {
  await packageApplication();
}
