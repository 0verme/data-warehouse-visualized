import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import {
  findLessonAnchor,
  getLessonAnchorId,
  scrollLessonAnchorIntoView,
} from '../../utils/lesson-anchor'
import { resetLessonViewportScroll } from '../../utils/scroll'
import type { LessonContentStatus } from './useLessonContent'

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export type LessonNavigationKind = 'initial' | 'navigate' | 'traverse'

export interface LessonAnchorNavigation {
  /** Navigation counter; `0` means the SSR page load, which the browser owns. */
  id: number
  kind: LessonNavigationKind
}

interface UseLessonAnchorScrollOptions {
  containerRef: RefObject<HTMLElement | null>
  navigation: LessonAnchorNavigation
  contentStatus: LessonContentStatus
  /** Re-attempts when the active lesson changes while the status stays `loading`. */
  activeLessonSlug: string
}

/**
 * Position `.learn-main__scroll` at `location.hash` after a client-side route
 * change (#148 P1-A).
 *
 * Why this exists: Learn pages lock the document (`html.learn-page`), so the
 * browser scrolls `documentElement` for a fragment while the real vertical
 * scroll owner is `.learn-main__scroll`. Native jumps therefore do nothing for
 * ClientRouter soft navigation (hard navigation is unaffected).
 *
 * Rules:
 * - initial hard load of an SSR lesson keeps its native fragment behaviour;
 * - initial hard load whose target lesson is still loading (e.g. `/learn/`
 *   restoring a stored progress lesson) is positioned once `useLessonContent`
 *   reports `ready`, because the browser had no target to scroll to;
 * - the effect waits for content, so a lazily loaded target lesson is
 *   positioned once its headings actually exist;
 * - it attempts once per navigation / content state — no timers, no polling;
 * - an unknown anchor or a failed content load degrades to the lesson top.
 *
 * Must run after `ensureLessonStyles()` in `LearnShell` so newly injected
 * lesson CSS is present before the target rect is measured.
 */
export function useLessonAnchorScroll({
  containerRef,
  navigation,
  contentStatus,
  activeLessonSlug,
}: UseLessonAnchorScrollOptions): void {
  // Records whether the hard load already had its lesson content (SSR lesson).
  // `null` = first effect run of this island has not happened yet.
  const initialContentWasReadyRef = useRef<boolean | null>(null)

  useIsomorphicLayoutEffect(() => {
    if (navigation.id === 0) {
      if (initialContentWasReadyRef.current === null) {
        initialContentWasReadyRef.current = contentStatus === 'ready'
      }

      // Hard load of an SSR lesson: the target exists in the SSR markup and the
      // browser already performed native fragment scrolling. Never re-position
      // it — the user may already be reading.
      if (initialContentWasReadyRef.current) {
        return
      }
      // Hard load whose lesson content is still loading (`/learn/` restoring a
      // stored progress lesson): native scrolling had no target, so wait for
      // `useLessonContent` below and position once it resolves.
    }

    const container = containerRef.current
    if (!container) {
      return
    }

    const anchorId = getLessonAnchorId(window.location.hash)
    if (!anchorId) {
      return
    }

    if (contentStatus === 'loading') {
      return
    }

    if (contentStatus === 'error') {
      resetLessonViewportScroll(container)
      return
    }

    const target = findLessonAnchor(container, anchorId)

    if (target) {
      scrollLessonAnchorIntoView(container, target)
      return
    }

    // Anchor does not exist in this lesson (typo / removed section):
    // fall back to the lesson top instead of throwing or retrying forever.
    resetLessonViewportScroll(container)
  }, [containerRef, navigation.id, navigation.kind, contentStatus, activeLessonSlug])
}
