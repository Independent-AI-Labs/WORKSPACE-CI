export const LANDING_POST_TABS_SCROLL_THRESHOLD_PX = 2

export function getHorizontalScrollOverflow(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  threshold = LANDING_POST_TABS_SCROLL_THRESHOLD_PX,
): { canScrollLeft: boolean; canScrollRight: boolean } {
  return {
    canScrollLeft: scrollLeft > threshold,
    canScrollRight: scrollLeft + clientWidth < scrollWidth - threshold,
  }
}

export function getHorizontalScrollStep(clientWidth: number, minStep = 120): number {
  return Math.max(clientWidth * 0.6, minStep)
}