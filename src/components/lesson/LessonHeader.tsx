import type { Lesson } from '../../data/course'
import { getChapterTitle } from '../../data/course'
import type { LessonContent } from '../../content/types'
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale'
import { getMessage } from '../../i18n/messages'
import { QuickSummary } from './QuickSummary'

interface LessonHeaderProps {
  lesson: Lesson
  content: LessonContent
  locale?: Locale
}

export function LessonHeader({ lesson, content, locale = DEFAULT_LOCALE }: LessonHeaderProps) {
  return (
    <header className="lesson-header">
      <div className="lesson-header__meta">
        <span className="lesson-number">{String(lesson.order).padStart(2, '0')}</span>
        <span>{getChapterTitle(lesson.chapter, locale)}</span>
        <span className="meta-separator" aria-hidden="true">
          /
        </span>
        <span>
          {lesson.estimatedMinutes} {getMessage('minutes', locale)}
        </span>
      </div>
      <h1>{lesson.title}</h1>
      <p className="lesson-header__subtitle">{content.subtitle}</p>
      <div className="lesson-header__tags" aria-label={getMessage('courseTags', locale)}>
        {lesson.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <QuickSummary>{content.quickSummary}</QuickSummary>
    </header>
  )
}
