const secretParts = new Set([
  "authorization",
  "auth",
  "token",
  "secret",
  "password",
  "passwd",
  "cookie",
  "csrf",
  "session",
  "sid",
  "credential",
  "credentials",
  "xsrf",
]);

const secretSuffixes = [
  "authorization",
  "token",
  "secret",
  "password",
  "passwd",
  "apikey",
  "cookie",
  "csrf",
  "session",
  "sessionid",
  "sid",
  "credential",
  "credentials",
  "privatekey",
  "xsrf",
];

export function isSecretKey(key: string): boolean {
  const separated = key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .toLowerCase();
  const parts = separated.split(/\s+/).filter(Boolean);
  const compact = parts.join("");
  return (
    parts.some((part) => secretParts.has(part)) ||
    secretSuffixes.some((suffix) => compact.endsWith(suffix))
  );
}

export function isMaskedSecretValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && /^•+$/.test(trimmed);
}

export function isSafeSecretReference(value: string): boolean {
  return /^(?:(?:Bearer|Basic)\s+)?\{\{\s*[A-Za-z_][A-Za-z0-9_.-]*\s*}}$/i.test(
    value.trim(),
  );
}
