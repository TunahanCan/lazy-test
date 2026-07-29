export const panelMinWidth = 224;
// Side panels are supporting surfaces. Once keeping both of them open would
// squeeze the request workbench below a comfortable editing width, they turn
// into drawers instead of competing with the primary task.
export const panelCompactThresholdWidth = 224;
export const panelMaxWidth = 440;
export const verticalCenterMinWidth = 680;
export const horizontalCenterMinWidth = 800;
export const panelResizerWidth = 4;
export const panelKeyboardStep = 16;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function fitPanelWidths(
  containerWidth: number,
  centerMinWidth: number,
  leftVisible: boolean,
  rightVisible: boolean,
  leftWidth: number,
  rightWidth: number,
): { left: number; right: number } {
  const visibleCount = Number(leftVisible) + Number(rightVisible);
  const budget = Math.max(
    0,
    containerWidth - centerMinWidth - visibleCount * panelResizerWidth,
  );
  const desiredLeft = leftVisible
    ? clamp(leftWidth, panelMinWidth, panelMaxWidth)
    : 0;
  const desiredRight = rightVisible
    ? clamp(rightWidth, panelMinWidth, panelMaxWidth)
    : 0;
  if (visibleCount === 0) return { left: 0, right: 0 };
  if (visibleCount === 1) {
    return {
      left: leftVisible ? Math.floor(Math.min(desiredLeft, budget)) : 0,
      right: rightVisible ? Math.floor(Math.min(desiredRight, budget)) : 0,
    };
  }
  if (desiredLeft + desiredRight <= budget) {
    return { left: desiredLeft, right: desiredRight };
  }
  const safeMinimum = Math.min(panelMinWidth, budget / 2);
  const leftCapacity = Math.max(0, desiredLeft - safeMinimum);
  const rightCapacity = Math.max(0, desiredRight - safeMinimum);
  const totalCapacity = leftCapacity + rightCapacity;
  const overflow = desiredLeft + desiredRight - budget;
  const leftReduction =
    totalCapacity > 0 ? overflow * (leftCapacity / totalCapacity) : overflow / 2;
  const fittedLeft = clamp(
    desiredLeft - leftReduction,
    safeMinimum,
    desiredLeft,
  );
  return {
    left: Math.floor(fittedLeft),
    right: Math.floor(Math.max(0, budget - fittedLeft)),
  };
}
