import type { Lesson } from '../data/course'

export interface AdjacentLessons {
  previous?: Lesson
  next?: Lesson
}

export function sortLessons(items: readonly Lesson[]): Lesson[] {
  return [...items].sort((left, right) => left.order - right.order)
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
