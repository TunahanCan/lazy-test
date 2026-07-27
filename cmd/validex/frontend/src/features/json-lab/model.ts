export type JSONMode = "format" | "diff" | "query" | "schema" | "dto";
export type JSONInputGroup = "json" | "diff" | "dto";

export function inputGroupForMode(mode: JSONMode): JSONInputGroup {
  if (mode === "diff") return "diff";
  if (mode === "dto") return "dto";
  return "json";
}
