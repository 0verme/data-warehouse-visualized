import {
  loadProgress,
  normalizeProgress,
  PROGRESS_STORAGE_KEY,
  type ProgressState,
  type ProgressStorage,
} from '../../utils/progress'
import { projectLearningProgress } from './progress'
import { applyRoadmapProgressView } from './progress-enhancer'
import { buildRoadmapProgressView } from './progress-view'

/** Roadmap has no lesson of its own, so it never invents a default current Lesson. */
const EMPTY_ROADMAP_PROGRESS: ProgressState = {
  completedLessonIds: [],
  currentLessonId: '',
}

declare global {
  interface Window {
    __DWV_ROADMAP_PROGRESS_INSTALLED__?: boolean
  }
}

/**
 * Reads the existing ProgressState and drops stale Lesson IDs with the shared
 * normalization contract. Keeps the stored current Lesson only when it still
 * maps to an available Roadmap Lesson.
 */
export function readRoadmapProgress(
  storage: ProgressStorage | undefined,
  availableLessonIds: readonly string[],
): ProgressState {
  const loaded = loadProgress(storage, EMPTY_ROADMAP_PROGRESS)
  return normalizeProgress(loaded, availableLessonIds, '', true)
}

function getBrowserStorage(): ProgressStorage | undefined {
  try {
    return window.localStorage
  } catch {
    // 隐私模式 / 存储被禁用：Roadmap 知识结构保持可用，只是不显示进度层。
    return undefined
  }
}

function getProgressRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.roadmap-main[data-roadmap-progress]')
}

function collectAvailableLessonIds(root: HTMLElement): string[] {
  const lessonIds = new Set<string>()
  root.querySelectorAll<HTMLElement>('[data-lesson-id]').forEach((node) => {
    if (node.dataset.lessonId) lessonIds.add(node.dataset.lessonId)
  })
  return [...lessonIds]
}

/** Re-reads local progress and re-applies the enhancement to the current Roadmap DOM. */
export function refreshRoadmapProgress(): void {
  const root = getProgressRoot()
  if (!root) return

  const storage = getBrowserStorage()
  if (!storage) {
    root.dataset.roadmapProgress = 'unavailable'
    return
  }

  const progress = readRoadmapProgress(storage, collectAvailableLessonIds(root))
  const view = buildRoadmapProgressView(projectLearningProgress(progress))
  applyRoadmapProgressView(root, view)
  root.dataset.roadmapProgress = 'ready'
}

/**
 * Roadmap-only progress enhancement.
 *
 * Runs after the static page loads, again after ClientRouter soft navigations
 * (`astro:after-swap`), after bfcache restores (`pageshow`), and when the
 * progress key changes in another tab. Listeners are installed once per tab.
 */
export function installRoadmapProgress(): void {
  if (!window.__DWV_ROADMAP_PROGRESS_INSTALLED__) {
    window.__DWV_ROADMAP_PROGRESS_INSTALLED__ = true
    window.addEventListener('pageshow', refreshRoadmapProgress)
    window.addEventListener('storage', (event) => {
      if (event.key === null || event.key === PROGRESS_STORAGE_KEY) refreshRoadmapProgress()
    })
    document.addEventListener('astro:after-swap', refreshRoadmapProgress)
  }

  refreshRoadmapProgress()
}
