import { describe, expect, it } from 'vitest'
import { dataQualityContent, dataQualityVisualization } from '../src/content/lessons/data-quality'
import type { QualityInjection } from '../src/features/data-quality/types'
import {
  QUALITY_RULE_IDS,
  createDataQualityVisualization,
  createQualitySchedulerRun,
  evaluateDataQuality,
  evaluateQualityStatus,
} from '../src/utils/data-quality'
import { SCHEDULER_TASK_IDS } from '../src/utils/scheduler'

function getCheck(
  injection: QualityInjection,
  ruleId: string,
  options: Parameters<typeof evaluateDataQuality>[1] = {},
) {
  const evaluation = evaluateDataQuality(dataQualityVisualization, { injection, ...options })
  const check = evaluation.checks.find((candidate) => candidate.ruleId === ruleId)
  if (!check) {
    throw new Error(`测试找不到规则: ${ruleId}`)
  }

  return { evaluation, check }
}

describe('数据质量领域契约与质量闸门', () => {
  it('注册第 07 课并连接真实 Scheduler Run', () => {
    expect(dataQualityContent.sections.some((section) => section.kind === 'visualization')).toBe(
      true,
    )
    expect(dataQualityVisualization.kind).toBe('data-quality')
    expect(dataQualityVisualization.rules).toHaveLength(6)
    expect(dataQualityVisualization.schedulerRun.status).toBe('success')
    expect(dataQualityVisualization.schedulerRun.taskRuns[SCHEDULER_TASK_IDS.ads]?.status).toBe(
      'success',
    )
    expect(
      dataQualityVisualization.rules.find((rule) => rule.ruleId === QUALITY_RULE_IDS.freshness)
        ?.schedulerTaskId,
    ).toBe(SCHEDULER_TASK_IDS.ads)
  })

  it.each([
    ['missing-balance-snapshot', QUALITY_RULE_IDS.completeness],
    ['duplicate-account-snapshot', QUALITY_RULE_IDS.uniqueness],
    ['invalid-currency', QUALITY_RULE_IDS.validity],
    ['orphan-account-balance', QUALITY_RULE_IDS.referentialIntegrity],
    ['deposit-reconciliation-drift', QUALITY_RULE_IDS.reconciliation],
    ['late-partition', QUALITY_RULE_IDS.freshness],
  ] as const)('注入 %s 会生成带样本的非 pass 质量结果', (injection, ruleId) => {
    const { evaluation, check } = getCheck(injection, ruleId)

    expect(check.status).not.toBe('pass')
    expect(check.evidence.some((evidence) => evidence.samples.length > 0)).toBe(true)
    expect(evaluation.events.some((event) => event.ruleId === ruleId)).toBe(true)
    expect(check.schedulerContext.runId).toBe(evaluation.schedulerRun.runId)
    expect(check.schedulerContext.partition).toEqual(evaluation.schedulerRun.partition)
  })

  it('默认故事证明 task success 不代表数据正确，并保留调查上下文', () => {
    const { evaluation, check } = getCheck(
      'missing-balance-snapshot',
      QUALITY_RULE_IDS.completeness,
    )
    const event = evaluation.events.find((candidate) => candidate.ruleId === check.ruleId)

    expect(check.schedulerContext.taskStatus).toBe('success')
    expect(check.status).toBe('fail')
    expect(event).toMatchObject({
      status: 'fail',
      target: {
        table: 'dwd_deposit_balance_detail',
        field: 'account_id',
        partition: { column: 'snapshot_date', value: dataQualityVisualization.targetDate },
      },
      schedulerContext: {
        taskId: SCHEDULER_TASK_IDS.dwd,
        taskStatus: 'success',
      },
      releaseImpact: {
        isBlocked: true,
        downstreamRelease: 'blocked',
      },
    })
    expect(event?.evidence[0]?.samples[0]).toMatchObject({
      rowKey: '2026-09-30 / A002 / 200000',
    })
    expect(event?.investigationContext.upstreamHints.length).toBeGreaterThan(0)
    expect(event?.investigationContext.downstreamImpacts).toContain(
      'dws_deposit_balance_daily_staging',
    )
  })

  it('支持 block、warn、quarantine、continue with risk 四种确定性发布决定', () => {
    const statuses = {
      block: evaluateDataQuality(dataQualityVisualization, {
        injection: 'deposit-reconciliation-drift',
        action: 'block',
      }).releaseDecision,
      warn: evaluateDataQuality(dataQualityVisualization, {
        injection: 'deposit-reconciliation-drift',
        action: 'warn',
      }).releaseDecision,
      quarantine: evaluateDataQuality(dataQualityVisualization, {
        injection: 'deposit-reconciliation-drift',
        action: 'quarantine',
      }).releaseDecision,
      risk: evaluateDataQuality(dataQualityVisualization, {
        injection: 'deposit-reconciliation-drift',
        action: 'continue-with-risk',
      }).releaseDecision,
    }

    expect(statuses.block).toMatchObject({ status: 'blocked', isBlocked: true })
    expect(statuses.warn).toMatchObject({ status: 'released-with-warning', isBlocked: false })
    expect(statuses.quarantine).toMatchObject({
      status: 'quarantined',
      isBlocked: true,
      quarantinedSampleCount: 1,
    })
    expect(statuses.risk).toMatchObject({
      status: 'released-with-risk',
      isBlocked: false,
    })
  })

  it('调整阈值会改变判定而不会删除证据', () => {
    const failed = evaluateDataQuality(dataQualityVisualization, {
      injection: 'deposit-reconciliation-drift',
      action: 'block',
    })
    const relaxed = evaluateDataQuality(dataQualityVisualization, {
      injection: 'deposit-reconciliation-drift',
      action: 'block',
      thresholdOverrides: { [QUALITY_RULE_IDS.reconciliation]: 40 },
    })
    const failedCheck = failed.checks.find(
      (check) => check.ruleId === QUALITY_RULE_IDS.reconciliation,
    )
    const relaxedCheck = relaxed.checks.find(
      (check) => check.ruleId === QUALITY_RULE_IDS.reconciliation,
    )

    expect(failedCheck?.status).toBe('fail')
    expect(failedCheck?.evidence[0]?.samples).toHaveLength(1)
    expect(relaxedCheck).toMatchObject({ status: 'pass', observedValue: 40 })
    expect(relaxedCheck?.evidence[0]?.expectedLabel).toBe('对账差额 ≤ ¥40')
    expect(relaxedCheck?.evidence[0]?.samples).toHaveLength(1)
    expect(relaxed.releaseDecision.status).toBe('released')
  })

  it('Freshness 迟到复用 Scheduler 的 upstream-late Run 而不是伪造状态', () => {
    const { evaluation, check } = getCheck('late-partition', QUALITY_RULE_IDS.freshness)

    expect(evaluation.schedulerRun.scenario).toBe('upstream-late')
    expect(evaluation.schedulerRun.status).toBe('success')
    expect(check.schedulerContext.taskStatus).toBe('success')
    expect(check.observedValue).toBeGreaterThan(30)
    expect(check.status).toBe('warn')
    expect(check.evidence[0]?.kind).toBe('partition-freshness')
    expect(check.evidence[0]?.samples[0]?.values).toMatchObject({
      task_status: 'success',
    })
  })

  it('Scheduler 前置失败时，证据仍保留 task status 语义', () => {
    const failedRun = createQualitySchedulerRun(
      dataQualityVisualization.schedulerRun.tasks,
      dataQualityVisualization.targetDate,
      'dwd-blocked',
    )
    const evaluation = evaluateDataQuality(createDataQualityVisualization(failedRun), {
      injection: 'none',
    })
    const dwdCheck = evaluation.checks.find(
      (check) => check.ruleId === QUALITY_RULE_IDS.completeness,
    )

    expect(failedRun.status).toBe('failed')
    expect(dwdCheck).toMatchObject({
      status: 'fail',
      schedulerContext: { taskStatus: 'failed' },
    })
    expect(dwdCheck?.evidence[0]?.expectedLabel).toBe('Scheduler task status = success')
  })

  it('正常基线全部通过，状态判定支持 pass / warn / fail', () => {
    const baseline = evaluateDataQuality(dataQualityVisualization, { injection: 'none' })

    expect(baseline.checks.every((check) => check.status === 'pass')).toBe(true)
    expect(baseline.events).toEqual([])
    expect(baseline.releaseDecision.status).toBe('released')
    expect(
      evaluateQualityStatus(37, {
        operator: 'at-most',
        value: 30,
        unit: 'minutes',
        warningRange: 15,
      }),
    ).toBe('warn')
    expect(
      evaluateQualityStatus(50, {
        operator: 'at-most',
        value: 30,
        unit: 'minutes',
        warningRange: 15,
      }),
    ).toBe('fail')
  })
})
