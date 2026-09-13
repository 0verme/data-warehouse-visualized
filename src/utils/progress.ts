export const PROGRESS_STORAGE_KEY = 'data-warehouse-visualized:progress'

export interface ProgressState {
  completedLessonIds: string[]
  currentLessonId: string
}

export interface ProgressStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function createInitialProgress(firstLessonId: string): ProgressState {
  return {
    completedLessonIds: [],
    currentLessonId: firstLessonId,
  }
}

export function parseProgress(raw: string | null, fallback: ProgressState): ProgressState {
  if (!raw) {
    return fallback
  }

  try {
    const parsed: unknown = JSON.parse(raw)

    if (!parsed || typeof parsed !== 'object') {
      return fallback
    }

    const candidate = parsed as Partial<ProgressState>
    const completedLessonIds = Array.isArray(candidate.completedLessonIds)
      ? [
          ...new Set(
            candidate.completedLessonIds.filter((id): id is string => typeof id === 'string'),
          ),
        ]
      : fallback.completedLessonIds

    return {
      completedLessonIds,
      currentLessonId:
        typeof candidate.currentLessonId === 'string'
          ? candidate.currentLessonId
          : fallback.currentLessonId,
    }
  } catch {
    return fallback
  }
}

export function loadProgress(
  storage: ProgressStorage | undefined,
  fallback: ProgressState,
): ProgressState {
  if (!storage) {
    return fallback
  }

  try {
    return parseProgress(storage.getItem(PROGRESS_STORAGE_KEY), fallback)
  } catch {
    return fallback
  }
}

export function saveProgress(storage: ProgressStorage | undefined, progress: ProgressState): void {
  if (!storage) {
    return
  }

  try {
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // 隐私模式或存储空间不足时，学习页面仍然可以继续使用。
  }
}

export function setCurrentLesson(progress: ProgressState, lessonId: string): ProgressState {
  return {
    ...progress,
    currentLessonId: lessonId,
  }
}

export function toggleLessonComplete(progress: ProgressState, lessonId: string): ProgressState {
  const isCompleted = progress.completedLessonIds.includes(lessonId)

  return {
    ...progress,
    completedLessonIds: isCompleted
      ? progress.completedLessonIds.filter((id) => id !== lessonId)
      : [...progress.completedLessonIds, lessonId],
  }
}

export function getCompletedCount(progress: ProgressState): number {
  return progress.completedLessonIds.length
}

export function getProgressPercent(progress: ProgressState, totalLessons: number): number {
  if (totalLessons <= 0) {
    return 0
  }

  return Math.min(100, Math.round((getCompletedCount(progress) / totalLessons) * 100))
}
