import { useMemo, useState } from 'react'
import type {
  ScdAttributeUpdate,
  ScdDimensionVersion,
  ScdOrder,
  ScdVisualization,
} from '../../types'
import { applyType1Update, applyType2Update, getDimensionVersionAt } from '../../utils/scd'

interface SlowlyChangingDimensionProps {
  visualization: ScdVisualization
}

type ScdMode = 'type1' | 'type2'
type ScdStage = 'initial' | 'updated' | 'historical'
type ScdTimelinePointKind = 'start' | 'order' | 'change'

interface ScdTimelinePoint {
  date: string
  label: string
  detail: string
  kind: ScdTimelinePointKind
  orderId?: string
}

interface ScdLabState {
  mode: ScdMode
  stage: ScdStage
  timelineIndex: number
}

const stageLabels: Record<ScdStage, string> = {
  initial: '时间胶囊停在升级前：普通会员',
  updated: 'Type 1 已覆盖：把时间拨回去看，历史会变成黄金会员',
  historical: 'Type 2 已开启：每个时间点命中自己的版本',
}

function getChangeAttributes(visualization: ScdVisualization): ScdAttributeUpdate {
  return {
    ...(visualization.change.city !== undefined ? { city: visualization.change.city } : {}),
    ...(visualization.change.memberLevel !== undefined
      ? { memberLevel: visualization.change.memberLevel }
      : {}),
  }
}

function hasDate(points: readonly ScdTimelinePoint[], date: string): boolean {
  for (const point of points) {
    if (point.date === date) {
      return true
    }
  }

  return false
}

function getTimelinePoints(visualization: ScdVisualization): ScdTimelinePoint[] {
  const candidates: ScdTimelinePoint[] = [
    {
      date: visualization.initialVersion.effectiveFrom,
      label: '初始版本',
      detail: `${visualization.initialVersion.memberLevel} 生效`,
      kind: 'start',
    },
    ...visualization.orders.map((order) => ({
      date: order.orderTime,
      label: order.label,
      detail: `¥${order.amount} · 事实表订单`,
      kind: 'order' as const,
      orderId: order.id,
    })),
    {
      date: visualization.change.effectiveFrom,
      label: '属性变化',
      detail: '会员等级升级',
      kind: 'change',
    },
  ]
  const sortedCandidates = [...candidates].sort((left, right) =>
    left.date.localeCompare(right.date),
  )
  const points: ScdTimelinePoint[] = []

  for (const candidate of sortedCandidates) {
    if (!hasDate(points, candidate.date)) {
      points.push(candidate)
    }
  }

  return points
}

function getMonthLabels(points: readonly ScdTimelinePoint[]): string[] {
  const labels: string[] = []

  for (const point of points) {
    const label = point.date.slice(0, 7)
    let hasLabel = false

    for (const existingLabel of labels) {
      if (existingLabel === label) {
        hasLabel = true
        break
      }
    }

    if (!hasLabel) {
      labels.push(label)
    }
  }

  return labels
}

function getFirstOrderIndex(
  points: readonly ScdTimelinePoint[],
  orders: readonly ScdOrder[],
): number {
  const firstOrder = orders[0]

  if (!firstOrder) {
    return 0
  }

  for (let index = 0; index < points.length; index += 1) {
    if (points[index]?.orderId === firstOrder.id) {
      return index
    }
  }

  return 0
}

function getOrderById(
  orders: readonly ScdOrder[],
  orderId: string | undefined,
): ScdOrder | undefined {
  if (!orderId) {
    return undefined
  }

  for (const order of orders) {
    if (order.id === orderId) {
      return order
    }
  }

  return undefined
}

function DimensionVersionTable({
  versions,
  showHistoryFields,
  selectedVersion,
}: {
  versions: readonly ScdDimensionVersion[]
  showHistoryFields: boolean
  selectedVersion: ScdDimensionVersion | undefined
}) {
  return (
    <div className="scd__dimension-table-wrap">
      <table className="scd__dimension-table">
        <caption>
          {showHistoryFields ? 'SCD Type 2 维度版本' : 'Type 1 直接覆盖后的当前维度'}
        </caption>
        <thead>
          <tr>
            <th>user_id</th>
            <th>city</th>
            <th>member_level</th>
            {showHistoryFields && (
              <>
                <th>effective_from</th>
                <th>effective_to</th>
                <th>is_current</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => {
            const isSelected = selectedVersion?.effectiveFrom === version.effectiveFrom
            return (
              <tr
                className={isSelected ? 'is-selected' : ''}
                key={`${version.userId}-${version.effectiveFrom}`}
              >
                <td>{version.userId}</td>
                <td>{version.city}</td>
                <td>
                  <strong>{version.memberLevel}</strong>
                </td>
                {showHistoryFields && (
                  <>
                    <td>{version.effectiveFrom}</td>
                    <td>{version.effectiveTo}</td>
                    <td>
                      <span
                        className={`scd__current-value${version.isCurrent ? ' is-current' : ''}`}
                      >
                        {String(version.isCurrent)}
                      </span>
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TimeMachine({
  points,
  monthLabels,
  selectedIndex,
  onSelect,
}: {
  points: readonly ScdTimelinePoint[]
  monthLabels: readonly string[]
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  const selectedPoint = points[selectedIndex] ?? points[0]

  if (!selectedPoint) {
    return null
  }

  return (
    <section className="scd__time-machine" aria-labelledby="scd-time-machine-title">
      <div className="scd__time-machine-heading">
        <div>
          <span className="eyebrow">TIME TRAVEL · 时间旅行</span>
          <h3 id="scd-time-machine-title">把时间拨回去，看当时的会员状态</h3>
        </div>
        <div className="scd__time-readout" aria-live="polite">
          <span>当前时间点</span>
          <strong>{selectedPoint.date}</strong>
          <small>{selectedPoint.detail}</small>
        </div>
      </div>
      <div className="scd__time-rail">
        <div
          className="scd__month-rail"
          style={{
            gridTemplateColumns: `repeat(${Math.max(monthLabels.length, 1)}, minmax(0, 1fr))`,
          }}
          aria-hidden="true"
        >
          {monthLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div
          className="scd__point-rail"
          style={{ gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(0, 1fr))` }}
        >
          {points.map((point, index) => (
            <button
              className={`scd__time-point scd__time-point--${point.kind}${
                selectedIndex === index ? ' is-selected' : ''
              }`}
              type="button"
              aria-label={`${point.label}，${point.date}，${point.detail}`}
              aria-current={selectedIndex === index ? 'step' : undefined}
              onClick={() => onSelect(index)}
              key={`${point.date}-${point.kind}`}
            >
              <i aria-hidden="true" />
              <strong>{point.label}</strong>
              <small>{point.date}</small>
            </button>
          ))}
        </div>
        <label className="scd__time-slider-label">
          <span>拖动时间滑块</span>
          <input
            type="range"
            min="0"
            max={Math.max(points.length - 1, 0)}
            step="1"
            value={selectedIndex}
            aria-label="拖动时间滑块查看维度状态"
            aria-valuetext={`${selectedPoint.date}，${selectedPoint.detail}`}
            onChange={(event) => onSelect(Number(event.target.value))}
          />
        </label>
      </div>
    </section>
  )
}

function TimeTravelResult({
  point,
  order,
  version,
  mode,
}: {
  point: ScdTimelinePoint
  order: ScdOrder | undefined
  version: ScdDimensionVersion | undefined
  mode: ScdMode
}) {
  const isType2 = mode === 'type2'

  return (
    <div className="scd__time-result" aria-live="polite">
      <div className="scd__time-result-heading">
        <div>
          <span className="eyebrow">SNAPSHOT · 时间点快照</span>
          <h4>{point.date} 的维度答案</h4>
        </div>
        <span className={`scd__answer-badge scd__answer-badge--${mode}`}>
          {isType2 ? '按有效区间命中' : '读取当前唯一行'}
        </span>
      </div>
      <div className="scd__snapshot-card">
        <span>U1001 在这个时间点是</span>
        <strong>{version?.memberLevel ?? '没有匹配版本'}</strong>
        <small>
          {version
            ? `${version.city} · ${version.effectiveFrom} ≤ t < ${version.effectiveTo}`
            : '请检查维度版本的有效时间区间'}
        </small>
      </div>
      {order ? (
        <div className="scd__join-cards">
          <article className="scd__join-card scd__join-card--order">
            <span>事实表 · fact_order</span>
            <strong>{order.label}</strong>
            <small>
              {order.orderTime} · ¥{order.amount}
            </small>
          </article>
          <span className="scd__join-arrow" aria-hidden="true">
            JOIN
          </span>
          <article className="scd__join-card scd__join-card--dimension">
            <span>维度表 · dim_user</span>
            <strong>{version?.memberLevel ?? '未找到版本'}</strong>
            <small>{isType2 ? '按订单时间命中的历史版本' : '表中留下的当前版本'}</small>
          </article>
        </div>
      ) : (
        <p className="scd__checkpoint-note">
          这是一个属性变化的检查点，不对应订单；滑到订单 A 或订单 B，可观察 JOIN 的历史语义。
        </p>
      )}
      {order && (
        <code className="scd__join-rule">
          order_time &gt;= effective_from&nbsp;&nbsp;AND&nbsp;&nbsp;order_time &lt; effective_to
        </code>
      )}
    </div>
  )
}

export function SlowlyChangingDimension({ visualization }: SlowlyChangingDimensionProps) {
  const timelinePoints = useMemo(() => getTimelinePoints(visualization), [visualization])
  const firstOrderIndex = getFirstOrderIndex(timelinePoints, visualization.orders)
  const [state, setState] = useState<ScdLabState>({
    mode: 'type1',
    stage: 'initial',
    timelineIndex: firstOrderIndex,
  })
  const changeAttributes = useMemo(() => getChangeAttributes(visualization), [visualization])
  const type1Version = useMemo(
    () =>
      state.stage === 'initial'
        ? visualization.initialVersion
        : applyType1Update(visualization.initialVersion, changeAttributes),
    [changeAttributes, state.stage, visualization.initialVersion],
  )
  const type2Versions = useMemo(
    () =>
      applyType2Update(
        [visualization.initialVersion],
        changeAttributes,
        visualization.change.effectiveFrom,
      ),
    [changeAttributes, visualization.change.effectiveFrom, visualization.initialVersion],
  )
  const selectedPoint = timelinePoints[state.timelineIndex] ?? timelinePoints[0]
  const selectedOrder = getOrderById(visualization.orders, selectedPoint?.orderId)
  const activeVersions = state.mode === 'type2' ? type2Versions : [type1Version]
  const selectedVersion = selectedPoint
    ? state.mode === 'type2'
      ? getDimensionVersionAt(type2Versions, selectedPoint.date)
      : type1Version
    : undefined
  const hasUpdated = state.stage !== 'initial'
  const monthLabels = visualization.timelineLabels ?? getMonthLabels(timelinePoints)

  function resetExperiment() {
    setState({ mode: 'type1', stage: 'initial', timelineIndex: firstOrderIndex })
  }

  function updateUser() {
    setState((current) => ({ ...current, mode: 'type1', stage: 'updated' }))
  }

  function useType2() {
    if (!hasUpdated) {
      return
    }

    setState((current) => ({ ...current, mode: 'type2', stage: 'historical' }))
  }

  function reviewType1() {
    setState((current) => ({ ...current, mode: 'type1', stage: 'updated' }))
  }

  return (
    <div className={`scd-flow scd-flow--${state.mode} scd-flow--${state.stage}`}>
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">SCD 时间旅行实验台</span>
          <p aria-live="polite">{stageLabels[state.stage]}</p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={resetExperiment}
        >
          重置时间线
        </button>
      </div>

      <section className="scd__scenario" aria-labelledby="scd-scenario-title">
        <div className="scd__scenario-heading">
          <div>
            <span className="eyebrow">THE HISTORY QUESTION · 历史问题</span>
            <h3 id="scd-scenario-title">U1001 的今天，不能改写订单的昨天</h3>
          </div>
          <p>2026-03-01 升级为黄金会员，但历史订单仍然发生在过去。</p>
        </div>
        <div className="scd__change-strip">
          <article className="scd__state-card">
            <span>2026-01-01 → 2026-03-01</span>
            <strong>普通会员</strong>
            <small>杭州 · 旧版本等待被关闭</small>
          </article>
          <div className="scd__change-arrow" aria-hidden="true">
            <span>2026-03-01</span>
            <strong>→</strong>
          </div>
          <article
            className={`scd__state-card scd__state-card--new${hasUpdated ? ' is-active' : ''}`}
          >
            <span>2026-03-01 → 现在</span>
            <strong>黄金会员</strong>
            <small>杭州 · 新版本从此刻生效</small>
          </article>
        </div>
      </section>

      <section className="scd__experiment" aria-labelledby="scd-experiment-title">
        <div className="scd__subheading">
          <div>
            <span className="eyebrow">VERSION LAB · 版本策略</span>
            <h3 id="scd-experiment-title">先让属性变化发生，再决定是否保留历史</h3>
          </div>
          <p>{stageLabels[state.stage]}</p>
        </div>
        <div className="scd__control-deck">
          <div className="scd__mode-switch" role="tablist" aria-label="选择维度历史策略">
            <button
              className={`scd__mode-tab${state.mode === 'type1' ? ' is-selected' : ''}`}
              type="button"
              role="tab"
              aria-selected={state.mode === 'type1'}
              onClick={reviewType1}
            >
              <span>TYPE 1</span>
              <strong>直接覆盖</strong>
              <small>只保留今天的值</small>
            </button>
            <button
              className={`scd__mode-tab${state.mode === 'type2' ? ' is-selected' : ''}`}
              type="button"
              role="tab"
              aria-selected={state.mode === 'type2'}
              disabled={!hasUpdated}
              onClick={useType2}
            >
              <span>TYPE 2</span>
              <strong>新增版本</strong>
              <small>让时间点命中历史</small>
            </button>
          </div>
          <div className="scd__actions">
            <button
              className="button button--primary button--small"
              type="button"
              onClick={updateUser}
              disabled={hasUpdated}
            >
              {hasUpdated ? '属性变化已写入' : '执行：升级为黄金会员'}
            </button>
            {state.mode === 'type2' && (
              <button
                className="button button--quiet button--small"
                type="button"
                onClick={reviewType1}
              >
                回看 Type 1
              </button>
            )}
          </div>
        </div>
        <div className="scd__version-layout">
          <div className="scd__version-copy">
            <span className="scd__version-label">
              {state.mode === 'type2' ? 'TYPE 2 · 保存历史版本' : 'TYPE 1 · 直接覆盖'}
            </span>
            <strong>
              {state.mode === 'type2' ? '关闭旧行，再插入新行' : 'dim_user 只保留一行'}
            </strong>
            <p>
              {state.mode === 'type2'
                ? '旧版本在升级时结束，新版本从升级时刻开始生效；两个有效区间不会重叠。'
                : 'UPDATE member_level = “黄金会员” 后，普通会员这条历史状态不再存在。'}
            </p>
          </div>
          <DimensionVersionTable
            versions={activeVersions}
            showHistoryFields={state.mode === 'type2'}
            selectedVersion={selectedVersion}
          />
        </div>
        <div
          className={`scd__feedback scd__feedback--${state.mode}`}
          role={state.mode === 'type1' && hasUpdated ? 'alert' : 'status'}
          aria-live="polite"
        >
          {state.mode === 'type1' && !hasUpdated && (
            <>
              <strong>先让问题发生</strong>
              <span>执行一次属性变化，然后把时间线拨回 2026-02-10，查看订单 A。</span>
            </>
          )}
          {state.mode === 'type1' && hasUpdated && (
            <>
              <strong>错误：历史状态丢失</strong>
              <span>
                2026-02-10 用户当时还是普通会员，直接 UPDATE 却让订单 A 显示成了黄金会员。
              </span>
            </>
          )}
          {state.mode === 'type2' && (
            <>
              <strong>历史被保留下来</strong>
              <span>同一个 user_id 有两个版本，时间旅行滑块会让订单 A 和订单 B 命中不同状态。</span>
            </>
          )}
        </div>
      </section>

      <section className="scd__query" aria-labelledby="scd-query-title">
        <div className="scd__subheading">
          <div>
            <span className="eyebrow">TIME TRAVEL · 有效区间查询</span>
            <h3 id="scd-query-title">滑过升级节点，观察答案如何改变</h3>
          </div>
          <p>点击时间点或拖动滑块，时间会决定 JOIN 命中哪一行维度。</p>
        </div>
        <TimeMachine
          points={timelinePoints}
          monthLabels={monthLabels}
          selectedIndex={state.timelineIndex}
          onSelect={(timelineIndex) => setState((current) => ({ ...current, timelineIndex }))}
        />
        {selectedPoint ? (
          <TimeTravelResult
            point={selectedPoint}
            order={selectedOrder}
            version={selectedVersion}
            mode={state.mode}
          />
        ) : (
          <p className="scd__empty-state">暂无可查询的时间点。</p>
        )}
      </section>
    </div>
  )
}

export type { SlowlyChangingDimensionProps }
