import { describe, expect, it } from 'vitest'
import {
  backfillFixedWindows,
  createMicrobatchLabState,
  getCheckpointChanges,
  getFixedWindowChanges,
  getMicrobatchObservation,
  injectLateTransactionChanges,
  isInHalfOpenWindow,
  repeatDailyRescan,
  runInitialMicrobatch,
  runNextMicrobatch,
  simulateCheckpointRetry,
} from '../src/features/performance/microbatch'

describe('11-5 microbatch strategy model', () => {
  it('固定窗口使用左闭右开边界，10:05 只进入第二个窗口', () => {
    const state = createMicrobatchLabState()
    const first = getFixedWindowChanges(state.sourceChanges, '10:00', '10:05', '10:06')
    const second = getFixedWindowChanges(state.sourceChanges, '10:05', '10:10', '10:06')

    expect(isInHalfOpenWindow('10:05', '10:00', '10:05')).toBe(false)
    expect(isInHalfOpenWindow('10:05', '10:05', '10:10')).toBe(true)
    expect(first.map((change) => change.transactionId)).toEqual(['TX-1001', 'TX-1002'])
    expect(second.map((change) => change.transactionId)).toEqual(['TX-1003'])
  })

  it('首批三种策略读取同一份可见输入；迟到交易与旧 event_time 更新造成不同结果', () => {
    const firstRun = runInitialMicrobatch(createMicrobatchLabState())
    const afterArrival = injectLateTransactionChanges(firstRun)
    const nextRun = runNextMicrobatch(afterArrival)
    const fixed = nextRun.strategies['fixed-window']
    const checkpoint = nextRun.strategies.checkpoint
    const daily = nextRun.strategies['daily-rescan']

    expect(firstRun.strategies['fixed-window'].runs[0]?.selectedChanges).toHaveLength(3)
    expect(firstRun.strategies.checkpoint.runs[0]?.selectedChanges).toHaveLength(3)
    expect(firstRun.strategies['daily-rescan'].runs[0]?.selectedChanges).toHaveLength(3)
    expect(firstRun.strategies.checkpoint.checkpoint).toEqual({
      time: '10:05',
      id: 'change-003-v1',
    })
    expect(fixed.runs.at(-1)?.scope).toBe('10:10–10:15（左闭右开）')
    expect(fixed.runs.at(-1)?.scannedRows).toBe(0)
    expect(getMicrobatchObservation(nextRun, 'fixed-window')).toMatchObject({
      missingTransactionIds: ['TX-1004'],
      staleTransactionIds: ['TX-1001'],
    })
    expect(checkpoint.checkpoint).toEqual({ time: '10:09', id: 'change-001-v2' })
    expect(getMicrobatchObservation(nextRun, 'checkpoint')).toMatchObject({
      missingTransactionIds: [],
      staleTransactionIds: [],
      duplicateRows: 0,
    })
    expect(daily.scannedRows).toBe(7)
    expect(daily.output).toHaveLength(4)
    expect(getMicrobatchObservation(nextRun, 'daily-rescan')).toMatchObject({
      missingTransactionIds: [],
      staleTransactionIds: [],
      duplicateRows: 0,
    })
  })

  it('固定窗口显式补跑后恢复迟到交易与更新，同时重复扫描旧窗口', () => {
    const nextRun = runNextMicrobatch(
      injectLateTransactionChanges(runInitialMicrobatch(createMicrobatchLabState())),
    )
    const backfilled = backfillFixedWindows(nextRun)
    const fixed = backfilled.strategies['fixed-window']

    expect(fixed.runs.at(-1)?.scannedRows).toBe(5)
    expect(fixed.scannedRows).toBe(8)
    expect(fixed.output).toHaveLength(4)
    expect(fixed.output.find((change) => change.transactionId === 'TX-1001')).toMatchObject({
      revision: 2,
      amount: 120,
    })
    expect(getMicrobatchObservation(backfilled, 'fixed-window')).toMatchObject({
      missingTransactionIds: [],
      staleTransactionIds: [],
      duplicateRows: 0,
    })
  })

  it('checkpoint 使用唯一变更 ID 稳定打破同时间并列', () => {
    const sameTimeChanges = [
      {
        id: 'change-a',
        transactionId: 'TX-2001',
        eventTime: '10:02',
        availableAt: '10:08',
        revision: 1,
        amount: 50,
        kind: 'insert',
      },
      {
        id: 'change-b',
        transactionId: 'TX-2002',
        eventTime: '10:03',
        availableAt: '10:08',
        revision: 1,
        amount: 75,
        kind: 'insert',
      },
    ] as const

    expect(
      getCheckpointChanges(sameTimeChanges, { time: '10:08', id: 'change-a' }, '10:10').map(
        (change) => change.id,
      ),
    ).toEqual(['change-b'])
  })

  it('checkpoint 按源变更时间与 ID 前进，可读到 event_time 更早的迟到和更新记录', () => {
    const firstRun = runInitialMicrobatch(createMicrobatchLabState())
    const late = injectLateTransactionChanges(firstRun)
    const changes = getCheckpointChanges(
      late.sourceChanges,
      firstRun.strategies.checkpoint.checkpoint,
      late.now,
    )

    expect(
      changes.map((change) => [change.transactionId, change.eventTime, change.availableAt]),
    ).toEqual([
      ['TX-1004', '10:04', '10:08'],
      ['TX-1001', '10:02', '10:09'],
    ])
  })

  it('重扫与 append 说明结果写入仍需幂等：重扫整个当日，追加会留下重复行', () => {
    const appendState = createMicrobatchLabState('append')
    const nextRun = runNextMicrobatch(
      injectLateTransactionChanges(runInitialMicrobatch(appendState)),
    )
    const rescanned = repeatDailyRescan(nextRun)
    const daily = rescanned.strategies['daily-rescan']

    expect(daily.runs.at(-1)?.scope).toBe('00:00 → 10:10')
    expect(daily.runs.at(-1)?.scannedRows).toBe(4)
    expect(daily.output).toHaveLength(11)
    expect(getMicrobatchObservation(rescanned, 'daily-rescan').duplicateRows).toBe(7)
  })

  it('checkpoint 未持久化时 retry 会重读；upsert 收敛结果，append 仍产生重复', () => {
    const upsertState = runNextMicrobatch(
      injectLateTransactionChanges(runInitialMicrobatch(createMicrobatchLabState('upsert'))),
    )
    const retried = simulateCheckpointRetry(upsertState)
    expect(retried.strategies.checkpoint.scannedRows).toBe(7)
    expect(retried.strategies.checkpoint.output).toHaveLength(4)
    expect(getMicrobatchObservation(retried, 'checkpoint').duplicateRows).toBe(0)
    expect(retried.strategies.checkpoint.runs.at(-1)?.label).toContain('retry')

    const appendState = runNextMicrobatch(
      injectLateTransactionChanges(runInitialMicrobatch(createMicrobatchLabState('append'))),
    )
    const appendRetry = simulateCheckpointRetry(appendState)
    expect(appendRetry.strategies.checkpoint.output).toHaveLength(7)
    expect(getMicrobatchObservation(appendRetry, 'checkpoint').duplicateRows).toBe(3)
  })
})
