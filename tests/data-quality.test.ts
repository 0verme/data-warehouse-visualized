import { describe, expect, it } from 'vitest'
import { dataQualityVisualization } from '../src/content/lessons/data-quality'
import type { QualityScenario } from '../src/features/data-quality/types'
import {
  QUALITY_RULE_IDS,
  createDataQualityVisualization,
  createQualitySchedulerRun,
  evaluateDataQuality,
} from '../src/utils/data-quality'
import { schedulerVisualization } from '../src/content/lessons/scheduling-system'
import { BANKING_SCHEDULER_TASK_IDS } from '../src/features/scheduler/banking'

function evaluate(
  scenario: QualityScenario,
  options: Parameters<typeof evaluateDataQuality>[1] = {},
) {
  return evaluateDataQuality(dataQualityVisualization, { scenario, ...options })
}

function getCheck(scenario: QualityScenario, ruleId: string) {
  const result = evaluate(scenario)
  const check = result.checks.find((candidate) => candidate.ruleId === ruleId)
  if (!check) {
    throw new Error(`测试找不到规则: ${ruleId}`)
  }
  return { result, check }
}

describe('07 数据质量：Banking Teaching Domain 质量契约', () => {
  it('从现有 Banking Metric 快照构造确定性的 AccountBalanceSnapshot 教学模型', () => {
    expect(dataQualityVisualization.targetDate).toBe('2026-09-30')
    expect(dataQualityVisualization.model.sourceSnapshots).toHaveLength(7)
    expect(dataQualityVisualization.model.knownBranchIds).toContain('hangzhou')
    expect(dataQualityVisualization.model.knownCurrencyCodes).toContain('CNY')
    expect(dataQualityVisualization.rules.map((rule) => rule.target.table)).toContain(
      'dwd_deposit_account_balance',
    )
  })

  it('Scheduler SUCCESS 与 Quality FAILED 可以同时成立，并默认阻断银行结果', () => {
    const result = evaluate('balance-reconciliation-drift')

    expect(result.schedulerRun.status).toBe('success')
    expect(result.schedulerRun.businessDate).toBe('2026-09-30')
    expect(result.releaseDecision).toMatchObject({ status: 'blocked', isBlocked: true })
    expect(result.events.some((event) => event.ruleId === QUALITY_RULE_IDS.reconciliation)).toBe(
      true,
    )
  })

  it.each([
    ['duplicate-grain', QUALITY_RULE_IDS.grain],
    ['missing-required-field', QUALITY_RULE_IDS.requiredFields],
    ['invalid-currency', QUALITY_RULE_IDS.currency],
    ['missing-branch-reference', QUALITY_RULE_IDS.branchReference],
  ] as const)('记录级故障 %s 生成行级证据', (scenario, ruleId) => {
    const { check } = getCheck(scenario, ruleId)

    expect(check.status).toBe('fail')
    expect(check.failedRows).toBeGreaterThan(0)
    expect(check.evidence[0]?.kind).toBe('row')
    expect(check.evidence[0]?.sample).toBeDefined()
  })

  it('Grain 是第一锚点，Account × snapshot_date 重复规则保持零容忍', () => {
    const result = evaluate('duplicate-grain', {
      thresholdOverrides: { [QUALITY_RULE_IDS.grain]: 100 },
    })
    const check = result.checks.find((candidate) => candidate.ruleId === QUALITY_RULE_IDS.grain)

    expect(check).toMatchObject({ status: 'fail', observedValue: 1, threshold: { value: 0 } })
    expect(check?.evidence[0]?.sample?.values).toMatchObject({ account_id: 'A005' })
  })

  it('整批完整性使用应到集合，不依赖昨天行数，也不伪造坏行', () => {
    const { result, check } = getCheck('batch-incomplete', QUALITY_RULE_IDS.batchCompleteness)

    expect(check).toMatchObject({ status: 'fail', observedValue: 3000, failedRows: 3000 })
    expect(check.expected).toBe('10000 个有效 Account')
    expect(check.observed).toBe('7000 个 AccountBalanceSnapshot')
    expect(check.evidence[0]?.kind).toBe('set')
    expect(check.evidence[0]?.sample).toBeUndefined()
    expect(result.events[0]?.sample).toBeUndefined()
  })

  it('Freshness 检查内容日期，而不是 Scheduler 到达或等待状态', () => {
    const { result, check } = getCheck('stale-snapshot', QUALITY_RULE_IDS.freshness)

    expect(result.schedulerRun.status).toBe('success')
    expect(check.schedulerContext.taskStatus).toBe('success')
    expect(check).toMatchObject({
      status: 'fail',
      expected: '2026-09-30',
      observed: '2026-09-29',
    })
    expect(check.evidence[0]?.kind).toBe('date')
    expect(check.failedRows).toBeUndefined()
    expect(check.evidence[0]?.sample).toBeUndefined()
  })

  it('跨层对账限定同一业务口径，并保留带符号的 delta 聚合证据', () => {
    const { check } = getCheck('balance-reconciliation-drift', QUALITY_RULE_IDS.reconciliation)

    expect(check).toMatchObject({ status: 'fail', observedValue: 200_000_000 })
    expect(check.expected).toBe('delta = 0')
    expect(check.observed).toBe('delta = -200000000')
    expect(check.evidence[0]?.kind).toBe('aggregate')
    expect(check.evidence[0]?.sample).toBeUndefined()
  })

  it('Quality Event 只携带质量事实和 Scheduler 上下文，不携带调查结论', () => {
    const result = evaluate('missing-branch-reference')
    const event = result.events.find(
      (candidate) => candidate.ruleId === QUALITY_RULE_IDS.branchReference,
    )

    expect(event).toMatchObject({
      ruleId: QUALITY_RULE_IDS.branchReference,
      businessDate: '2026-09-30',
      target: {
        table: 'dwd_deposit_account_balance',
        field: 'branch_id',
        partition: { column: 'business_date', value: '2026-09-30' },
      },
      expected: 'branch_id ∈ {hangzhou, shanghai}',
      observed: 'B9999',
      failedRows: 1,
      schedulerContext: {
        taskId: BANKING_SCHEDULER_TASK_IDS.dwd,
        taskStatus: 'success',
      },
    })
    expect(event?.sample?.values).toMatchObject({
      account_id: 'A003',
      branch_id: 'B9999',
      balance: 230000,
    })
    expect(event).not.toHaveProperty('rootCause')
    expect(event).not.toHaveProperty('upstreamHints')
    expect(event).not.toHaveProperty('downstreamImpacts')
    expect(event).not.toHaveProperty('releaseImpact')
  })

  it('银行关键数据默认 BLOCK，非关键独立埋点才使用 quarantine 对照', () => {
    const banking = evaluate('bank-critical-branch-failure')
    const telemetry = evaluate('telemetry-invalid-records')

    expect(banking.releaseDecision).toMatchObject({ status: 'blocked', isBlocked: true })
    expect(banking.events[0]?.failedRows).toBe(3)
    expect(telemetry.releaseDecision).toMatchObject({
      status: 'quarantined',
      isBlocked: false,
      quarantinedSampleCount: 3,
    })
    expect(telemetry.events[0]?.failedRows).toBe(3)
  })

  it('无故障基线全部通过，质量模型结果可重放', () => {
    const first = evaluate('baseline')
    const second = evaluate('baseline')

    expect(first).toEqual(second)
    expect(first.checks.every((check) => check.status === 'pass')).toBe(true)
    expect(first.events).toEqual([])
    expect(first.releaseDecision.status).toBe('released')
  })

  it('质量模型仍通过 Scheduler adapter 接收 run、business date、partition 和 task status', () => {
    const run = createQualitySchedulerRun(schedulerVisualization.tasks, '2026-09-30', 'dwd-blocked')
    const visualization = createDataQualityVisualization(run, 'status')
    const result = evaluateDataQuality(visualization, { scenario: 'baseline' })
    const grainCheck = result.checks.find((check) => check.ruleId === QUALITY_RULE_IDS.grain)

    expect(run.status).toBe('failed')
    expect(grainCheck?.schedulerContext).toMatchObject({
      runId: run.runId,
      businessDate: '2026-09-30',
      taskStatus: 'failed',
    })
    expect(grainCheck?.status).toBe('fail')
  })
})
