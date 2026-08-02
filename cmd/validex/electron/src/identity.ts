import { basename, join } from "node:path";

export const applicationID = "com.validex.Validex";
export const applicationName = "Validex";
export const developmentApplicationID = `${applicationID}.dev`;
export const developmentRuntimeMarkerSchema = 2;

export interface ApplicationIconLocation {
  applicationRoot: string;
  packaged: boolean;
  resourcesRoot: string;
}

export interface MacDock<Icon = string> {
  hide(): void;
  setIcon(icon: Icon): void;
  show(): Promise<void>;
}

interface MacDockIconOptions<Icon> extends ApplicationIconLocation {
  brandedRuntime: boolean;
  dock: MacDock<Icon> | undefined;
  loadIcon(path: string): Icon;
  platform: NodeJS.Platform;
}

export interface ProcessIdentity {
  title: string;
}

export function applyApplicationProcessIdentity(
  target: ProcessIdentity,
): void {
  target.title = applicationName;
}

export function isBrandedMacRuntime(
  platform: NodeJS.Platform,
  executablePath: string,
): boolean {
  return (
    platform === "darwin" && basename(executablePath) === applicationName
  );
}

export function isPackagedApplicationRuntime(options: {
  applicationVersion: string;
  architecture: string;
  developmentMarker: unknown;
  developmentRuntime: string | undefined;
  electronPackaged: boolean;
  electronVersion: string;
  executablePath: string;
  platform: NodeJS.Platform;
}): boolean {
  const marker = options.developmentMarker;
  const validMarker =
    typeof marker === "object" &&
    marker !== null &&
    (marker as Record<string, unknown>).schema ===
      developmentRuntimeMarkerSchema &&
    (marker as Record<string, unknown>).applicationID ===
      developmentApplicationID &&
    (marker as Record<string, unknown>).applicationName ===
      applicationName &&
    (marker as Record<string, unknown>).applicationVersion ===
      options.applicationVersion &&
    (marker as Record<string, unknown>).architecture ===
      options.architecture &&
    (marker as Record<string, unknown>).electronVersion ===
      options.electronVersion &&
    (marker as Record<string, unknown>).platform === "darwin";
  const brandedDevelopmentRuntime =
    options.developmentRuntime === "1" &&
    isBrandedMacRuntime(options.platform, options.executablePath) &&
    validMarker;
  return options.electronPackaged && !brandedDevelopmentRuntime;
}

export function applicationIconPath(
  location: ApplicationIconLocation,
): string {
  return location.packaged
    ? join(location.resourcesRoot, "frontend", "appicon.png")
    : join(location.applicationRoot, "build", "appicon.png");
}

export function macDockIconPath(
  location: ApplicationIconLocation,
): string {
  // nativeImage accepts the packaged PNG; the ICNS file remains the native
  // bundle icon used by LaunchServices before JavaScript starts.
  return applicationIconPath(location);
}

export async function configureMacDockIcon<Icon>(
  options: MacDockIconOptions<Icon>,
): Promise<() => void> {
  if (options.platform !== "darwin" || options.dock === undefined) {
    return () => undefined;
  }

  const icon = options.loadIcon(macDockIconPath(options));
  const reinforce = () => options.dock?.setIcon(icon);
  if (options.packaged || options.brandedRuntime) {
    reinforce();
    return reinforce;
  }

  options.dock.hide();
  try {
    reinforce();
    await options.dock.show();
  } catch (error) {
    await options.dock.show();
    throw error;
  }
  // Showing the stock Electron bundle can restore its default Dock artwork.
  // Reapply Validex after the Dock item is visible so the replacement sticks.
  reinforce();
  return reinforce;
}
