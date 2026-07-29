/**
 * Matches a user query across one or more searchable fields.
 *
 * Whitespace separates terms and every term must be present. This lets users
 * combine independent fields such as an HTTP method and a URL fragment without
 * requiring those values to be adjacent in the rendered label.
 */
export function matchesSidebarSearch(
  fields: readonly string[],
  query: string,
  locale: string,
): boolean {
  const terms = query
    .trim()
    .toLocaleLowerCase(locale)
    .split(/\s+/u)
    .filter(Boolean);
  if (terms.length === 0) return true;

  const searchableText = fields.join(" ").toLocaleLowerCase(locale);
  return terms.every((term) => searchableText.includes(term));
}
