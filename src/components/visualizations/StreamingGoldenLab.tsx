import { useMemo, useReducer } from 'react'
import {
  STREAMING_GOLDEN_DELIVERIES,
  STREAMING_OFFLINE_CUTOFF,
} from '../../features/streaming-golden/fixture'
import {
  buildMicrobatchSnapshots,
  buildReconciliationRows,
  buildT1BatchReference,
  canAdvanceStreamingGoldenLesson,
  createStreamingGoldenKernel,
  createStreamingGoldenLessonSession,
  findAggregate,
  formatCurrency,
  formatStreamingClock,
  formatStreamingWindow,
  getDeliveryWindow,
  getWindowLifecycle,
  isWindowEmitted,
  reduceStreamingGoldenLessonSession,
} from '../../features/streaming-golden'
import type {
  StreamingClockBasis,
  StreamingDelivery,
  StreamingDeliveryDisposition,
  StreamingGoldenLessonAction,
  StreamingGoldenLessonSession,
  StreamingState,
} from '../../features/streaming-golden/types'

const CLOCK_OPTIONS: readonly { id: StreamingClockBasis; label: string }[] = [
  { id: 'event_time', label: 'Event Time' },
  { id: 'arrival_time', label: 'Arrival Time' },
  { id: 'processing_time', label: 'Processing Time' },
]

const DISPOSITION_LABELS: Record<StreamingDeliveryDisposition, string> = {
  accepted: '已接收',
  revised: 'Accepted · 修订',
  'business-duplicate': '业务重复 · 去重',
  'too-late': 'Too late · side evidence',
}

const LIFECYCLE_LABELS = {
  OPEN: 'Open · 收集中',
  ALLOWED_LATE: '已 emit · 仍可修订',
  FINAL: 'Final · 不再修改',
} as const

const OFFLINE_REFERENCE = buildT1BatchReference()
const MICROBATCH_SNAPSHOTS = buildMicrobatchSnapshots()

function findDecision(state: StreamingState, offset: number) {
  return state.decisions.find((decision) => decision.offset === offset)
}

function getDispositionTone(disposition: StreamingDeliveryDisposition | undefined) {
  if (disposition === 'revised') return 'revision'
  if (disposition === 'business-duplicate') return 'duplicate'
  if (disposition === 'too-late') return 'late'
  return disposition === 'accepted' ? 'accepted' : 'pending'
}

function getDeliveryLabel(state: StreamingState, delivery: StreamingDelivery): string {
  const decision = findDecision(state, delivery.offset)
  return decision ? DISPOSITION_LABELS[decision.disposition] : '等待到达'
}

function TimelineEvent({
  delivery,
  state,
  focusOffset,
}: {
  delivery: StreamingDelivery
  state: StreamingState
  focusOffset?: number
}) {
  const decision = findDecision(state, delivery.offset)
  const active = focusOffset === delivery.offset
  const current = state.sourcePosition === delivery.offset
  const tone = getDispositionTone(decision?.disposition)
  const window = getDeliveryWindow(delivery, 'event_time')

  return (
    <li
      className="streaming-golden__event"
      data-offset={delivery.offset}
      data-disposition={tone}
      data-focused={active || current}
      data-out-of-order={decision?.isOutOfOrder ?? false}
    >
      <div className="streaming-golden__event-main">
        <strong>#{delivery.offset}</strong>
        <div className="streaming-golden__event-identity">
          <b>{delivery.transactionId}</b>
          <span>
            {delivery.branchId} · {formatCurrency(delivery.amountCny)} CNY
          </span>
        </div>
        <span className="streaming-golden__event-status">{getDeliveryLabel(state, delivery)}</span>
      </div>
      <div
        className="streaming-golden__event-times"
        aria-label={`${delivery.transactionId} 三只钟`}
      >
        <span>event {formatStreamingClock(delivery.eventTime)}</span>
        <span>arrival {formatStreamingClock(delivery.arrivalTime)}</span>
        <span>processing {formatStreamingClock(delivery.processingTime)}</span>
      </div>
      <div className="streaming-golden__event-foot">
        <span>
          {formatStreamingWindow(window)} · {delivery.currency}
        </span>
        <span>{decision?.isOutOfOrder ? 'event-time out-of-order' : delivery.note}</span>
      </div>
    </li>
  )
}

function ModeComparison() {
  const batchOld = findAggregate(OFFLINE_REFERENCE, 'HZ001', '2026-05-12T10:00:00+08:00')
  const batchBranch = findAggregate(OFFLINE_REFERENCE, 'HZ002', '2026-05-12T10:00:00+08:00')
  const batchNext = findAggregate(OFFLINE_REFERENCE, 'HZ001', '2026-05-12T10:05:00+08:00')

  return (
    <section className="streaming-golden__modes" aria-label="同一输入的三种计算边界">
      <article className="streaming-golden__mode" data-mode="batch">
        <span>T+1 · bounded cutoff</span>
        <strong>RUN 完成</strong>
        <small>
          as of cutoff：HZ001 {batchOld?.count} 笔 / {formatCurrency(batchOld?.amountCny ?? 0)} 元；
          HZ002 {formatCurrency(batchBranch?.amountCny ?? 0)} 元；下一窗{' '}
          {formatCurrency(batchNext?.amountCny ?? 0)} 元
        </small>
      </article>
      <article className="streaming-golden__mode" data-mode="microbatch">
        <span>Minute-level · discrete runs</span>
        <strong>300 → 450</strong>
        <small>10:05 / 10:06 / 10:07 / 10:09 各是一份快照；source cursor 逐轮前进。</small>
      </article>
      <article className="streaming-golden__mode" data-mode="stream">
        <span>Continuous · long-running state</span>
        <strong>持续 emit / revise / final</strong>
        <small>同一窗口状态跨 delivery 保留；当前 completeness 由 event-time policy 判断。</small>
      </article>
    </section>
  )
}

function MicrobatchTimeline() {
  return (
    <section
      className="streaming-golden__microbatch"
      aria-label="固定的四次 minute-level microbatch snapshot"
    >
      <strong>Minute-level snapshots · 每次 run 都有边界</strong>
      <ol className="streaming-golden__microbatch-list">
        {MICROBATCH_SNAPSHOTS.map((snapshot) => (
          <li key={snapshot.tick}>
            <strong>{snapshot.tick}</strong>
            <span>
              offset ≤ {snapshot.throughOffset} · cursor {snapshot.sourcePosition}
            </span>
            <span>HZ001 旧窗 {formatCurrency(snapshot.oldWindowAmountCny)} 元</span>
            <span>HZ001 新窗 {formatCurrency(snapshot.nextWindowAmountCny)} 元</span>
            <span>
              W={formatStreamingClock(snapshot.watermark)}
              {snapshot.sideOutputOffsets.length > 0
                ? ` · offset ${snapshot.sideOutputOffsets.join(', ')} → side output`
                : ''}
            </span>
          </li>
        ))}
      </ol>
      <p>同一份固定 fixture 的快照，不是第二套可编辑实验。</p>
    </section>
  )
}

function WindowState({ state }: { state: StreamingState }) {
  if (state.aggregates.length === 0) {
    return (
      <p className="streaming-golden__empty-state">
        Continuous state 尚未建立。推进到窗口步骤后，offset 1–4 会形成两个 branch × window 聚合。
      </p>
    )
  }

  return (
    <ul className="streaming-golden__windows" aria-label="当前 window state">
      {state.aggregates.map((aggregate) => {
        const lifecycle = getWindowLifecycle(aggregate.windowEnd, state.watermark)
        const emitted = isWindowEmitted(aggregate.windowEnd, state.watermark)
        return (
          <li
            key={`${aggregate.branchId}-${aggregate.windowStart}-${aggregate.currency}`}
            data-lifecycle={lifecycle.toLowerCase()}
          >
            <div className="streaming-golden__window-heading">
              <strong>{aggregate.branchId}</strong>
              <span>
                {formatStreamingWindow({ start: aggregate.windowStart, end: aggregate.windowEnd })}
              </span>
              <span className="streaming-golden__lifecycle">{LIFECYCLE_LABELS[lifecycle]}</span>
            </div>
            <div className="streaming-golden__window-result">
              <b>{aggregate.count} 笔</b>
              <b>{formatCurrency(aggregate.amountCny)} CNY</b>
              <small>seen: {aggregate.transactionIds.join(', ')}</small>
            </div>
            {!emitted && (
              <small className="streaming-golden__window-hint">
                窗口尚未到 end；状态继续累计。
              </small>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function RecoveryPanel({
  session,
  dispatch,
}: {
  session: StreamingGoldenLessonSession
  dispatch: (action: StreamingGoldenLessonAction) => void
}) {
  const evidence = session.recovery
  return (
    <section className="streaming-golden__recovery" aria-label="Exactly-once 最小恢复契约">
      <div className="streaming-golden__recovery-chain" aria-label="端到端结果契约">
        {[
          'Source Position',
          'Operator State',
          'Replay',
          'Sink Write',
          'Idempotency / Transaction',
        ].map((part, index, parts) => (
          <span key={part}>
            {part}
            {index < parts.length - 1 ? <b aria-hidden="true">→</b> : null}
          </span>
        ))}
      </div>
      <button
        type="button"
        className="button button--primary button--small"
        data-streaming-action="restore-replay"
        onClick={() => dispatch({ type: 'restore-replay' })}
        disabled={evidence !== null}
      >
        {evidence ? '恢复轨迹已显示' : 'Fail → Restore / Replay'}
      </button>
      {evidence ? (
        <div className="streaming-golden__recovery-cases">
          <article data-case="A">
            <span>Case A · position/state 不一致</span>
            <strong>
              source {evidence.caseA.sourcePosition} · state {evidence.caseA.operatorStateOffset}
            </strong>
            <p>
              从 offset {evidence.caseA.sourcePosition + 1} 继续会跳过 offset{' '}
              {evidence.caseA.skippedOffsets.join('、')}，可能漏掉{' '}
              {evidence.caseA.missingTransactionIds.join('、')}。
            </p>
          </article>
          <article data-case="B">
            <span>Case B · 一致恢复仍会 replay</span>
            <strong>
              source {evidence.caseB.sourcePosition} = state {evidence.caseB.operatorStateOffset}
            </strong>
            <p>
              replay offset {evidence.caseB.replayedOffsets.join('、')}；append 写入{' '}
              {evidence.caseB.appendWritesBeforeFailure} → {evidence.caseB.appendWritesAfterReplay}
              ， 可能重复 {evidence.caseB.duplicateAppendWrites} 次。按 Grain upsert 后保留{' '}
              {evidence.caseB.upsertRowsByGrain} 行结果。
            </p>
          </article>
        </div>
      ) : (
        <p className="streaming-golden__recovery-prompt">
          处理 offset 6 后故障。点击一次，同时比较两种独立恢复问题；不启动真实 runtime。
        </p>
      )}
      <p className="streaming-golden__duplicate-note">
        业务重复 delivery：offset {evidence?.caseB.businessDuplicateOffset ?? 7} 的{' '}
        {evidence?.caseB.businessDuplicateTransactionId ?? 'TX-006'}；与 recovery replay
        是两个不同来源。
      </p>
    </section>
  )
}

function Reconciliation({ state }: { state: StreamingState }) {
  const rows = buildReconciliationRows(state)
  return (
    <section
      className="streaming-golden__reconciliation"
      aria-label="Online 与 offline cutoff reconciliation"
    >
      <header>
        <span>Grain · branch × window_start × window_end × currency</span>
        <small>
          offline reference cutoff：{STREAMING_OFFLINE_CUTOFF.slice(0, 16).replace('T', ' ')}{' '}
          (+08:00)
        </small>
      </header>
      <div className="streaming-golden__reconciliation-rows">
        {rows.map((row) => (
          <article
            key={`${row.branchId}-${row.windowStart}-${row.currency}`}
            data-difference={row.amountDifferenceCny !== 0}
          >
            <strong>
              {row.branchId} ·{' '}
              {formatStreamingWindow({ start: row.windowStart, end: row.windowEnd })}
            </strong>
            <span>
              Online {row.onlineCount} / {formatCurrency(row.onlineAmountCny)} CNY ·{' '}
              {LIFECYCLE_LABELS[row.onlineLifecycle]}
            </span>
            <span>
              Offline reference {row.offlineCount} / {formatCurrency(row.offlineAmountCny)} CNY
            </span>
            <b>
              Difference {row.countDifference >= 0 ? '+' : ''}
              {row.countDifference} / {row.amountDifferenceCny >= 0 ? '+' : ''}
              {formatCurrency(row.amountDifferenceCny)} CNY
              {row.differenceTransactionIds.length > 0
                ? ` · ${row.differenceTransactionIds.join(', ')}`
                : ''}
            </b>
          </article>
        ))}
      </div>
      <p>
        Offline reference 是 cutoff 下的可复核快照，不是脱离 cutoff 的绝对真值；差异由 late policy
        与 cutoff 解释。
      </p>
    </section>
  )
}

function streamingGoldenReducer(
  state: StreamingGoldenLessonSession,
  action: StreamingGoldenLessonAction,
) {
  return reduceStreamingGoldenLessonSession(state, action)
}

function StreamingGoldenLabBody({
  session,
  dispatch,
  kernel,
}: {
  session: StreamingGoldenLessonSession
  dispatch: (action: StreamingGoldenLessonAction) => void
  kernel: ReturnType<typeof createStreamingGoldenKernel>
}) {
  const step = kernel.get(session.player.currentIndex)
  const focusOffset = step.state.focusOffset
  const canContinue = canAdvanceStreamingGoldenLesson(session)
  const selectedDelivery = STREAMING_GOLDEN_DELIVERIES.find((delivery) => delivery.offset === 5)!
  const selectedClockWindow = getDeliveryWindow(selectedDelivery, session.selectedClock)
  const sessionComplete = session.player.currentIndex === session.player.stepCount - 1
  const showRecovery = step.state.stage === 'checkpoint-replay' || session.recovery !== null
  const showReconciliation = step.state.stage === 'reconciliation'
  const lastDecision = session.stream.decisions.at(-1)

  return (
    <section
      className="streaming-golden"
      data-diagram-type="state"
      data-step-id={step.id}
      data-current-offset={session.stream.sourcePosition}
      data-watermark={session.stream.watermark ?? 'none'}
      aria-label="同一 Transaction 数据流的批、微批与持续窗口实验"
    >
      <div className="streaming-golden__toolbar">
        <div className="streaming-golden__step-copy">
          <span className="visualization-toolbar__label">
            Step {session.player.currentIndex + 1} / {session.player.stepCount}
          </span>
          <p aria-live="polite" aria-atomic="true">
            <strong>{step.title}</strong>：{step.description}
          </p>
        </div>
        {!sessionComplete && (
          <button
            type="button"
            className="button button--primary button--small"
            data-streaming-action="next"
            disabled={!canContinue}
            onClick={() => dispatch({ type: 'next' })}
          >
            继续到下一步
          </button>
        )}
      </div>
      <div
        className="streaming-golden__progress"
        role="progressbar"
        aria-label="Golden Lesson 推进进度"
        aria-valuemin={1}
        aria-valuemax={session.player.stepCount}
        aria-valuenow={session.player.currentIndex + 1}
      >
        <span
          style={{
            width: `${((session.player.currentIndex + 1) / session.player.stepCount) * 100}%`,
          }}
        />
      </div>

      <ModeComparison />
      <MicrobatchTimeline />

      <section
        className="streaming-golden__timeline-panel"
        aria-labelledby="streaming-timeline-title"
      >
        <header className="streaming-golden__panel-heading">
          <div>
            <span>Continuous stream · fixed arrival order</span>
            <h3 id="streaming-timeline-title">Event Stream / Timeline</h3>
          </div>
          <div className="streaming-golden__positions">
            <span>
              Current offset<strong>{session.stream.sourcePosition}</strong>
            </span>
            <span>
              Transaction<strong>{lastDecision?.transactionId ?? '—'}</strong>
            </span>
          </div>
        </header>
        <ol className="streaming-golden__event-list" aria-label="固定的 8 次 source delivery">
          {STREAMING_GOLDEN_DELIVERIES.map((delivery) => (
            <TimelineEvent
              key={delivery.offset}
              delivery={delivery}
              state={session.stream}
              focusOffset={focusOffset}
            />
          ))}
        </ol>
      </section>

      <section className="streaming-golden__clock-panel" aria-label="選擇交易時間觀察基準">
        <fieldset>
          <legend>Time basis · 比較 offset 5 / TX-005</legend>
          {CLOCK_OPTIONS.map(({ id, label }) => (
            <label key={id}>
              <input
                type="radio"
                name="streaming-golden-clock"
                value={id}
                checked={session.selectedClock === id}
                onChange={() => dispatch({ type: 'select-clock', clock: id })}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <p data-testid="streaming-clock-window">
          event {formatStreamingClock(selectedDelivery.eventTime)} · arrival{' '}
          {formatStreamingClock(selectedDelivery.arrivalTime)} · processing{' '}
          {formatStreamingClock(selectedDelivery.processingTime)}
          <strong>{formatStreamingWindow(selectedClockWindow)}</strong>
        </p>
      </section>

      <section className="streaming-golden__state-panel" aria-label="Window、Watermark 與 State">
        <header className="streaming-golden__panel-heading">
          <div>
            <span>Event Time Window → State</span>
            <h3>同一 aggregate 如何 emit、revision、finalize</h3>
          </div>
          <div className="streaming-golden__watermarks">
            <span>
              Source High-water Cursor<strong>offset {session.stream.sourcePosition}</strong>
            </span>
            <span>
              Event-time Watermark
              <strong>
                {session.stream.watermark
                  ? formatStreamingClock(session.stream.watermark)
                  : '尚未前進'}
              </strong>
            </span>
          </div>
        </header>
        <p className="streaming-golden__cursor-note">
          Source High-water Cursor != Event-time Watermark · 前者回答讀到哪；後者是 event-time
          completeness 策略估計。
        </p>
        <WindowState state={session.stream} />
        {session.stream.sideOutputOffsets.length > 0 && (
          <p className="streaming-golden__side-output" data-testid="streaming-side-output">
            Side / late evidence：offset {session.stream.sideOutputOffsets.join(', ')} · TX-008 ·
            不再修改 online final。
          </p>
        )}
      </section>

      {step.state.stage === 'late-watermark' && (
        <section className="streaming-golden__action-panel" aria-label="Inject accepted late event">
          <div>
            <strong>offset 5 尚未到達</strong>
            <p>TX-005 event_time=10:04，arrival_time=10:06；窗口仍在 2 分钟允许迟到期内。</p>
          </div>
          <button
            type="button"
            className="button button--quiet button--small"
            data-streaming-action="inject-late"
            disabled={session.stream.sourcePosition >= 5}
            onClick={() => dispatch({ type: 'inject-late-event' })}
          >
            Inject TX-005 · 300 → 450
          </button>
        </section>
      )}

      {step.state.stage === 'late-watermark' && (
        <section
          className="streaming-golden__action-panel"
          aria-label="Advance event-time watermark"
        >
          <div>
            <strong>Window end 10:05 · allowed lateness 2 minutes</strong>
            <p>
              {session.stream.sourcePosition < 5
                ? '先接收 offset 5；再让 offset 6 / 7 按固定时间线到达，并推进 event-time watermark 到 10:07。'
                : 'offset 6 / 7 已到达；推进 event-time watermark 到 10:07 finalize，随后 offset 8 进入 late side output。'}
            </p>
          </div>
          <button
            type="button"
            className="button button--quiet button--small"
            data-streaming-action="advance-watermark"
            disabled={
              session.stream.sourcePosition < 5 ||
              session.stream.watermark === '2026-05-12T10:07:00+08:00'
            }
            onClick={() => dispatch({ type: 'advance-watermark' })}
          >
            Advance watermark → 10:07
          </button>
        </section>
      )}

      {showRecovery && <RecoveryPanel session={session} dispatch={dispatch} />}
      {showReconciliation && <Reconciliation state={session.stream} />}
      {sessionComplete && (
        <p className="streaming-golden__completion">
          同一 fixture、同一 Grain：差异已定位到 cutoff 与 late policy。
        </p>
      )}
    </section>
  )
}

export function StreamingGoldenLab() {
  const kernel = useMemo(() => createStreamingGoldenKernel(), [])
  const [session, dispatch] = useReducer(
    streamingGoldenReducer,
    kernel.size,
    createStreamingGoldenLessonSession,
  )

  return <StreamingGoldenLabBody session={session} dispatch={dispatch} kernel={kernel} />
}
