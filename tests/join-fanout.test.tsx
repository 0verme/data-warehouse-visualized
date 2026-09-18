import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { JoinFanoutSimulator } from '../src/components/visualizations/JoinFanoutSimulator'
import { getLessonContent } from '../src/content/lessons'
import { getLessonBySlug } from '../src/data/course'
import {
  aggregateRightByKey,
  createJoinFanoutState,
  joinFanoutFixture,
  joinFanoutRows,
} from '../src/features/join-fanout/model'
import { buildJoinFanoutSteps, createJoinFanoutKernel } from '../src/features/join-fanout/steps'

const { leftRows, rightRows } = joinFanoutFixture

describe('JOIN 膨胀 Golden Sample · 数据与计算', () => {
  it('fixture 两端 key 都不唯一，真实匹配得到 2 × 2 = 4 行', () => {
    const resultRows = joinFanoutRows(leftRows, rightRows)

    expect(leftRows).toHaveLength(2)
    expect(rightRows).toHaveLength(2)
    expect(leftRows.map((row) => row.customerId)).toEqual(['A', 'A'])
    expect(rightRows.map((row) => row.customerId)).toEqual(['A', 'A'])
    expect(resultRows.map((row) => row.id)).toEqual(['L1×R1', 'L1×R2', 'L2×R1', 'L2×R2'])
    expect(resultRows).toHaveLength(leftRows.length * rightRows.length)
    expect(resultRows.every((row) => row.tags.length === 1)).toBe(true)
  })

  it('按 key 聚合右表后，Join 输出回到 2 行而不是 4 行', () => {
    const aggregated = aggregateRightByKey(rightRows)
    const fixedState = createJoinFanoutState(leftRows, aggregated, leftRows.length)

    expect(aggregated).toEqual([{ id: 'AGG:A', customerId: 'A', tags: ['X', 'Y'] }])
    expect(fixedState.counts.rightRows).toBe(1)
    expect(fixedState.counts.resultRows).toBe(2)
    expect(fixedState.resultRows.every((row) => row.tags.join('、') === 'X、Y')).toBe(true)
  })

  it('每一步都是确定性完整快照，重复构建结果一致', () => {
    const first = buildJoinFanoutSteps()
    const second = buildJoinFanoutSteps()

    expect(first).toHaveLength(6)
    expect(first.map((step) => step.id)).toEqual([
      'observe-tables',
      'match-left-row-1',
      'match-left-row-2',
      'expand-result',
      'diagnose-key-grain',
      'fix-align-grain',
    ])
    expect(first).toEqual(second)

    for (const step of first) {
      expect(step.highlight, step.id).toBeDefined()
      expect(step.state.resultRows).toHaveLength(step.state.counts.resultRows)
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.description.length).toBeGreaterThan(0)
    }
  })

  it('第 3 / 4 步累计 4 行，第 6 步修复回 2 行', () => {
    const steps = buildJoinFanoutSteps()

    expect(steps[1]!.state.counts).toMatchObject({
      matchedLeftRows: 1,
      rightRows: 2,
      resultRows: 2,
    })
    expect(steps[2]!.state.counts).toMatchObject({
      matchedLeftRows: 2,
      rightRows: 2,
      resultRows: 4,
    })
    expect(steps[3]!.state.counts).toMatchObject({
      matchedLeftRows: 2,
      rightRows: 2,
      resultRows: 4,
    })
    expect(steps[5]!.state.counts).toMatchObject({
      matchedLeftRows: 2,
      rightRows: 1,
      resultRows: 2,
    })
  })

  it('UI 使用的行数来自同一套计算逻辑，而不是硬编码', () => {
    const computed = createJoinFanoutState(leftRows, rightRows, leftRows.length)
    const steps = buildJoinFanoutSteps()

    expect(computed.counts.resultRows).toBe(leftRows.length * rightRows.length)
    expect(steps[3]!.state.counts.resultRows).toBe(computed.counts.resultRows)
    expect(steps[4]!.state.counts.resultRows).toBe(computed.counts.resultRows)
  })

  it('步骤覆盖 ≥ 3 种教学语义，根因指向 key 粒度', () => {
    const steps = buildJoinFanoutSteps()
    const kinds = new Set(steps.map((step) => step.highlight!.kind))

    expect(kinds).toEqual(new Set(['observe', 'match', 'expand', 'diagnose', 'fix']))
    expect(steps[4]!.description).toContain('粒度不足以唯一确定')
    expect(steps[4]!.description).not.toContain('不允许')
  })

  it('kernel 保持 6 步顺序，并保留完整快照', () => {
    const kernel = createJoinFanoutKernel()

    expect(kernel.size).toBe(6)
    expect(kernel.get(99).id).toBe('fix-align-grain')
    expect(kernel.get(0).state.resultRows).toHaveLength(0)
    expect(kernel.get(3).state.resultRows).toHaveLength(4)
  })
})

describe('JOIN 膨胀 Golden Sample · SSR 首屏与接线', () => {
  it('首屏默认 Step 1：实验背景 + 最终问题 + 禁用上一步', () => {
    const markup = renderToStaticMarkup(<JoinFanoutSimulator />)

    expect(markup).toContain('data-diagram-type="schema"')
    expect(markup).toContain('Step 1 / 6')
    expect(markup).toContain('观察两边数据')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('role="progressbar"')
    expect(markup).toContain('aria-valuenow="1"')
    expect(markup).toContain('role="group"')
    expect(markup).toContain('上一步')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('下一步')
    expect(markup).toContain('customer_id')
    expect(markup).toContain('A-001')
    expect(markup).toContain('A-002')
    expect(markup).toContain('>X<')
    expect(markup).toContain('>Y<')
    expect(markup).toContain('还没有生成结果行')
  })

  it('首屏不直接给出最终 4 行结果，只显示两边数据和空结果', () => {
    const markup = renderToStaticMarkup(<JoinFanoutSimulator />)

    expect(markup).not.toContain('L1×R1')
    expect(markup).not.toContain('最终结果')
    expect(markup).not.toContain('修复结果')
    expect(markup).toContain('当前查看')
  })

  it('join-fanout 是 join lesson 唯一的核心交互实验', () => {
    const lesson = getLessonBySlug('sql-transformation-join')
    expect(lesson).toBeDefined()

    const content = getLessonContent(lesson!)
    const kinds = content.sections
      .filter((section) => section.kind === 'visualization')
      .map((section) => section.visualization.kind)

    expect(kinds).toEqual(['join-fanout'])
    expect(
      content.sections.some(
        (section) =>
          section.kind === 'visualization' &&
          section.visualization.kind === 'sql-transformation' &&
          section.visualization.focus === 'join',
      ),
    ).toBe(false)
  })
})

describe('JOIN lesson · 叙事一致性', () => {
  it('Takeaway 只保留三个检查问题，不重复数字口径', () => {
    const content = getLessonContent(getLessonBySlug('sql-transformation-join')!)
    const takeaway = content.sections.find((section) => section.kind === 'takeaway')

    expect(takeaway?.bullets).toHaveLength(3)
    expect(takeaway?.title).toContain('三个问题')
    expect(takeaway?.bullets?.join('')).not.toMatch(/300,000|500,000/)
  })

  it('M:N 分步实验带 1:N → M:N 过渡，且步骤标题落在 2 × 2 与 2 × 1', () => {
    const content = getLessonContent(getLessonBySlug('sql-transformation-join')!)
    const visualizationSections = content.sections.filter(
      (section) => section.kind === 'visualization',
    )
    const fanoutSection = visualizationSections.find(
      (section) => section.visualization.kind === 'join-fanout',
    )

    expect(fanoutSection?.title).toContain('2 × 2 = 4')
    expect(fanoutSection?.description).toContain('一对多已经会复制度量')

    const stepTitles = buildJoinFanoutSteps().map((step) => step.title)
    expect(stepTitles).toEqual([
      '观察两边数据',
      '匹配左表第 1 行',
      '匹配左表第 2 行',
      '看见 2 × 2 = 4',
      '指出根因',
      '修复到 2 × 1 = 2',
    ])
  })
})
