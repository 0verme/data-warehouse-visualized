import { useState } from 'react'
import {
  backfillFixedWindows,
  createMicrobatchLabState,
  MICRO_BATCH_LATE_ARRIVALS,
  MICRO_BATCH_WINDOW_BOUNDARIES,
  formatMicrobatchCheckpoint,
  getMicrobatchObservation,
  injectLateTransactionChanges,
  repeatDailyRescan,
  runInitialMicrobatch,
  runNextMicrobatch,
  setMicrobatchLateArrival,
  setMicrobatchWindowBoundary,
  simulateCheckpointRetry,
  type MicrobatchLabState,
  type MicrobatchStrategyId,
  type MicrobatchStrategyState,
  type MicrobatchWriteMode,
  type MicrobatchLateArrival,
  type MicrobatchWindowBoundary,
} from '../../features/performance/microbatch'
import { LayerMarker, PerformancePanelHeading, SimulationNote } from './PerformanceLabShared'

const STRATEGIES: readonly {
  id: MicrobatchStrategyId
  letter: string
  title: string
  description: string
}[] = [
  {
    id: 'fixed-window',
    letter: 'A',
    title: '固定时间窗口',
    description: '按 Transaction.event_time 切片；已关闭窗口要靠 lookback 或补跑找回迟到记录。',
  },
  {
    id: 'checkpoint',
    letter: 'B',
    title: 'Source Cursor / Checkpoint',
    description: '按源变更时间与 ID 游标读取新增 / 更新；需要持久化游标并与结果写入协调。',
  },
  {
    id: 'daily-rescan',
    letter: 'C',
    title: '当日重扫',
    description: '每次重读 00:00 → now 的当日快照；简单，但重复扫描会随时间增长。',
  },
]

function StrategyEvidence({
  strategyId,
  state,
  lab,
  onBackfill,
  onRetry,
  onRescan,
}: {
  strategyId: MicrobatchStrategyId
  state: MicrobatchStrategyState
  lab: MicrobatchLabState
  onBackfill: () => void
  onRetry: () => void
  onRescan: () => void
}) {
  const strategy = STRATEGIES.find((item) => item.id === strategyId)!
  const observation = getMicrobatchObservation(lab, strategyId)
  const lastRun = state.runs.at(-1)
  const selected = lastRun?.selectedChanges ?? []
  const isCheckpoint = strategyId === 'checkpoint'

  return (
    <article
      className={`performance-microbatch__strategy performance-microbatch__strategy--${strategyId}`}
      data-microbatch-strategy={strategyId}
    >
      <header className="performance-microbatch__strategy-heading">
        <span aria-hidden="true">{strategy.letter}</span>
        <div>
          <h4>{strategy.title}</h4>
          <p>{strategy.description}</p>
        </div>
      </header>

      <dl className="performance-microbatch__facts">
        <div>
          <dt>最近读取范围</dt>
          <dd data-microbatch-scope>{lastRun?.scope ?? '尚未执行'}</dd>
        </div>
        <div>
          <dt>本轮扫描 / 命中</dt>
          <dd data-microbatch-last-read>
            {lastRun ? `${lastRun.scannedRows} / ${selected.length} 条源记录` : '—'}
          </dd>
        </div>
        <div>
          <dt>累计扫描</dt>
          <dd data-microbatch-scanned>{state.scannedRows} 条源记录</dd>
        </div>
        <div>
          <dt>结果行 / 期望交易</dt>
          <dd data-microbatch-output-rows={state.output.length}>
            {state.output.length} / {observation.expectedTransactions.length}
          </dd>
        </div>
        <div>
          <dt>重复输出行</dt>
          <dd
            className={observation.duplicateRows > 0 ? 'is-warning' : undefined}
            data-microbatch-duplicates={observation.duplicateRows}
          >
            {observation.duplicateRows}
          </dd>
        </div>
        <div>
          <dt>遗漏 / 旧版本</dt>
          <dd
            data-microbatch-missing={observation.missingTransactionIds.join(',')}
            data-microbatch-stale={observation.staleTransactionIds.join(',')}
            className={
              observation.missingTransactionIds.length + observation.staleTransactionIds.length > 0
                ? 'is-warning'
                : undefined
            }
          >
            {observation.missingTransactionIds.length > 0
              ? `缺 ${observation.missingTransactionIds.join(', ')}`
              : '无遗漏'}
            {observation.staleTransactionIds.length > 0
              ? ` · 旧版本 ${observation.staleTransactionIds.join(', ')}`
              : ''}
          </dd>
        </div>
        {isCheckpoint && (
          <div>
            <dt>last_processed_time / last_processed_id</dt>
            <dd data-microbatch-checkpoint>{formatMicrobatchCheckpoint(state.checkpoint)}</dd>
          </div>
        )}
      </dl>

      {lab.hasInjectedLateChanges && strategyId === 'fixed-window' && (
        <>
          <button
            className="performance-microbatch__local-action"
            type="button"
            data-microbatch-action="backfill"
            onClick={onBackfill}
          >
            补跑 10:00–10:10 受影响窗口
          </button>
          <p
            className="performance-microbatch__feedback"
            data-microbatch-feedback
            aria-live="polite"
          >
            {lastRun
              ? `${lastRun.label}：扫描 ${lastRun.scannedRows} 条；${observation.missingTransactionIds.length ? `缺少 ${observation.missingTransactionIds.join(', ')}` : '无遗漏'}；旧版本 ${observation.staleTransactionIds.length} 项；重复 ${observation.duplicateRows} 行。`
              : '窗口尚未运行。'}
          </p>
        </>
      )}
      {lab.hasRunNextBatch && strategyId === 'checkpoint' && state.lastCheckpointBatch && (
        <>
          <button
            className="performance-microbatch__local-action"
            type="button"
            data-microbatch-action="retry"
            onClick={onRetry}
          >
            模拟 checkpoint 未持久化后 retry
          </button>
          <p
            className="performance-microbatch__feedback"
            data-microbatch-feedback
            aria-live="polite"
          >
            {lastRun
              ? `${lastRun.label}：累计重读 ${state.scannedRows} 条源记录；checkpoint = ${formatMicrobatchCheckpoint(state.checkpoint)}；重复输出 ${observation.duplicateRows} 行。`
              : 'Checkpoint 尚未推进。'}
          </p>
        </>
      )}
      {lab.hasRunNextBatch && strategyId === 'daily-rescan' && (
        <>
          <button
            className="performance-microbatch__local-action"
            type="button"
            data-microbatch-action="rescan"
            onClick={onRescan}
          >
            再次重扫当日
          </button>
          <p
            className="performance-microbatch__feedback"
            data-microbatch-feedback
            aria-live="polite"
          >
            {lastRun
              ? `${lastRun.label}：最近读取 ${lastRun.scannedRows} 条；累计扫描 ${state.scannedRows} 条；结果重复 ${observation.duplicateRows} 行。`
              : '当日尚未重扫。'}
          </p>
        </>
      )}

      <section
        className="performance-microbatch__records"
        aria-label={`${strategy.title}最近命中记录`}
      >
        <h5>最近命中记录</h5>
        {selected.length === 0 ? (
          <p className="performance-microbatch__empty">没有命中；结果保持原样。</p>
        ) : (
          <ul>
            {selected.map((change) => (
              <li key={`${lastRun?.label}-${change.id}`}>
                <span>
                  <strong>{change.transactionId}</strong> · v{change.revision} · {change.amount} 元
                </span>
                <small>
                  event {change.eventTime} / arrived {change.availableAt}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>

      {observation.currentOutput.length > 0 && (
        <section
          className="performance-microbatch__output"
          aria-label={`${strategy.title}目标结果`}
        >
          <h5>目标当前结果</h5>
          <ul>
            {observation.currentOutput.map((row) => (
              <li key={row.transactionId}>
                <strong>{row.transactionId}</strong>
                <span>
                  v{row.revision} · {row.amount} 元
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}

export function PerformanceMicrobatchLab() {
  const [lab, setLab] = useState(() => createMicrobatchLabState())
  const isStarted = lab.hasRunFirstBatch

  function selectWriteMode(writeMode: MicrobatchWriteMode) {
    if (!isStarted) {
      setLab(
        createMicrobatchLabState(writeMode, {
          windowBoundary: lab.windowBoundary,
          lateArrivalTime: lab.lateArrivalTime,
        }),
      )
    }
  }

  function reset() {
    setLab(
      createMicrobatchLabState(lab.writeMode, {
        windowBoundary: lab.windowBoundary,
        lateArrivalTime: lab.lateArrivalTime,
      }),
    )
  }

  return (
    <div className="performance-lab performance-lab--microbatch" data-microbatch-lab>
      <LayerMarker layer="calculation-plan" />
      <SimulationNote text="固定窗口长度、迟到回看范围和重扫频率都是示例中的策略参数，不是行业统一标准。源事件、时间与金额均为确定性 Banking 教学数据。" />

      <PerformancePanelHeading
        eyebrow="11-5 · 准实时微批实验"
        title="同一批 Transaction，为什么三种增量策略结果不同？"
        description="先调整固定窗口边界、迟到到达时间和写入方式，再注入迟到交易与已有交易更新；推进、补跑或重试时观察扫描量与目标状态。"
        id="performance-microbatch-title"
      />

      <section className="performance-microbatch__input" aria-labelledby="microbatch-input-title">
        <div className="performance-microbatch__input-heading">
          <div>
            <span className="eyebrow eyebrow--small">同一份输入</span>
            <h4 id="microbatch-input-title">Banking Transaction 变更记录</h4>
          </div>
          <p>业务发生时间与源端可见 / 更新的时间分开记录。</p>
        </div>
        <ul className="performance-microbatch__source-list">
          {lab.sourceChanges.map((change) => (
            <li
              className={change.availableAt > '10:06' ? 'is-late' : undefined}
              data-transaction-change={change.id}
              key={change.id}
            >
              <strong>{change.transactionId}</strong>
              <span>
                {change.kind === 'insert' ? '新增' : '更新'} · v{change.revision}
              </span>
              <span>发生 {change.eventTime}</span>
              <span>到达 / 更新 {change.availableAt}</span>
              <span>{change.amount} 元</span>
            </li>
          ))}
        </ul>
        <p className="performance-microbatch__boundary-note" data-microbatch-boundary>
          固定窗口是 <code>10:00–{lab.windowBoundary}</code>、
          <code>{lab.windowBoundary}–10:10</code>，采用 <code>[start, end)</code>{' '}
          左闭右开：恰好等于边界的
          <code> event_time</code> 只属于第二窗，不会和前一窗重叠。
        </p>
      </section>

      <fieldset className="performance-microbatch__configuration" disabled={isStarted}>
        <legend>可调整的策略参数（开始运行后锁定）</legend>
        <div className="performance-microbatch__configuration-grid">
          <label>
            <span>第一窗口结束边界</span>
            <select
              data-microbatch-window-boundary
              value={lab.windowBoundary}
              onChange={(event) =>
                setLab((current) =>
                  setMicrobatchWindowBoundary(
                    current,
                    event.target.value as MicrobatchWindowBoundary,
                  ),
                )
              }
            >
              {MICRO_BATCH_WINDOW_BOUNDARIES.map((boundary) => (
                <option key={boundary} value={boundary}>
                  {boundary}
                </option>
              ))}
            </select>
            <small>改变边界后，时间恰好相等的记录应只进入第二窗口。</small>
          </label>
          <label>
            <span>迟到 Transaction 到达时间</span>
            <select
              data-microbatch-late-arrival
              value={lab.lateArrivalTime}
              onChange={(event) =>
                setLab((current) =>
                  setMicrobatchLateArrival(current, event.target.value as MicrobatchLateArrival),
                )
              }
            >
              {MICRO_BATCH_LATE_ARRIVALS.map((arrival) => (
                <option key={arrival} value={arrival}>
                  {arrival}
                </option>
              ))}
            </select>
            <small>更新在一分钟后到达；改变迟到程度也会推进本轮 as-of 时间。</small>
          </label>
        </div>
      </fieldset>

      <fieldset className="performance-microbatch__write-mode" disabled={isStarted}>
        <legend>目标写入语义（所有策略一致，开始运行后锁定）</legend>
        <div className="performance-choice-grid performance-choice-grid--two">
          <button
            className={`performance-choice${lab.writeMode === 'upsert' ? ' is-selected' : ''}`}
            data-microbatch-write-mode="upsert"
            type="button"
            aria-pressed={lab.writeMode === 'upsert'}
            onClick={() => selectWriteMode('upsert')}
          >
            <strong>按 transaction_id Upsert</strong>
            <small>更新旧版本、覆盖同一交易；结果写入具备幂等条件。</small>
          </button>
          <button
            className={`performance-choice${lab.writeMode === 'append' ? ' is-selected' : ''}`}
            data-microbatch-write-mode="append"
            type="button"
            aria-pressed={lab.writeMode === 'append'}
            onClick={() => selectWriteMode('append')}
          >
            <strong>Append 追加</strong>
            <small>每次读取都新增结果行；重复窗口 / 重试可能累积重复交易。</small>
          </button>
        </div>
      </fieldset>

      <div className="performance-microbatch__actions" aria-label="微批实验操作">
        <button
          className="performance-microbatch__action is-primary"
          type="button"
          disabled={isStarted}
          data-microbatch-action="first"
          onClick={() => setLab((current) => runInitialMicrobatch(current))}
        >
          1 · 执行第一次微批
        </button>
        <button
          className="performance-microbatch__action"
          type="button"
          disabled={!lab.hasRunFirstBatch || lab.hasInjectedLateChanges}
          data-microbatch-action="inject"
          onClick={() => setLab((current) => injectLateTransactionChanges(current))}
        >
          2 · 插入迟到交易 + 更新
        </button>
        <button
          className="performance-microbatch__action"
          type="button"
          disabled={!lab.hasInjectedLateChanges || lab.hasRunNextBatch}
          data-microbatch-action="next"
          onClick={() => setLab((current) => runNextMicrobatch(current))}
        >
          3 · 推进下一微批
        </button>
      </div>

      <p
        className="performance-microbatch__status"
        data-microbatch-status
        role="status"
        aria-live="polite"
      >
        {!lab.hasRunFirstBatch
          ? '准备就绪：三种策略将读取同一份输入，先选择结果写入语义。'
          : !lab.hasInjectedLateChanges
            ? '第一次运行完成：TX-1001 / TX-1002 / TX-1003 已进入初始结果。现在可以注入迟到与更新。'
            : !lab.hasRunNextBatch
              ? '迟到变化已可见但尚未处理：TX-1004 的 event_time 落在已关闭窗口；TX-1001 更新也保留原 event_time。'
              : '第二次运行完成：比较 fixed window 的遗漏、checkpoint 的增量游标和当日重扫的累计扫描；可继续补跑、重试或重扫。'}
      </p>
      <button
        className="performance-microbatch__action is-reset performance-microbatch__reset"
        type="button"
        data-microbatch-action="reset"
        onClick={reset}
      >
        重置实验
      </button>

      <div className="performance-microbatch__strategies">
        {STRATEGIES.map((strategy) => (
          <StrategyEvidence
            key={strategy.id}
            strategyId={strategy.id}
            state={lab.strategies[strategy.id]}
            lab={lab}
            onBackfill={() => setLab((current) => backfillFixedWindows(current))}
            onRetry={() => setLab((current) => simulateCheckpointRetry(current))}
            onRescan={() => setLab((current) => repeatDailyRescan(current))}
          />
        ))}
      </div>

      <div className="performance-microbatch__engineering-notes">
        <p>
          <strong>Checkpoint 不等于 exactly-once：</strong>
          本例的 <code>last_processed_time</code> 使用源端新增 / 更新可见时间，
          <code>last_processed_id</code> 是唯一变更记录 ID，用作同时间排序键；若改按旧
          <code> event_time</code> 前进，迟到记录与更新可能落到游标后面。结果先写成功、checkpoint
          未保存时会重读同一批；Upsert 可让最终表保持一行，但读取和计算仍重复。若先推进 checkpoint
          再写结果，则可能漏数。
        </p>
        <p>
          <strong>当日重扫不是默认推荐：</strong>
          它用较简单的读取规则重新覆盖当天变化；每次都会重新扫描从午夜至当前时点的输入，数据量增长后成本也会增长，并且仍要求结果写入幂等。频率、窗口宽度、lookback
          与状态方案应按 SLA、迟到分布、成本和恢复能力选择。
        </p>
      </div>
    </div>
  )
}
