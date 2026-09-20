/**
 * Fragment positioning for the Learn page scroll owner (#148 P1-A).
 *
 * Learn pages lock the document (`html.learn-page { overflow: hidden }`) and
 * scroll `.learn-main__scroll` instead. A native fragment jump therefore has
 * nothing to move, and Astro's ClientRouter only replaces the DOM — it never
 * touches the inner scroller. These helpers resolve a `location.hash` to a
 * heading inside the lesson scroller and move that scroller deterministically.
 *
 * Pure and DOM-light on purpose: the React effect owns *when* to run, these
 * functions own *what* happens.
 */
import type { LessonViewportScrollContainer } from './scroll'

/** Rect shape used by the scroll math (subset of `DOMRect`). */
export interface AnchorRect {
  top: number
}

/** The lesson scroll owner plus the metrics needed to align an anchor. */
export interface LessonAnchorScrollContainer extends LessonViewportScrollContainer {
  scrollHeight: number
  clientHeight: number
  getBoundingClientRect: () => AnchorRect
}

/** Anchor target shape: only its viewport rect is needed. */
export interface LessonAnchorTarget {
  getBoundingClientRect: () => AnchorRect
}

/**
 * `location.hash` → anchor id.
 *
 * Returns `null` for an empty hash or a non-fragment value so callers never
 * build a selector from `''`. Malformed percent-encoding is kept verbatim
 * (the lookup then simply misses and degrades to the lesson top).
 */
export function getLessonAnchorId(hash: string): string | null {
  if (typeof hash !== 'string' || !hash.startsWith('#')) {
    return null
  }

  const raw = hash.slice(1)
  if (!raw) {
    return null
  }

  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * Final `scrollTop` that puts the target at the top of the lesson scrollport,
 * clamped to the container's scrollable range. Mirrors native fragment
 * positioning: the container's padding box is the scrollport, so the element
 * rect alone is enough (no hard-coded topbar offset).
 */
export function getLessonAnchorScrollTop(
  container: LessonAnchorScrollContainer,
  target: LessonAnchorTarget,
): number {
  const containerTop = container.getBoundingClientRect().top
  const targetTop = target.getBoundingClientRect().top
  const desired = container.scrollTop + (targetTop - containerTop)
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)

  return Math.min(Math.max(desired, 0), maxScrollTop)
}

/** Move the lesson viewport to a target instantly (never smooth-scroll). */
export function scrollLessonAnchorIntoView(
  container: LessonAnchorScrollContainer,
  target: LessonAnchorTarget,
): void {
  const top = getLessonAnchorScrollTop(container, target)

  if (container.scrollTo) {
    container.scrollTo({ behavior: 'instant', left: 0, top })
    return
  }

  container.scrollTop = top
}

/**
 * Resolve an anchor id to an element owned by the lesson scroller.
 *
 * `getElementById` keeps arbitrary hash values (including quotes or spaces)
 * safe without a selector builder; the containment check rejects ids that
 * live outside the lesson content (topbar, sidebar, dialogs).
 */
export function findLessonAnchor(container: HTMLElement, anchorId: string): HTMLElement | null {
  const target = container.ownerDocument?.getElementById(anchorId)

  if (!target || !container.contains(target)) {
    return null
  }

  return target
}
