import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BankingMetricScopeLab } from '../src/components/visualizations/BankingMetricLabs'
import { CapstoneWorkbench } from '../src/components/visualizations/CapstoneWorkbench'
import { DataQualityWorkbench } from '../src/components/visualizations/DataQualityWorkbench'
import { GovernanceWorkbench } from '../src/components/visualizations/GovernanceWorkbench'
import { LakehouseArchitectureLab } from '../src/components/visualizations/LakehouseArchitectureLab'
import { LoanBusinessProcessLab } from '../src/components/visualizations/LoanBusinessProcessLab'
import { PerformanceDiagnosisLab } from '../src/components/visualizations/PerformanceDiagnosisLab'
import { SchedulerRunSimulator } from '../src/components/visualizations/SchedulerRunSimulator'
import { capstoneVisualization } from '../src/features/capstone/banking'
import { performanceVisualizations } from '../src/features/performance/banking'
import { createBankingSchedulerVisualization } from '../src/features/scheduler/banking'
import { dataModelingContent } from '../src/content/lessons/data-modeling'
import { dataQualityRulesVisualization } from '../src/content/lessons/data-quality-rules'
import { governanceLifecycleVisualization } from '../src/content/lessons/data-governance'
import { lakehouseVisualizations } from '../src/content/lessons/lakehouse'
import { depositBalanceScopeVisualization } from '../src/content/lessons/metric-system'
import type { LoanBusinessProcessVisualization } from '../src/types'

/**
 * #144 Pattern 1 — structural half of the contract.
 *
 * The browser journey (`tests/e2e/action-feedback-proximity.mjs`) proves the
 * *geometry* (control ↔ feedback ≤ 1 viewport, feedback on screen, no automatic
 * scroll). This file proves the *structure* that makes the geometry stable: the
 * primary feedback of every migrated lab is rendered next to the control in DOM
 * order, so a phone stacking the document cannot push it a screen away again.
 *
 * Markup order is DOM order for the server-rendered output, and the migrated
 * labs render their default selection (or their always-on conclusion) without
 * interaction — so this stays a fast unit-level guard, not a browser test.
 */

function markup(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
}

function position(source: string, needle: string): number {
  const index = source.indexOf(needle)
  expect(index, `markup 中缺少 ${needle}`).toBeGreaterThanOrEqual(0)
  return index
}

function expectOrder(source: string, markers: readonly string[]): void {
  let previous = -1
  for (const marker of markers) {
    const index = position(source, marker)
    expect(
      index,
      `DOM 顺序错误：${marker} 出现在前一个标记之前（${markers.join(' → ')}）`,
    ).toBeGreaterThan(previous)
    previous = index
  }
}

function componentSource(fileName: string): string {
  return readFileSync(
    join(import.meta.dirname, '..', 'src', 'components', 'visualizations', fileName),
    'utf8',
  )
}

function findLoanBusinessProcessVisualization(): LoanBusinessProcessVisualization {
  for (const section of dataModelingContent.sections) {
    if (section.kind !== 'visualization') continue
    if (section.visualization.kind === 'loan-business-process') {
      return section.visualization
    }
  }

  throw new Error('data-modeling lesson 缺少 loan-business-process visualization')
}

describe('#144 Pattern 1：Primary Action ↔ Primary Feedback 结构契约', () => {
  it('CapstoneWorkbench：checkpoint 提交控件与 Decision Record 位于 stage 顶部，紧邻其更新的 main 区', () => {
    const source = markup(<CapstoneWorkbench visualization={capstoneVisualization} />)

    expectOrder(source, [
      'capstone-stage__top',
      'capstone-stage__heading',
      'capstone-primary-button',
      'capstone-brief-grid',
    ])
    // 旧的 F2 结构：提交控件在 stage 内容之后（1.6–2.3 screen 之外）已被移除。
    expect(source.indexOf('capstone-action-bar', position(source, 'capstone-brief-grid'))).toBe(-1)
    expect(source).toContain('capstone-action-bar')
  })

  it('DataQualityWorkbench(rules)：所选 rule 的 evidence 是规则网格中紧随其后的下一项', () => {
    const source = markup(<DataQualityWorkbench visualization={dataQualityRulesVisualization} />)
    const focusIndex = position(source, 'data-quality-focus')
    const ruleMarkers = source.match(/class="data-quality-rule( |")/g) ?? []

    expect(ruleMarkers.length).toBeGreaterThan(1)
    // 默认选中的是第一条规则：它之后立刻就是 evidence，其余规则排在 evidence 之后。
    expect(source.slice(0, focusIndex).match(/class="data-quality-rule( |")/g) ?? []).toHaveLength(
      1,
    )
    expectOrder(source, ['data-quality-rule-grid', 'data-quality-focus'])
    expect(source.indexOf('data-quality-rule', focusIndex)).toBeGreaterThan(focusIndex)
  })

  it('PerformanceDiagnosisLab：阶段证据摘要渲染在阶段列表内部、所选阶段卡之后', () => {
    const source = markup(
      <PerformanceDiagnosisLab visualization={performanceVisualizations.diagnosis} />,
    )

    expectOrder(source, ['performance-stage-list', 'performance-diagnosis__evidence'])
    // 初始没有选中阶段，因此摘要不在 SSR markup 里：断言它被渲染在阶段列表内部
    // （定义见组件源码），而不是整块证据面板之前或之后。
    const component = componentSource('PerformanceDiagnosisLab.tsx')
    expect(component).toContain('data-stage-evidence-summary')
    const listStart = component.indexOf('className="performance-stage-list"')
    const usage = component.indexOf('<StageEvidenceSummary', listStart)
    const listEnd = component.indexOf('className="performance-diagnosis__summary"', listStart)
    expect(listStart).toBeGreaterThanOrEqual(0)
    expect(usage).toBeGreaterThan(listStart)
    expect(usage).toBeLessThan(listEnd)
  })

  it('LoanBusinessProcessLab：所选环节的声明结论渲染在链路内部，位于业务环节卡之后', () => {
    const source = markup(
      <LoanBusinessProcessLab visualization={findLoanBusinessProcessVisualization()} />,
    )

    expectOrder(source, [
      'loan-process__chain',
      'data-loan-step-conclusion',
      'loan-process__contract-note',
    ])
    expect(source.slice(0, position(source, 'data-loan-step-conclusion'))).toContain(
      'loan-process__step is-selected',
    )
  })

  it('BankingMetricScopeLab：当前口径结论位于预设卡之后、条件控件之前', () => {
    const source = markup(
      <BankingMetricScopeLab visualization={depositBalanceScopeVisualization} />,
    )

    expectOrder(source, [
      'banking-metric-scope__scenario-grid',
      'data-scope-conclusion',
      'banking-metric-scope__controls',
      'banking-metric-scope__selected',
    ])
  })

  it('GovernanceWorkbench(lifecycle)：迁移结论与切换动作同块，且状态块先于被替换的资产定义', () => {
    const source = markup(<GovernanceWorkbench visualization={governanceLifecycleVisualization} />)

    expectOrder(source, [
      'governance-lifecycle-callout',
      '切换到替代资产',
      'governance-definition-card',
    ])
    const component = componentSource('GovernanceWorkbench.tsx')
    const calloutStart = component.indexOf('governance-lifecycle-callout is-')
    const conclusion = component.indexOf('data-governance-migration-conclusion', calloutStart)
    const definition = component.indexOf('<DefinitionPanel', calloutStart)
    expect(conclusion).toBeGreaterThan(calloutStart)
    expect(conclusion).toBeLessThan(definition)
  })

  it('LakehouseArchitectureLab：三个变体都使用同一「动作 → 结论」相邻策略', () => {
    const replication = markup(
      <LakehouseArchitectureLab visualization={lakehouseVisualizations.replication} />,
    )
    expectOrder(replication, [
      'lakehouse-replication-actions',
      'data-lakehouse-action-result',
      'data-detail-role="replica-summary"',
    ])

    const tableLayer = markup(
      <LakehouseArchitectureLab visualization={lakehouseVisualizations.tableLayer} />,
    )
    expectOrder(tableLayer, [
      'lakehouse-table-layer-actions',
      'data-lakehouse-action-result',
      'lakehouse-pointer-panel',
    ])

    const unity = markup(<LakehouseArchitectureLab visualization={lakehouseVisualizations.unity} />)
    expectOrder(unity, [
      'lakehouse-unity-switcher',
      'data-lakehouse-action-result',
      'lakehouse-unity-comparison',
      'lakehouse-zones--unity',
    ])
  })

  it('SchedulerRunSimulator(rerun)：执行计划的运行结论紧随执行按钮', () => {
    const source = markup(
      <SchedulerRunSimulator visualization={createBankingSchedulerVisualization('rerun')} />,
    )

    expectOrder(source, [
      'scheduler-rerun__plan',
      'scheduler-rerun__reason',
      'data-rerun-result',
      'scheduler-output-comparison',
    ])
  })

  it('Pattern 1 由信息结构实现：迁移组件不得使用 scrollIntoView / 程序化 focus 抢占 viewport', () => {
    const migratedComponents = [
      'CapstoneWorkbench.tsx',
      'DataQualityWorkbench.tsx',
      'GovernanceWorkbench.tsx',
      'LakehouseArchitectureLab.tsx',
      'BankingMetricLabs.tsx',
      'PerformanceDiagnosisLab.tsx',
      'LoanBusinessProcessLab.tsx',
      'SchedulerRunSimulator.tsx',
    ]

    for (const fileName of migratedComponents) {
      const source = componentSource(fileName)
      expect(source, `${fileName} 不应使用 scrollIntoView`).not.toContain('scrollIntoView')
      expect(source, `${fileName} 不应使用 scrollTo`).not.toContain('scrollTo(')
      expect(source, `${fileName} 不应主动 focus 控件`).not.toMatch(/\.focus\(\)/)
    }
  })
})
