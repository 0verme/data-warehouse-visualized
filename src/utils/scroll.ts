export interface LessonViewportScrollContainer {
  scrollTop: number
  scrollTo?: (options: { behavior: 'instant'; left: number; top: number }) => void
}

/** Reset the lesson viewport without touching the document or the sidebar. */
export function resetLessonViewportScroll(container: LessonViewportScrollContainer): void {
  if (container.scrollTo) {
    container.scrollTo({ behavior: 'instant', left: 0, top: 0 })
    return
  }

  container.scrollTop = 0
}
