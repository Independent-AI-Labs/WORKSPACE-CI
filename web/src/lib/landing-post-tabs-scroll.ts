export const LANDING_POST_TABS_SCROLL_THRESHOLD_PX = 2

export type PostTabIndicatorRect = { x: number; y: number; w: number; h: number }

/** Map active tab bounds into scroll-content coordinates for an in-list indicator. */
export function getPostTabIndicatorRect(
  list: HTMLElement,
  tab: HTMLElement,
  listRect = list.getBoundingClientRect(),
  tabRect = tab.getBoundingClientRect(),
): PostTabIndicatorRect {
  return {
    x: tabRect.left - listRect.left + list.scrollLeft,
    y: tabRect.top - listRect.top + list.scrollTop,
    w: tabRect.width,
    h: tabRect.height,
  }
}

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