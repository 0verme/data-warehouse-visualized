import { describe, expect, it } from 'vitest'
import { shiftBusinessDate } from '../src/features/dependency-reprocessing/date'
import {
  REPROCESSING_HISTORICAL_BUSINESS_DATE,
  REPROCESSING_INCIDENT_BUSINESS_DATE,
  REPROCESSING_PREVIOUS_BUSINESS_DATE,
  REPROCESSING_TASK_IDS,
  createReprocessingFixture,
} from '../src/features/dependency-reprocessing/fixture'
import {
  createParallelPlan,
  createRollingBackfillWindow,
  evaluateCurrentBatch,
  evaluateDownstreamClosure,
  evaluateVersionCompatibility,
  listRollingBusinessDates,
  orderTaskIdsByDependencies,
} from '../src/features/dependency-reprocessing/model'
import type {
  ConsumerEvidence,
  ReprocessingModel,
  VersionChangeType,
} from '../src/features/dependency-reprocessing/types'

const INCIDENT_DATE = REPROCESSING_INCIDENT_BUSINESS_DATE
const PREVIOUS_DATE = REPROCESSING_PREVIOUS_BUSINESS_DATE
const HISTORICAL_DATE = REPROCESSING_HISTORICAL_BUSINESS_DATE
const TASK = REPROCESSING_TASK_IDS

const EXPECTED_TASK_ORDER = [
  TASK.ingestTransaction,
  TASK.checkTransactionCompleteness,
  TASK.dwdTransactionDetail,
  TASK.dwsMerchantTransaction,
  TASK.dwsChannelTransaction,
  TASK.adsTransactionReport,
  TASK.consumeTransactionReport,
  TASK.deliverTransactionFile,
]

function incidentInstance(taskId: string): string {
  return `${taskId}@${INCIDENT_DATE}`
}

function historicalInstance(taskId: string): string {
  return `${taskId}@${HISTORICAL_DATE}`
}

function createPlanOptions(changeType: VersionChangeType = 'sql-logic', target = HISTORICAL_DATE) {
  return {
    currentBusinessDate: INCIDENT_DATE,
    targetBusinessDate: target,
    sourceTaskId: TASK.ingestTransaction,
    programVersion: 'v3',
    changeType,
  }
}

describe('依赖链重做 · 历史模式 / 平行 Job Plan / 版本兼容 / 下游闭环（Phase 1-C）', () => {
  it('「当日」由生产日切 businessDate 决定，批次可跨自然日', () => {
    const model = createReprocessingFixture()
    const current = evaluateCurrentBatch(model, INCIDENT_DATE)

    expect(current.businessDate).toBe(INCIDENT_DATE)
    expect(current.completed).toBe(false)
    expect(current.runningInstanceIds).toEqual([incidentInstance(TASK.dwsMerchantTransaction)])
    expect(current.pendingInstanceIds).toContain(incidentInstance(TASK.adsTransactionReport))

    const ingest = model.instances.find(
      (instance) => instance.instanceId === incidentInstance(TASK.ingestTransaction),
    )
    expect(ingest?.businessDate).toBe(INCIDENT_DATE)
    expect(ingest?.logs[0]?.loggedAt.startsWith('2026-10-17')).toBe(true)

    expect(evaluateCurrentBatch(model, PREVIOUS_DATE).completed).toBe(true)
    expect(evaluateCurrentBatch(model, HISTORICAL_DATE).completed).toBe(true)
  })

  it('当日日切未全部结束时，历史重做被阻断并可解释', () => {
    const model = createReprocessingFixture()
    const decision = createParallelPlan(model, createPlanOptions())

    expect(decision.status).toBe('blocked')
    expect(decision.blockers).toHaveLength(1)
    expect(decision.blockers[0]).toContain('尚未全部结束')
    expect(decision.parallelPlan).toBeNull()
    expect(decision.requiredAction).toBeNull()
    expect(decision.gate.completed).toBe(false)
    expect(decision.compatibility.compatible).toBe(true)

    const sameDate = createParallelPlan(model, createPlanOptions('sql-logic', INCIDENT_DATE))
    expect(sameDate.status).toBe('blocked')
    expect(sameDate.blockers[0]).toContain('应按当日重做处理')
  })

  it('当日结束后生成历史日期的平行 Job / Plan，且不修改当前正常状态', () => {
    const model = createReprocessingFixture({ variant: 'completed' })
    const snapshot = createReprocessingFixture({ variant: 'completed' })
    const decision = createParallelPlan(model, createPlanOptions())

    expect(decision.status).toBe('allowed')
    expect(decision.blockers).toEqual([])
    expect(decision.gate.completed).toBe(true)

    const plan = decision.parallelPlan
    expect(plan).not.toBeNull()
    if (!plan) return

    expect(plan.targetBusinessDate).toBe(HISTORICAL_DATE)
    expect(plan.currentBusinessDate).toBe(INCIDENT_DATE)
    expect(plan.isolatedFromBusinessDate).toBe(INCIDENT_DATE)
    expect(plan.programVersion).toBe('v3')
    expect(plan.simulatorPlanId).toContain('SIM-PARALLEL')
    expect(plan.items.map((item) => item.taskId)).toEqual(EXPECTED_TASK_ORDER)
    expect(plan.items.every((item) => item.targetBusinessDate === HISTORICAL_DATE)).toBe(true)
    expect(plan.items.every((item) => item.programVersion === 'v3')).toBe(true)

    for (const item of plan.items) {
      const instance = model.instances.find((candidate) => candidate.instanceId === item.instanceId)
      expect(instance?.businessDate).toBe(HISTORICAL_DATE)
    }

    // 平行计划生成前后，当前正常 Job / Plan 与全部实例保持完全相同。
    expect(model).toEqual(snapshot)
    expect(
      model.instances
        .filter((instance) => instance.businessDate === INCIDENT_DATE)
        .every((instance) => instance.state === 'success'),
    ).toBe(true)
  })

  it('不兼容变更禁止直接历史重做，转专项修复；兼容变更放行', () => {
    const model = createReprocessingFixture({ variant: 'completed' })
    const forbidden: readonly VersionChangeType[] = [
      'schema-breaking',
      'semantics-changed',
      'input-contract-changed',
      'major-refactor',
    ]

    for (const changeType of forbidden) {
      const decision = createParallelPlan(model, createPlanOptions(changeType))
      expect(decision.status).toBe('forbidden')
      expect(decision.parallelPlan).toBeNull()
      expect(decision.requiredAction).toContain('专项修复')
      expect(decision.compatibility.compatible).toBe(false)
    }

    for (const changeType of ['none', 'sql-logic'] as const) {
      const decision = createParallelPlan(model, createPlanOptions(changeType))
      expect(decision.status).toBe('allowed')
      expect(decision.compatibility.requiredAction).toBeNull()
    }

    const compatibility = evaluateVersionCompatibility({
      programVersion: 'v3',
      targetBusinessDate: HISTORICAL_DATE,
      changeType: 'major-refactor',
    })
    expect(compatibility.reasons[0]).toContain('重大重构')
  })

  it('历史日期缺少任务实例时显式报错，不生成不完整计划', () => {
    const model = createReprocessingFixture({ variant: 'completed' })
    const partial: ReprocessingModel = {
      ...model,
      instances: model.instances.filter(
        (instance) =>
          !(
            instance.taskId === TASK.adsTransactionReport &&
            instance.businessDate === HISTORICAL_DATE
          ),
      ),
    }

    expect(() => createParallelPlan(partial, createPlanOptions())).toThrow(/缺少任务/)
  })

  it('下游闭环：已装载旧结果按消费方式重装 / 刷新 / 更正，并跟踪确认', () => {
    const consumers: ConsumerEvidence[] = [
      {
        consumerId: 'interface.push',
        label: '交易报表推送',
        kind: 'interface',
        consumedInstanceId: historicalInstance(TASK.adsTransactionReport),
        consumedNewResult: false,
        confirmation: 'pending',
      },
      {
        consumerId: 'file.export',
        label: '交易文件投递',
        kind: 'file',
        consumedInstanceId: historicalInstance(TASK.deliverTransactionFile),
        consumedNewResult: false,
        confirmation: 'pending',
      },
      {
        consumerId: 'report.bi',
        label: '经营分析报表',
        kind: 'report',
        consumedInstanceId: historicalInstance(TASK.adsTransactionReport),
        consumedNewResult: false,
        confirmation: 'pending',
      },
      {
        consumerId: 'regulator.submit',
        label: '监管报送',
        kind: 'regulatory',
        consumedInstanceId: historicalInstance(TASK.adsTransactionReport),
        consumedNewResult: false,
        confirmation: 'pending',
      },
      {
        consumerId: 'load.new',
        label: '新建装载任务',
        kind: 'load',
        consumedInstanceId: null,
        consumedNewResult: false,
        confirmation: 'pending',
      },
      {
        consumerId: 'interface.fresh',
        label: '已消费新结果的接口',
        kind: 'interface',
        consumedInstanceId: incidentInstance(TASK.adsTransactionReport),
        consumedNewResult: true,
        confirmation: 'confirmed',
      },
    ]

    const closure = evaluateDownstreamClosure(consumers)
    expect(closure.rows.map((row) => row.requiredAction)).toEqual([
      'reload',
      'reload',
      'refresh',
      'correct',
      'none',
      'none',
    ])
    expect(closure.rows.map((row) => row.actionLabel)).toEqual([
      '重新装数',
      '重新装数',
      '刷新报表缓存',
      '更正并重新报送',
      '无需处理',
      '无需处理',
    ])
    expect(closure.rows[0]?.note).toContain('已装载旧结果')
    expect(closure.pendingConfirmationCount).toBe(4)
    expect(closure.allConfirmed).toBe(false)

    const confirmed = evaluateDownstreamClosure(
      consumers.map((consumer) => ({ ...consumer, confirmation: 'confirmed' as const })),
    )
    expect(confirmed.pendingConfirmationCount).toBe(0)
    expect(confirmed.allConfirmed).toBe(true)
  })

  it('数仓任务全部 SUCCESS 不等于消费端恢复', () => {
    const model = createReprocessingFixture({ variant: 'completed' })
    expect(
      model.instances
        .filter((instance) => instance.businessDate === INCIDENT_DATE)
        .every((instance) => instance.state === 'success'),
    ).toBe(true)

    const closure = evaluateDownstreamClosure([
      {
        consumerId: 'interface.push',
        label: '交易报表推送',
        kind: 'interface',
        consumedInstanceId: historicalInstance(TASK.adsTransactionReport),
        consumedNewResult: false,
        confirmation: 'pending',
      },
    ])
    expect(closure.allConfirmed).toBe(false)
    expect(closure.rows[0]?.requiredAction).toBe('reload')
  })

  it('滚动七日：影响日期集合与跨天依赖顺序正确', () => {
    const dates = listRollingBusinessDates(INCIDENT_DATE, 7)
    expect(dates).toEqual([
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
    ])

    const window = createRollingBackfillWindow([...dates].reverse())
    expect(window.order).toEqual(dates)
    expect(window.crossDayDependencies).toHaveLength(6)
    expect(window.crossDayDependencies[0]).toMatchObject({
      fromBusinessDate: '2026-10-10',
      toBusinessDate: '2026-10-11',
    })
    expect(window.parallelUnsafeReason).toContain('不能简单并行')

    const single = createRollingBackfillWindow(['2026-10-16'])
    expect(single.crossDayDependencies).toHaveLength(0)
    expect(single.parallelUnsafeReason).toBeNull()

    expect(shiftBusinessDate('2026-10-01', -1)).toBe('2026-09-30')
    expect(() => listRollingBusinessDates(INCIDENT_DATE, 0)).toThrow(/正整数/)
  })

  it('依赖排序可复用于历史任务集合：上游先于下游', () => {
    const model = createReprocessingFixture()
    const ordered = orderTaskIdsByDependencies(model, [
      TASK.adsTransactionReport,
      TASK.dwsMerchantTransaction,
      TASK.ingestTransaction,
      TASK.dwdTransactionDetail,
    ])

    expect(ordered).toEqual([
      TASK.ingestTransaction,
      TASK.dwdTransactionDetail,
      TASK.dwsMerchantTransaction,
      TASK.adsTransactionReport,
    ])
  })
})
