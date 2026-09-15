import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CodeRenderer } from '../lesson/CodeRenderer'
import type { CodeHighlightMap } from '../../utils/code-highlight'
import { getCodeHighlightKey } from '../../utils/code-highlight'
import { HERO_METRIC_SQL } from '../../data/code-examples'

type FlowPhase = 0 | 1 | 2 | 3
type StageStatus = 'waiting' | 'current' | 'done'
type OrderColumnKey = 'orderId' | 'userId' | 'amount' | 'status'

interface OrderRow {
  orderId: string
  userId: string
  amount: number
  status: 'PAID' | 'REFUND'
}

interface HeroStep {
  id: string
  name: string
  table: string
  detail: string
}

interface OrderColumn {
  key: OrderColumnKey
  label: string
}

interface OrderTableProps {
  columns: readonly OrderColumn[]
  tableClassName: string
  wrapperClassName: string
  caption: string
  filtered: boolean
}

interface HeroStageProps {
  step: HeroStep
  status: StageStatus
  statusLabel: string
  children: ReactNode
}

interface FlowConnectorProps {
  index: number
  label: string
  phase: FlowPhase
  isPlaying: boolean
}

interface HeroDataFlowProps {
  codeHighlights?: CodeHighlightMap
}

const FLOW_STEP_MS = 1350
const GMV_AMOUNT = 598

const orderRows: readonly OrderRow[] = [
  { orderId: '10001', userId: 'U01', amount: 199, status: 'PAID' },
  { orderId: '10002', userId: 'U02', amount: 399, status: 'PAID' },
  { orderId: '10003', userId: 'U01', amount: 59, status: 'REFUND' },
]

const sourceColumns: readonly OrderColumn[] = [
  { key: 'orderId', label: 'order_id' },
  { key: 'userId', label: 'user_id' },
  { key: 'amount', label: 'amount' },
  { key: 'status', label: 'status' },
]

const dwdColumns: readonly OrderColumn[] = [
  { key: 'orderId', label: 'order_id' },
  { key: 'amount', label: 'amount' },
  { key: 'status', label: 'status' },
]

const heroSteps: readonly HeroStep[] = [
  { id: '01', name: 'Source', table: 'orders', detail: '业务库' },
  { id: '02', name: 'ODS', table: 'ods_order', detail: '原样落表' },
  { id: '03', name: 'DWD', table: 'dwd_order', detail: 'SQL 过滤' },
  { id: '04', name: 'Metric', table: 'GMV', detail: 'SQL 聚合' },
]

const phaseMessages = {
  0: '先看业务库里的 3 行订单；点击播放，观察它们如何被加工。',
  1: 'ODS 原样接住订单，不改变来源字段。',
  2: "DWD 应用 WHERE status = 'PAID'，REFUND 被过滤。",
  3: '2 valid rows → SQL SUM(amount) → GMV ¥598。',
} satisfies Record<FlowPhase, string>

function getStageStatus(index: number, phase: FlowPhase): StageStatus {
  if (index < phase) {
    return 'done'
  }

  if (index === phase) {
    return 'current'
  }

  return 'waiting'
}

function getStageStatusLabel(status: StageStatus, phase: FlowPhase, isPlaying: boolean): string {
  if (status === 'done') {
    return '已完成'
  }

  if (status === 'current') {
    return phase === 3 && !isPlaying ? '已完成' : '当前'
  }

  return '等待'
}

function getPlayLabel(isFinished: boolean, isPlaying: boolean): string {
  if (isFinished) {
    return '↻ 重新演示'
  }

  if (isPlaying) {
    return '处理中…'
  }

  return '▶ 看数据流动'
}

function getRowStatusClass(row: OrderRow, isFiltered: boolean): string {
  return isFiltered ? 'filtered' : row.status.toLowerCase()
}

function renderOrderCell(row: OrderRow, column: OrderColumn, isFiltered: boolean): ReactNode {
  if (column.key === 'status') {
    return (
      <span
        className={`hero-demo__row-status hero-demo__row-status--${getRowStatusClass(row, isFiltered)}`}
      >
        {isFiltered ? 'FILTERED' : row.status}
      </span>
    )
  }

  const value = row[column.key]
  return isFiltered ? <del>{value}</del> : value
}

function OrderTable({
  columns,
  tableClassName,
  wrapperClassName,
  caption,
  filtered,
}: OrderTableProps) {
  return (
    <div className={wrapperClassName}>
      <table className={tableClassName}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th scope="col" key={column.key}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orderRows.map((row) => {
            const isFiltered = filtered && row.status === 'REFUND'
            return (
              <tr className={isFiltered ? 'is-filtered' : undefined} key={row.orderId}>
                {columns.map((column) => (
                  <td key={column.key}>{renderOrderCell(row, column, isFiltered)}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function HeroStage({ step, status, statusLabel, children }: HeroStageProps) {
  return (
    <section
      className={`hero-demo__stage hero-demo__stage--${status}`}
      aria-label={`${step.name}：${statusLabel}`}
    >
      <div className="hero-demo__stage-heading">
        <span className="hero-demo__stage-index">{step.id}</span>
        <div>
          <strong>{step.name}</strong>
          <code>{step.table}</code>
        </div>
        <span className="hero-demo__stage-status">{statusLabel}</span>
      </div>
      {children}
    </section>
  )
}

function StageFooter({ table, value, label }: { table: string; value: string; label: string }) {
  return (
    <div className="hero-demo__stage-footer">
      <code>{table}</code>
      <span>
        <strong>{value}</strong> {label}
      </span>
    </div>
  )
}

function SourceStage({ phase, isPlaying }: { phase: FlowPhase; isPlaying: boolean }) {
  const status = getStageStatus(0, phase)
  const statusLabel = getStageStatusLabel(status, phase, isPlaying)

  return (
    <HeroStage step={heroSteps[0]} status={status} statusLabel={statusLabel}>
      <OrderTable
        columns={sourceColumns}
        tableClassName="hero-demo__order-table"
        wrapperClassName="hero-demo__table-wrap"
        caption="业务库 orders 的原始订单记录"
        filtered={false}
      />
      <StageFooter table="business_db.orders" value="3" label="rows" />
    </HeroStage>
  )
}

function OdsStage({ phase, isPlaying }: { phase: FlowPhase; isPlaying: boolean }) {
  const status = getStageStatus(1, phase)
  const statusLabel = getStageStatusLabel(status, phase, isPlaying)

  return (
    <HeroStage step={heroSteps[1]} status={status} statusLabel={statusLabel}>
      <div className="hero-demo__node-body">
        <span className="hero-demo__node-glyph" aria-hidden="true">
          DB
        </span>
        <code className="hero-demo__node-name">ods_order</code>
        <p>保留来源字段和上下文</p>
        <div className="hero-demo__node-count">
          <strong>{phase >= 1 ? '3' : '—'}</strong>
          <span>rows</span>
        </div>
        <small>raw landing</small>
      </div>
    </HeroStage>
  )
}

function DwdStage({ phase, isPlaying }: { phase: FlowPhase; isPlaying: boolean }) {
  const status = getStageStatus(2, phase)
  const statusLabel = getStageStatusLabel(status, phase, isPlaying)
  const hasRun = phase >= 2

  return (
    <HeroStage step={heroSteps[2]} status={status} statusLabel={statusLabel}>
      <code className="hero-demo__filter-sql">WHERE status = 'PAID'</code>
      <OrderTable
        columns={dwdColumns}
        tableClassName="hero-demo__mini-table"
        wrapperClassName="hero-demo__mini-table-wrap"
        caption="DWD 订单过滤结果"
        filtered={hasRun}
      />
      <StageFooter table="dwd_order" value={hasRun ? '2' : '—'} label="valid rows" />
    </HeroStage>
  )
}

function MetricStage({
  phase,
  isPlaying,
  metricValue,
  codeHighlights,
}: {
  phase: FlowPhase
  isPlaying: boolean
  metricValue: number
  codeHighlights?: CodeHighlightMap
}) {
  const status = getStageStatus(3, phase)
  const highlightedCode = codeHighlights?.[getCodeHighlightKey('sql', HERO_METRIC_SQL)]
  const statusLabel = getStageStatusLabel(status, phase, isPlaying)
  const hasRun = phase === 3

  return (
    <HeroStage step={heroSteps[3]} status={status} statusLabel={statusLabel}>
      <div className="hero-demo__metric-body">
        <div className="hero-demo__sql-block">
          <span className="hero-demo__sql-label">SQL</span>
          <CodeRenderer
            className="hero-demo__sql-code"
            code={HERO_METRIC_SQL}
            highlightedCode={highlightedCode}
          />
        </div>
        <div className={`hero-demo__metric-result${hasRun ? ' is-visible' : ''}`}>
          <span>GMV</span>
          <strong>¥{hasRun ? metricValue : '—'}</strong>
        </div>
        <p>{hasRun ? '2 rows → 1 metric' : '等待 dwd_order'}</p>
      </div>
    </HeroStage>
  )
}

function FlowConnector({ index, label, phase, isPlaying }: FlowConnectorProps) {
  const isPassed = phase > index
  const isActive = isPlaying && phase === index
  const className = [
    'hero-demo__connector',
    isPassed ? 'is-passed' : '',
    isActive ? 'is-active' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className} aria-hidden="true">
      <span className="hero-demo__connector-line" />
      <span className="hero-demo__connector-packet" />
      <span className="hero-demo__connector-arrow">→</span>
      <span className="hero-demo__connector-label">{label}</span>
    </div>
  )
}

function HeroSteps({ phase, isPlaying }: { phase: FlowPhase; isPlaying: boolean }) {
  return (
    <ol className="hero-demo__steps" aria-label="数据流演示步骤">
      {heroSteps.map((step, index) => {
        const status = getStageStatus(index, phase)
        const statusLabel = getStageStatusLabel(status, phase, isPlaying)
        return (
          <li
            className={`hero-demo__step hero-demo__step--${status}`}
            key={step.id}
            aria-current={status === 'current' ? 'step' : undefined}
            aria-label={`${step.id} ${step.name}，${statusLabel}`}
          >
            <span className="hero-demo__step-number">{step.id}</span>
            <span className="hero-demo__step-copy">
              <strong>{step.name}</strong>
              <small>
                {step.table} · {step.detail}
              </small>
            </span>
            <span className="hero-demo__step-status">{statusLabel}</span>
          </li>
        )
      })}
    </ol>
  )
}

function DataStory({
  dwdHasRun,
  metricHasRun,
  metricValue,
}: {
  dwdHasRun: boolean
  metricHasRun: boolean
  metricValue: number
}) {
  return (
    <div className="hero-demo__data-story" aria-label="数据变化摘要">
      <span className="hero-demo__data-value is-visible">
        <strong>3</strong>
        <small>rows</small>
      </span>
      <span className="hero-demo__data-arrow" aria-hidden="true">
        ↓
      </span>
      <span className={`hero-demo__data-value${dwdHasRun ? ' is-visible is-current' : ''}`}>
        <strong>{dwdHasRun ? '2' : '—'}</strong>
        <small>valid rows</small>
      </span>
      <span className="hero-demo__data-arrow" aria-hidden="true">
        ↓
      </span>
      <span className={`hero-demo__data-value${metricHasRun ? ' is-visible is-current' : ''}`}>
        <strong>SUM</strong>
        <small>amount</small>
      </span>
      <span className="hero-demo__data-arrow" aria-hidden="true">
        ↓
      </span>
      <span
        className={`hero-demo__data-value hero-demo__data-value--result${metricHasRun ? ' is-visible is-current' : ''}`}
      >
        <strong>{metricHasRun ? `¥${metricValue}` : '—'}</strong>
        <small>GMV</small>
      </span>
    </div>
  )
}

export function HeroDataFlow({ codeHighlights }: HeroDataFlowProps) {
  const [phase, setPhase] = useState<FlowPhase>(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [metricValue, setMetricValue] = useState(0)
  const timerIds = useRef<number[]>([])
  const countFrame = useRef<number | undefined>(undefined)

  function clearTimers() {
    timerIds.current.forEach((timerId) => window.clearTimeout(timerId))
    timerIds.current = []
  }

  function playFlow() {
    clearTimers()

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMetricValue(GMV_AMOUNT)
      setPhase(3)
      setIsPlaying(false)
      return
    }

    setMetricValue(0)
    setPhase(0)
    setIsPlaying(true)
    const nextPhases: readonly FlowPhase[] = [1, 2, 3]
    timerIds.current = nextPhases.map((nextPhase, index) =>
      window.setTimeout(
        () => {
          setPhase(nextPhase)
          if (nextPhase === 3) {
            setIsPlaying(false)
          }
        },
        FLOW_STEP_MS * (index + 1),
      ),
    )
  }

  function resetFlow() {
    clearTimers()
    setMetricValue(0)
    setPhase(0)
    setIsPlaying(false)
  }

  useEffect(() => {
    return () => {
      timerIds.current.forEach((timerId) => window.clearTimeout(timerId))
    }
  }, [])

  useEffect(() => {
    if (countFrame.current !== undefined) {
      window.cancelAnimationFrame(countFrame.current)
      countFrame.current = undefined
    }

    if (phase < 3 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    const startedAt = window.performance.now()
    const animateValue = (now: number) => {
      const progress = Math.min((now - startedAt) / 720, 1)
      setMetricValue(Math.round(GMV_AMOUNT * progress))
      if (progress < 1) {
        countFrame.current = window.requestAnimationFrame(animateValue)
      }
    }

    countFrame.current = window.requestAnimationFrame(animateValue)

    return () => {
      if (countFrame.current !== undefined) {
        window.cancelAnimationFrame(countFrame.current)
        countFrame.current = undefined
      }
    }
  }, [phase])

  const isFinished = phase === 3 && !isPlaying
  const dwdHasRun = phase >= 2
  const metricHasRun = phase === 3

  return (
    <div
      className={`hero-demo${isPlaying ? ' is-playing' : ''}`}
      role="region"
      aria-labelledby="hero-demo-title"
    >
      <div className="hero-demo__toolbar">
        <div>
          <span className="hero-demo__toolbar-label">一条订单的加工实验</span>
          <p aria-live="polite">{phaseMessages[phase]}</p>
        </div>
        <div className="hero-demo__actions">
          <button
            className="button button--primary button--small"
            type="button"
            onClick={playFlow}
            disabled={isPlaying}
            aria-busy={isPlaying}
          >
            {getPlayLabel(isFinished, isPlaying)}
          </button>
          <button
            className="button button--quiet button--small"
            type="button"
            onClick={resetFlow}
            aria-label="重置数据流演示"
          >
            重置
          </button>
        </div>
      </div>

      <HeroSteps phase={phase} isPlaying={isPlaying} />

      <div className="hero-demo__flow" aria-label="orders 到 GMV 的数据流">
        <SourceStage phase={phase} isPlaying={isPlaying} />
        <FlowConnector index={0} label="ingest" phase={phase} isPlaying={isPlaying} />
        <OdsStage phase={phase} isPlaying={isPlaying} />
        <FlowConnector index={1} label="filter" phase={phase} isPlaying={isPlaying} />
        <DwdStage phase={phase} isPlaying={isPlaying} />
        <FlowConnector index={2} label="aggregate" phase={phase} isPlaying={isPlaying} />
        <MetricStage
          phase={phase}
          isPlaying={isPlaying}
          metricValue={metricValue}
          codeHighlights={codeHighlights}
        />
      </div>

      <DataStory dwdHasRun={dwdHasRun} metricHasRun={metricHasRun} metricValue={metricValue} />
    </div>
  )
}
