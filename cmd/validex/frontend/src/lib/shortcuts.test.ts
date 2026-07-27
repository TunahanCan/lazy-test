import { describe, expect, it } from "vitest";
import { isApplePlatform, shortcutLabel } from "./shortcuts";

describe("platform shortcut labels", () => {
  it("uses command symbols on Apple platforms", () => {
    expect(isApplePlatform("MacIntel")).toBe(true);
    expect(shortcutLabel("k", { platform: "macOS" })).toBe("⌘ K");
    expect(shortcutLabel("t", { platform: "MacIntel", shift: true })).toBe(
      "⇧ ⌘ T",
    );
  });

  it("uses Ctrl labels on Linux and Windows", () => {
    expect(isApplePlatform("Linux x86_64")).toBe(false);
    expect(shortcutLabel("n", { platform: "Linux x86_64" })).toBe("Ctrl N");
    expect(shortcutLabel("t", { platform: "Win32", shift: true })).toBe(
      "Ctrl Shift T",
    );
  });
});
