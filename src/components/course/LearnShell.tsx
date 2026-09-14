import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lesson } from '../../data/course'
import { chapters } from '../../data/course'
import type { LessonContent } from '../../content/types'
import { getLessonContent } from '../../content/lessons'
import {
  createInitialProgress,
  getCompletedCount,
  loadProgress,
  saveProgress,
  setCurrentLesson,
  toggleLessonComplete,
  type ProgressState,
} from '../../utils/progress'
import { getAdjacentLessons } from '../../utils/lesson'
import { getRoute } from '../../utils/routes'
import {
  LessonContent as LessonBody,
  LessonHeader,
  LessonNavigation,
  ProgressIndicator,
} from '../lesson'

interface LearnShellProps {
  lessons: Lesson[]
  initialLesson: Lesson
  initialContent: LessonContent
  isIndex?: boolean
}

export function LearnShell({
  lessons,
  initialLesson,
  initialContent,
  isIndex = false,
}: LearnShellProps) {
  const fallbackProgress = useMemo(
    () => createInitialProgress(initialLesson.id),
    [initialLesson.id],
  )
  const [progress, setProgress] = useState<ProgressState>(fallbackProgress)
  const [isHydrated, setIsHydrated] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({})
  const activeLessonRef = useRef<HTMLAnchorElement | null>(null)

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const storedProgress = loadProgress(window.localStorage, fallbackProgress)
      const availableLessonIds = new Set(lessons.map((lesson) => lesson.id))
      const storedLessonIsValid = lessons.some(
        (lesson) => lesson.id === storedProgress.currentLessonId,
      )
      const currentLessonId =
        isIndex && storedLessonIsValid ? storedProgress.currentLessonId : initialLesson.id

      setProgress({
        ...storedProgress,
        completedLessonIds: storedProgress.completedLessonIds.filter((id) =>
          availableLessonIds.has(id),
        ),
        currentLessonId,
      })
      setIsHydrated(true)
    }, 0)

    return () => window.clearTimeout(hydrationTimer)
  }, [fallbackProgress, initialLesson.id, isIndex, lessons])

  useEffect(() => {
    if (isHydrated) {
      saveProgress(window.localStorage, progress)
    }
  }, [isHydrated, progress])

  useEffect(() => {
    if (isHydrated) {
      activeLessonRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [initialLesson.id, isHydrated, progress.currentLessonId])

  const activeLesson = isIndex
    ? (lessons.find((lesson) => lesson.id === progress.currentLessonId) ?? initialLesson)
    : initialLesson
  const activeContent =
    activeLesson.id === initialLesson.id ? initialContent : getLessonContent(activeLesson)
  const adjacentLessons = getAdjacentLessons(lessons, activeLesson.slug)
  const completedCount = getCompletedCount(progress)
  const isActiveLessonCompleted = progress.completedLessonIds.includes(activeLesson.id)

  function updateProgress(nextProgress: ProgressState) {
    setProgress(nextProgress)
    if (typeof window !== 'undefined') {
      saveProgress(window.localStorage, nextProgress)
    }
  }

  function navigateToLesson(lesson: Lesson) {
    updateProgress(setCurrentLesson(progress, lesson.id))
    setIsSidebarOpen(false)
  }

  function toggleActiveLesson() {
    updateProgress(toggleLessonComplete(progress, activeLesson.id))
  }

  function toggleChapter(chapterId: string) {
    setCollapsedChapters((current) => ({
      ...current,
      [chapterId]: !current[chapterId],
    }))
  }

  return (
    <div className="learn-app">
      <header className="learn-topbar">
        <a className="brand brand--learn" href={getRoute('/')} aria-label="返回数据仓库图解首页">
          <span className="brand__mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="brand__text">
            <strong>数据仓库图解</strong>
            <small>交互式教材</small>
          </span>
        </a>

        <div className="learn-topbar__progress">
          <ProgressIndicator
            completedCount={completedCount}
            totalLessons={lessons.length}
            compact
          />
        </div>

        <button
          className="sidebar-toggle"
          type="button"
          aria-expanded={isSidebarOpen}
          aria-controls="course-sidebar"
          onClick={() => setIsSidebarOpen((isOpen) => !isOpen)}
        >
          <span className="sidebar-toggle__icon" aria-hidden="true">
            ☰
          </span>
          课程目录
        </button>
      </header>

      <div className="learn-layout">
        <aside
          className={`course-sidebar${isSidebarOpen ? ' is-open' : ''}`}
          id="course-sidebar"
          aria-label="课程目录"
        >
          <div className="course-sidebar__intro">
            <span className="eyebrow eyebrow--small">学习路线</span>
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

              return (
                <section className="course-chapter" key={chapter.id}>
                  <button
                    className="course-chapter__heading"
                    type="button"
                    aria-expanded={!collapsedChapters[chapter.id]}
                    aria-controls={`chapter-${chapter.id}`}
                    onClick={() => toggleChapter(chapter.id)}
                  >
                    <span className="course-chapter__chevron" aria-hidden="true">
                      <svg viewBox="0 0 16 16" focusable="false">
                        <path d="m4 6 4 4 4-4" />
                      </svg>
                    </span>
                    <span className="course-chapter__index">{chapter.id}</span>
                    <strong>{chapter.title}</strong>
                    <span
                      className={`course-chapter__progress${isChapterComplete ? ' is-complete' : ''}`}
                      aria-label={`${completedLessonCount}/${chapter.lessons.length} 节已完成`}
                    >
                      {completedLessonCount}/{chapter.lessons.length}
                    </span>
                  </button>
                  <ul id={`chapter-${chapter.id}`} hidden={collapsedChapters[chapter.id]}>
                    {chapter.lessons.map((lesson) => {
                      const isActive = lesson.id === activeLesson.id
                      const isCompleted = progress.completedLessonIds.includes(lesson.id)
                      const statusLabel = isCompleted
                        ? isActive
                          ? '已学会，当前课程'
                          : '已学会'
                        : isActive
                          ? '当前课程'
                          : '未完成'

                      return (
                        <li key={lesson.id}>
                          <a
                            ref={isActive ? activeLessonRef : undefined}
                            className={`course-lesson${isActive ? ' is-active' : ''}`}
                            href={getRoute(`/learn/${lesson.slug}/`)}
                            aria-current={isActive ? 'page' : undefined}
                            onClick={() => navigateToLesson(lesson)}
                          >
                            <span
                              className={`course-lesson__status${isActive ? ' is-active' : ''}${isCompleted ? ' is-completed' : ' is-pending'}`}
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

        {isSidebarOpen && (
          <button
            className="sidebar-backdrop"
            type="button"
            aria-label="关闭课程目录"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <main className="learn-main">
          <div className="learn-main__crumbs">
            <a href={getRoute('/')}>首页</a>
            <span aria-hidden="true">/</span>
            <span>课程学习</span>
            <span aria-hidden="true">/</span>
            <span>{activeLesson.title}</span>
          </div>
          <LessonHeader lesson={activeLesson} content={activeContent} />
          <LessonBody lesson={activeLesson} content={activeContent} />
          <LessonNavigation
            previous={adjacentLessons.previous}
            next={adjacentLessons.next}
            isCompleted={isActiveLessonCompleted}
            onToggleComplete={toggleActiveLesson}
            onNavigate={navigateToLesson}
          />
        </main>
      </div>
    </div>
  )
}
