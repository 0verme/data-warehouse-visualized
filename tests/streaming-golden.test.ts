import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StreamingGoldenLab } from '../src/components/visualizations/StreamingGoldenLab'
import {
  STREAMING_FINAL_WATERMARK,
  STREAMING_GOLDEN_DELIVERIES,
  STREAMING_ON_TIME_WATERMARK,
} from '../src/features/streaming-golden/fixture'
import {
  advanceEventTimeWatermark,
  buildCompletedStreamingState,
  buildMicrobatchSnapshots,
  buildOfflineReference,
  buildReconciliationRows,
  buildStreamingRecoveryEvidence,
  createInitialStreamingState,
  findAggregate,
  getDeliveryWindow,
  getStreamingWindow,
  getWindowLifecycle,
  processStreamingDelivery,
} from '../src/features/streaming-golden/model'
import {
  buildStreamingGoldenSteps,
  canAdvanceStreamingGoldenLesson,
  createStreamingGoldenKernel,
  createStreamingGoldenLessonSession,
  reduceStreamingGoldenLessonSession,
} from '../src/features/streaming-golden/steps'
import { streamingWarehouseGoldenContent } from '../src/content/lessons/streaming-warehouse-golden'

const OLD_WINDOW_START = '2026-05-12T10:00:00+08:00'
const NEXT_WINDOW_START = '2026-05-12T10:05:00+08:00'

function runToOffset4() {
  let state = createInitialStreamingState()
  for (const delivery of STREAMING_GOLDEN_DELIVERIES.slice(0, 4)) {
    state = processStreamingDelivery(state, delivery)
  }
  return state
}

describe('Issue #75 fixed Streaming Warehouse Golden Scenario', () => {
  it('keeps one immutable banking fixture with eight deliveries and seven unique transactions', () => {
    expect(STREAMING_GOLDEN_DELIVERIES.map(({ offset }) => offset)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ])
    expect(
      new Set(STREAMING_GOLDEN_DELIVERIES.map(({ transactionId }) => transactionId)).size,
    ).toBe(7)
    expect(STREAMING_GOLDEN_DELIVERIES[5]?.transactionId).toBe('TX-006')
    expect(STREAMING_GOLDEN_DELIVERIES[6]?.transactionId).toBe('TX-006')
    expect(getStreamingWindow('2026-05-12T10:05:00+08:00')).toEqual({
      start: NEXT_WINDOW_START,
      end: '2026-05-12T10:10:00+08:00',
    })
    expect(getDeliveryWindow(STREAMING_GOLDEN_DELIVERIES[4]!, 'event_time').start).toBe(
      OLD_WINDOW_START,
    )
    expect(getDeliveryWindow(STREAMING_GOLDEN_DELIVERIES[4]!, 'arrival_time').start).toBe(
      NEXT_WINDOW_START,
    )
    expect(getDeliveryWindow(STREAMING_GOLDEN_DELIVERIES[4]!, 'processing_time').start).toBe(
      NEXT_WINDOW_START,
    )
  })

  it('preserves event-time membership, out-of-order arrival, accepted lateness and business deduplication', () => {
    const stateAtFour = runToOffset4()
    expect(stateAtFour.decisions[3]).toMatchObject({ offset: 4, isOutOfOrder: true })

    let state = advanceEventTimeWatermark(stateAtFour, STREAMING_ON_TIME_WATERMARK)
    expect(getWindowLifecycle('2026-05-12T10:05:00+08:00', state.watermark)).toBe('ALLOWED_LATE')
    state = processStreamingDelivery(state, STREAMING_GOLDEN_DELIVERIES[4]!)
    expect(state.decisions.at(-1)).toMatchObject({ offset: 5, disposition: 'revised' })
    expect(findAggregate(state.aggregates, 'HZ001', OLD_WINDOW_START)).toMatchObject({
      count: 3,
      amountCny: 450,
    })

    state = processStreamingDelivery(state, STREAMING_GOLDEN_DELIVERIES[5]!)
    state = processStreamingDelivery(state, STREAMING_GOLDEN_DELIVERIES[6]!)
    expect(state.decisions.at(-1)).toMatchObject({ offset: 7, disposition: 'business-duplicate' })
    expect(findAggregate(state.aggregates, 'HZ001', NEXT_WINDOW_START)).toMatchObject({
      count: 1,
      amountCny: 70,
      transactionIds: ['TX-006'],
    })
  })

  it('makes T+1 batch and four deterministic microbatch snapshots use the same fixture', () => {
    expect(
      buildOfflineReference().map(({ branchId, windowStart, count, amountCny }) => ({
        branchId,
        windowStart,
        count,
        amountCny,
      })),
    ).toEqual([
      { branchId: 'HZ001', windowStart: OLD_WINDOW_START, count: 4, amountCny: 510 },
      { branchId: 'HZ002', windowStart: OLD_WINDOW_START, count: 2, amountCny: 100 },
      { branchId: 'HZ001', windowStart: NEXT_WINDOW_START, count: 1, amountCny: 70 },
    ])

    expect(
      buildMicrobatchSnapshots().map(
        ({ tick, throughOffset, sourcePosition, oldWindowAmountCny, sideOutputOffsets }) => ({
          tick,
          throughOffset,
          sourcePosition,
          oldWindowAmountCny,
          sideOutputOffsets,
        }),
      ),
    ).toEqual([
      {
        tick: '10:05:05',
        throughOffset: 4,
        sourcePosition: 4,
        oldWindowAmountCny: 300,
        sideOutputOffsets: [],
      },
      {
        tick: '10:06:05',
        throughOffset: 5,
        sourcePosition: 5,
        oldWindowAmountCny: 450,
        sideOutputOffsets: [],
      },
      {
        tick: '10:07:05',
        throughOffset: 7,
        sourcePosition: 7,
        oldWindowAmountCny: 450,
        sideOutputOffsets: [],
      },
      {
        tick: '10:09:05',
        throughOffset: 8,
        sourcePosition: 8,
        oldWindowAmountCny: 450,
        sideOutputOffsets: [8],
      },
    ])
  })

  it('keeps source position independent from the event-time watermark and finality policy', () => {
    const state = buildCompletedStreamingState()

    expect(state.sourcePosition).toBe(8)
    expect(state.watermark).toBe(STREAMING_FINAL_WATERMARK)
    expect(state.decisions.find(({ offset }) => offset === 8)).toMatchObject({
      disposition: 'too-late',
      window: { start: OLD_WINDOW_START },
    })
    expect(state.sideOutputOffsets).toEqual([8])
    expect(findAggregate(state.aggregates, 'HZ001', OLD_WINDOW_START)).toMatchObject({
      count: 3,
      amountCny: 450,
    })
    expect(getWindowLifecycle('2026-05-12T10:05:00+08:00', state.watermark)).toBe('FINAL')
  })

  it('demonstrates distinct inconsistent-checkpoint and consistent-replay failure modes', () => {
    const evidence = buildStreamingRecoveryEvidence()

    expect(evidence.caseA).toEqual({
      sourcePosition: 6,
      operatorStateOffset: 4,
      skippedOffsets: [5, 6],
      missingTransactionIds: ['TX-005', 'TX-006'],
    })
    expect(evidence.caseB).toMatchObject({
      sourcePosition: 4,
      operatorStateOffset: 4,
      replayedOffsets: [5, 6],
      appendWritesBeforeFailure: 2,
      appendWritesAfterReplay: 4,
      duplicateAppendWrites: 2,
      upsertRowsByGrain: 3,
      businessDuplicateOffset: 7,
      businessDuplicateTransactionId: 'TX-006',
    })
  })

  it('reconciles online final 450 to cutoff reference 510 with TX-008 as +60 evidence', () => {
    const rows = buildReconciliationRows(buildCompletedStreamingState())
    const oldWindow = rows.find(
      (row) => row.branchId === 'HZ001' && row.windowStart === OLD_WINDOW_START,
    )

    expect(oldWindow).toMatchObject({
      onlineCount: 3,
      onlineAmountCny: 450,
      offlineCount: 4,
      offlineAmountCny: 510,
      countDifference: 1,
      amountDifferenceCny: 60,
      differenceTransactionIds: ['TX-008'],
      onlineLifecycle: 'FINAL',
    })
    expect(rows.find((row) => row.branchId === 'HZ002')).toMatchObject({
      onlineAmountCny: 100,
      offlineAmountCny: 100,
      amountDifferenceCny: 0,
    })
  })
})

describe('Issue #75 seven-section lesson and Step Kernel', () => {
  it('has exactly seven causal sections and one deterministic visualization', () => {
    expect(streamingWarehouseGoldenContent.sections).toHaveLength(7)
    expect(
      streamingWarehouseGoldenContent.sections.filter(({ kind }) => kind === 'visualization'),
    ).toHaveLength(1)
    expect(
      streamingWarehouseGoldenContent.sections.map((section) =>
        'title' in section ? section.title : undefined,
      ),
    ).toEqual([
      '同一输入，三种完成边界',
      '02 · 一笔交易应该按哪一个时间进入窗口？',
      '03 · [10:00,10:05) 到边界后，结果会怎样？',
      '04 · 结果已经显示，旧 event time 又到了怎么办？',
      '05 · 为了更新下一条事件，系统必须记住什么？',
      '06 · 任务处理到 offset 6 后失败，恢复从哪继续？',
      '07 · 为什么 final online 450 与 offline 510 都可能合理？流值得吗？',
    ])

    const copy = JSON.stringify(streamingWarehouseGoldenContent)
    for (const term of [
      'CDC != Streaming',
      'Kafka != Streaming Warehouse',
      'Flink != Streaming Warehouse',
      'Lakehouse != Streaming Warehouse',
      'Realtime != Always Correct',
      'TX-008',
    ]) {
      expect(copy).toContain(term)
    }
    expect(copy).toContain('Source High-water Cursor != Event-time Watermark')
    expect(copy).toContain('Watermark != “之后绝不会再迟到”')
    expect(copy).toContain('Checkpoint success != Exactly-once achieved')
  })

  it('gates late event, finalization and restore on the seven-step causal sequence', () => {
    const kernel = createStreamingGoldenKernel()
    expect(kernel.size).toBe(7)
    expect(buildStreamingGoldenSteps()).toHaveLength(7)
    let session = createStreamingGoldenLessonSession(kernel.size)
    const act = (action: Parameters<typeof reduceStreamingGoldenLessonSession>[1]) => {
      session = reduceStreamingGoldenLessonSession(session, action)
    }

    act({ type: 'next' })
    act({ type: 'select-clock', clock: 'arrival_time' })
    expect(session.selectedClock).toBe('arrival_time')
    act({ type: 'next' })
    expect(session.stream).toMatchObject({
      sourcePosition: 4,
      watermark: STREAMING_ON_TIME_WATERMARK,
    })
    act({ type: 'next' })
    expect(session.stream.sourcePosition).toBe(4)
    expect(canAdvanceStreamingGoldenLesson(session)).toBe(false)
    act({ type: 'inject-late-event' })
    expect(session.stream.sourcePosition).toBe(5)
    expect(canAdvanceStreamingGoldenLesson(session)).toBe(false)
    act({ type: 'advance-watermark' })
    expect(session.stream.sourcePosition).toBe(8)
    expect(session.stream.decisions.find(({ offset }) => offset === 7)?.disposition).toBe(
      'business-duplicate',
    )
    expect(session.stream.watermark).toBe(STREAMING_FINAL_WATERMARK)
    expect(session.stream.sideOutputOffsets).toEqual([8])
    act({ type: 'next' })
    expect(session.player.currentIndex).toBe(4)
    act({ type: 'next' })
    expect(session.player.currentIndex).toBe(5)
    expect(canAdvanceStreamingGoldenLesson(session)).toBe(false)
    act({ type: 'restore-replay' })
    expect(session.recovery?.caseB.duplicateAppendWrites).toBe(2)
    act({ type: 'next' })
    expect(session.player.currentIndex).toBe(6)
    expect(canAdvanceStreamingGoldenLesson(session)).toBe(false)
  })

  it('SSR renders all fixed deliveries, clock choices, source cursor and watermark terminology', () => {
    const markup = renderToStaticMarkup(createElement(StreamingGoldenLab))

    expect(markup).toContain('data-diagram-type="state"')
    expect(markup).toContain('data-step-id="bounded-input"')
    expect(markup).toContain('data-current-offset="0"')
    expect(markup).toContain('Source High-water Cursor')
    expect(markup).toContain('Event-time Watermark')
    expect(markup.match(/class="streaming-golden__event"/g)).toHaveLength(8)
    expect(markup).toContain('Event Time')
    expect(markup).toContain('Arrival Time')
    expect(markup).toContain('Processing Time')
    expect(markup).toContain('T+1 · bounded cutoff')
    expect(markup).toContain('Minute-level snapshots')
  })
})
