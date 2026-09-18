import {
  createStepKernel,
  type StepKernel,
  type VisualizationStep,
} from '../../utils/visualization-steps'
import { aggregateRightByKey, createJoinFanoutState, joinFanoutFixture } from './model'
import type { JoinFanoutHighlight, JoinFanoutState } from './types'

export type JoinFanoutStep = VisualizationStep<JoinFanoutState, JoinFanoutHighlight>

const { leftRows, rightRows, joinKey } = joinFanoutFixture
const allLeftRowIds = leftRows.map((row) => row.id)
const allRightRowIds = rightRows.map((row) => row.id)
const leftRowCount = leftRows.length
const rightRowCount = rightRows.length

/**
 * 6 步确定性教学序列。每一步都直接携带完整快照与 highlight，
 * 因此 prev / next / reset 都只是索引变化，不需要 replay。
 */
export function buildJoinFanoutSteps(): readonly JoinFanoutStep[] {
  const step1 = createJoinFanoutState(leftRows, rightRows, 0)
  const step2 = createJoinFanoutState(leftRows, rightRows, 1)
  const step3 = createJoinFanoutState(leftRows, rightRows, 2)
  const step2ResultIds = new Set(step2.resultRows.map((row) => row.id))
  const newlyMatchedResultIds = step3.resultRows
    .map((row) => row.id)
    .filter((id) => !step2ResultIds.has(id))

  const aggregatedRightRows = aggregateRightByKey(rightRows)
  const step6 = createJoinFanoutState(leftRows, aggregatedRightRows, leftRowCount)
  const aggregatedTagCount = aggregatedRightRows[0]?.tags.length ?? 0

  return [
    {
      id: 'observe-tables',
      title: '观察两边数据',
      description: `左表 ${leftRowCount} 行、右表 ${rightRowCount} 行都指向 ${joinKey} = A，两边都没有唯一的 key。先记住这一点，再往下看错误 Join 会发生什么。`,
      state: step1,
      highlight: {
        kind: 'observe',
        joinKey,
        leftRowIds: allLeftRowIds,
        rightRowIds: allRightRowIds,
        resultRowIds: [],
        risk: false,
      },
    },
    {
      id: 'match-left-row-1',
      title: '匹配左表第 1 行',
      description: `左表 A-001 与右表的 X、Y 两条记录都能匹配，因此它被复制成 ${step2.counts.resultRows} 行。`,
      state: step2,
      highlight: {
        kind: 'match',
        joinKey,
        leftRowIds: ['L1'],
        rightRowIds: allRightRowIds,
        resultRowIds: step2.resultRows.map((row) => row.id),
        risk: false,
      },
    },
    {
      id: 'match-left-row-2',
      title: '匹配左表第 2 行',
      description: `左表 A-002 同样匹配 X、Y，又产生 ${newlyMatchedResultIds.length} 行；累计已经是 ${step3.counts.resultRows} 行。`,
      state: step3,
      highlight: {
        kind: 'match',
        joinKey,
        leftRowIds: ['L2'],
        rightRowIds: allRightRowIds,
        resultRowIds: newlyMatchedResultIds,
        risk: false,
      },
    },
    {
      id: 'expand-result',
      title: '看见 2 × 2 = 4',
      description: `左表 ${step3.counts.matchedLeftRows} 行 × 右表 ${step3.counts.rightRows} 行 = 结果 ${step3.counts.resultRows} 行。SQL 没有报错，但结果行数已经被放大。`,
      state: step3,
      highlight: {
        kind: 'expand',
        joinKey,
        leftRowIds: allLeftRowIds,
        rightRowIds: allRightRowIds,
        resultRowIds: step3.resultRows.map((row) => row.id),
        risk: true,
      },
    },
    {
      id: 'diagnose-key-grain',
      title: '指出根因',
      description: `根因不在 JOIN 语法，而在 ${joinKey} 的粒度不足以唯一确定双方记录：A 既对应 ${leftRowCount} 个账户，又对应 ${rightRowCount} 个标签，两个“多”相乘，结果就不再是账户粒度。`,
      state: step3,
      highlight: {
        kind: 'diagnose',
        joinKey,
        leftRowIds: allLeftRowIds,
        rightRowIds: allRightRowIds,
        resultRowIds: step3.resultRows.map((row) => row.id),
        risk: true,
      },
    },
    {
      id: 'fix-align-grain',
      title: '修复到 2 × 1 = 2',
      description: `这个例子的目标是账户级一行：右表先按 ${joinKey} 聚合成 1 行（${aggregatedTagCount} 个标签），再 Join 账户表：${step6.counts.matchedLeftRows} × ${step6.counts.rightRows} = ${step6.counts.resultRows} 行，放大消失。`,
      state: step6,
      highlight: {
        kind: 'fix',
        joinKey,
        leftRowIds: allLeftRowIds,
        rightRowIds: aggregatedRightRows.map((row) => row.id),
        resultRowIds: step6.resultRows.map((row) => row.id),
        risk: false,
      },
    },
  ]
}

export function createJoinFanoutKernel(): StepKernel<JoinFanoutState, JoinFanoutHighlight> {
  return createStepKernel(buildJoinFanoutSteps())
}
