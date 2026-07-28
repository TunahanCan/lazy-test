export const VIRTUAL_LIST_NAVIGATION_KEY = {
  NEXT: "ArrowDown",
  PREVIOUS: "ArrowUp",
  FIRST: "Home",
  LAST: "End",
} as const;

export type VirtualListNavigationKey =
  (typeof VIRTUAL_LIST_NAVIGATION_KEY)[keyof typeof VIRTUAL_LIST_NAVIGATION_KEY];

export interface VirtualWindowRange {
  start: number;
  end: number;
}

interface VirtualListMetrics {
  count: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscan: number;
  fallbackVisibleRows?: number;
}

interface VirtualNavigationInput extends VirtualListMetrics {
  currentIndex: number;
  key: VirtualListNavigationKey;
}

export interface VirtualNavigationTarget {
  index: number;
  scrollTop: number;
  window: VirtualWindowRange;
}

const defaultFallbackVisibleRows = 20;

function clampedInteger(value: number, minimum: number): number {
  return Math.max(minimum, Math.floor(Number.isFinite(value) ? value : 0));
}

function effectiveViewportHeight(
  viewportHeight: number,
  rowHeight: number,
  fallbackVisibleRows = defaultFallbackVisibleRows,
): number {
  if (viewportHeight > 0) return viewportHeight;
  return rowHeight * clampedInteger(fallbackVisibleRows, 1);
}

/**
 * Returns an end-exclusive render window for a fixed-height virtual list.
 */
export function virtualWindowRange({
  count,
  scrollTop,
  viewportHeight,
  rowHeight,
  overscan,
  fallbackVisibleRows,
}: VirtualListMetrics): VirtualWindowRange {
  const safeCount = clampedInteger(count, 0);
  const safeRowHeight = clampedInteger(rowHeight, 1);
  const safeOverscan = clampedInteger(overscan, 0);
  const requestedScrollTop = Math.max(
    0,
    Number.isFinite(scrollTop) ? scrollTop : 0,
  );
  const effectiveHeight = effectiveViewportHeight(
    viewportHeight,
    safeRowHeight,
    fallbackVisibleRows,
  );
  const safeScrollTop = Math.min(
    Math.max(0, safeCount * safeRowHeight - effectiveHeight),
    requestedScrollTop,
  );
  return {
    start: Math.max(
      0,
      Math.floor(safeScrollTop / safeRowHeight) - safeOverscan,
    ),
    end: Math.min(
      safeCount,
      Math.ceil(
        (safeScrollTop + effectiveHeight) / safeRowHeight,
      ) + safeOverscan,
    ),
  };
}

export function isVirtualListNavigationKey(
  value: string,
): value is VirtualListNavigationKey {
  return Object.values(VIRTUAL_LIST_NAVIGATION_KEY).some(
    (key) => key === value,
  );
}

/**
 * Resolves keyboard navigation against the complete logical list, then
 * adjusts scroll position so the target row is both visible and rendered.
 */
export function virtualNavigationTarget({
  count,
  currentIndex,
  key,
  scrollTop,
  viewportHeight,
  rowHeight,
  overscan,
  fallbackVisibleRows,
}: VirtualNavigationInput): VirtualNavigationTarget | undefined {
  const safeCount = clampedInteger(count, 0);
  if (safeCount === 0) return undefined;

  const safeCurrentIndex = Math.min(
    safeCount - 1,
    clampedInteger(currentIndex, 0),
  );
  let index = safeCurrentIndex;
  switch (key) {
    case VIRTUAL_LIST_NAVIGATION_KEY.NEXT:
      index = Math.min(safeCount - 1, safeCurrentIndex + 1);
      break;
    case VIRTUAL_LIST_NAVIGATION_KEY.PREVIOUS:
      index = Math.max(0, safeCurrentIndex - 1);
      break;
    case VIRTUAL_LIST_NAVIGATION_KEY.FIRST:
      index = 0;
      break;
    case VIRTUAL_LIST_NAVIGATION_KEY.LAST:
      index = safeCount - 1;
      break;
  }

  const safeRowHeight = clampedInteger(rowHeight, 1);
  const effectiveHeight = effectiveViewportHeight(
    viewportHeight,
    safeRowHeight,
    fallbackVisibleRows,
  );
  const maximumScrollTop = Math.max(
    0,
    safeCount * safeRowHeight - effectiveHeight,
  );
  const currentScrollTop = Math.min(
    maximumScrollTop,
    Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0),
  );
  const rowTop = index * safeRowHeight;
  const rowBottom = rowTop + safeRowHeight;
  let nextScrollTop = currentScrollTop;
  if (rowTop < currentScrollTop) {
    nextScrollTop = rowTop;
  } else if (rowBottom > currentScrollTop + effectiveHeight) {
    nextScrollTop = rowBottom - effectiveHeight;
  }
  nextScrollTop = Math.min(
    maximumScrollTop,
    Math.max(0, nextScrollTop),
  );

  const metrics = {
    count: safeCount,
    scrollTop: nextScrollTop,
    viewportHeight: effectiveHeight,
    rowHeight: safeRowHeight,
    overscan,
    fallbackVisibleRows,
  };
  return {
    index,
    scrollTop: nextScrollTop,
    window: virtualWindowRange(metrics),
  };
}
