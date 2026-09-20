import { describe, expect, it } from 'vitest'
import {
  findLessonAnchor,
  getLessonAnchorId,
  getLessonAnchorScrollTop,
  scrollLessonAnchorIntoView,
  type AnchorRect,
  type LessonAnchorScrollContainer,
  type LessonAnchorTarget,
} from '../src/utils/lesson-anchor'

interface FakeContainer extends LessonAnchorScrollContainer {
  scrollToCalls: Array<{ behavior: 'instant'; left: number; top: number }>
}

function createContainer(input: {
  scrollTop?: number
  scrollHeight?: number
  clientHeight?: number
  rectTop?: number
  withScrollTo?: boolean
}): FakeContainer {
  const scrollToCalls: FakeContainer['scrollToCalls'] = []
  const container: FakeContainer = {
    scrollTop: input.scrollTop ?? 0,
    scrollHeight: input.scrollHeight ?? 2000,
    clientHeight: input.clientHeight ?? 600,
    getBoundingClientRect: (): AnchorRect => ({ top: input.rectTop ?? 64 }),
    scrollToCalls,
  }

  if (input.withScrollTo !== false) {
    container.scrollTo = (options) => {
      scrollToCalls.push(options)
      container.scrollTop = options.top
    }
  }

  return container
}

function createTarget(rectTop: number): LessonAnchorTarget {
  return { getBoundingClientRect: (): AnchorRect => ({ top: rectTop }) }
}

describe('lesson anchor 定位（#148 P1-A）', () => {
  it('解析 location.hash，非法或空 fragment 返回 null 而不抛异常', () => {
    expect(getLessonAnchorId('#lesson-01-section-2-title')).toBe('lesson-01-section-2-title')
    expect(getLessonAnchorId('#%E6%8B%89%E9%93%BE%E8%A1%A8')).toBe('拉链表')
    expect(getLessonAnchorId('')).toBeNull()
    expect(getLessonAnchorId('#')).toBeNull()
    expect(getLessonAnchorId('lesson-01-section-2-title')).toBeNull()
    // 非法的 percent-encoding 原样保留，后续查找失败即降级到课程顶部
    expect(getLessonAnchorId('#%E0%A4%A')).toBe('%E0%A4%A')
  })

  it('目标在滚动容器内时对齐到滚动口顶部', () => {
    const container = createContainer({ scrollTop: 0, rectTop: 64 })
    const target = createTarget(564)

    expect(getLessonAnchorScrollTop(container, target)).toBe(500)
  })

  it('已经滚动过的容器按当前 scrollTop 计算增量', () => {
    const container = createContainer({ scrollTop: 1000, rectTop: 64 })
    const target = createTarget(64)

    expect(getLessonAnchorScrollTop(container, target)).toBe(1000)

    const lowerTarget = createTarget(164)
    expect(getLessonAnchorScrollTop(container, lowerTarget)).toBe(1100)
  })

  it('目标超出可滚动范围时收敛到上下边界，不产生负数或越界滚动', () => {
    const container = createContainer({ scrollTop: 0, scrollHeight: 2000, clientHeight: 600 })
    expect(getLessonAnchorScrollTop(container, createTarget(-500))).toBe(0)
    expect(getLessonAnchorScrollTop(container, createTarget(99999))).toBe(1400)
  })

  it('内容不足一屏时 maxScrollTop 为 0', () => {
    const container = createContainer({ scrollTop: 0, scrollHeight: 400, clientHeight: 600 })
    expect(getLessonAnchorScrollTop(container, createTarget(200))).toBe(0)
  })

  it('滚动使用 instant 语义，不触发平滑动画', () => {
    const container = createContainer({ scrollTop: 0, rectTop: 64 })
    scrollLessonAnchorIntoView(container, createTarget(564))

    expect(container.scrollToCalls).toEqual([{ behavior: 'instant', left: 0, top: 500 }])
    expect(container.scrollTop).toBe(500)
  })

  it('没有 scrollTo 的环境回退为直接写 scrollTop', () => {
    const container = createContainer({ scrollTop: 0, rectTop: 64, withScrollTo: false })
    scrollLessonAnchorIntoView(container, createTarget(664))

    expect(container.scrollTop).toBe(600)
  })

  it('只解析课程滚动容器内部的 id，容器外的同名 id 被忽略', () => {
    const inside = { id: 'inside' }
    const outside = { id: 'outside' }
    const container = {
      contains: (element: unknown) => element === inside,
      ownerDocument: {
        getElementById: (id: string) =>
          id === 'inside' ? inside : id === 'outside' ? outside : null,
      },
    }

    expect(findLessonAnchor(container as unknown as HTMLElement, 'inside')).toBe(
      inside as unknown as HTMLElement,
    )
    expect(findLessonAnchor(container as unknown as HTMLElement, 'outside')).toBeNull()
    expect(findLessonAnchor(container as unknown as HTMLElement, 'missing')).toBeNull()
  })
})
