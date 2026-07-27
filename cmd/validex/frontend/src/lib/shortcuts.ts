interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: {
    platform?: string;
  };
}

function browserPlatform(): string {
  if (typeof navigator === "undefined") return "";
  const currentNavigator = navigator as NavigatorWithUserAgentData;
  return (
    currentNavigator.userAgentData?.platform ||
    currentNavigator.platform ||
    currentNavigator.userAgent
  );
}

export function isApplePlatform(platform = browserPlatform()): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function shortcutLabel(
  key: string,
  options: { platform?: string; shift?: boolean } = {},
): string {
  const apple = isApplePlatform(options.platform);
  const modifiers = apple
    ? options.shift
      ? ["⇧", "⌘"]
      : ["⌘"]
    : options.shift
      ? ["Ctrl", "Shift"]
      : ["Ctrl"];
  return [...modifiers, key.toUpperCase()].join(" ");
}
