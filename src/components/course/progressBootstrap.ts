import type { Lesson } from '../../data/course'
import type { Locale } from '../../i18n/locale'
import { getMessage } from '../../i18n/messages'
import {
  loadProgress,
  normalizeProgress,
  PROGRESS_STORAGE_KEY,
  type ProgressState,
} from '../../utils/progress'

export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'dwv_sidebar_collapsed'

export interface ProgressBootstrapState {
  completedLessonIds: string[]
  currentLessonId: string
}

declare global {
  interface Window {
    __DWV_PROGRESS__?: ProgressBootstrapState
    __DWV_PROGRESS_BOOTSTRAP_ROOT__?: Element
    __DWV_SIDEBAR_COLLAPSED__?: boolean
  }
}

export function createProgressBootstrapScript(locale: Locale): string {
  const currentLessonCompleted = JSON.stringify(getMessage('learnedCurrentLesson', locale))
  const lessonCompleted = JSON.stringify(getMessage('learned', locale))
  const currentLesson = JSON.stringify(getMessage('currentLesson', locale))
  const lessonNotCompleted = JSON.stringify(getMessage('notCompleted', locale))
  const lessonsCompleted = JSON.stringify(getMessage('lessonsCompleted', locale))
  const markAsLearned = JSON.stringify(getMessage('markAsLearned', locale))
  const collapseSidebar = JSON.stringify(getMessage('collapseSidebar', locale))
  const expandSidebar = JSON.stringify(getMessage('expandSidebar', locale))

  return `(() => {
  const root = document.currentScript?.closest('astro-island')?.querySelector('.learn-app')
  const isNewRoot = root && window.__DWV_PROGRESS_BOOTSTRAP_ROOT__ !== root

  if (root) {
    window.__DWV_PROGRESS_BOOTSTRAP_ROOT__ = root
  }

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
  if (root) {
    root.classList.toggle('is-sidebar-collapsed', isSidebarCollapsed)
    const desktopToggle = root.querySelector('.sidebar-collapse-toggle')
    if (desktopToggle) {
      desktopToggle.setAttribute('aria-expanded', String(!isSidebarCollapsed))
      const sidebarLabel = isSidebarCollapsed ? ${expandSidebar} : ${collapseSidebar}
      desktopToggle.setAttribute('aria-label', sidebarLabel)
      desktopToggle.setAttribute('title', sidebarLabel)
    }
  }

  const completedLessonIds = Array.isArray(stored?.completedLessonIds)
    ? [...new Set(stored.completedLessonIds.filter((id) => typeof id === 'string'))]
    : []
  const currentLessonId = typeof stored?.currentLessonId === 'string' ? stored.currentLessonId : ''
  const progress = { completedLessonIds, currentLessonId }

  if (!root) {
    window.__DWV_PROGRESS__ = progress
    return
  }

  // A persisted LearnShell can execute this script again during navigation. Its
  // React state owns route and accordion state after the first root is ready.
  if (!isNewRoot) return

  window.__DWV_PROGRESS__ = progress

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

export function getInitialProgress(
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
