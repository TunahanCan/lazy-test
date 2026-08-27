type ClipboardWriter = (value: string) => Promise<unknown>;

export async function writeClipboardText(
  value: string,
  writers: readonly ClipboardWriter[],
): Promise<boolean> {
  for (const writer of writers) {
    try {
      if ((await writer(value)) !== false) return true;
    } catch {
      // Try the next available clipboard implementation.
    }
  }
  return false;
}

function availableClipboardWriters(): ClipboardWriter[] {
  const writers: ClipboardWriter[] = [];
  const nativeWriter =
    typeof window !== "undefined"
      ? window.canbridge?.Bridge?.WriteClipboardText
      : undefined;
  if (nativeWriter) {
    writers.push((value) => nativeWriter(value));
  }
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    writers.push((value) => navigator.clipboard.writeText(value));
  }
  if (typeof document !== "undefined") {
    writers.push(async (value) => {
      const input = document.createElement("textarea");
      input.value = value;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      try {
        return document.execCommand("copy");
      } finally {
        input.remove();
      }
    });
  }
  return writers;
}

export function copyText(value: string): Promise<boolean> {
  return writeClipboardText(value, availableClipboardWriters());
}
