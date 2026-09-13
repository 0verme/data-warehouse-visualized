import type { Lesson } from '../../data/course'
import { getChapterTitle } from '../../data/course'
import type { LessonContent } from '../../content/types'
import { QuickSummary } from './QuickSummary'

interface LessonHeaderProps {
  lesson: Lesson
  content: LessonContent
}

export function LessonHeader({ lesson, content }: LessonHeaderProps) {
  return (
    <header className="lesson-header">
      <div className="lesson-header__meta">
        <span className="lesson-number">{String(lesson.order).padStart(2, '0')}</span>
        <span>{getChapterTitle(lesson.chapter)}</span>
        <span className="meta-separator" aria-hidden="true">
          /
        </span>
        <span>{lesson.estimatedMinutes} 分钟</span>
      </div>
      <h1>{lesson.title}</h1>
      <p className="lesson-header__subtitle">{content.subtitle}</p>
      <div className="lesson-header__tags" aria-label="课程标签">
        {lesson.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <QuickSummary>{content.quickSummary}</QuickSummary>
    </header>
  )
}
