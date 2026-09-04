export interface HardwareAccelerationController {
  disableHardwareAcceleration(): void;
}

export interface GraphicsCompatibilityOptions {
  arguments?: readonly string[];
  environment?: Readonly<Record<string, string | undefined>>;
  platform?: NodeJS.Platform;
}

function commandLineValue(
  arguments_: readonly string[],
  name: string,
): string | undefined {
  const exact = `--${name}`;
  const prefix = `${exact}=`;
  for (let index = 1; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument?.startsWith(prefix)) {
      const value = argument.slice(prefix.length).trim();
      return value === "" ? undefined : value;
    }
    if (argument === exact) {
      const value = arguments_[index + 1]?.trim();
      return value === "" ? undefined : value;
    }
  }
  return undefined;
}

/**
 * Native Wayland and Chromium Vulkan are not a reliable combination across
 * Linux drivers. X11/XWayland keeps acceleration; native Wayland uses the
 * stable software path for this text-and-DOM-focused desktop application.
 */
export function requiresWaylandGraphicsFallback({
  arguments: arguments_ = process.argv,
  environment = process.env,
  platform = process.platform,
}: GraphicsCompatibilityOptions = {}): boolean {
  if (platform !== "linux") return false;

  const ozonePlatform = (
    commandLineValue(arguments_, "ozone-platform") ??
    environment.ELECTRON_OZONE_PLATFORM_HINT
  )?.trim().toLowerCase();
  if (ozonePlatform === "x11") return false;
  if (ozonePlatform === "wayland") return true;

  return (
    environment.XDG_SESSION_TYPE?.trim().toLowerCase() === "wayland" ||
    Boolean(environment.WAYLAND_DISPLAY?.trim())
  );
}

export function configureGraphicsCompatibility(
  application: HardwareAccelerationController,
  options: GraphicsCompatibilityOptions = {},
): boolean {
  if (!requiresWaylandGraphicsFallback(options)) return false;
  application.disableHardwareAcceleration();
  return true;
}
