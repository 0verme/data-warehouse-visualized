import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LoanGrainLab } from '../src/components/visualizations/LoanGrainLab'
import { StarSchemaFlow } from '../src/components/visualizations/StarSchemaFlow'
import { grainContent } from '../src/content/lessons/grain'
import {
  buildGrainErrorSteps,
  createGrainErrorKernel,
  type GrainErrorStepSpecs,
} from '../src/features/grain-error/steps'
import type { LoanGrainVisualization, StarSchemaVisualization } from '../src/types'
import {
  applyVisualizationPlayerAction,
  createVisualizationPlayer,
  getCurrentVisualizationStep,
} from '../src/utils/visualization-steps'

type DemoStep = 'wrong' | 'calculated' | 'fixed'

const demoSpects = [
  { id: 'wrong', title: '错误模型', description: '先观察错误模型', risk: true },
  { id: 'calculated', title: '执行 SUM', description: 'SUM 暴露重复', risk: true },
  { id: 'fixed', title: '修复', description: '修复到目标 Grain', risk: false },
] as const satisfies GrainErrorStepSpecs<DemoStep>

function getLoanGrainVisualization(): LoanGrainVisualization {
  for (const section of grainContent.sections) {
    if (section.kind === 'visualization' && section.visualization.kind === 'loan-grain') {
      return section.visualization
    }
  }

  throw new Error('Grain 测试需要 loan-grain visualization 数据')
}

const starSchemaVisualization: StarSchemaVisualization = {
  kind: 'star-schema',
  rawTable: { columns: [], rows: [] },
  rawFieldGroups: [],
  tables: [],
  grains: [],
  errorDemo: {
    wrongColumns: ['order_id', 'order_amount'],
    wrongRows: [
      { order_id: '1001', order_amount: 300 },
      { order_id: '1001', order_amount: 300 },
    ],
    fixedColumns: ['order_id', 'item_amount'],
    fixedRows: [
      { order_id: '1001', item_amount: 100 },
      { order_id: '1001', item_amount: 200 },
    ],
    actualAmount: 300,
    wrongMeasure: 'order_amount',
    fixedMeasure: 'item_amount',
    wrongSql: 'SUM(order_amount)',
    fixedSql: 'SUM(item_amount)',
  },
}

describe('Grain 错误演示 · Step Kernel', () => {
  it('固定 3 步顺序，每步携带同一份确定性 result 快照', () => {
    const result = { total: 42 }
    const kernel = createGrainErrorKernel(result, demoSpects)

    expect(kernel.size).toBe(3)
    expect(kernel.steps.map((step) => step.id)).toEqual(['wrong', 'calculated', 'fixed'])
    expect(kernel.steps.map((step) => step.state.step)).toEqual(['wrong', 'calculated', 'fixed'])
    expect(kernel.steps.every((step) => step.state.result === result)).toBe(true)
    expect(kernel.steps.map((step) => step.highlight?.risk)).toEqual([true, true, false])
    expect(kernel.steps.map((step) => step.title)).toEqual(['错误模型', '执行 SUM', '修复'])
  })

  it('重复构建结果一致，不依赖组件内部状态', () => {
    expect(buildGrainErrorSteps({ total: 42 }, demoSpects)).toEqual(
      buildGrainErrorSteps({ total: 42 }, demoSpects),
    )
  })

  it('headless player 只做 index 推进：next / reset 边界正确', () => {
    const kernel = createGrainErrorKernel({ total: 42 }, demoSpects)
    let player = createVisualizationPlayer(kernel.size)

    expect(player.currentIndex).toBe(0)
    expect(getCurrentVisualizationStep(player, kernel).id).toBe('wrong')

    player = applyVisualizationPlayerAction(player, 'next')
    expect(player.currentIndex).toBe(1)
    expect(getCurrentVisualizationStep(player, kernel).id).toBe('calculated')

    player = applyVisualizationPlayerAction(player, 'next')
    expect(player.currentIndex).toBe(2)
    expect(getCurrentVisualizationStep(player, kernel).id).toBe('fixed')

    expect(applyVisualizationPlayerAction(player, 'next')).toBe(player)

    player = applyVisualizationPlayerAction(player, 'reset')
    expect(player.currentIndex).toBe(0)
    expect(getCurrentVisualizationStep(player, kernel).id).toBe('wrong')
  })
})

describe('LoanGrainLab · 三步演示接线', () => {
  it('SSR 首屏停在错误模型：执行可用、修复禁用、错误模型可见', () => {
    const markup = renderToStaticMarkup(
      <LoanGrainLab visualization={getLoanGrainVisualization()} />,
    )

    expect(markup).toContain('data-step-id="joined"')
    expect(markup).toContain('合同金额被带到了两笔借据上')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('type="button">执行 SUM(contract_amount)</button>')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('修复 Grain')
    expect(markup).toContain('重置演示')
    expect(markup).toContain('错误做法')
    expect(markup).toContain('先观察 Join 结果，再执行聚合。')
    expect(markup).not.toContain('修复做法')
  })
})

describe('StarSchemaFlow · 三步演示接线', () => {
  it('SSR 首屏停在错误模型：执行可用、修复禁用、错误模型可见', () => {
    const markup = renderToStaticMarkup(<StarSchemaFlow visualization={starSchemaVisualization} />)

    expect(markup).toContain('data-step-id="wrong"')
    expect(markup).toContain('先观察错误模型')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('type="button">执行 SUM(order_amount)</button>')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('修复模型')
    expect(markup).toContain('重置演示')
    expect(markup).toContain('错误设计')
    expect(markup).toContain('点击执行 SUM，看看重复的订单总额会发生什么。')
    expect(markup).not.toContain('修复设计')
  })
})
