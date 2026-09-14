import type { Lesson } from '../../data/course'
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale'
import { getMessage } from '../../i18n/messages'
import { getRoute } from '../../utils/routes'

interface LessonNavigationProps {
  previous?: Lesson
  next?: Lesson
  lessonId: string
  isCompleted: boolean
  onToggleComplete: () => void
  locale?: Locale
}

function LessonLink({
  lesson,
  direction,
  locale,
}: {
  lesson?: Lesson
  direction: 'previous' | 'next'
  locale: Locale
}) {
  if (!lesson) {
    return <div className={`lesson-nav__link lesson-nav__link--${direction} is-disabled`} />
  }

  return (
    <a
      className={`lesson-nav__link lesson-nav__link--${direction}`}
      href={getRoute(`/learn/${lesson.slug}/`)}
    >
      <span className="lesson-nav__direction">
        {getMessage(direction === 'previous' ? 'previousLesson' : 'nextLesson', locale)}
      </span>
      <strong>{lesson.title}</strong>
      <span className="lesson-nav__arrow" aria-hidden="true">
        {direction === 'previous' ? '←' : '→'}
      </span>
    </a>
  )
}

export function LessonNavigation({
  previous,
  next,
  lessonId,
  isCompleted,
  onToggleComplete,
  locale = DEFAULT_LOCALE,
}: LessonNavigationProps) {
  return (
    <nav className="lesson-nav" aria-label={getMessage('courseNavigation', locale)}>
      <LessonLink lesson={previous} direction="previous" locale={locale} />
      <button
        className={`complete-button${isCompleted ? ' is-completed' : ''}`}
        data-progress-complete-lesson={lessonId}
        type="button"
        aria-pressed={isCompleted}
        onClick={onToggleComplete}
      >
        <span aria-hidden="true">✓</span>
        {getMessage(isCompleted ? 'learned' : 'markAsLearned', locale)}
      </button>
      <LessonLink lesson={next} direction="next" locale={locale} />
    </nav>
  )
}
