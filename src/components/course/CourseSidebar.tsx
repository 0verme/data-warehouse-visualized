import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Chapter, Lesson } from '../../data/course'
import type { Locale } from '../../i18n/locale'
import { getMessage } from '../../i18n/messages'
import type { ProgressState } from '../../utils/progress'
import { ensureSidebarItemVisible } from '../../utils/sidebar'
import { getRoute } from '../../utils/routes'

export interface SidebarRevealRequest {
  id: number
  lessonId: string
}

interface CourseSidebarProps {
  chapters: Chapter[]
  activeLesson: Lesson
  expandedChapterId: string | null
  progress: ProgressState
  isOpen: boolean
  locale: Locale
  revealRequest: SidebarRevealRequest
  onToggleChapter: (chapterId: string) => void
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function CourseSidebar({
  chapters,
  activeLesson,
  expandedChapterId,
  progress,
  isOpen,
  locale,
  revealRequest,
  onToggleChapter,
}: CourseSidebarProps) {
  const sidebarRef = useRef<HTMLElement | null>(null)
  const activeLessonRef = useRef<HTMLAnchorElement | null>(null)
  const isInitialSyncRef = useRef(true)
  const lastHandledRevealRequestRef = useRef(-1)

  useIsomorphicLayoutEffect(() => {
    const isInitialSync = isInitialSyncRef.current

    if (isInitialSync) {
      if (expandedChapterId !== activeLesson.chapter) {
        return
      }

      isInitialSyncRef.current = false
      lastHandledRevealRequestRef.current = revealRequest.id
    } else if (
      revealRequest.id <= lastHandledRevealRequestRef.current ||
      revealRequest.lessonId !== activeLesson.id ||
      expandedChapterId !== activeLesson.chapter
    ) {
      return
    } else {
      lastHandledRevealRequestRef.current = revealRequest.id
    }

    const sidebar = sidebarRef.current
    const activeLessonElement = activeLessonRef.current

    if (sidebar && activeLessonElement) {
      ensureSidebarItemVisible(sidebar, activeLessonElement)
    }
  }, [
    activeLesson.chapter,
    activeLesson.id,
    expandedChapterId,
    revealRequest.id,
    revealRequest.lessonId,
  ])

  return (
    <aside
      ref={sidebarRef}
      className={`course-sidebar${isOpen ? ' is-open' : ''}`}
      id="course-sidebar"
      aria-label={getMessage('courseDirectory', locale)}
      data-sidebar-scroll-container
    >
      <div className="course-sidebar__intro">
        <span className="eyebrow eyebrow--small">{getMessage('learningRoute', locale)}</span>
        <h2>从一张表开始</h2>
        <p>沿着数据流动的方向，把抽象概念变成可以观察的步骤。</p>
      </div>

      <nav className="course-nav">
        {chapters.map((chapter) => {
          const completedLessonCount = chapter.lessons.filter((lesson) =>
            progress.completedLessonIds.includes(lesson.id),
          ).length
          const isChapterComplete =
            chapter.lessons.length > 0 && completedLessonCount === chapter.lessons.length
          const isExpanded = expandedChapterId === chapter.id

          return (
            <section className="course-chapter" key={chapter.id} data-course-chapter={chapter.id}>
              <button
                className="course-chapter__heading"
                type="button"
                aria-expanded={isExpanded}
                aria-controls={`chapter-${chapter.id}`}
                onClick={() => onToggleChapter(chapter.id)}
              >
                <span className="course-chapter__chevron" aria-hidden="true">
                  <svg viewBox="0 0 16 16" focusable="false">
                    <path d="m4 6 4 4 4-4" />
                  </svg>
                </span>
                <strong>{chapter.title}</strong>
                <span
                  className={`course-chapter__progress${isChapterComplete ? ' is-complete' : ''}`}
                  data-progress-chapter-lessons={chapter.lessons
                    .map((lesson) => lesson.id)
                    .join(',')}
                  aria-label={`${completedLessonCount}/${chapter.lessons.length} ${getMessage('lessonsCompleted', locale)}`}
                >
                  {completedLessonCount}/{chapter.lessons.length}
                </span>
              </button>
              <ul id={`chapter-${chapter.id}`} data-course-chapter-panel hidden={!isExpanded}>
                {chapter.lessons.map((lesson) => {
                  const isActive = lesson.id === activeLesson.id
                  const isCompleted = progress.completedLessonIds.includes(lesson.id)
                  const statusLabel = isCompleted
                    ? isActive
                      ? getMessage('learnedCurrentLesson', locale)
                      : getMessage('learned', locale)
                    : isActive
                      ? getMessage('currentLesson', locale)
                      : getMessage('notCompleted', locale)

                  return (
                    <li key={lesson.id}>
                      <a
                        ref={isActive ? activeLessonRef : undefined}
                        className={`course-lesson${isActive ? ' is-active' : ''}`}
                        data-progress-lesson-link={lesson.id}
                        href={getRoute(`/learn/${lesson.slug}/`)}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <span
                          className={`course-lesson__status${isActive ? ' is-active' : ''}${isCompleted ? ' is-completed' : ' is-pending'}`}
                          data-progress-lesson-id={lesson.id}
                          role="img"
                          aria-label={statusLabel}
                        >
                          {isCompleted && (
                            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                              <path d="m3.5 8.5 3 3 6-7" />
                            </svg>
                          )}
                        </span>
                        <span className="course-lesson__title">{lesson.title}</span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </nav>
    </aside>
  )
}
