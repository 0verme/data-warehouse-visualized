import { describe, expect, it } from 'vitest'
import {
  applyVisualizationPlayerAction,
  createStepKernel,
  createVisualizationPlayer,
  getCurrentVisualizationStep,
  getVisualizationPlayerProgress,
  isVisualizationPlayerAtEnd,
  isVisualizationPlayerAtStart,
  type VisualizationStep,
} from '../src/utils/visualization-steps'

interface DemoState {
  readonly value: number
}

interface DemoHighlight {
  readonly note: string
}

function buildDemoSteps(): VisualizationStep<DemoState, DemoHighlight>[] {
  return [
    {
      id: 'first',
      title: '第一步',
      description: '确定性快照 1',
      state: { value: 1 },
      highlight: { note: 'first' },
    },
    {
      id: 'second',
      title: '第二步',
      description: '确定性快照 2',
      state: { value: 2 },
      highlight: { note: 'second' },
    },
    {
      id: 'third',
      title: '第三步',
      description: '确定性快照 3',
      state: { value: 3 },
      highlight: { note: 'third' },
    },
  ]
}

describe('Step Kernel', () => {
  it('保持步骤定义顺序，并按 index / id 稳定查找', () => {
    const kernel = createStepKernel(buildDemoSteps())

    expect(kernel.size).toBe(3)
    expect(kernel.steps.map((step) => step.id)).toEqual(['first', 'second', 'third'])
    expect(kernel.get(0).state).toEqual({ value: 1 })
    expect(kernel.get(2).state).toEqual({ value: 3 })
    expect(kernel.find('second')?.state).toEqual({ value: 2 })
    expect(kernel.find('missing')).toBeUndefined()
    expect(kernel.indexOf('second')).toBe(1)
    expect(kernel.indexOf('missing')).toBe(-1)
  })

  it('越界索引被夹到合法范围，渲染层不需要自己判断边界', () => {
    const kernel = createStepKernel(buildDemoSteps())

    expect(kernel.get(-3).id).toBe('first')
    expect(kernel.get(99).id).toBe('third')
  })

  it('拒绝空列表、空 id 与重复 id', () => {
    expect(() => createStepKernel([])).toThrow('非空')
    expect(() =>
      createStepKernel([{ id: ' ', title: '', description: '', state: { value: 0 } }]),
    ).toThrow('缺少 id')
    expect(() =>
      createStepKernel([
        { id: 'same', title: '', description: '', state: { value: 0 } },
        { id: 'same', title: '', description: '', state: { value: 1 } },
      ]),
    ).toThrow('重复')
  })

  it('kernel 固定步骤数组，避免渲染层意外改写', () => {
    const steps = buildDemoSteps()
    const kernel = createStepKernel(steps)

    expect(Object.isFrozen(kernel.steps)).toBe(true)
    expect(steps).toHaveLength(3)
  })
})

describe('Headless Player', () => {
  it('初始停在 Step 1，且没有 timer / 自动播放', () => {
    const player = createVisualizationPlayer(6)

    expect(player).toEqual({ currentIndex: 0, stepCount: 6 })
    expect(isVisualizationPlayerAtStart(player)).toBe(true)
    expect(isVisualizationPlayerAtEnd(player)).toBe(false)
    expect(getVisualizationPlayerProgress(player)).toEqual({ current: 1, total: 6, ratio: 1 / 6 })
  })

  it('next 在最后一页不越界，prev 在第一页不越界', () => {
    let player = createVisualizationPlayer(3)

    player = applyVisualizationPlayerAction(player, 'next')
    expect(player.currentIndex).toBe(1)
    player = applyVisualizationPlayerAction(player, 'next')
    expect(player.currentIndex).toBe(2)
    expect(isVisualizationPlayerAtEnd(player)).toBe(true)

    const atEnd = applyVisualizationPlayerAction(player, 'next')
    expect(atEnd).toBe(player)
    expect(atEnd.currentIndex).toBe(2)

    player = applyVisualizationPlayerAction(player, 'prev')
    expect(player.currentIndex).toBe(1)

    const atStart = applyVisualizationPlayerAction(createVisualizationPlayer(3), 'prev')
    expect(atStart.currentIndex).toBe(0)
  })

  it('reset 回到 Step 1，且重复 reset 保持同一状态对象', () => {
    let player = createVisualizationPlayer(4)
    player = applyVisualizationPlayerAction(player, 'next')
    player = applyVisualizationPlayerAction(player, 'next')
    expect(player.currentIndex).toBe(2)

    player = applyVisualizationPlayerAction(player, 'reset')
    expect(player.currentIndex).toBe(0)
    expect(applyVisualizationPlayerAction(player, 'reset')).toBe(player)
  })

  it('progress 始终是 1-based 的当前步骤 / 总步骤', () => {
    let player = createVisualizationPlayer(5)

    expect(getVisualizationPlayerProgress(player)).toMatchObject({ current: 1, total: 5 })
    player = applyVisualizationPlayerAction(player, 'next')
    player = applyVisualizationPlayerAction(player, 'next')
    expect(getVisualizationPlayerProgress(player)).toEqual({ current: 3, total: 5, ratio: 3 / 5 })
  })

  it('拒绝非法 stepCount', () => {
    expect(() => createVisualizationPlayer(0)).toThrow('至少需要一个步骤')
    expect(() => createVisualizationPlayer(2.5)).toThrow('至少需要一个步骤')
  })

  it('kernel + player 组合可直接得到当前完整 state 与 highlight', () => {
    const kernel = createStepKernel(buildDemoSteps())
    let player = createVisualizationPlayer(kernel.size)

    player = applyVisualizationPlayerAction(player, 'next')
    const step = getCurrentVisualizationStep(player, kernel)

    expect(step.id).toBe('second')
    expect(step.title).toBe('第二步')
    expect(step.description).toBe('确定性快照 2')
    expect(step.state).toEqual({ value: 2 })
    expect(step.highlight).toEqual({ note: 'second' })
  })
})
