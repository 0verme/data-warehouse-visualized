import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LineageTeachingLab } from '../src/components/visualizations/LineageTeachingLab'
import { dataLineageImpactContent } from '../src/content/lessons/data-lineage-impact'
import { bankingLineageEdges, bankingLineageNodes } from '../src/features/lineage/banking'
import {
  buildLineageImpactSteps,
  createLineageImpactKernel,
} from '../src/features/lineage-impact/steps'
import {
  applyVisualizationPlayerAction,
  createVisualizationPlayer,
  getCurrentVisualizationStep,
} from '../src/utils/visualization-steps'

function getPageImpactTeaching() {
  const section = dataLineageImpactContent.sections.find(
    (candidate) => candidate.kind === 'visualization',
  )

  if (section?.kind !== 'visualization' || section.visualization.kind !== 'lineage') {
    throw new Error('data-lineage-impact 页面缺少 lineage visualization section')
  }

  const teaching = section.visualization.teaching

  if (!teaching?.impact) {
    throw new Error('data-lineage-impact 页面缺少 impact 教学配置')
  }

  return { teaching, impact: teaching.impact }
}

const { teaching: impactTeaching, impact: impactConfig } = getPageImpactTeaching()
const transitiveNodeIds = impactConfig.expectedTransitiveNodeIds

describe('Lineage Impact reveal · Step Kernel', () => {
  it('步骤数量 = 真实下游对象数量 + 1，并逐层给出完整快照', () => {
    const kernel = createLineageImpactKernel(transitiveNodeIds)
    const graphNodeIds = new Set(bankingLineageNodes.map((node) => node.id))
    const snapshots = kernel.steps.map((step) => step.state.revealedNodeIds)

    expect(transitiveNodeIds.length).toBeGreaterThan(0)
    expect(transitiveNodeIds.every((nodeId) => graphNodeIds.has(nodeId))).toBe(true)
    expect(kernel.size).toBe(transitiveNodeIds.length + 1)
    expect(kernel.steps.map((step) => step.id)).toEqual([
      'reveal-start',
      ...transitiveNodeIds.map((nodeId) => `reveal-${nodeId}`),
    ])
    expect(snapshots[0]).toEqual([])
    expect(snapshots.at(-1)).toEqual(transitiveNodeIds)
    snapshots.forEach((revealed, index) => {
      expect(revealed).toEqual(transitiveNodeIds.slice(0, index))
    })
    expect(kernel.steps.map((step) => step.state.complete)).toEqual(
      kernel.steps.map((step) => step.state.revealedNodeIds.length === transitiveNodeIds.length),
    )
    expect(kernel.get(kernel.size - 1).state.complete).toBe(true)
  })

  it('步骤顺序自动跟随输入数据，不硬编码 DWS / ADS / Metric', () => {
    const kernel = createLineageImpactKernel(['first-node', 'second-node'])

    expect(kernel.size).toBe(3)
    expect(kernel.steps.map((step) => step.state.revealedNodeIds)).toEqual([
      [],
      ['first-node'],
      ['first-node', 'second-node'],
    ])
    expect(kernel.steps.map((step) => step.state.complete)).toEqual([false, false, true])
  })

  it('同样输入重复构建结果一致', () => {
    expect(buildLineageImpactSteps(transitiveNodeIds)).toEqual(
      buildLineageImpactSteps(transitiveNodeIds),
    )
  })

  it('空下游列表退化为一页完整快照', () => {
    const kernel = createLineageImpactKernel([])

    expect(kernel.size).toBe(1)
    expect(kernel.get(0).state).toEqual({ revealedNodeIds: [], complete: true })
  })
})

describe('Lineage Impact reveal · Headless Player', () => {
  it('next 逐层推进，最后一页不越界', () => {
    const kernel = createLineageImpactKernel(transitiveNodeIds)
    let player = createVisualizationPlayer(kernel.size)

    expect(getCurrentVisualizationStep(player, kernel).state).toEqual({
      revealedNodeIds: [],
      complete: false,
    })

    for (const [index, nodeId] of transitiveNodeIds.entries()) {
      player = applyVisualizationPlayerAction(player, 'next')
      const step = getCurrentVisualizationStep(player, kernel)

      expect(step.id).toBe(`reveal-${nodeId}`)
      expect(step.state.revealedNodeIds).toEqual(transitiveNodeIds.slice(0, index + 1))
      expect(step.state.complete).toBe(index === transitiveNodeIds.length - 1)
    }

    expect(applyVisualizationPlayerAction(player, 'next')).toBe(player)
  })

  it('reset 回到初始 reveal，与 Prediction 提交后的起始状态一致', () => {
    const kernel = createLineageImpactKernel(transitiveNodeIds)
    const initialStep = getCurrentVisualizationStep(
      createVisualizationPlayer(kernel.size),
      kernel,
    ).state

    expect(initialStep).toEqual({ revealedNodeIds: [], complete: false })

    let player = applyVisualizationPlayerAction(createVisualizationPlayer(kernel.size), 'next')
    player = applyVisualizationPlayerAction(player, 'next')
    expect(getCurrentVisualizationStep(player, kernel).state.revealedNodeIds).toHaveLength(2)

    player = applyVisualizationPlayerAction(player, 'reset')
    expect(player.currentIndex).toBe(0)
    expect(getCurrentVisualizationStep(player, kernel).state).toEqual(initialStep)
  })
})

describe('Lineage Impact reveal · SSR 初始状态', () => {
  it('首屏保留 Prediction，但不提前展开任何下游影响', () => {
    const markup = renderToStaticMarkup(
      <LineageTeachingLab
        nodes={bankingLineageNodes}
        edges={bankingLineageEdges}
        teaching={impactTeaching}
      />,
    )

    expect(markup).toContain('如果这里出问题，会影响哪些下游？')
    expect(markup).toContain('直接影响谁？')
    expect(markup).toContain('提交直接下游预测')
    expect(markup).toContain('dws_deposit_balance_daily')

    expect(markup).not.toContain('影响范围（Blast Radius）')
    expect(markup).not.toContain('展开下一层影响')
    expect(markup).not.toContain('lineage-teaching-impact-chain')
    expect(markup).not.toContain('data-impact-level')
    expect(markup).not.toContain('data-step-id')
    expect(markup).not.toContain('影响已经传到')
  })
})
