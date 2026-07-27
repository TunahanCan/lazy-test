import { useEffect, useState } from "react";
import { useWorkspaceStore } from "../stores/workspace";

export type ResolvedTheme = "light" | "dark";

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function useResolvedTheme(): ResolvedTheme {
  const preference = useWorkspaceStore((state) => state.theme);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setPrefersDark(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

export function useApplyResolvedTheme(): ResolvedTheme {
  const resolvedTheme = useResolvedTheme();

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  return resolvedTheme;
}
