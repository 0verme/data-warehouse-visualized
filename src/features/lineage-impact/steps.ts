import {
  createStepKernel,
  type StepKernel,
  type VisualizationStep,
} from '../../utils/visualization-steps'
import type { LineageImpactRevealState } from './types'

export type LineageImpactRevealStep = VisualizationStep<LineageImpactRevealState>

/**
 * 逐层展开序列完全由真实 lineage 数据生成：
 * - Step 0：尚未展开任何下游对象；
 * - Step i：展开 `transitiveNodeIds` 的前 i 个；
 * - 最后一步：完整快照，`complete === true`。
 *
 * 因此步骤数量始终是 `transitiveNodeIds.length + 1`，下游数据变化时
 * 序列自动跟随，组件不再维护 `current + 1` 这样的增量事件。
 */
export function buildLineageImpactSteps(
  transitiveNodeIds: readonly string[],
): readonly LineageImpactRevealStep[] {
  const total = transitiveNodeIds.length
  const steps: LineageImpactRevealStep[] = []

  for (let index = 0; index <= total; index += 1) {
    steps.push({
      id: index === 0 ? 'reveal-start' : `reveal-${transitiveNodeIds[index - 1]}`,
      title: getRevealTitle(index, total),
      description: getRevealDescription(index, total),
      state: {
        revealedNodeIds: Object.freeze(transitiveNodeIds.slice(0, index)),
        complete: index === total,
      },
    })
  }

  return Object.freeze(steps)
}

export function createLineageImpactKernel(
  transitiveNodeIds: readonly string[],
): StepKernel<LineageImpactRevealState> {
  return createStepKernel(buildLineageImpactSteps(transitiveNodeIds))
}

function getRevealTitle(index: number, total: number): string {
  if (total === 0) return '无下游影响'
  if (index === 0) return '初始状态'
  if (index === total) return '到达最终指标消费者'
  return index === 1 ? '展开直接影响' : '继续展开传递影响'
}

function getRevealDescription(index: number, total: number): string {
  if (total === 0) return '没有需要展开的下游对象。'
  if (index === 0) return '预测已提交，等待展开下一层影响。'
  return `已展开 ${index} / ${total} 个下游对象。`
}
