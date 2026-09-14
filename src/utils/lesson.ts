import type { Lesson, LessonDefinition } from '../data/course'

export type LessonOrdering = Pick<LessonDefinition, 'id' | 'chapter' | 'order'>

export interface AdjacentLessons {
  previous?: Lesson
  next?: Lesson
}

function getChapterSortValue(chapterId: string): number {
  const chapterNumber = Number(chapterId)

  return Number.isFinite(chapterNumber) ? chapterNumber : Number.MAX_SAFE_INTEGER
}

function compareLessonOrder(left: LessonOrdering, right: LessonOrdering): number {
  const chapterDifference = getChapterSortValue(left.chapter) - getChapterSortValue(right.chapter)

  return chapterDifference || left.order - right.order
}

/** Sort lessons by chapter and chapter-local order weight without mutating the input. */
export function sortLessons<T extends LessonOrdering>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => compareLessonOrder(left.item, right.item) || left.index - right.index)
    .map(({ item }) => item)
}

/** Format a chapter for the top-level course directory, for example `01`. */
export function getChapterDisplayNumber(chapterId: string): string {
  if (!/^\d+$/.test(chapterId)) {
    return chapterId
  }

  return String(Number(chapterId)).padStart(2, '0')
}

function getLessonChapterNumber(chapterId: string): string {
  return getChapterDisplayNumber(chapterId).replace(/^0+(?=\d)/, '')
}

/** Calculate a lesson's chapter-local display number, for example `3-2`. */
export function getLessonDisplayNumber(
  lesson: LessonOrdering,
  items: readonly LessonOrdering[],
): string {
  const chapterLessons = sortLessons(items.filter((item) => item.chapter === lesson.chapter))
  const lessonIndex = chapterLessons.findIndex((item) => item.id === lesson.id)

  if (lessonIndex === -1) {
    throw new Error(`Lesson "${lesson.id}" is not present in the supplied lesson collection`)
  }

  return `${getLessonChapterNumber(lesson.chapter)}-${lessonIndex + 1}`
}

function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, '')
}

export function getLessonFromPath(pathname: string, items: readonly Lesson[]): Lesson | undefined {
  const normalizedPath = normalizePathname(pathname)

  return items.find((lesson) => normalizedPath.endsWith(`/learn/${lesson.slug}`))
}

export function isLearnIndexPath(pathname: string): boolean {
  const normalizedPath = normalizePathname(pathname)

  return normalizedPath === '/learn' || normalizedPath.endsWith('/learn')
}

export function getAdjacentLessons(items: readonly Lesson[], currentSlug: string): AdjacentLessons {
  const orderedLessons = sortLessons(items)
  const currentIndex = orderedLessons.findIndex((lesson) => lesson.slug === currentSlug)

  if (currentIndex === -1) {
    return {}
  }

  return {
    previous: orderedLessons[currentIndex - 1],
    next: orderedLessons[currentIndex + 1],
  }
}
