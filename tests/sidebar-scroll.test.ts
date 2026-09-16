import { describe, expect, it } from 'vitest'
import {
  ensureSidebarItemVisible,
  getMinimalSidebarScrollTop,
  SIDEBAR_VISIBILITY_MARGIN,
  type SidebarScrollContainer,
  type SidebarScrollTarget,
} from '../src/utils/sidebar'
import { resetLessonViewportScroll } from '../src/utils/scroll'

interface LayoutOptions {
  scrollTop?: number
  clientHeight?: number
  scrollHeight?: number
  targetTop: number
  targetBottom: number
}

function createLayout(options: LayoutOptions): {
  container: SidebarScrollContainer
  target: SidebarScrollTarget
} {
  const container: SidebarScrollContainer = {
    scrollTop: options.scrollTop ?? 120,
    clientHeight: options.clientHeight ?? 200,
    scrollHeight: options.scrollHeight ?? 900,
    getBoundingClientRect: () => ({ top: 100, bottom: 300 }),
  }
  const target: SidebarScrollTarget = {
    getBoundingClientRect: () => ({
      top: options.targetTop,
      bottom: options.targetBottom,
    }),
  }

  return { container, target }
}

describe('Sidebar active lesson scroll lifecycle', () => {
  it('active lesson already sits in the viewport without moving the Sidebar', () => {
    const { container, target } = createLayout({ targetTop: 150, targetBottom: 184 })
    const initialScrollTop = container.scrollTop

    expect(getMinimalSidebarScrollTop(container, target)).toBeNull()
    expect(ensureSidebarItemVisible(container, target)).toBe(false)
    expect(container.scrollTop).toBe(initialScrollTop)
  })

  it('moves only the minimum distance when the active lesson is below the viewport', () => {
    const { container, target } = createLayout({
      scrollTop: 120,
      targetTop: 278,
      targetBottom: 326,
    })

    expect(getMinimalSidebarScrollTop(container, target)).toBe(154)
    expect(ensureSidebarItemVisible(container, target)).toBe(true)
    expect(container.scrollTop).toBe(154)
  })

  it('moves only the minimum distance when the active lesson is above the viewport', () => {
    const { container, target } = createLayout({
      scrollTop: 240,
      targetTop: 86,
      targetBottom: 126,
    })

    expect(getMinimalSidebarScrollTop(container, target)).toBe(218)
    expect(ensureSidebarItemVisible(container, target)).toBe(true)
    expect(container.scrollTop).toBe(218)
  })

  it('keeps the target inside a small readable margin instead of centering it', () => {
    const { container, target } = createLayout({ targetTop: 105, targetBottom: 140 })

    expect(getMinimalSidebarScrollTop(container, target, SIDEBAR_VISIBILITY_MARGIN)).toBe(117)
  })

  it('clamps the minimum movement to the real scroll range', () => {
    const { container, target } = createLayout({
      scrollTop: 780,
      scrollHeight: 900,
      targetTop: 280,
      targetBottom: 340,
    })

    expect(getMinimalSidebarScrollTop(container, target)).toBe(700)
    expect(ensureSidebarItemVisible(container, target)).toBe(true)
    expect(container.scrollTop).toBe(700)
  })

  it('resets the lesson viewport through its own scroll container', () => {
    const calls: Array<{ behavior: 'instant'; left: number; top: number }> = []
    const main = {
      scrollTop: 480,
      scrollTo: (options: { behavior: 'instant'; left: number; top: number }) => {
        calls.push(options)
        main.scrollTop = options.top
      },
    }
    const sidebar = { scrollTop: 240 }

    resetLessonViewportScroll(main)

    expect(calls).toEqual([{ behavior: 'instant', left: 0, top: 0 }])
    expect(main.scrollTop).toBe(0)
    expect(sidebar.scrollTop).toBe(240)
  })
})
