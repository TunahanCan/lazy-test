import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.max(0, Math.round(milliseconds))} ms`;
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

export function fuzzyMatch(value: string, query: string): boolean {
  const haystack = value.toLocaleLowerCase("tr");
  const needle = query.trim().toLocaleLowerCase("tr");
  if (!needle) return true;
  let cursor = 0;
  for (const character of needle) {
    cursor = haystack.indexOf(character, cursor);
    if (cursor === -1) return false;
    cursor += 1;
  }
  return true;
}

export function requestNameFromURL(url: string): string {
  const clean = url.replace(/\{\{[^}]+}}/g, "").split(/[?#]/)[0];
  const last = clean.split("/").filter(Boolean).at(-1);
  return last ? last.replace(/[-_]/g, " ") : "Untitled request";
}

export function statusTone(statusCode: number): "success" | "warning" | "danger" {
  if (statusCode >= 200 && statusCode < 400) return "success";
  if (statusCode >= 400 && statusCode < 500) return "warning";
  return "danger";
}
