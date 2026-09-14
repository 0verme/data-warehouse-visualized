import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lesson } from '../../data/course'
import { chapters } from '../../data/course'
import type { LessonContent } from '../../content/types'
import { getLessonContent } from '../../content/lessons'
import {
  createInitialProgress,
  getCompletedCount,
  loadProgress,
  normalizeProgress,
  PROGRESS_STORAGE_KEY,
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

interface ProgressBootstrapState {
  completedLessonIds: string[]
  currentLessonId: string
}

declare global {
  interface Window {
    __DWV_PROGRESS__?: ProgressBootstrapState
  }
}

const progressBootstrapScript = `(() => {
  const root = document.currentScript?.closest('astro-island')
  let stored = null

  try {
    const raw = window.localStorage.getItem(${JSON.stringify(PROGRESS_STORAGE_KEY)})
    stored = raw ? JSON.parse(raw) : null
  } catch {
    stored = null
  }

  const completedLessonIds = Array.isArray(stored?.completedLessonIds)
    ? [...new Set(stored.completedLessonIds.filter((id) => typeof id === 'string'))]
    : []
  const currentLessonId = typeof stored?.currentLessonId === 'string' ? stored.currentLessonId : ''
  const progress = { completedLessonIds, currentLessonId }

  window.__DWV_PROGRESS__ = progress
  if (!root) return

  const setFirstText = (element, value) => {
    const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE)
    if (textNode) textNode.nodeValue = value
  }

  const statusElements = Array.from(root.querySelectorAll('[data-progress-lesson-id]'))
  const knownLessonIds = new Set(
    statusElements
      .map((element) => element.getAttribute('data-progress-lesson-id'))
      .filter(Boolean),
  )
  const validCompletedLessonIds = completedLessonIds.filter((id) => knownLessonIds.has(id))
  const completedLessonSet = new Set(validCompletedLessonIds)
  progress.completedLessonIds = validCompletedLessonIds

  if (root.getAttribute('data-progress-index') === 'true' && currentLessonId) {
    root.querySelectorAll('[data-progress-lesson-link]').forEach((link) => {
      const isActive = link.getAttribute('data-progress-lesson-link') === currentLessonId
      link.classList.toggle('is-active', isActive)
      if (isActive) {
        link.setAttribute('aria-current', 'page')
      } else {
        link.removeAttribute('aria-current')
      }
      link.querySelector('[data-progress-lesson-id]')?.classList.toggle('is-active', isActive)
    })
  }

  statusElements.forEach((status) => {
    const lessonId = status.getAttribute('data-progress-lesson-id')
    const isCompleted = lessonId ? completedLessonSet.has(lessonId) : false
    const isActive = status.classList.contains('is-active')
    status.classList.toggle('is-completed', isCompleted)
    status.classList.toggle('is-pending', !isCompleted)
    status.setAttribute(
      'aria-label',
      isCompleted ? (isActive ? '已学会，当前课程' : '已学会') : isActive ? '当前课程' : '未完成',
    )

    if (isCompleted && !status.querySelector('svg')) {
      status.insertAdjacentHTML(
        'beforeend',
        '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m3.5 8.5 3 3 6-7"></path></svg>',
      )
    } else if (!isCompleted) {
      status.querySelector('svg')?.remove()
    }
  })

  const progressCount = root.querySelector('[data-progress-count]')
  if (progressCount) {
    setFirstText(progressCount, String(validCompletedLessonIds.length))
  }

  const progressBar = root.querySelector('[data-progress-bar]')
  if (progressBar) {
    const percent = knownLessonIds.size
      ? Math.round((validCompletedLessonIds.length / knownLessonIds.size) * 100)
      : 0
    progressBar.setAttribute('aria-valuenow', String(validCompletedLessonIds.length))
    progressBar.querySelector('span')?.style.setProperty('width', percent + '%')
  }

  root.querySelectorAll('[data-progress-chapter-lessons]').forEach((chapterProgress) => {
    const lessonIds = (chapterProgress.getAttribute('data-progress-chapter-lessons') || '')
      .split(',')
      .filter(Boolean)
    const completedCount = lessonIds.filter((id) => completedLessonSet.has(id)).length
    const isComplete = lessonIds.length > 0 && completedCount === lessonIds.length
    chapterProgress.classList.toggle('is-complete', isComplete)
    chapterProgress.setAttribute('aria-label', completedCount + '/' + lessonIds.length + ' 节已完成')
    setFirstText(chapterProgress, String(completedCount))
  })

  root.querySelectorAll('[data-progress-complete-lesson]').forEach((button) => {
    const lessonId = button.getAttribute('data-progress-complete-lesson')
    const isCompleted = lessonId ? completedLessonSet.has(lessonId) : false
    button.classList.toggle('is-completed', isCompleted)
    button.setAttribute('aria-pressed', String(isCompleted))
    const textNodes = Array.from(button.childNodes).filter(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
    )
    const labelNode = textNodes[textNodes.length - 1]
    if (labelNode) labelNode.nodeValue = isCompleted ? '已学会' : '标记为已学会'
  })
})()`

function getLessonFromPath(pathname: string, lessons: Lesson[]): Lesson | undefined {
  const normalizedPath = pathname.replace(/\/+$/, '')

  return lessons.find((lesson) => normalizedPath.endsWith(`/learn/${lesson.slug}`))
}

function getInitialProgress(
  fallbackProgress: ProgressState,
  lessons: Lesson[],
  initialLessonId: string,
  isIndex: boolean,
): ProgressState {
  if (typeof window === 'undefined') {
    return fallbackProgress
  }

  const bootstrappedProgress = window.__DWV_PROGRESS__
  if (bootstrappedProgress) {
    delete window.__DWV_PROGRESS__
  }
  const storedProgress = bootstrappedProgress ?? loadProgress(window.localStorage, fallbackProgress)

  return normalizeProgress(
    storedProgress,
    lessons.map((lesson) => lesson.id),
    initialLessonId,
    isIndex,
  )
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
  const [progress, setProgress] = useState<ProgressState>(() =>
    getInitialProgress(fallbackProgress, lessons, initialLesson.id, isIndex),
  )
  const [selectedLessonId, setSelectedLessonId] = useState(initialLesson.id)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({})
  const activeLessonRef = useRef<HTMLAnchorElement | null>(null)

  useEffect(() => {
    function handlePageLoad() {
      const routeLesson = getLessonFromPath(window.location.pathname, lessons)
      if (!routeLesson) {
        return
      }

      setSelectedLessonId(routeLesson.id)
      setProgress((currentProgress) =>
        currentProgress.currentLessonId === routeLesson.id
          ? currentProgress
          : setCurrentLesson(currentProgress, routeLesson.id),
      )
    }

    document.addEventListener('astro:after-swap', handlePageLoad)
    return () => document.removeEventListener('astro:after-swap', handlePageLoad)
  }, [lessons])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      saveProgress(window.localStorage, progress)
    }
  }, [progress])

  const activeLessonId = isIndex ? progress.currentLessonId : selectedLessonId
  const activeLesson = lessons.find((lesson) => lesson.id === activeLessonId) ?? initialLesson

  useEffect(() => {
    activeLessonRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeLesson.id])
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
    setSelectedLessonId(lesson.id)
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
    <div className="learn-app" data-progress-index={isIndex ? 'true' : 'false'}>
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
                      data-progress-chapter-lessons={chapter.lessons
                        .map((lesson) => lesson.id)
                        .join(',')}
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
                            data-progress-lesson-link={lesson.id}
                            href={getRoute(`/learn/${lesson.slug}/`)}
                            aria-current={isActive ? 'page' : undefined}
                            onClick={() => navigateToLesson(lesson)}
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
            lessonId={activeLesson.id}
            isCompleted={isActiveLessonCompleted}
            onToggleComplete={toggleActiveLesson}
            onNavigate={navigateToLesson}
          />
        </main>
      </div>
      {/* pi-lens-ignore: dangerously-set-inner-html */}
      <script data-astro-rerun dangerouslySetInnerHTML={{ __html: progressBootstrapScript }} />
    </div>
  )
}
