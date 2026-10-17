import { describe, expect, it } from 'vitest'
import {
  REPROCESSING_INCIDENT_BUSINESS_DATE,
  REPROCESSING_PREVIOUS_BUSINESS_DATE,
  REPROCESSING_SOURCE_INSTANCE_ID,
  REPROCESSING_TASK_IDS,
  createOdsValidationChecks,
  createReprocessingFixture,
} from '../src/features/dependency-reprocessing/fixture'
import {
  analyzeReprocessingImpact,
  applyAffectedStopAndWait,
  applyReprocessingAction,
  checkRedoMutualExclusion,
  createRedoSchedule,
  evaluateOdsValidation,
  findInstance,
  invalidateAffectedSuccess,
  shiftTimestamp,
} from '../src/features/dependency-reprocessing/model'
import type {
  OdsValidationResult,
  RedoSchedule,
  ReprocessingModel,
  ReprocessingTaskDefinition,
  ReprocessingTaskInstance,
} from '../src/features/dependency-reprocessing/types'

const INCIDENT_DATE = REPROCESSING_INCIDENT_BUSINESS_DATE
const PREVIOUS_DATE = REPROCESSING_PREVIOUS_BUSINESS_DATE
const TASK = REPROCESSING_TASK_IDS
const STOP_AT = '2026-10-17 04:00:00'

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

function previousInstance(taskId: string): string {
  return `${taskId}@${PREVIOUS_DATE}`
}

function passedValidation(): OdsValidationResult {
  return evaluateOdsValidation(INCIDENT_DATE, createOdsValidationChecks('passed'))
}

function failedValidation(): OdsValidationResult {
  return evaluateOdsValidation(INCIDENT_DATE, createOdsValidationChecks('failed'))
}

function createReadyVariant(): ReprocessingModel {
  const model = createReprocessingFixture()
  return {
    ...model,
    instances: model.instances.map((instance) =>
      instance.instanceId === incidentInstance(TASK.dwsMerchantTransaction)
        ? { ...instance, state: 'ready' }
        : instance,
    ),
  }
}

function createStoppedVariant(): ReprocessingModel {
  const model = createReprocessingFixture()
  return {
    ...model,
    instances: model.instances.map((instance) =>
      instance.instanceId === incidentInstance(TASK.dwsMerchantTransaction)
        ? { ...instance, state: 'stopped' }
        : instance,
    ),
  }
}

function executeScheduleToSuccess(
  model: ReprocessingModel,
  schedule: RedoSchedule,
): ReprocessingModel {
  let next = model
  schedule.items.forEach((item, index) => {
    const startAt = shiftTimestamp(STOP_AT, 10 + index * 2)
    const completeAt = shiftTimestamp(startAt, 1)
    next = applyReprocessingAction(next, {
      type: 'start-redo',
      instanceId: item.instanceId,
      at: startAt,
    })
    next = applyReprocessingAction(next, {
      type: 'complete-redo',
      instanceId: item.instanceId,
      at: completeAt,
    })
  })
  return next
}

describe('依赖链重做 · 止损 / 等待 / ODS 门禁 / 二次修复（Phase 1-B）', () => {
  it('先停止再等待：running → stopping → stopped → waiting，日志严格递增', () => {
    const model = createReprocessingFixture()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)
    const result = applyAffectedStopAndWait(model, analysis, STOP_AT)
    const merchantDws = findInstance(result.model, incidentInstance(TASK.dwsMerchantTransaction))

    expect(result.stoppedInstanceIds).toEqual([incidentInstance(TASK.dwsMerchantTransaction)])
    expect(result.blockedInstanceIds).toEqual([])
    expect(merchantDws?.state).toBe('waiting')

    const newEvents = merchantDws?.logs.slice(-3).map((log) => log.event)
    expect(newEvents).toEqual(['stop-requested', 'stopped', 'waiting'])
    expect(merchantDws?.logs.every((log) => log.source === 'reprocessing')).toBe(false)
    expect(merchantDws?.logs.slice(-3).every((log) => log.source === 'reprocessing')).toBe(true)

    const timestamps = merchantDws?.logs.map((log) => log.loggedAt) ?? []
    expect([...timestamps].sort()).toEqual(timestamps)
    expect(new Set(timestamps).size).toBe(timestamps.length)
  })

  it('ready 实例尚未开始执行，直接被阻断为等待', () => {
    const model = createReadyVariant()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)
    const result = applyAffectedStopAndWait(model, analysis, STOP_AT)
    const merchantDws = findInstance(result.model, incidentInstance(TASK.dwsMerchantTransaction))

    expect(result.blockedInstanceIds).toEqual([incidentInstance(TASK.dwsMerchantTransaction)])
    expect(result.stoppedInstanceIds).toEqual([])
    expect(merchantDws?.state).toBe('waiting')
    expect(merchantDws?.logs.at(-1)?.event).toBe('stop-requested')
    expect(merchantDws?.logs.at(-1)?.detail).toContain('尚未开始执行')
  })

  it('互斥检查：停止前阻断重做，停止后放行', () => {
    const model = createReprocessingFixture()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)

    const blocked = createRedoSchedule(model, analysis, { validation: passedValidation() })
    expect(blocked.status).toBe('blocked')
    expect(blocked.schedule).toBeNull()
    expect(
      blocked.violations.some(
        (violation) =>
          violation.instanceId === incidentInstance(TASK.dwsMerchantTransaction) &&
          violation.state === 'running',
      ),
    ).toBe(true)

    const stopped = applyAffectedStopAndWait(model, analysis, STOP_AT)
    const stoppedAnalysis = analyzeReprocessingImpact(
      stopped.model,
      REPROCESSING_SOURCE_INSTANCE_ID,
    )
    const ready = createRedoSchedule(stopped.model, stoppedAnalysis, {
      validation: passedValidation(),
    })

    expect(ready.status).toBe('ready')
    expect(ready.violations).toEqual([])
    expect(ready.schedule?.businessDate).toBe(INCIDENT_DATE)
    expect(ready.schedule?.simulatorPlanId).toMatch(/^SIM-PLAN:/)
    expect(ready.schedule?.items.map((item) => item.taskId)).toEqual(EXPECTED_TASK_ORDER)
  })

  it('重做计划按依赖顺序给出动作语义', () => {
    const stoppedOnly = createStoppedVariant()
    const stoppedOnlyAnalysis = analyzeReprocessingImpact(
      stoppedOnly,
      REPROCESSING_SOURCE_INSTANCE_ID,
    )
    const stoppedResult = createRedoSchedule(stoppedOnly, stoppedOnlyAnalysis, {
      validation: passedValidation(),
    })

    expect(stoppedResult.status).toBe('ready')
    if (stoppedResult.status !== 'ready') return
    expect(stoppedResult.schedule.items.map((item) => item.taskId)).toEqual(EXPECTED_TASK_ORDER)

    const stoppedByInstance = new Map(
      stoppedResult.schedule.items.map((item) => [item.instanceId, item.action]),
    )
    expect(stoppedByInstance.get(incidentInstance(TASK.dwsMerchantTransaction))).toBe(
      'redo-after-stop',
    )

    const model = createReprocessingFixture()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)
    const stopped = applyAffectedStopAndWait(model, analysis, STOP_AT)
    const stoppedAnalysis = analyzeReprocessingImpact(
      stopped.model,
      REPROCESSING_SOURCE_INSTANCE_ID,
    )
    const result = createRedoSchedule(stopped.model, stoppedAnalysis, {
      validation: passedValidation(),
    })

    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    const byInstance = new Map(result.schedule.items.map((item) => [item.instanceId, item.action]))

    expect(byInstance.get(incidentInstance(TASK.ingestTransaction))).toBe('redo-executed')
    expect(byInstance.get(incidentInstance(TASK.dwsMerchantTransaction))).toBe('run-waiting')
    expect(byInstance.get(incidentInstance(TASK.adsTransactionReport))).toBe('run-waiting')
    expect(byInstance.get(incidentInstance(TASK.deliverTransactionFile))).toBe('run-waiting')
    expect(result.schedule.items).toHaveLength(EXPECTED_TASK_ORDER.length)
  })

  it('无关链路不被误停：机构链路与前一日分区保持原状态', () => {
    const model = createReprocessingFixture()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)
    const result = applyAffectedStopAndWait(model, analysis, STOP_AT)

    for (const taskId of [
      TASK.ingestBranch,
      TASK.dimBranch,
      TASK.adsBranchReport,
      TASK.consumeBranchReport,
    ]) {
      const before = findInstance(model, incidentInstance(taskId))
      const after = findInstance(result.model, incidentInstance(taskId))
      expect(after).toEqual(before)
      expect(after?.state).toBe('success')
    }

    expect(findInstance(result.model, previousInstance(TASK.ingestTransaction))?.state).toBe(
      'success',
    )
    expect(findInstance(result.model, previousInstance(TASK.dwsMerchantTransaction))?.state).toBe(
      'success',
    )
  })

  it('ODS 验证门禁：验证不通过不得放行；无检查项也不得放行', () => {
    const model = createReprocessingFixture()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)
    const stopped = applyAffectedStopAndWait(model, analysis, STOP_AT)

    const failed = createRedoSchedule(stopped.model, analysis, {
      validation: failedValidation(),
    })
    expect(failed.status).toBe('blocked')
    expect(failed.reason).toContain('ODS 验证未通过')
    expect(failed.reason).toContain('行数与控制表登记一致')
    expect(failed.schedule).toBeNull()

    const empty = evaluateOdsValidation(INCIDENT_DATE, [])
    expect(empty.validated).toBe(false)
    expect(empty.blockedReason).toContain('没有可用的 ODS 验证检查')
  })

  it('写入冲突：其他任务正在写入重做目标表时判定互斥', () => {
    const sharedTable = { table: 'shared_control_table', partitionColumn: 'business_date' }
    const tasks: ReprocessingTaskDefinition[] = [
      {
        taskId: 'writer.a',
        label: '写入 A',
        layer: 'dws',
        reads: [],
        writes: [sharedTable],
        dependsOn: [],
      },
      {
        taskId: 'writer.b',
        label: '写入 B',
        layer: 'dws',
        reads: [],
        writes: [sharedTable],
        dependsOn: [],
      },
    ]
    const instances: ReprocessingTaskInstance[] = [
      {
        instanceId: `writer.a@${INCIDENT_DATE}`,
        taskId: 'writer.a',
        businessDate: INCIDENT_DATE,
        partition: { column: 'business_date', value: INCIDENT_DATE },
        state: 'success',
        source: 'normal-schedule',
        logs: [],
      },
      {
        instanceId: `writer.b@${INCIDENT_DATE}`,
        taskId: 'writer.b',
        businessDate: INCIDENT_DATE,
        partition: { column: 'business_date', value: INCIDENT_DATE },
        state: 'running',
        source: 'normal-schedule',
        logs: [],
      },
    ]

    const result = checkRedoMutualExclusion({ tasks, instances }, [`writer.a@${INCIDENT_DATE}`])
    expect(result.ok).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.taskId).toBe('writer.b')
    expect(result.violations[0]?.reason).toContain('写入目标冲突')
  })

  it('自动依赖重做：按计划顺序执行后全部 SUCCESS，后续实例来源为 reprocessing', () => {
    const model = createReprocessingFixture()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)
    const stopped = applyAffectedStopAndWait(model, analysis, STOP_AT)
    const stoppedAnalysis = analyzeReprocessingImpact(
      stopped.model,
      REPROCESSING_SOURCE_INSTANCE_ID,
    )
    const result = createRedoSchedule(stopped.model, stoppedAnalysis, {
      validation: passedValidation(),
    })

    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return

    const redone = executeScheduleToSuccess(stopped.model, result.schedule)
    for (const item of result.schedule.items) {
      const instance = findInstance(redone, item.instanceId)
      expect(instance?.state).toBe('success')
      expect(instance?.source).toBe('reprocessing')
    }

    expect(findInstance(redone, incidentInstance(TASK.adsBranchReport))?.state).toBe('success')
    expect(findInstance(redone, previousInstance(TASK.ingestTransaction))?.state).toBe('success')
  })

  it('重做失败按正常生产故障处理：保持已成功上游，不级联清空无关成功', () => {
    const model = createReprocessingFixture()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)
    const stopped = applyAffectedStopAndWait(model, analysis, STOP_AT)
    const stoppedAnalysis = analyzeReprocessingImpact(
      stopped.model,
      REPROCESSING_SOURCE_INSTANCE_ID,
    )
    const result = createRedoSchedule(stopped.model, stoppedAnalysis, {
      validation: passedValidation(),
    })
    if (result.status !== 'ready') throw new Error('测试前提：重做计划应当 ready')

    const items = result.schedule.items
    const dwdIndex = items.findIndex((item) => item.taskId === TASK.dwdTransactionDetail)
    expect(dwdIndex).toBeGreaterThan(0)

    let next = stopped.model
    items.slice(0, dwdIndex).forEach((item, index) => {
      const at = shiftTimestamp(STOP_AT, 10 + index * 2)
      next = applyReprocessingAction(next, { type: 'start-redo', instanceId: item.instanceId, at })
      next = applyReprocessingAction(next, {
        type: 'complete-redo',
        instanceId: item.instanceId,
        at: shiftTimestamp(at, 1),
      })
    })

    const dwdItem = items[dwdIndex]
    if (!dwdItem) throw new Error('测试前提：存在 DWD 重做项')
    const dwdStartAt = shiftTimestamp(STOP_AT, 10 + dwdIndex * 2)
    next = applyReprocessingAction(next, {
      type: 'start-redo',
      instanceId: dwdItem.instanceId,
      at: dwdStartAt,
    })
    next = applyReprocessingAction(next, {
      type: 'fail-redo',
      instanceId: dwdItem.instanceId,
      at: shiftTimestamp(dwdStartAt, 1),
      reason: '目标表写入失败',
    })

    expect(findInstance(next, dwdItem.instanceId)?.state).toBe('failed')
    expect(findInstance(next, dwdItem.instanceId)?.logs.at(-1)?.event).toBe('failed')
    expect(findInstance(next, incidentInstance(TASK.ingestTransaction))?.state).toBe('success')
    expect(findInstance(next, incidentInstance(TASK.dwsMerchantTransaction))?.state).toBe('waiting')
    expect(findInstance(next, incidentInstance(TASK.adsBranchReport))?.state).toBe('success')

    const retried = applyReprocessingAction(next, {
      type: 'start-redo',
      instanceId: dwdItem.instanceId,
      at: shiftTimestamp(dwdStartAt, 10),
    })
    expect(findInstance(retried, dwdItem.instanceId)?.state).toBe('running')
  })

  it('ODS 再次修复：受影响 SUCCESS 失效并重新等待，历史日志保留其它分区不受影响', () => {
    const model = createReprocessingFixture()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)
    const stopped = applyAffectedStopAndWait(model, analysis, STOP_AT)
    const stoppedAnalysis = analyzeReprocessingImpact(
      stopped.model,
      REPROCESSING_SOURCE_INSTANCE_ID,
    )
    const result = createRedoSchedule(stopped.model, stoppedAnalysis, {
      validation: passedValidation(),
    })
    if (result.status !== 'ready') throw new Error('测试前提：重做计划应当 ready')

    const redone = executeScheduleToSuccess(stopped.model, result.schedule)
    const repairAt = '2026-10-18 02:30:00'
    const invalidated = invalidateAffectedSuccess(
      redone,
      stoppedAnalysis,
      repairAt,
      'ODS 再次修复：受影响 SUCCESS 失效并重新等待',
    )

    expect(invalidated.invalidatedInstanceIds).toHaveLength(EXPECTED_TASK_ORDER.length)
    for (const instanceId of invalidated.invalidatedInstanceIds) {
      const before = findInstance(redone, instanceId)
      const after = findInstance(invalidated.model, instanceId)
      expect(after?.state).toBe('waiting')
      expect(after?.logs.length).toBe((before?.logs.length ?? 0) + 1)
      expect(after?.logs.at(-1)?.loggedAt).toBe(repairAt)
      expect(after?.logs.at(-1)?.detail).toContain('ODS 再次修复')
    }

    expect(findInstance(invalidated.model, incidentInstance(TASK.adsBranchReport))?.state).toBe(
      'success',
    )
    expect(findInstance(invalidated.model, previousInstance(TASK.ingestTransaction))?.state).toBe(
      'success',
    )

    const reschedule = createRedoSchedule(invalidated.model, stoppedAnalysis, {
      validation: passedValidation(),
    })
    expect(reschedule.status).toBe('ready')
    expect(reschedule.schedule?.items.every((item) => item.action === 'run-waiting')).toBe(true)
  })

  it('日志只有时间语义：实例与日志字段集合固定，无轮次 / generation 字段', () => {
    const model = createReprocessingFixture()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)
    const result = applyAffectedStopAndWait(model, analysis, STOP_AT)
    const instance = findInstance(result.model, incidentInstance(TASK.dwsMerchantTransaction))

    expect(Object.keys(instance ?? {}).sort()).toEqual([
      'businessDate',
      'instanceId',
      'logs',
      'partition',
      'source',
      'state',
      'taskId',
    ])
    for (const log of instance?.logs ?? []) {
      expect(Object.keys(log).sort()).toEqual(['detail', 'event', 'loggedAt', 'source'])
    }
    expect(JSON.stringify(result.model)).not.toMatch(/generation|round|批次号/i)
  })

  it('非法转换显式抛错；幂等请求不重复追加日志', () => {
    const model = createReprocessingFixture()

    expect(() =>
      applyReprocessingAction(model, {
        type: 'confirm-stop',
        instanceId: incidentInstance(TASK.dwdTransactionDetail),
        at: STOP_AT,
        sideEffectDisposition: '不适用',
      }),
    ).toThrow(/confirm-stop 不支持的状态/)

    expect(() =>
      applyReprocessingAction(model, {
        type: 'start-redo',
        instanceId: incidentInstance(TASK.dwsMerchantTransaction),
        at: STOP_AT,
      }),
    ).toThrow(/start-redo 不支持的状态/)

    const waitingModel = createReadyVariant()
    const analysis = analyzeReprocessingImpact(waitingModel, REPROCESSING_SOURCE_INSTANCE_ID)
    const once = applyAffectedStopAndWait(waitingModel, analysis, STOP_AT)
    const twice = applyAffectedStopAndWait(once.model, analysis, STOP_AT)

    const firstLogs = findInstance(once.model, incidentInstance(TASK.dwsMerchantTransaction))?.logs
    const secondLogs = findInstance(
      twice.model,
      incidentInstance(TASK.dwsMerchantTransaction),
    )?.logs
    expect(secondLogs).toEqual(firstLogs)
  })
})
