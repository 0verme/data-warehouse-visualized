export interface SidebarRect {
  top: number
  bottom: number
}

export interface SidebarScrollContainer {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
  getBoundingClientRect: () => SidebarRect
}

export interface SidebarScrollTarget {
  getBoundingClientRect: () => SidebarRect
}

/** Keep a small breathing room so an item at the edge is still easy to read. */
export const SIDEBAR_VISIBILITY_MARGIN = 8

function getContainerViewportHeight(container: SidebarScrollContainer, rect: SidebarRect): number {
  if (container.clientHeight > 0) {
    return container.clientHeight
  }

  return Math.max(0, rect.bottom - rect.top)
}

/**
 * Calculate the smallest scrollTop change that brings a sidebar item into view.
 * Returning null means the item is already visible and the container must not move.
 */
export function getMinimalSidebarScrollTop(
  container: SidebarScrollContainer,
  target: SidebarScrollTarget,
  visibilityMargin = SIDEBAR_VISIBILITY_MARGIN,
): number | null {
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const viewportHeight = getContainerViewportHeight(container, containerRect)
  const viewportTop = containerRect.top + visibilityMargin
  const viewportBottom = containerRect.top + viewportHeight - visibilityMargin
  const targetHeight = Math.max(0, targetRect.bottom - targetRect.top)
  const currentScrollTop = Number.isFinite(container.scrollTop) ? container.scrollTop : 0
  const usableViewportHeight = Math.max(0, viewportBottom - viewportTop)

  let nextScrollTop: number | null = null

  if (targetHeight > usableViewportHeight) {
    nextScrollTop = currentScrollTop + targetRect.top - viewportTop
  } else if (targetRect.top < viewportTop) {
    nextScrollTop = currentScrollTop + targetRect.top - viewportTop
  } else if (targetRect.bottom > viewportBottom) {
    nextScrollTop = currentScrollTop + targetRect.bottom - viewportBottom
  }

  if (nextScrollTop === null) {
    return null
  }

  const maxScrollTop = Math.max(0, container.scrollHeight - viewportHeight)
  return Math.min(maxScrollTop, Math.max(0, nextScrollTop))
}

/** Move only the sidebar container when its active item is outside its viewport. */
export function ensureSidebarItemVisible(
  container: SidebarScrollContainer,
  target: SidebarScrollTarget,
  visibilityMargin = SIDEBAR_VISIBILITY_MARGIN,
): boolean {
  const nextScrollTop = getMinimalSidebarScrollTop(container, target, visibilityMargin)

  if (nextScrollTop === null || nextScrollTop === container.scrollTop) {
    return false
  }

  container.scrollTop = nextScrollTop
  return true
}
