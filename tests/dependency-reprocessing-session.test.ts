import { describe, expect, it } from 'vitest'
import { REPROCESSING_TASK_IDS } from '../src/features/dependency-reprocessing/fixture'
import { findInstance } from '../src/features/dependency-reprocessing/model'
import {
  STOP_WAIT_FAIL_TASK_ID,
  applyStopWaitRedoAction,
  buildStopWaitRedoNodeViews,
  createStopWaitRedoSession,
  summarizeStopWaitRedoSession,
} from '../src/features/dependency-reprocessing/session'
import type { StopWaitRedoSession } from '../src/features/dependency-reprocessing/session'

function stopAndValidate(outcome: 'passed' | 'failed' = 'passed'): StopWaitRedoSession {
  let session = createStopWaitRedoSession()
  session = applyStopWaitRedoAction(session, { type: 'stop-affected' })
  session = applyStopWaitRedoAction(session, { type: 'validate', outcome })
  return session
}

function scheduledSession(): StopWaitRedoSession {
  let session = stopAndValidate('passed')
  session = applyStopWaitRedoAction(session, { type: 'create-schedule' })
  return session
}

function completedSession(): StopWaitRedoSession {
  let session = scheduledSession()
  session = applyStopWaitRedoAction(session, { type: 'execute' })
  return session
}

function instanceState(session: StopWaitRedoSession, taskId: string): string | undefined {
  return findInstance(session.model, `${taskId}@2026-10-16`)?.state
}

describe('依赖链重做 · E3 停止 / 等待 / 自动重做会话（Phase 2-C）', () => {
  it('初始状态：圈定 8 个受影响实例，停止与等待集合可计算', () => {
    const session = createStopWaitRedoSession()
    const summary = summarizeStopWaitRedoSession(session)

    expect(session.phase).toBe('detected')
    expect(session.events).toHaveLength(1)
    expect(summary).toMatchObject({
      affectedCount: 8,
      successCount: 4,
      waitingCount: 3,
      runningCount: 1,
      failedCount: 0,
      consumerCount: 2,
      phaseLabel: '已圈定范围',
    })
    expect(instanceState(session, REPROCESSING_TASK_IDS.dwsMerchantTransaction)).toBe('running')
  })

  it('停止受影响任务：运行中实例停止并等待，无关链路保持原状态', () => {
    let session = createStopWaitRedoSession()
    session = applyStopWaitRedoAction(session, { type: 'stop-affected' })

    expect(session.phase).toBe('stopped')
    expect(instanceState(session, REPROCESSING_TASK_IDS.dwsMerchantTransaction)).toBe('waiting')
    expect(instanceState(session, REPROCESSING_TASK_IDS.adsBranchReport)).toBe('success')
    expect(instanceState(session, REPROCESSING_TASK_IDS.consumeBranchReport)).toBe('success')
    expect(instanceState(session, REPROCESSING_TASK_IDS.dwsChannelTransaction)).toBe('success')

    const stopLogs = findInstance(
      session.model,
      `${REPROCESSING_TASK_IDS.dwsMerchantTransaction}@2026-10-16`,
    )?.logs.map((log) => log.event)
    expect(stopLogs?.slice(-3)).toEqual(['stop-requested', 'stopped', 'waiting'])
    expect(session.events.some((event) => event.kind === 'stop')).toBe(true)
  })

  it('ODS 验证门禁：不通过阻断，重新验证通过后放行', () => {
    let session = stopAndValidate('failed')
    expect(session.phase).toBe('blocked')
    expect(session.validation?.validated).toBe(false)
    expect(() => applyStopWaitRedoAction(session, { type: 'create-schedule' })).toThrow(
      /create-schedule/,
    )

    session = applyStopWaitRedoAction(session, { type: 'validate', outcome: 'passed' })
    expect(session.phase).toBe('validated')
    expect(session.validation?.validated).toBe(true)
    expect(session.events.some((event) => event.kind === 'block')).toBe(true)
  })

  it('自动依赖重做：按依赖顺序执行完成后全部 SUCCESS', () => {
    const scheduled = scheduledSession()
    expect(scheduled.phase).toBe('scheduled')
    expect(scheduled.schedule?.items).toHaveLength(8)
    expect(scheduled.schedule?.items.map((item) => item.taskId)).toEqual([
      REPROCESSING_TASK_IDS.ingestTransaction,
      REPROCESSING_TASK_IDS.checkTransactionCompleteness,
      REPROCESSING_TASK_IDS.dwdTransactionDetail,
      REPROCESSING_TASK_IDS.dwsMerchantTransaction,
      REPROCESSING_TASK_IDS.dwsChannelTransaction,
      REPROCESSING_TASK_IDS.adsTransactionReport,
      REPROCESSING_TASK_IDS.consumeTransactionReport,
      REPROCESSING_TASK_IDS.deliverTransactionFile,
    ])
    expect(scheduled.schedule?.items.every((item) => item.action !== undefined)).toBe(true)

    const completed = applyStopWaitRedoAction(scheduled, { type: 'execute' })
    const summary = summarizeStopWaitRedoSession(completed)

    expect(completed.phase).toBe('completed')
    expect(summary.successCount).toBe(8)
    expect(summary.waitingCount).toBe(0)
    expect(summary.failedCount).toBe(0)
    expect(instanceState(completed, REPROCESSING_TASK_IDS.adsBranchReport)).toBe('success')

    const timestamps = completed.events.map((event) => event.at)
    expect([...timestamps].sort()).toEqual(timestamps)
    expect(JSON.stringify(completed)).not.toMatch(/generation|round|批次号/i)
  })

  it('重做失败按正常生产故障处理：保持已成功上游，不级联清空无关成功', () => {
    let session = stopAndValidate('passed')
    session = applyStopWaitRedoAction(session, { type: 'create-schedule' })
    session = applyStopWaitRedoAction(session, {
      type: 'arm-failure',
      taskId: STOP_WAIT_FAIL_TASK_ID,
    })
    session = applyStopWaitRedoAction(session, { type: 'execute' })

    expect(session.phase).toBe('failed')
    expect(session.failedInstanceId).toBe(`${STOP_WAIT_FAIL_TASK_ID}@2026-10-16`)
    expect(instanceState(session, STOP_WAIT_FAIL_TASK_ID)).toBe('failed')
    expect(instanceState(session, REPROCESSING_TASK_IDS.ingestTransaction)).toBe('success')
    expect(instanceState(session, REPROCESSING_TASK_IDS.checkTransactionCompleteness)).toBe(
      'success',
    )
    expect(instanceState(session, REPROCESSING_TASK_IDS.dwsMerchantTransaction)).toBe('waiting')
    expect(instanceState(session, REPROCESSING_TASK_IDS.adsTransactionReport)).toBe('waiting')
    expect(instanceState(session, REPROCESSING_TASK_IDS.adsBranchReport)).toBe('success')
    expect(session.events.at(-1)?.kind).toBe('failure')

    const retried = applyStopWaitRedoAction(session, { type: 'retry-failed' })
    expect(retried.phase).toBe('completed')
    expect(summarizeStopWaitRedoSession(retried).successCount).toBe(8)
  })

  it('ODS 再次修复：受影响 SUCCESS 失效重新等待，历史日志保留，随后可重新入队', () => {
    const completed = completedSession()
    const logLengthsBefore = new Map(
      buildStopWaitRedoNodeViews(completed).map((node) => [
        node.instanceId,
        findInstance(completed.model, node.instanceId)?.logs.length ?? 0,
      ]),
    )
    const eventsBefore = completed.events.length

    const repaired = applyStopWaitRedoAction(completed, { type: 're-repair' })
    expect(repaired.phase).toBe('repaired')
    expect(repaired.invalidatedInstanceIds).toHaveLength(8)
    expect(summarizeStopWaitRedoSession(repaired)).toMatchObject({
      successCount: 0,
      waitingCount: 8,
    })
    expect(repaired.events.length).toBeGreaterThan(eventsBefore)

    for (const node of buildStopWaitRedoNodeViews(repaired)) {
      const instance = findInstance(repaired.model, node.instanceId)
      expect(instance?.state).toBe('waiting')
      expect(instance?.logs.length).toBe((logLengthsBefore.get(node.instanceId) ?? 0) + 1)
      expect(instance?.logs.at(-1)?.detail).toContain('ODS 再次修复')
    }

    const requeued = applyStopWaitRedoAction(repaired, { type: 'requeue' })
    expect(requeued.phase).toBe('scheduled')
    expect(requeued.schedule?.items).toHaveLength(8)
    expect(requeued.schedule?.items.every((item) => item.action === 'run-waiting')).toBe(true)

    const redone = applyStopWaitRedoAction(requeued, { type: 'execute' })
    expect(redone.phase).toBe('completed')
    expect(summarizeStopWaitRedoSession(redone).successCount).toBe(8)
  })

  it('非法转换与状态约束显式抛错', () => {
    const session = createStopWaitRedoSession()

    expect(() => applyStopWaitRedoAction(session, { type: 'execute' })).toThrow(/execute/)
    expect(() => applyStopWaitRedoAction(session, { type: 're-repair' })).toThrow(/re-repair/)
    expect(() => applyStopWaitRedoAction(session, { type: 'stop-affected' })).not.toThrow()
    const stopped = applyStopWaitRedoAction(session, { type: 'stop-affected' })
    expect(() => applyStopWaitRedoAction(stopped, { type: 'stop-affected' })).toThrow(
      /stop-affected/,
    )
  })
})
