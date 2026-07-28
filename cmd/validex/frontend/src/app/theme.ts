import type { ThemePreference } from "../lib/types.js";

export type ResolvedTheme = "light" | "dark";

export function resolveTheme(
  preference: ThemePreference,
  prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches,
): ResolvedTheme {
  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

export function watchSystemTheme(
  getPreference: () => ThemePreference,
  onChange?: (theme: ResolvedTheme) => void,
): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const update = () => onChange?.(applyTheme(getPreference()));
  media.addEventListener("change", update);
  update();
  return () => media.removeEventListener("change", update);
}
