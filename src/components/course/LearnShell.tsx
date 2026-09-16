import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Lesson } from '../../data/course'
import { getChapters } from '../../data/course'
import type { LessonContent } from '../../content/types'
import type { CodeHighlightMap } from '../../utils/code-highlight'
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
import {
  getAdjacentLessons,
  getLessonChapterId,
  getLessonFromPath,
  isLearnIndexPath,
  toggleExpandedChapter,
} from '../../utils/lesson'
import { getRoute } from '../../utils/routes'
import { DEFAULT_LOCALE, getStoredLocale, saveLocale, type Locale } from '../../i18n/locale'
import { getMessage } from '../../i18n/messages'
import { LocaleSwitcher } from './LocaleSwitcher'
import { ThemeToggle } from './ThemeToggle'
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
  codeHighlights?: CodeHighlightMap
  isIndex?: boolean
  locale?: Locale
}

interface ProgressBootstrapState {
  completedLessonIds: string[]
  currentLessonId: string
}

export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'dwv_sidebar_collapsed'

declare global {
  interface Window {
    __DWV_PROGRESS__?: ProgressBootstrapState
    __DWV_SIDEBAR_COLLAPSED__?: boolean
  }
}

function createProgressBootstrapScript(locale: Locale): string {
  const currentLessonCompleted = JSON.stringify(getMessage('learnedCurrentLesson', locale))
  const lessonCompleted = JSON.stringify(getMessage('learned', locale))
  const currentLesson = JSON.stringify(getMessage('currentLesson', locale))
  const lessonNotCompleted = JSON.stringify(getMessage('notCompleted', locale))
  const lessonsCompleted = JSON.stringify(getMessage('lessonsCompleted', locale))
  const markAsLearned = JSON.stringify(getMessage('markAsLearned', locale))
  const expandSidebar = JSON.stringify(getMessage('expandSidebar', locale))

  return `(() => {
  const root = document.currentScript?.closest('astro-island')?.querySelector('.learn-app')
  let stored = null

  try {
    const raw = window.localStorage.getItem(${JSON.stringify(PROGRESS_STORAGE_KEY)})
    stored = raw ? JSON.parse(raw) : null
  } catch {
    stored = null
  }

  let isSidebarCollapsed = false
  try {
    isSidebarCollapsed =
      window.localStorage.getItem(${JSON.stringify(SIDEBAR_COLLAPSED_STORAGE_KEY)}) === 'true'
  } catch {
    isSidebarCollapsed = false
  }

  window.__DWV_SIDEBAR_COLLAPSED__ = isSidebarCollapsed
  if (isSidebarCollapsed && root) {
    root.classList.add('is-sidebar-collapsed')
    const desktopToggle = root.querySelector('.sidebar-collapse-toggle')
    if (desktopToggle) {
      desktopToggle.setAttribute('aria-expanded', 'false')
      desktopToggle.setAttribute('aria-label', ${expandSidebar})
      desktopToggle.setAttribute('title', ${expandSidebar})
    }
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

  const normalizedPathname = window.location.pathname.replace(/\\/+$/, '')
  const isCourseIndex = normalizedPathname === '/learn' || normalizedPathname.endsWith('/learn')
  const lessonLinks = Array.from(root.querySelectorAll('[data-progress-lesson-link]'))
  const routeLessonLink = lessonLinks.find((link) => {
    const href = link.getAttribute('href')
    if (!href) return false

    try {
      return new URL(href, window.location.href).pathname.replace(/\\/+$/, '') === normalizedPathname
    } catch {
      return false
    }
  })
  const storedIndexLessonId =
    isCourseIndex && knownLessonIds.has(currentLessonId) ? currentLessonId : ''
  const sidebarLessonId =
    routeLessonLink?.getAttribute('data-progress-lesson-link') ||
    storedIndexLessonId ||
    root.getAttribute('data-initial-lesson-id')
  const activeLessonLink = lessonLinks.find(
    (link) => link.getAttribute('data-progress-lesson-link') === sidebarLessonId,
  )
  const activeChapter = activeLessonLink?.closest('[data-course-chapter]')

  root.querySelectorAll('[data-course-chapter]').forEach((chapter) => {
    const isExpanded = chapter === activeChapter
    chapter
      .querySelector('.course-chapter__heading')
      ?.setAttribute('aria-expanded', String(isExpanded))
    const panel = chapter.querySelector('[data-course-chapter-panel]')
    if (panel) {
      panel.hidden = !isExpanded
    }
  })

  if (storedIndexLessonId) {
    lessonLinks.forEach((link) => {
      const isActive = link.getAttribute('data-progress-lesson-link') === storedIndexLessonId
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
      isCompleted ? (isActive ? ${currentLessonCompleted} : ${lessonCompleted}) : isActive ? ${currentLesson} : ${lessonNotCompleted},
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
    chapterProgress.setAttribute('aria-label', completedCount + '/' + lessonIds.length + ' ' + ${lessonsCompleted})
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
    if (labelNode) labelNode.nodeValue = isCompleted ? ${lessonCompleted} : ${markAsLearned}
  })
})()`
}

function subscribeToRouteChanges(onChange: () => void): () => void {
  document.addEventListener('astro:after-swap', onChange)

  return () => document.removeEventListener('astro:after-swap', onChange)
}

function getCurrentPathname(): string {
  return window.location.pathname
}

function subscribeToLocaleChanges(onChange: () => void): () => void {
  document.addEventListener('dwv:locale-change', onChange)

  return () => document.removeEventListener('dwv:locale-change', onChange)
}

function getLocaleSnapshot(fallback: Locale): Locale {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    return getStoredLocale(window.localStorage, fallback)
  } catch {
    return fallback
  }
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

function getInitialSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  if (typeof window.__DWV_SIDEBAR_COLLAPSED__ === 'boolean') {
    const bootstrapped = window.__DWV_SIDEBAR_COLLAPSED__
    delete window.__DWV_SIDEBAR_COLLAPSED__
    return bootstrapped
  }

  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function LearnShell({
  lessons,
  initialLesson,
  initialContent,
  codeHighlights,
  isIndex = false,
  locale = DEFAULT_LOCALE,
}: LearnShellProps) {
  const activeLocale = useSyncExternalStore(
    subscribeToLocaleChanges,
    () => getLocaleSnapshot(locale),
    () => locale,
  )
  const localizedChapters = useMemo(() => getChapters(activeLocale), [activeLocale])
  const progressBootstrapScript = useMemo(
    () => createProgressBootstrapScript(activeLocale),
    [activeLocale],
  )
  const fallbackProgress = useMemo(
    () => createInitialProgress(initialLesson.id),
    [initialLesson.id],
  )
  const [progress, setProgress] = useState<ProgressState>(() =>
    getInitialProgress(fallbackProgress, lessons, initialLesson.id, isIndex),
  )
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(getInitialSidebarCollapsed)
  const serverPathname = getRoute(isIndex ? '/learn/' : `/learn/${initialLesson.slug}/`)
  const pathname = useSyncExternalStore(
    subscribeToRouteChanges,
    getCurrentPathname,
    () => serverPathname,
  )
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(
    () =>
      getLessonChapterId(lessons, isIndex ? progress.currentLessonId : initialLesson.id) ??
      initialLesson.chapter,
  )
  const activeLessonRef = useRef<HTMLAnchorElement | null>(null)
  const previousPathnameRef = useRef(pathname)
  const shouldResetMainScrollRef = useRef(false)

  useEffect(() => {
    document.documentElement.lang = activeLocale
  }, [activeLocale])

  const routeLesson = getLessonFromPath(pathname, lessons)
  const isCourseIndex = isLearnIndexPath(pathname)

  useEffect(() => {
    function handleBeforePreparation(event: Event) {
      const navigationType = (event as Event & { navigationType?: string }).navigationType
      shouldResetMainScrollRef.current = navigationType !== 'traverse'
    }

    function handleRouteChange() {
      setIsSidebarOpen(false)

      const nextLesson = getLessonFromPath(window.location.pathname, lessons)
      if (!nextLesson) {
        return
      }

      setExpandedChapterId(nextLesson.chapter)
      setProgress((currentProgress) =>
        currentProgress.currentLessonId === nextLesson.id
          ? currentProgress
          : setCurrentLesson(currentProgress, nextLesson.id),
      )
    }

    document.addEventListener('astro:before-preparation', handleBeforePreparation)
    document.addEventListener('astro:after-swap', handleRouteChange)
    return () => {
      document.removeEventListener('astro:before-preparation', handleBeforePreparation)
      document.removeEventListener('astro:after-swap', handleRouteChange)
    }
  }, [lessons])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      saveProgress(window.localStorage, progress)
    }
  }, [progress])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed))
      } catch {
        // ignore localStorage write errors
      }
    }
  }, [isSidebarCollapsed])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 900px)')
    const handleMediaChange = (event: MediaQueryListEvent | MediaQueryList) => {
      if (!event.matches) {
        setIsSidebarOpen(false)
      }
    }
    media.addEventListener?.('change', handleMediaChange)
    return () => media.removeEventListener?.('change', handleMediaChange)
  }, [])

  const activeLesson =
    routeLesson ??
    (isCourseIndex
      ? (lessons.find((lesson) => lesson.id === progress.currentLessonId) ?? initialLesson)
      : initialLesson)

  useEffect(() => {
    activeLessonRef.current?.scrollIntoView({
      behavior: 'instant',
      block: 'nearest',
      inline: 'nearest',
    })
  }, [activeLesson.id])

  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return
    }

    previousPathnameRef.current = pathname
    if (!shouldResetMainScrollRef.current) {
      return
    }

    shouldResetMainScrollRef.current = false
    const mainScroll = document.querySelector<HTMLElement>('.learn-main__scroll')
    if (mainScroll) {
      mainScroll.scrollTo({ behavior: 'instant', left: 0, top: 0 })
    } else {
      window.scrollTo({ behavior: 'instant', left: 0, top: 0 })
    }
  }, [pathname])
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

  function toggleActiveLesson() {
    updateProgress(toggleLessonComplete(progress, activeLesson.id))
  }

  function toggleChapter(chapterId: string) {
    setExpandedChapterId((current) => toggleExpandedChapter(current, chapterId))
  }

  function handleLocaleChange(nextLocale: Locale) {
    if (typeof window !== 'undefined') {
      try {
        saveLocale(window.localStorage, nextLocale)
      } catch {
        // localStorage 受限时仍然在当前页面切换语言。
      }
    }

    document.documentElement.lang = nextLocale
    document.dispatchEvent(new Event('dwv:locale-change'))
  }

  return (
    <div
      className={`learn-app${isSidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}
      data-progress-index={isIndex ? 'true' : 'false'}
      data-initial-lesson-id={initialLesson.id}
    >
      <header className="learn-topbar">
        <button
          className="sidebar-collapse-toggle"
          type="button"
          aria-expanded={!isSidebarCollapsed}
          aria-controls="course-sidebar"
          aria-label={getMessage(
            isSidebarCollapsed ? 'expandSidebar' : 'collapseSidebar',
            activeLocale,
          )}
          title={getMessage(isSidebarCollapsed ? 'expandSidebar' : 'collapseSidebar', activeLocale)}
          onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
        >
          <svg
            className="sidebar-collapse-toggle__icon sidebar-collapse-toggle__icon--collapse"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
            <path d="m16 15-3-3 3-3" />
          </svg>
          <svg
            className="sidebar-collapse-toggle__icon sidebar-collapse-toggle__icon--expand"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
            <path d="m14 9 3 3-3 3" />
          </svg>
        </button>

        <a
          className="brand brand--learn"
          href={getRoute('/')}
          aria-label={getMessage('homeAriaLabel', activeLocale)}
        >
          <span className="brand__mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="brand__text">
            <strong>{getMessage('siteName', activeLocale)}</strong>
            <small>{getMessage('interactiveTextbook', activeLocale)}</small>
          </span>
        </a>

        <div className="learn-topbar__progress">
          <ProgressIndicator
            completedCount={completedCount}
            totalLessons={lessons.length}
            compact
            locale={activeLocale}
          />
        </div>

        <div className="learn-topbar__actions">
          <LocaleSwitcher locale={activeLocale} onLocaleChange={handleLocaleChange} />
          <ThemeToggle locale={activeLocale} />
          <button
            className="sidebar-toggle"
            type="button"
            aria-expanded={isSidebarOpen}
            aria-controls="course-sidebar"
            aria-label={getMessage('courseDirectory', activeLocale)}
            onClick={() => setIsSidebarOpen((isOpen) => !isOpen)}
          >
            <svg
              className="sidebar-toggle__icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="sidebar-toggle__label">
              {getMessage('courseDirectory', activeLocale)}
            </span>
          </button>
        </div>
      </header>

      <div className="learn-layout">
        <aside
          className={`course-sidebar${isSidebarOpen ? ' is-open' : ''}`}
          id="course-sidebar"
          aria-label={getMessage('courseDirectory', activeLocale)}
        >
          <div className="course-sidebar__intro">
            <span className="eyebrow eyebrow--small">
              {getMessage('learningRoute', activeLocale)}
            </span>
            <h2>从一张表开始</h2>
            <p>沿着数据流动的方向，把抽象概念变成可以观察的步骤。</p>
          </div>

          <nav className="course-nav">
            {localizedChapters.map((chapter) => {
              const completedLessonCount = chapter.lessons.filter((lesson) =>
                progress.completedLessonIds.includes(lesson.id),
              ).length
              const isChapterComplete =
                chapter.lessons.length > 0 && completedLessonCount === chapter.lessons.length

              const isExpanded = expandedChapterId === chapter.id

              return (
                <section
                  className="course-chapter"
                  key={chapter.id}
                  data-course-chapter={chapter.id}
                >
                  <button
                    className="course-chapter__heading"
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={`chapter-${chapter.id}`}
                    onClick={() => toggleChapter(chapter.id)}
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
                      aria-label={`${completedLessonCount}/${chapter.lessons.length} ${getMessage('lessonsCompleted', activeLocale)}`}
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
                          ? getMessage('learnedCurrentLesson', activeLocale)
                          : getMessage('learned', activeLocale)
                        : isActive
                          ? getMessage('currentLesson', activeLocale)
                          : getMessage('notCompleted', activeLocale)

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

        {isSidebarOpen && (
          <button
            className="sidebar-backdrop"
            type="button"
            aria-label={getMessage('closeCourseDirectory', activeLocale)}
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <main className="learn-main">
          <div className="learn-main__scroll">
            <div className="learn-main__crumbs">
              <a href={getRoute('/')}>{getMessage('home', activeLocale)}</a>
              <span aria-hidden="true">/</span>
              <span>{getMessage('courseLearning', activeLocale)}</span>
              <span aria-hidden="true">/</span>
              <span>{activeLesson.title}</span>
            </div>
            <LessonHeader
              lesson={activeLesson}
              lessons={lessons}
              content={activeContent}
              locale={activeLocale}
            />
            <LessonBody
              lesson={activeLesson}
              content={activeContent}
              codeHighlights={codeHighlights}
              locale={activeLocale}
            />
          </div>
          <LessonNavigation
            previous={adjacentLessons.previous}
            next={adjacentLessons.next}
            lessonId={activeLesson.id}
            isCompleted={isActiveLessonCompleted}
            onToggleComplete={toggleActiveLesson}
            locale={activeLocale}
          />
        </main>
      </div>
      <script data-astro-rerun>{progressBootstrapScript}</script>
    </div>
  )
}
