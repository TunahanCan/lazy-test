export const responseSizeMinimum = 24;
export const responseSizeMaximum = 72;
export const responseSizeStep = 2;

export type ResponseSplitPlacement = "vertical" | "horizontal";

export function clampResponseSize(size: number): number {
  const finite = Number.isFinite(size) ? size : 42;
  return Math.max(
    responseSizeMinimum,
    Math.min(responseSizeMaximum, finite),
  );
}

export function responseSizeFromPointer(
  startSize: number,
  startCoordinate: number,
  currentCoordinate: number,
  containerExtent: number,
): number {
  if (!Number.isFinite(containerExtent) || containerExtent <= 0) {
    return clampResponseSize(startSize);
  }
  const delta =
    ((currentCoordinate - startCoordinate) / containerExtent) * 100;
  return clampResponseSize(startSize - delta);
}

export function responseSizeFromKey(
  currentSize: number,
  placement: ResponseSplitPlacement,
  key: string,
): number | undefined {
  if (key === "Home") return responseSizeMinimum;
  if (key === "End") return responseSizeMaximum;
  const increase =
    placement === "vertical" ? key === "ArrowUp" : key === "ArrowLeft";
  const decrease =
    placement === "vertical" ? key === "ArrowDown" : key === "ArrowRight";
  if (!increase && !decrease) return undefined;
  return clampResponseSize(
    currentSize + (increase ? responseSizeStep : -responseSizeStep),
  );
}

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
