import { useEffect, useLayoutEffect, type RefObject } from 'react'
import type { Lesson } from '../../data/course'
import type { LessonContent } from '../../content/types'
import type { CodeHighlightMap } from '../../utils/code-highlight'
import type { Locale } from '../../i18n/locale'
import { getMessage } from '../../i18n/messages'
import { getRoute } from '../../utils/routes'
import { getLessonAnchorId } from '../../utils/lesson-anchor'
import { resetLessonViewportScroll } from '../../utils/scroll'
import type { LessonContentStatus } from './useLessonContent'
import { LessonContent as LessonBody, LessonHeader, LessonNavigation } from '../lesson'

interface LessonViewportProps {
  activeLesson: Lesson
  lessons: Lesson[]
  content: LessonContent | null
  contentStatus: LessonContentStatus
  onRetryContent: () => void
  codeHighlights?: CodeHighlightMap
  previous?: Lesson
  next?: Lesson
  isCompleted: boolean
  onToggleComplete: () => void
  locale: Locale
  /** Owned by `LearnShell`: reset and anchor positioning share one container ref. */
  mainScrollRef: RefObject<HTMLDivElement | null>
  mainScrollResetKey: number
  shouldResetMainScroll: boolean
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function LessonViewport({
  activeLesson,
  lessons,
  content,
  contentStatus,
  onRetryContent,
  codeHighlights,
  previous,
  next,
  isCompleted,
  onToggleComplete,
  locale,
  mainScrollRef,
  mainScrollResetKey,
  shouldResetMainScroll,
}: LessonViewportProps) {
  useIsomorphicLayoutEffect(() => {
    if (!shouldResetMainScroll) {
      return
    }

    const container = mainScrollRef.current
    if (!container) {
      return
    }

    // A fragment navigation is positioned by `useLessonAnchorScroll` once the
    // target lesson content exists; a reset here would fight that placement.
    if (getLessonAnchorId(window.location.hash)) {
      return
    }

    resetLessonViewportScroll(container)
  }, [mainScrollRef, mainScrollResetKey, shouldResetMainScroll])

  return (
    <main className="learn-main">
      <div ref={mainScrollRef} className="learn-main__scroll">
        <div className="learn-main__crumbs">
          <a href={getRoute('/')}>{getMessage('home', locale)}</a>
          <span aria-hidden="true">/</span>
          <span>{getMessage('courseLearning', locale)}</span>
          <span aria-hidden="true">/</span>
          <span>{activeLesson.title}</span>
        </div>
        {contentStatus === 'ready' && content ? (
          <>
            <LessonHeader
              lesson={activeLesson}
              lessons={lessons}
              content={content}
              locale={locale}
            />
            <LessonBody
              lesson={activeLesson}
              content={content}
              codeHighlights={codeHighlights}
              locale={locale}
            />
          </>
        ) : contentStatus === 'error' ? (
          <div
            className="lesson-content-status"
            data-status="error"
            role="alert"
            style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}
          >
            <div className="lesson-content-status__inner">
              <p>{getMessage('lessonContentLoadError', locale)}</p>
              <button type="button" onClick={onRetryContent}>
                {getMessage('retry', locale)}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="lesson-content-status"
            data-status="loading"
            role="status"
            aria-live="polite"
            style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}
          >
            <p>{getMessage('lessonContentLoading', locale)}</p>
          </div>
        )}
      </div>
      <LessonNavigation
        previous={previous}
        next={next}
        lessonId={activeLesson.id}
        isCompleted={isCompleted}
        onToggleComplete={onToggleComplete}
        locale={locale}
      />
    </main>
  )
}
