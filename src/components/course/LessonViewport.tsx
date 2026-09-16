import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Lesson } from '../../data/course'
import type { LessonContent } from '../../content/types'
import type { CodeHighlightMap } from '../../utils/code-highlight'
import type { Locale } from '../../i18n/locale'
import { getMessage } from '../../i18n/messages'
import { getRoute } from '../../utils/routes'
import { resetLessonViewportScroll } from '../../utils/scroll'
import { LessonContent as LessonBody, LessonHeader, LessonNavigation } from '../lesson'

interface LessonViewportProps {
  activeLesson: Lesson
  lessons: Lesson[]
  content: LessonContent
  codeHighlights?: CodeHighlightMap
  previous?: Lesson
  next?: Lesson
  isCompleted: boolean
  onToggleComplete: () => void
  locale: Locale
  mainScrollResetKey: number
  shouldResetMainScroll: boolean
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function LessonViewport({
  activeLesson,
  lessons,
  content,
  codeHighlights,
  previous,
  next,
  isCompleted,
  onToggleComplete,
  locale,
  mainScrollResetKey,
  shouldResetMainScroll,
}: LessonViewportProps) {
  const mainScrollRef = useRef<HTMLDivElement | null>(null)

  useIsomorphicLayoutEffect(() => {
    if (!shouldResetMainScroll) {
      return
    }

    if (mainScrollRef.current) {
      resetLessonViewportScroll(mainScrollRef.current)
    }
  }, [mainScrollResetKey, shouldResetMainScroll])

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
        <LessonHeader lesson={activeLesson} lessons={lessons} content={content} locale={locale} />
        <LessonBody
          lesson={activeLesson}
          content={content}
          codeHighlights={codeHighlights}
          locale={locale}
        />
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
