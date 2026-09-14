import type { Lesson } from '../data/course'

export interface AdjacentLessons {
  previous?: Lesson
  next?: Lesson
}

export function sortLessons(items: readonly Lesson[]): Lesson[] {
  return [...items].sort((left, right) => left.order - right.order)
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
