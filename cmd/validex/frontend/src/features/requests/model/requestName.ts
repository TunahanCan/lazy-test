const genericSegments = new Set(["api", "variable"]);

export function requestNameFromURL(rawURL: string): string | undefined {
  const source = rawURL.trim();
  if (!source) return undefined;

  const withoutTemplates = source.replace(/\{\{[^}]+\}\}/g, "variable");
  let pathname = withoutTemplates.split(/[?#]/, 1)[0] ?? "";
  try {
    pathname = new URL(withoutTemplates).pathname;
  } catch {
    pathname = pathname.replace(/^[a-z][a-z\d+.-]*:\/\/[^/]+/i, "");
  }

  const segments = pathname
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment).trim();
      } catch {
        return segment.trim();
      }
    })
    .filter(Boolean);
  const meaningful =
    [...segments]
      .reverse()
      .find(
        (segment) =>
          !genericSegments.has(segment.toLocaleLowerCase("en-US")) &&
          !/^v\d+$/i.test(segment) &&
          !/^\d+$/.test(segment) &&
          !/^[:{].*[}]?$/.test(segment),
      ) ?? segments.at(-1);
  if (!meaningful) return undefined;

  const label = meaningful
    .replace(/\.[a-z\d]+$/i, "")
    .replace(/[-_.]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!label) return undefined;
  const title = label.charAt(0).toUpperCase() + label.slice(1);
  return title.length > 42 ? `${title.slice(0, 39).trimEnd()}…` : title;
}
