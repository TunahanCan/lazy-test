export const clipboardWriteChannel = "validex:clipboard:write";

export function clipboardText(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("Clipboard text must be a string");
  }
  return value;
}
