import { join } from "node:path";

export const applicationID = "com.validex.Validex";
export const applicationName = "Validex";

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
  dock: MacDock<Icon> | undefined;
  loadIcon(path: string): Icon;
  platform: NodeJS.Platform;
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
  return location.packaged
    ? join(location.resourcesRoot, "validex.icns")
    : applicationIconPath(location);
}

export async function configureMacDockIcon<Icon>(
  options: MacDockIconOptions<Icon>,
): Promise<() => void> {
  if (options.platform !== "darwin" || options.dock === undefined) {
    return () => undefined;
  }

  const icon = options.loadIcon(macDockIconPath(options));
  const reinforce = () => options.dock?.setIcon(icon);
  if (options.packaged) {
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
