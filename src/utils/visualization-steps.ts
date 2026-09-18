/**
 * Interactive Visualization 2.0 · Phase 1 step semantics.
 *
 * A step is a deterministic, complete snapshot: `state` and `highlight` for
 * every step can be read directly without replaying previous steps. The player
 * only tracks the current index. It owns no timer, no renderer and no visuals,
 * and every transition is a pure function so it can be tested in isolation.
 *
 * Phase 1 deliberately does not implement autoplay, pause, speed, dragging,
 * keyboard shortcuts or a shared `PlayerChrome`. See Issue #119 for the
 * decision record.
 */

export interface VisualizationStep<S, H = undefined> {
  readonly id: string
  /** 短标题，用于进度与 aria-live。 */
  readonly title: string
  /** 当前步骤的一句话解释。 */
  readonly description: string
  /** 该步骤对应的确定性完整快照。 */
  readonly state: S
  /** 该步骤的高亮 / 归因语义；由 domain 定义具体类型。 */
  readonly highlight?: H
}

export interface StepKernel<S, H = undefined> {
  readonly steps: readonly VisualizationStep<S, H>[]
  readonly size: number
  /** 越界索引会被夹到合法范围，便于渲染层直接使用。 */
  get(index: number): VisualizationStep<S, H>
  find(id: string): VisualizationStep<S, H> | undefined
  indexOf(id: string): number
}

export function createStepKernel<S, H = undefined>(
  steps: readonly VisualizationStep<S, H>[],
): StepKernel<S, H> {
  if (steps.length === 0) {
    throw new Error('createStepKernel 需要一个非空的步骤列表')
  }

  const indexById = new Map<string, number>()
  for (const [index, step] of steps.entries()) {
    if (step.id.trim().length === 0) {
      throw new Error(`步骤 ${index} 缺少 id`)
    }
    if (indexById.has(step.id)) {
      throw new Error(`步骤 id 重复: ${step.id}`)
    }
    indexById.set(step.id, index)
  }

  const frozenSteps = Object.freeze([...steps])

  return {
    steps: frozenSteps,
    size: frozenSteps.length,
    get(index) {
      const normalizedIndex = Math.min(Math.max(Math.trunc(index), 0), frozenSteps.length - 1)
      return frozenSteps[normalizedIndex]!
    },
    find(id) {
      const index = indexById.get(id)
      return index === undefined ? undefined : frozenSteps[index]
    },
    indexOf(id) {
      return indexById.get(id) ?? -1
    },
  }
}

export interface VisualizationPlayerState {
  readonly currentIndex: number
  readonly stepCount: number
}

export type VisualizationPlayerAction = 'prev' | 'next' | 'reset'

export interface VisualizationPlayerProgress {
  /** 1-based，用于展示 `3 / 6`。 */
  readonly current: number
  readonly total: number
  /** 0–1，用于进度条填充。 */
  readonly ratio: number
}

export function createVisualizationPlayer(
  stepCount: number,
  initialIndex = 0,
): VisualizationPlayerState {
  if (!Number.isInteger(stepCount) || stepCount <= 0) {
    throw new Error('createVisualizationPlayer 至少需要一个步骤')
  }

  return {
    currentIndex: clampIndex(initialIndex, stepCount),
    stepCount,
  }
}

/**
 * 纯函数播放器。边界语义：
 * - 第一页 `prev` 保持不动；
 * - 最后一页 `next` 保持不动；
 * - `reset` 回到 Step 1；
 * - 不创建 timer，不自动播放。
 */
export function applyVisualizationPlayerAction(
  state: VisualizationPlayerState,
  action: VisualizationPlayerAction,
): VisualizationPlayerState {
  switch (action) {
    case 'prev':
      return state.currentIndex <= 0 ? state : { ...state, currentIndex: state.currentIndex - 1 }
    case 'next':
      return state.currentIndex >= state.stepCount - 1
        ? state
        : { ...state, currentIndex: state.currentIndex + 1 }
    case 'reset':
      return state.currentIndex === 0 ? state : { ...state, currentIndex: 0 }
  }
}

export function isVisualizationPlayerAtStart(state: VisualizationPlayerState): boolean {
  return state.currentIndex <= 0
}

export function isVisualizationPlayerAtEnd(state: VisualizationPlayerState): boolean {
  return state.currentIndex >= state.stepCount - 1
}

export function getVisualizationPlayerProgress(
  state: VisualizationPlayerState,
): VisualizationPlayerProgress {
  return {
    current: state.currentIndex + 1,
    total: state.stepCount,
    ratio: (state.currentIndex + 1) / state.stepCount,
  }
}

export function getCurrentVisualizationStep<S, H>(
  state: VisualizationPlayerState,
  kernel: StepKernel<S, H>,
): VisualizationStep<S, H> {
  return kernel.get(state.currentIndex)
}

function clampIndex(index: number, stepCount: number): number {
  if (!Number.isFinite(index)) {
    return 0
  }
  return Math.min(Math.max(Math.trunc(index), 0), stepCount - 1)
}
