import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  session,
  type IpcMainInvokeEvent,
  type NativeImage,
} from "electron";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

import {
  bridgeChannel,
  bridgeMethods,
  isBridgeMethod,
  type RendererInvocation,
} from "./bridge";
import { startupBanner } from "./banner";
import {
  clipboardText,
  clipboardWriteChannel,
} from "./clipboard";
import { configureGraphicsCompatibility } from "./graphics";
import {
  applicationIconPath,
  applicationID,
  applicationName,
  applyApplicationProcessIdentity,
  configureMacDockIcon,
  isBrandedMacRuntime,
  isPackagedApplicationRuntime,
} from "./identity";
import { SidecarClient } from "./sidecar";

applyApplicationProcessIdentity(process);
configureGraphicsCompatibility(app);

const applicationScheme = "app";
const applicationHost = "validex";
const productionURL = `${applicationScheme}://${applicationHost}/`;

protocol.registerSchemesAsPrivileged([
  {
    scheme: applicationScheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
app.enableSandbox();
app.setName(applicationName);
if (process.platform === "linux") {
  app.setDesktopName(`${applicationID}.desktop`);
  app.commandLine.appendSwitch("class", applicationID);
}
if (process.platform === "win32") {
  app.setAppUserModelId(applicationID);
}

let mainWindow: BrowserWindow | undefined;
let sidecar: SidecarClient | undefined;
let shutdownStarted = false;
let shutdownComplete = false;

function commandLineValue(name: string): string | undefined {
  const exact = `--${name}`;
  const prefix = `${exact}=`;
  for (let index = 1; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument?.startsWith(prefix)) {
      const value = argument.slice(prefix.length).trim();
      return value === "" ? undefined : value;
    }
    if (argument === exact) {
      const value = process.argv[index + 1]?.trim();
      return value === "" ? undefined : value;
    }
  }
  return undefined;
}

let developmentMarkerLoaded = false;
let developmentMarker: unknown;

function readDevelopmentRuntimeMarker(): unknown {
  if (developmentMarkerLoaded) return developmentMarker;
  developmentMarkerLoaded = true;
  try {
    developmentMarker = JSON.parse(
      readFileSync(
        join(
          process.resourcesPath,
          ".validex-development-runtime.json",
        ),
        "utf8",
      ),
    );
  } catch {
    developmentMarker = undefined;
  }
  return developmentMarker;
}

function packagedApplication(): boolean {
  return isPackagedApplicationRuntime({
    applicationVersion: app.getVersion(),
    architecture: process.arch,
    developmentMarker: readDevelopmentRuntimeMarker(),
    developmentRuntime: commandLineValue(
      "validex-development-runtime",
    ),
    electronPackaged: app.isPackaged,
    electronVersion: process.versions.electron,
    executablePath: process.execPath,
    platform: process.platform,
  });
}

function developmentURL(): string | undefined {
  if (packagedApplication()) return undefined;

  const raw =
    commandLineValue("dev-url") ?? process.env.VALIDEX_DEV_URL?.trim();
  if (raw === undefined || raw === "") return undefined;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid Validex development URL: ${raw}`);
  }
  const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !loopbackHosts.has(url.hostname)
  ) {
    throw new Error(
      "Validex development URL must use HTTP(S) on a loopback host",
    );
  }
  return url.toString();
}

function executableName(): string {
  return process.platform === "win32"
    ? "validex-backend.exe"
    : "validex-backend";
}

function backendExecutable(): string {
  if (packagedApplication()) {
    return join(process.resourcesPath, executableName());
  }

  const override =
    commandLineValue("backend") ?? process.env.VALIDEX_BACKEND_PATH?.trim();
  if (override !== undefined && override !== "") {
    return isAbsolute(override) ? override : resolve(process.cwd(), override);
  }
  return resolve(app.getAppPath(), "build", "bin", executableName());
}

function frontendRoot(): string {
  if (packagedApplication()) {
    return join(process.resourcesPath, "frontend");
  }
  return resolve(app.getAppPath(), "frontend", "dist");
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
    case ".map":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function containedPath(root: string, requestedPath: string): string | undefined {
  const candidate = resolve(root, requestedPath);
  const fromRoot = relative(root, candidate);
  if (
    fromRoot === "" ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(fromRoot)
  ) {
    return undefined;
  }
  return candidate;
}

async function serveApplicationAsset(
  request: Request,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  const url = new URL(request.url);
  if (url.protocol !== `${applicationScheme}:` || url.host !== applicationHost) {
    return new Response("Not found", { status: 404 });
  }

  let requestedPath: string;
  try {
    requestedPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (requestedPath === "") requestedPath = "index.html";

  const filePath = containedPath(frontendRoot(), requestedPath);
  if (filePath === undefined) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const body = request.method === "HEAD" ? null : await readFile(filePath);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType(filePath),
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
        "Cross-Origin-Opener-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const code =
      error !== null && typeof error === "object" && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code === "ENOENT" || code === "EISDIR") {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}

function trustedDocument(rawURL: string, devURL: string | undefined): boolean {
  let url: URL;
  try {
    url = new URL(rawURL);
  } catch {
    return false;
  }
  if (devURL === undefined) {
    return (
      url.protocol === `${applicationScheme}:` &&
      url.host === applicationHost
    );
  }
  return url.origin === new URL(devURL).origin;
}

function validateSender(
  event: IpcMainInvokeEvent,
  devURL: string | undefined,
): void {
  if (
    mainWindow === undefined ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame === null ||
    event.senderFrame !== event.senderFrame.top ||
    !trustedDocument(event.senderFrame.url, devURL)
  ) {
    throw new Error("Rejected bridge call from an untrusted renderer");
  }
}

function asInvocation(value: unknown): RendererInvocation {
  if (value === null || typeof value !== "object") {
    throw new Error("Bridge invocation must be an object");
  }
  const candidate = value as Record<string, unknown>;
  if (!isBridgeMethod(candidate.method) || !Array.isArray(candidate.args)) {
    throw new Error("Bridge invocation is invalid");
  }
  if (candidate.args.length !== bridgeMethods[candidate.method]) {
    throw new Error(
      `${candidate.method} expects ${bridgeMethods[candidate.method]} arguments`,
    );
  }
  return {
    method: candidate.method,
    args: candidate.args,
  };
}

function installBridge(devURL: string | undefined): void {
  ipcMain.handle(bridgeChannel, async (event, rawInvocation: unknown) => {
    validateSender(event, devURL);
    const invocation = asInvocation(rawInvocation);
    if (sidecar === undefined) {
      throw new Error("Validex backend is unavailable");
    }
    return sidecar.invoke(invocation.method, invocation.args);
  });
}

function installClipboardWriter(devURL: string | undefined): void {
  ipcMain.handle(clipboardWriteChannel, (event, value: unknown) => {
    validateSender(event, devURL);
    clipboard.writeText(clipboardText(value));
    return true;
  });
}

function hardenSession(): void {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );
}

async function createWindow(
  devURL: string | undefined,
  icon: NativeImage,
): Promise<void> {
  const window = new BrowserWindow({
    title: "Validex",
    icon,
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: devURL !== undefined,
      webviewTag: false,
    },
  });
  mainWindow = window;

  window.setMenu(null);
  window.setMenuBarVisibility(false);

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  window.webContents.on("will-redirect", (event) => {
    event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  window.once("ready-to-show", () => {
    window.maximize();
    window.show();
  });
  window.once("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });

  await window.loadURL(devURL ?? productionURL);
}

function loadApplicationIcon(path: string): NativeImage {
  const icon = nativeImage.createFromPath(path);
  if (icon.isEmpty()) {
    throw new Error(`Validex application icon could not be loaded: ${path}`);
  }
  return icon;
}

async function startApplication(): Promise<void> {
  const devURL = developmentURL();
  Menu.setApplicationMenu(null);
  if (process.platform === "darwin") {
    app.setAboutPanelOptions({
      applicationName,
      applicationVersion: app.getVersion(),
    });
  }
  const iconLocation = {
    applicationRoot: app.getAppPath(),
    packaged: packagedApplication(),
    resourcesRoot: process.resourcesPath,
  };
  const icon = loadApplicationIcon(applicationIconPath(iconLocation));
  const reinforceDockIcon = await configureMacDockIcon({
    ...iconLocation,
    brandedRuntime: isBrandedMacRuntime(
      process.platform,
      process.execPath,
    ),
    dock: app.dock,
    loadIcon: loadApplicationIcon,
    platform: process.platform,
  });

  if (devURL === undefined) {
    await protocol.handle(applicationScheme, serveApplicationAsset);
  }

  hardenSession();
  installBridge(devURL);
  installClipboardWriter(devURL);
  app.on("browser-window-focus", reinforceDockIcon);
  app.on("did-become-active", reinforceDockIcon);

  const backend = backendExecutable();
  sidecar = new SidecarClient();
  await sidecar.start(backend);
  await createWindow(devURL, icon);
  // Reinforce the artwork after the first native window lifecycle boundary.
  reinforceDockIcon();
  process.stderr.write(
    `\n${startupBanner({
      appVersion: app.getVersion(),
      backendName: executableName(),
      chromiumVersion: process.versions.chrome,
      electronVersion: process.versions.electron,
      endpoint: devURL ?? productionURL,
      mode: devURL === undefined ? "Production" : "Development",
    })}\n`,
  );

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow(devURL, icon)
        .then(reinforceDockIcon)
        .catch(reportFatalError);
    }
  });
}

function reportFatalError(error: unknown): void {
  const message =
    error instanceof Error ? error.message : "Validex could not be started";
  dialog.showErrorBox("Validex", message);
  app.quit();
}

app.whenReady().then(startApplication).catch(reportFatalError);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (shutdownStarted) return;
  shutdownStarted = true;

  void (sidecar?.shutdown() ?? Promise.resolve()).finally(() => {
    shutdownComplete = true;
    app.quit();
  });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.quit();
  });
}
