export {
  clampResponseSize,
  responseSizeDefault,
  responseSizeFromKey,
  responseSizeFromPointer,
  responseSizeMaximum,
  responseSizeMinimum,
  responseSizeStep,
  type ResponseSplitPlacement,
} from "../../features/requests/model/responseLayout.js";

export function horizontalTabIndexFromKey(
  currentIndex: number,
  itemCount: number,
  key: string,
): number | undefined {
  if (itemCount <= 0 || currentIndex < 0 || currentIndex >= itemCount) {
    return undefined;
  }
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return undefined;
  const offset = key === "ArrowLeft" ? -1 : 1;
  return (currentIndex + offset + itemCount) % itemCount;
}

export async function writeClipboardText(
  writer: ((value: string) => Promise<void>) | undefined,
  value: string,
): Promise<boolean> {
  if (!writer) return false;
  try {
    await writer(value);
    return true;
  } catch {
    return false;
  }
}
