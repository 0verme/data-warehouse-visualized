import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  REPROCESSING_INCIDENT_BUSINESS_DATE,
  REPROCESSING_PREVIOUS_BUSINESS_DATE,
  REPROCESSING_SOURCE_INSTANCE_ID,
  REPROCESSING_TASK_IDS,
  createReprocessingFixture,
} from '../src/features/dependency-reprocessing/fixture'
import {
  analyzeReprocessingImpact,
  classifyInstanceExecution,
  deriveLineageEdges,
  findInstance,
  listTaskInstances,
} from '../src/features/dependency-reprocessing/model'
import type { TaskInstanceState } from '../src/features/dependency-reprocessing/types'

const INCIDENT_DATE = REPROCESSING_INCIDENT_BUSINESS_DATE
const PREVIOUS_DATE = REPROCESSING_PREVIOUS_BUSINESS_DATE
const TASK = REPROCESSING_TASK_IDS

function incidentInstance(taskId: string): string {
  return `${taskId}@${INCIDENT_DATE}`
}

function previousInstance(taskId: string): string {
  return `${taskId}@${PREVIOUS_DATE}`
}

const EXPECTED_AFFECTED_ORDER = [
  incidentInstance(TASK.ingestTransaction),
  incidentInstance(TASK.checkTransactionCompleteness),
  incidentInstance(TASK.dwdTransactionDetail),
  incidentInstance(TASK.dwsMerchantTransaction),
  incidentInstance(TASK.dwsChannelTransaction),
  incidentInstance(TASK.adsTransactionReport),
  incidentInstance(TASK.consumeTransactionReport),
  incidentInstance(TASK.deliverTransactionFile),
]

describe('依赖链重做 · 影响分析内核（Phase 1-A）', () => {
  it('主事故场景：按血缘 + 调度依赖圈定受影响实例并按模型顺序去重', () => {
    const model = createReprocessingFixture()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)

    expect(analysis.sourceInstanceId).toBe(REPROCESSING_SOURCE_INSTANCE_ID)
    expect(analysis.affectedInstanceIds).toEqual(EXPECTED_AFFECTED_ORDER)
    expect(analysis.affectedInstanceIds).toContain(REPROCESSING_SOURCE_INSTANCE_ID)
    expect(new Set(analysis.affectedInstanceIds).size).toBe(analysis.affectedInstanceIds.length)
  })

  it('调度依赖传播：没有 SQL 血缘的校验任务也必须重做', () => {
    const model = createReprocessingFixture()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)
    const checkInstanceId = incidentInstance(TASK.checkTransactionCompleteness)
    const checkTask = model.tasks.find((task) => task.taskId === TASK.checkTransactionCompleteness)

    expect(checkTask?.reads.map((read) => read.table)).not.toContain('ods_transaction')
    expect(analysis.affectedInstanceIds).toContain(checkInstanceId)
    expect(analysis.redoInstanceIds).toContain(checkInstanceId)

    const checkEvidence = analysis.evidence.find((edge) => edge.toInstanceId === checkInstanceId)
    expect(checkEvidence?.kind).toBe('scheduler')
    expect(checkEvidence?.fromInstanceId).toBe(incidentInstance(TASK.ingestTransaction))
  })

  it('多支汇合去重：两支证据都保留，ads 与消费方在清单中只出现一次', () => {
    const model = createReprocessingFixture()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)
    const adsInstanceId = incidentInstance(TASK.adsTransactionReport)

    const mergeEvidence = analysis.evidence.filter(
      (edge) => edge.toInstanceId === adsInstanceId && edge.kind === 'lineage',
    )
    expect(mergeEvidence.map((edge) => edge.fromInstanceId)).toEqual([
      incidentInstance(TASK.dwsMerchantTransaction),
      incidentInstance(TASK.dwsChannelTransaction),
    ])

    expect(
      analysis.affectedInstanceIds.filter(
        (instanceId) => instanceId === incidentInstance(TASK.consumeTransactionReport),
      ),
    ).toHaveLength(1)
    expect(analysis.deduplicatedTaskIds).toEqual([...new Set(analysis.deduplicatedTaskIds)])
    expect(analysis.deduplicatedTaskIds).toContain(TASK.consumeTransactionReport)
  })

  it('分区隔离：只影响事故业务日期，前一日与无关机构链路不被误伤', () => {
    const model = createReprocessingFixture()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)

    expect(analysis.affectedInstanceIds.every((id) => id.endsWith(`@${INCIDENT_DATE}`))).toBe(true)
    expect(analysis.affectedInstanceIds).not.toContain(previousInstance(TASK.ingestTransaction))
    expect(analysis.affectedInstanceIds).not.toContain(incidentInstance(TASK.ingestAccount))
    expect(analysis.affectedInstanceIds).not.toContain(incidentInstance(TASK.ingestCustomer))
    expect(analysis.affectedInstanceIds).not.toContain(incidentInstance(TASK.ingestMerchant))

    expect(analysis.unaffectedInstanceIds).toContain(previousInstance(TASK.adsTransactionReport))
    expect(analysis.unaffectedInstanceIds).toContain(incidentInstance(TASK.adsBranchReport))
    expect(analysis.unaffectedInstanceIds).toContain(incidentInstance(TASK.consumeBranchReport))
  })

  it('未首次执行的实例进入等待集合，不伪称为“已经重做”', () => {
    const model = createReprocessingFixture()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)

    expect(analysis.waitingInstanceIds).toEqual([
      incidentInstance(TASK.adsTransactionReport),
      incidentInstance(TASK.consumeTransactionReport),
      incidentInstance(TASK.deliverTransactionFile),
    ])
    expect(analysis.redoInstanceIds).not.toContain(incidentInstance(TASK.adsTransactionReport))
    expect(analysis.redoInstanceIds).not.toContain(incidentInstance(TASK.consumeTransactionReport))
  })

  it('运行中实例进入停止集合，停止前不进入重做集合', () => {
    const model = createReprocessingFixture()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)

    expect(analysis.stopRequiredInstanceIds).toEqual([
      incidentInstance(TASK.dwsMerchantTransaction),
    ])
    expect(analysis.redoInstanceIds).not.toContain(incidentInstance(TASK.dwsMerchantTransaction))
  })

  it('已执行实例全部进入重做集合：LEFT JOIN 任务不因结果未变化而排除', () => {
    const model = createReprocessingFixture({ variant: 'completed' })
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)

    expect(analysis.redoInstanceIds).toHaveLength(EXPECTED_AFFECTED_ORDER.length)
    expect(analysis.redoInstanceIds).toContain(incidentInstance(TASK.dwsMerchantTransaction))
    expect(analysis.waitingInstanceIds).toHaveLength(0)
    expect(analysis.stopRequiredInstanceIds).toHaveLength(0)
  })

  it('LEFT JOIN 输入被污染时：左连接读取仍构成传播边', () => {
    const model = createReprocessingFixture({ variant: 'completed' })
    const analysis = analyzeReprocessingImpact(model, incidentInstance(TASK.ingestMerchant))
    const merchantDwsInstanceId = incidentInstance(TASK.dwsMerchantTransaction)

    expect(analysis.affectedInstanceIds).toContain(merchantDwsInstanceId)
    expect(analysis.redoInstanceIds).toContain(merchantDwsInstanceId)
    expect(analysis.affectedInstanceIds).toContain(incidentInstance(TASK.adsTransactionReport))

    const leftJoinEvidence = analysis.evidence.find(
      (edge) => edge.toInstanceId === merchantDwsInstanceId && edge.kind === 'lineage',
    )
    expect(leftJoinEvidence?.detail).toContain('left-join')
  })

  it('集合划分互斥且完备：每个实例只属于重做 / 等待 / 停止 / 不受影响之一', () => {
    const model = createReprocessingFixture()
    const analysis = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)

    const redo = new Set(analysis.redoInstanceIds)
    const waiting = new Set(analysis.waitingInstanceIds)
    const stopRequired = new Set(analysis.stopRequiredInstanceIds)
    const unaffected = new Set(analysis.unaffectedInstanceIds)

    for (const instance of model.instances) {
      const membership = [redo, waiting, stopRequired, unaffected].filter((set) =>
        set.has(instance.instanceId),
      )
      expect(membership).toHaveLength(1)
    }

    expect(redo.size + waiting.size + stopRequired.size + unaffected.size).toBe(
      model.instances.length,
    )
    expect(analysis.consumerInstanceIds).toEqual([
      incidentInstance(TASK.consumeTransactionReport),
      incidentInstance(TASK.deliverTransactionFile),
    ])
  })

  it('实例执行类别与九个状态一一对应', () => {
    const expected: Record<TaskInstanceState, string> = {
      success: 'already-executed',
      failed: 'already-executed',
      stopped: 'already-executed',
      ready: 'needs-stop',
      running: 'needs-stop',
      stopping: 'needs-stop',
      waiting: 'not-yet-executed',
      blocked: 'not-yet-executed',
      skipped: 'not-yet-executed',
    }

    for (const [state, executionClass] of Object.entries(expected)) {
      expect(classifyInstanceExecution(state as TaskInstanceState)).toBe(executionClass)
    }
  })

  it('派生血缘边：全部读写关系唯一，且 LEFT JOIN 被显式标记', () => {
    const model = createReprocessingFixture()
    const edges = deriveLineageEdges(model)

    expect(new Set(edges.map((edge) => edge.edgeId)).size).toBe(edges.length)
    expect(edges).toContainEqual({
      edgeId: `${TASK.dwsMerchantTransaction}:ods_merchant->dws_merchant_transaction_daily`,
      taskId: TASK.dwsMerchantTransaction,
      fromTable: 'ods_merchant',
      toTable: 'dws_merchant_transaction_daily',
      transform: 'left-join',
    })
    expect(edges).toContainEqual({
      edgeId: `${TASK.dwdTransactionDetail}:ods_transaction->dwd_transaction_detail`,
      taskId: TASK.dwdTransactionDetail,
      fromTable: 'ods_transaction',
      toTable: 'dwd_transaction_detail',
      transform: 'select',
    })
  })

  it('确定性：同一 fixture 与输入重复分析结果完全一致', () => {
    const model = createReprocessingFixture()
    const first = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)
    const second = analyzeReprocessingImpact(model, REPROCESSING_SOURCE_INSTANCE_ID)

    expect(second).toEqual(first)
    expect(createReprocessingFixture()).toEqual(model)
  })

  it('未知实例：影响分析抛出明确错误', () => {
    const model = createReprocessingFixture()

    expect(() => analyzeReprocessingImpact(model, `missing@${INCIDENT_DATE}`)).toThrow(
      /未知的任务实例/,
    )
  })

  it('查找辅助函数保持实例与日期语义', () => {
    const model = createReprocessingFixture()

    expect(findInstance(model, REPROCESSING_SOURCE_INSTANCE_ID)?.state).toBe('success')
    expect(findInstance(model, 'missing@2026-10-16')).toBeUndefined()
    expect(listTaskInstances(model, TASK.dwsMerchantTransaction)).toHaveLength(2)
    expect(listTaskInstances(model, TASK.dwsMerchantTransaction, INCIDENT_DATE)[0]?.state).toBe(
      'running',
    )
    expect(listTaskInstances(model, TASK.dwsMerchantTransaction, PREVIOUS_DATE)[0]?.state).toBe(
      'success',
    )
  })

  it('纯逻辑层不依赖 React / DOM', () => {
    for (const file of ['types.ts', 'fixture.ts', 'model.ts']) {
      const source = readFileSync(
        new URL(`../src/features/dependency-reprocessing/${file}`, import.meta.url),
        'utf8',
      )
      expect(source).not.toMatch(/from 'react'/)
      expect(source).not.toMatch(/\bdocument\./)
      expect(source).not.toMatch(/\bwindow\./)
    }
  })
})
