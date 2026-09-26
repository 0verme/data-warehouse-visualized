import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LifecyclePathLab } from '../src/components/visualizations/LifecyclePathLab'
import { getLessonContent } from '../src/content/lessons'
import { getLessonBySlug, lessons } from '../src/data/course'
import {
  MAINTAIN_PREPARE_RULE_GAP,
  accountBalanceSnapshotFixture,
  createDay1Run,
  createDay2FailedRun,
  getDayEvidence,
  getDayPathSteps,
  getInputEvidence,
  getLifecycleTestMatrix,
  rerunSameBusinessDate,
  runInitialize,
  runMaintainBeforeFix,
  sameSnapshotRows,
  validateMaintainWithFix,
  verifySnapshot,
} from '../src/features/lifecycle-path/model'
import {
  buildLifecyclePathSteps,
  createLifecyclePathKernel,
} from '../src/features/lifecycle-path/steps'
import {
  applyVisualizationPlayerAction,
  createVisualizationPlayer,
  getCurrentVisualizationStep,
  isVisualizationPlayerAtEnd,
  isVisualizationPlayerAtStart,
} from '../src/utils/visualization-steps'
import { getAdjacentLessons } from '../src/utils/lesson'

const fixture = accountBalanceSnapshotFixture

describe('生产案例 13-1 · 生命周期路径 fixture', () => {
  it('Day 1 initialize：创建目标对象、初始化 2026-09-18 写入单元并写入 6 行', () => {
    const dataset = runInitialize(fixture)

    expect(dataset.targetExists).toBe(true)
    expect(dataset.writeUnits).toEqual(['2026-09-18'])
    expect(dataset.rows).toHaveLength(6)
    expect(dataset.rows.every((row) => row.snapshotDate === '2026-09-18')).toBe(true)

    const day1 = createDay1Run(fixture, dataset)
    expect(day1).toMatchObject({
      targetBefore: 'missing',
      path: 'initialize',
      phase: 'write',
      jobStatus: 'SUCCESS',
      rowsWritten: 6,
      targetRecreated: false,
    })
  })

  it('Day 2 maintain：prepare 缺少当前 business_date 写入单元，write 未执行', () => {
    const dataset = runInitialize(fixture)
    const attempt = runMaintainBeforeFix(fixture, dataset)

    expect(attempt.ruleGap).toBe(MAINTAIN_PREPARE_RULE_GAP)
    expect(attempt.rowsWritten).toBe(0)
    expect(attempt.dataset).toBe(dataset)
    expect(attempt.dataset.writeUnits).toEqual(['2026-09-18'])
    expect(attempt.dataset.rows).toHaveLength(6)

    const day2 = createDay2FailedRun(fixture)
    expect(day2).toMatchObject({
      targetBefore: 'exists',
      path: 'maintain',
      phase: 'prepare',
      jobStatus: 'FAILED',
      rowsWritten: 0,
      maintainValidated: false,
      targetRecreated: false,
      rerunExecuted: false,
    })
  })

  it('处理：单独验证 maintain 后 prepare 通过，目标对象未被重新创建且没有写入', () => {
    const day1 = runInitialize(fixture)
    const validation = validateMaintainWithFix(fixture, day1)

    expect(validation.preparePassed).toBe(true)
    expect(validation.targetRecreated).toBe(false)
    expect(validation.dataset.targetExists).toBe(true)
    expect(validation.dataset.writeUnits).toEqual(['2026-09-18', '2026-09-19'])
    expect(validation.dataset.rows).toHaveLength(6)
  })

  it('Rerun 后 5 项数据验证全部通过，Day 1 未被覆盖且同业务日期幂等', () => {
    const day1 = runInitialize(fixture)
    const validated = validateMaintainWithFix(fixture, day1).dataset
    const { dataset, idempotency } = rerunSameBusinessDate(fixture, validated)
    const checks = verifySnapshot(fixture, dataset, day1.rows, idempotency)

    expect(dataset.rows).toHaveLength(12)
    expect(idempotency).toMatchObject({
      businessDate: '2026-09-19',
      rowsBefore: 12,
      rowsAfter: 12,
      added: 0,
      identical: true,
    })

    expect(checks).toHaveLength(5)
    expect(checks.every((check) => check.passed)).toBe(true)
    expect(checks.find((check) => check.id === 'snapshot-exists')?.detail).toBe('实际 6 行')
    expect(checks.find((check) => check.id === 'grain-stable')?.detail).toBe(
      '12 个 (account_id, snapshot_date) 对应 12 行',
    )
    expect(checks.find((check) => check.id === 'no-duplicates')?.detail).toBe(
      '重复 (account_id, snapshot_date) 共 0 行',
    )
    expect(checks.find((check) => check.id === 'history-preserved')?.detail).toBe(
      'Day 1 6 行余额与运行时一致',
    )
    expect(checks.find((check) => check.id === 'rerun-idempotent')?.detail).toContain('新增 0 行')

    const day1After = dataset.rows.filter((row) => row.snapshotDate === '2026-09-18')
    expect(sameSnapshotRows(day1.rows, day1After)).toBe(true)
  })

  it('7 步顺序固定、确定性可重复，Step 1–2 不泄露根因', () => {
    const steps = buildLifecyclePathSteps()

    expect(steps).toHaveLength(7)
    expect(steps.map((step) => step.id)).toEqual([
      'symptom',
      'first-evidence',
      'lifecycle-divergence',
      'prepare-rule-gap',
      'fix-prepare-rule',
      'rerun-and-verify',
      'prevent-regression',
    ])
    expect(steps.map((step) => step.highlight?.kind)).toEqual([
      'symptom',
      'evidence',
      'divergence',
      'diagnose',
      'fix',
      'rerun',
      'prevent',
    ])
    expect(steps).toEqual(buildLifecyclePathSteps())

    const firstStep = steps[0]!
    const secondStep = steps[1]!
    expect(firstStep.state.day1.jobStatus).toBe('SUCCESS')
    expect(firstStep.state.day2.jobStatus).toBe('FAILED')
    expect(firstStep.highlight?.reveal.target).toBe(false)
    expect(firstStep.highlight?.reveal.writeUnit).toBe(false)
    expect(secondStep.highlight?.reveal.run).toBe(true)
    expect(secondStep.highlight?.reveal.target).toBe(false)
    expect(secondStep.highlight?.reveal.writeUnit).toBe(false)
    expect(firstStep.description).not.toContain('写入单元')
    expect(secondStep.description).not.toContain('写入单元')
    expect(secondStep.description).not.toContain('maintain')
  })

  it('Step 3 才揭示目标状态与路径分叉，Step 4 才展开写入单元缺口', () => {
    const steps = buildLifecyclePathSteps()

    expect(steps[2]!.highlight?.reveal).toMatchObject({ run: true, target: true, writeUnit: false })
    expect(steps[3]!.highlight?.reveal).toMatchObject({ target: true, writeUnit: true, fix: false })
    expect(steps[3]!.state.day2.path).toBe('maintain')
    expect(steps[3]!.state.day1.path).toBe('initialize')
    expect(steps[3]!.state.dataset.writeUnits).toEqual(['2026-09-18'])
    expect(steps[3]!.description).toContain('2026-09-19')
    expect(steps[3]!.description).toContain('缺少')

    expect(steps[4]!.state.day2.maintainValidated).toBe(true)
    expect(steps[4]!.state.dataset.writeUnits).toEqual(['2026-09-18', '2026-09-19'])
    expect(steps[5]!.state.verification).toHaveLength(5)
    expect(steps[6]!.highlight?.reveal.matrix).toBe(true)
  })

  it('Evidence Panel 值随 Step 变化，Day 2 失败时 rows written = 0', () => {
    const steps = buildLifecyclePathSteps()

    const day2AtStep1 = getDayEvidence(steps[0]!.state.day2, steps[0]!.highlight!.reveal)
    expect(day2AtStep1.map((row) => row.value)).toEqual(['FAILED', '—', '—', '—', '—'])

    const revealAtStep2 = steps[1]!.highlight!.reveal
    const day2AtStep2 = getDayEvidence(steps[1]!.state.day2, revealAtStep2)
    expect(day2AtStep2.find((row) => row.field === 'business_date')?.value).toBe('2026-09-19')
    expect(day2AtStep2.find((row) => row.field === 'Current Phase')?.value).toBe('prepare（失败）')
    expect(day2AtStep2.find((row) => row.field === 'Rows Written')?.value).toBe('0')
    expect(day2AtStep2.find((row) => row.field === 'Target Exists')?.value).toBe('—')

    const day1AtStep2 = getDayEvidence(steps[1]!.state.day1, revealAtStep2)
    expect(day1AtStep2.find((row) => row.field === 'Rows Written')?.value).toBe('6')

    const day2AtStep3 = getDayEvidence(steps[2]!.state.day2, steps[2]!.highlight!.reveal)
    expect(day2AtStep3.find((row) => row.field === 'Target Exists')?.value).toBe('Yes')
    const day1AtStep3 = getDayEvidence(steps[2]!.state.day1, steps[2]!.highlight!.reveal)
    expect(day1AtStep3.find((row) => row.field === 'Target Exists')?.value).toBe('No')

    const day2AfterFix = getDayEvidence(steps[4]!.state.day2, steps[4]!.highlight!.reveal)
    expect(day2AfterFix.find((row) => row.field === 'Current Phase')?.value).toBe(
      'prepare ✓（已单独验证）',
    )
    expect(day2AfterFix.find((row) => row.field === 'Rows Written')?.value).toBe('0')

    const day2AfterRerun = getDayEvidence(steps[5]!.state.day2, steps[5]!.highlight!.reveal)
    expect(day2AfterRerun.find((row) => row.field === 'Job Status')?.value).toBe('SUCCESS')
    expect(day2AfterRerun.find((row) => row.field === 'Current Phase')?.value).toBe('write（完成）')
    expect(day2AfterRerun.find((row) => row.field === 'Rows Written')?.value).toBe('6')

    const inputEvidence = getInputEvidence(fixture, steps[1]!.state.day2)
    expect(inputEvidence[2]).toMatchObject({
      label: 'Day 2 失败边界',
      value: '正式写入之前',
      detail: '停在 prepare，rows written = 0',
    })
  })

  it('路径步骤在修复前后分别表达「失败 / 未执行」与「已完成」', () => {
    const failedDay2 = createDay2FailedRun(fixture)
    const failedSteps = getDayPathSteps(failedDay2, fixture)

    expect(failedSteps.map((step) => step.state)).toEqual(['done', 'failed', 'pending'])
    expect(failedSteps[1]?.detail).toBe('规则缺口')
    expect(failedSteps[2]?.detail).toBe('未执行')

    const validated = validateMaintainWithFix(fixture, runInitialize(fixture)).dataset
    const validatedDay2 = { ...failedDay2, maintainValidated: true, rowsWritten: 0 }
    const validatedSteps = getDayPathSteps(validatedDay2, fixture)
    expect(validatedSteps.map((step) => step.state)).toEqual(['done', 'done', 'pending'])
    expect(validatedSteps[1]?.detail).toBe('单独验证通过')

    const rerunDay2 = { ...failedDay2, phase: 'write' as const, maintainValidated: true }
    const rerunSteps = getDayPathSteps(rerunDay2, fixture)
    expect(rerunSteps.map((step) => step.state)).toEqual(['done', 'done', 'done'])
    expect(validated.writeUnits).toEqual(['2026-09-18', '2026-09-19'])
  })

  it('Step 7 最小矩阵只有三种运行状态', () => {
    const matrix = getLifecycleTestMatrix()

    expect(matrix.map((row) => row.state)).toEqual([
      'object not exists',
      'object already exists',
      'rerun same business_date',
    ])
    expect(matrix[0]?.evidence).toContain('2026-09-18')
    expect(matrix[1]?.evidence).toContain('2026-09-19')
    expect(matrix[2]?.covers).toContain('幂等')
  })
})

describe('生产案例 13-1 · Step Kernel 与 SSR 首屏', () => {
  it('kernel 保持 7 步，player 边界与现有 Headless Player 一致', () => {
    const kernel = createLifecyclePathKernel()
    let player = createVisualizationPlayer(kernel.size)

    expect(kernel.size).toBe(7)
    expect(kernel.get(99).id).toBe('prevent-regression')
    expect(isVisualizationPlayerAtStart(player)).toBe(true)

    player = applyVisualizationPlayerAction(player, 'prev')
    expect(player.currentIndex).toBe(0)

    for (let index = 0; index < kernel.size; index += 1) {
      player = applyVisualizationPlayerAction(player, 'next')
    }

    expect(isVisualizationPlayerAtEnd(player)).toBe(true)
    expect(getCurrentVisualizationStep(player, kernel).id).toBe('prevent-regression')
    expect(applyVisualizationPlayerAction(player, 'next')).toBe(player)

    player = applyVisualizationPlayerAction(player, 'reset')
    expect(getCurrentVisualizationStep(player, kernel).id).toBe('symptom')
  })

  it('SSR 首屏停在 Step 1：可见两天状态，隐藏日期、路径与根因', () => {
    const markup = renderToStaticMarkup(<LifecyclePathLab />)

    expect(markup).toContain('data-diagram-type="state"')
    expect(markup).toContain('Step 1 / 7')
    expect(markup).toContain('现象：两天结果不同')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('role="progressbar"')
    expect(markup).toContain('aria-valuenow="1"')
    expect(markup).toContain('role="group"')
    expect(markup).toContain('上一步')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('下一步')
    expect(markup).toContain('SUCCESS')
    expect(markup).toContain('FAILED')
    expect(markup).toContain('Job Status')
    expect(markup).toContain('Rows Written')
    expect(markup).not.toContain('maintain')
    expect(markup).not.toContain('prepare')
    expect(markup).not.toContain('写入单元')
    expect(markup).not.toContain('正式写入之前')
    expect(markup).not.toContain('initialize')
  })

  it('13-1 保留单一 lifecycle-path 入口，并补充对象策略对照说明', () => {
    const lesson = getLessonBySlug('lifecycle-path-failure')
    expect(lesson).toBeDefined()

    const content = getLessonContent(lesson!)
    const visualizations = content.sections
      .filter((section) => section.kind === 'visualization')
      .map((section) => section.visualization)

    expect(visualizations).toEqual([{ kind: 'lifecycle-path' }])
    expect(JSON.stringify(content)).toContain('同名目标表，是否还是同一个对象？')
    expect(JSON.stringify(content)).toContain('CTAS 并非错误')
    expect(getAdjacentLessons(lessons, 'build-a-warehouse').next?.slug).toBe(
      'lifecycle-path-failure',
    )
    expect(getAdjacentLessons(lessons, 'lifecycle-path-failure').previous?.slug).toBe(
      'build-a-warehouse',
    )
    expect(getAdjacentLessons(lessons, 'lifecycle-path-failure').next).toBeUndefined()
  })
})
