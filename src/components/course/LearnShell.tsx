import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Lesson } from '../../data/course'
import { getChapters, getChapterTitle, getLessonBySlug } from '../../data/course'
import type { LessonContent } from '../../content/types'
import type { CodeHighlightMap } from '../../utils/code-highlight'
import {
  createInitialProgress,
  getCompletedCount,
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
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale'
import { getMessage } from '../../i18n/messages'
import { getLocaleSnapshot, subscribeToLocaleChanges } from '../../utils/locale'
import { ensureLessonStyles } from '../../utils/lesson-styles'
import { GlobalHeaderActions } from '../GlobalHeaderActions'
import { CourseSidebar, type SidebarRevealRequest } from './CourseSidebar'
import { LessonViewport } from './LessonViewport'
import { useLessonContent } from './useLessonContent'
import {
  createProgressBootstrapScript,
  getInitialProgress,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
} from './progressBootstrap'
import { ProgressIndicator } from '../lesson'

interface LearnShellProps {
  lessons: Lesson[]
  initialLesson: Lesson
  initialContent: LessonContent
  codeHighlights?: CodeHighlightMap
  isIndex?: boolean
  locale?: Locale
}

type NavigationKind = 'initial' | 'navigate' | 'traverse'

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

interface NavigationEvent {
  id: number
  kind: NavigationKind
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
  const [navigationEvent, setNavigationEvent] = useState<NavigationEvent>({
    id: 0,
    kind: 'initial',
  })
  const [sidebarRevealRequest, setSidebarRevealRequest] = useState<SidebarRevealRequest>({
    id: 0,
    lessonId: '',
  })
  const navigationKindRef = useRef<NavigationKind>('navigate')

  useEffect(() => {
    document.documentElement.lang = activeLocale
  }, [activeLocale])

  const routeLesson = getLessonFromPath(pathname, lessons)
  const isCourseIndex = isLearnIndexPath(pathname)

  useEffect(() => {
    function handleBeforePreparation(event: Event) {
      const navigationType = (event as Event & { navigationType?: string }).navigationType
      navigationKindRef.current = navigationType === 'traverse' ? 'traverse' : 'navigate'
    }

    function handleRouteChange() {
      const navigationKind = navigationKindRef.current
      navigationKindRef.current = 'navigate'
      setIsSidebarOpen(false)

      const nextLesson = getLessonFromPath(window.location.pathname, lessons)

      if (nextLesson) {
        setExpandedChapterId((currentChapterId) =>
          currentChapterId === nextLesson.chapter ? currentChapterId : nextLesson.chapter,
        )
        setProgress((currentProgress) =>
          currentProgress.currentLessonId === nextLesson.id
            ? currentProgress
            : setCurrentLesson(currentProgress, nextLesson.id),
        )
        setSidebarRevealRequest((currentRequest) => ({
          id: currentRequest.id + 1,
          lessonId: nextLesson.id,
        }))
      }

      setNavigationEvent((currentEvent) => ({
        id: currentEvent.id + 1,
        kind: navigationKind,
      }))
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
  const { state: contentState, retryContent } = useLessonContent(
    activeLesson,
    initialLesson,
    initialContent,
  )
  const activeContent = contentState.status === 'ready' ? contentState.content : null

  // `/learn/` can restore a progress lesson that is not the SSR lesson, and
  // ClientRouter replaces the head on every navigation. Link the active
  // lesson's stylesheet whenever the route/content changes and it is missing.
  useIsomorphicLayoutEffect(() => {
    if (activeContent) {
      ensureLessonStyles(activeContent)
    }
  }, [activeContent, navigationEvent.id])
  const adjacentLessons = getAdjacentLessons(lessons, activeLesson.slug)
  const completedCount = getCompletedCount(progress)
  const isActiveLessonCompleted = progress.completedLessonIds.includes(activeLesson.id)
  const currentChapterTitle = getChapterTitle(activeLesson.chapter, activeLocale)
  const currentLessonTitle =
    getLessonBySlug(activeLesson.slug, activeLocale)?.title ?? activeLesson.title

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
    setExpandedChapterId((currentChapterId) => toggleExpandedChapter(currentChapterId, chapterId))

    if (chapterId === activeLesson.chapter) {
      setSidebarRevealRequest((currentRequest) => ({
        id: currentRequest.id + 1,
        lessonId: activeLesson.id,
      }))
    }
  }

  return (
    <div
      className={`learn-app${isSidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}
      data-progress-index={isIndex ? 'true' : 'false'}
      data-initial-lesson-id={initialLesson.id}
    >
      <header className="learn-topbar">
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

        <button
          className="topbar-control sidebar-collapse-toggle"
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

        <button
          className="topbar-control sidebar-toggle"
          type="button"
          aria-expanded={isSidebarOpen}
          aria-controls="course-sidebar"
          aria-label={getMessage('courseDirectory', activeLocale)}
          title={getMessage('courseDirectory', activeLocale)}
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
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <div className="learn-topbar__progress">
          <div className="learn-topbar__nav">
            <span className="learn-topbar__chapter" title={currentChapterTitle}>
              {currentChapterTitle}
            </span>
            <span className="learn-topbar__separator" aria-hidden="true">
              /
            </span>
            <span className="learn-topbar__lesson" title={currentLessonTitle}>
              {currentLessonTitle}
            </span>
          </div>
          <ProgressIndicator
            completedCount={completedCount}
            totalLessons={lessons.length}
            compact
            locale={activeLocale}
          />
        </div>

        <GlobalHeaderActions locale={activeLocale} />
      </header>

      <div className="learn-layout">
        <CourseSidebar
          chapters={localizedChapters}
          activeLesson={activeLesson}
          expandedChapterId={expandedChapterId}
          progress={progress}
          isOpen={isSidebarOpen}
          locale={activeLocale}
          revealRequest={sidebarRevealRequest}
          onToggleChapter={toggleChapter}
        />

        {isSidebarOpen && (
          <button
            className="sidebar-backdrop"
            type="button"
            aria-label={getMessage('closeCourseDirectory', activeLocale)}
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <LessonViewport
          activeLesson={activeLesson}
          lessons={lessons}
          content={activeContent}
          contentStatus={contentState.status}
          onRetryContent={retryContent}
          codeHighlights={codeHighlights}
          previous={adjacentLessons.previous}
          next={adjacentLessons.next}
          isCompleted={isActiveLessonCompleted}
          onToggleComplete={toggleActiveLesson}
          locale={activeLocale}
          mainScrollResetKey={navigationEvent.id}
          shouldResetMainScroll={navigationEvent.id > 0 && navigationEvent.kind === 'navigate'}
        />
      </div>
      <script data-astro-rerun>{progressBootstrapScript}</script>
    </div>
  )
}

function subscribeToRouteChanges(onChange: () => void): () => void {
  document.addEventListener('astro:after-swap', onChange)

  return () => document.removeEventListener('astro:after-swap', onChange)
}

function getCurrentPathname(): string {
  return window.location.pathname
}
