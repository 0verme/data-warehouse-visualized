import type { Lesson } from '../../data/course'
import { getRoute } from '../../utils/routes'

interface LessonNavigationProps {
  previous?: Lesson
  next?: Lesson
  lessonId: string
  isCompleted: boolean
  onToggleComplete: () => void
}

function LessonLink({ lesson, direction }: { lesson?: Lesson; direction: 'previous' | 'next' }) {
  if (!lesson) {
    return <div className={`lesson-nav__link lesson-nav__link--${direction} is-disabled`} />
  }

  return (
    <a
      className={`lesson-nav__link lesson-nav__link--${direction}`}
      href={getRoute(`/learn/${lesson.slug}/`)}
    >
      <span className="lesson-nav__direction">
        {direction === 'previous' ? '上一节' : '下一节'}
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
}: LessonNavigationProps) {
  return (
    <nav className="lesson-nav" aria-label="课程导航">
      <LessonLink lesson={previous} direction="previous" />
      <button
        className={`complete-button${isCompleted ? ' is-completed' : ''}`}
        data-progress-complete-lesson={lessonId}
        type="button"
        aria-pressed={isCompleted}
        onClick={onToggleComplete}
      >
        <span aria-hidden="true">✓</span>
        {isCompleted ? '已学会' : '标记为已学会'}
      </button>
      <LessonLink lesson={next} direction="next" />
    </nav>
  )
}
