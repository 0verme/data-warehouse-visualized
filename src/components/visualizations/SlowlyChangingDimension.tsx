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

interface ScdLabState {
  mode: ScdMode
  stage: ScdStage
  selectedOrderId: string
}

const stageLabels: Record<ScdStage, string> = {
  initial: '初始状态：普通会员',
  updated: '直接 UPDATE：历史已被覆盖',
  historical: 'SCD Type 2：两个有效版本并存',
}

function getChangeAttributes(visualization: ScdVisualization): ScdAttributeUpdate {
  return {
    ...(visualization.change.city !== undefined ? { city: visualization.change.city } : {}),
    ...(visualization.change.memberLevel !== undefined
      ? { memberLevel: visualization.change.memberLevel }
      : {}),
  }
}

function DimensionVersionTable({
  versions,
  showHistoryFields,
}: {
  versions: readonly ScdDimensionVersion[]
  showHistoryFields: boolean
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
          {versions.map((version) => (
            <tr key={`${version.userId}-${version.effectiveFrom}`}>
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
                    <span className={`scd__current-value${version.isCurrent ? ' is-current' : ''}`}>
                      {String(version.isCurrent)}
                    </span>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TimelineSwitcher({
  labels,
  changeAt,
  orders,
  selectedOrderId,
  onSelect,
}: {
  labels: readonly string[]
  changeAt: string
  orders: readonly ScdOrder[]
  selectedOrderId: string
  onSelect: (orderId: string) => void
}) {
  const changeMonth = changeAt.slice(0, 7)

  return (
    <div className="scd__timeline-area">
      <div className="scd__timeline-track" aria-hidden="true">
        {labels.map((label) => (
          <span
            className={`scd__timeline-point${label === changeMonth ? ' is-change' : ''}`}
            key={label}
          >
            <i />
            <strong>{label}</strong>
            {label === changeMonth && <b>升级</b>}
          </span>
        ))}
      </div>
      <div className="scd__order-switcher" role="tablist" aria-label="选择要查看的订单时间">
        {orders.map((order) => {
          const isSelected = order.id === selectedOrderId
          return (
            <button
              className={`scd__order-tab${isSelected ? ' is-selected' : ''}`}
              type="button"
              role="tab"
              id={`scd-order-tab-${order.id}`}
              aria-selected={isSelected}
              aria-controls="scd-order-result"
              onClick={() => onSelect(order.id)}
              key={order.id}
            >
              <span>{order.label}</span>
              <small>{order.orderTime}</small>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function OrderJoinResult({
  order,
  version,
  mode,
}: {
  order: ScdOrder
  version: ScdDimensionVersion | undefined
  mode: ScdMode
}) {
  const isType2 = mode === 'type2'

  return (
    <div className="scd__join-result" id="scd-order-result" role="tabpanel" aria-live="polite">
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
          {version ? (
            <>
              <strong>{version.memberLevel}</strong>
              <small>
                {isType2 ? `${version.effectiveFrom} 起的版本` : '表中唯一留下的当前版本'}
              </small>
            </>
          ) : (
            <>
              <strong>未找到版本</strong>
              <small>请检查有效时间区间</small>
            </>
          )}
        </article>
      </div>
      <code className="scd__join-rule">
        order_time &gt;= effective_from&nbsp;&nbsp;AND&nbsp;&nbsp;order_time &lt; effective_to
      </code>
    </div>
  )
}

export function SlowlyChangingDimension({ visualization }: SlowlyChangingDimensionProps) {
  const firstOrderId = visualization.orders[0]?.id ?? ''
  const [state, setState] = useState<ScdLabState>({
    mode: 'type1',
    stage: 'initial',
    selectedOrderId: firstOrderId,
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
  const selectedOrder =
    visualization.orders.find((order) => order.id === state.selectedOrderId) ??
    visualization.orders[0]
  const activeVersions = state.mode === 'type2' ? type2Versions : [type1Version]
  const selectedVersion = selectedOrder
    ? state.mode === 'type2'
      ? getDimensionVersionAt(type2Versions, selectedOrder.orderTime)
      : type1Version
    : undefined
  const hasUpdated = state.stage !== 'initial'
  const timelineLabels =
    visualization.timelineLabels ??
    [
      visualization.initialVersion.effectiveFrom.slice(0, 7),
      ...visualization.orders.map((order) => order.orderTime.slice(0, 7)),
      visualization.change.effectiveFrom.slice(0, 7),
    ].filter((label, index, labels) => labels.indexOf(label) === index)

  function resetExperiment() {
    setState({ mode: 'type1', stage: 'initial', selectedOrderId: firstOrderId })
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
          <span className="visualization-toolbar__label">SCD Type 2 维度历史实验</span>
          <p aria-live="polite">{stageLabels[state.stage]}</p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={resetExperiment}
        >
          重置实验
        </button>
      </div>

      <section className="scd__scenario" aria-labelledby="scd-scenario-title">
        <div className="scd__scenario-heading">
          <div>
            <span className="eyebrow">Stage 01 · 历史问题</span>
            <h3 id="scd-scenario-title">U1001 的会员等级发生了变化</h3>
          </div>
          <p>2026-03-01 升级为黄金会员，但历史订单仍然发生在过去。</p>
        </div>
        <div className="scd__change-strip">
          <article className="scd__state-card">
            <span>2026-01-01</span>
            <strong>普通会员</strong>
            <small>杭州 · U1001</small>
          </article>
          <div className="scd__change-arrow" aria-hidden="true">
            <span>2026-03-01</span>
            <strong>→</strong>
          </div>
          <article
            className={`scd__state-card scd__state-card--new${hasUpdated ? ' is-active' : ''}`}
          >
            <span>一次属性变化</span>
            <strong>黄金会员</strong>
            <small>用户升级</small>
          </article>
        </div>
      </section>

      <section className="scd__experiment" aria-labelledby="scd-experiment-title">
        <div className="scd__subheading">
          <div>
            <span className="eyebrow">Stage 02 · 先观察错误方案</span>
            <h3 id="scd-experiment-title">直接 UPDATE 会留下什么？</h3>
          </div>
          <p>{stageLabels[state.stage]}</p>
        </div>
        <div className="scd__actions">
          <button
            className="button button--primary button--small"
            type="button"
            onClick={updateUser}
            disabled={hasUpdated}
          >
            {hasUpdated ? '用户已升级为黄金会员' : '用户升级为黄金会员'}
          </button>
          <button
            className="button button--quiet button--small"
            type="button"
            onClick={useType2}
            disabled={!hasUpdated || state.mode === 'type2'}
          >
            使用 SCD Type 2
          </button>
          {state.mode === 'type2' && (
            <button
              className="button button--quiet button--small"
              type="button"
              onClick={reviewType1}
            >
              回看直接 UPDATE
            </button>
          )}
        </div>
        <div className="scd__version-layout">
          <div className="scd__version-copy">
            <span className="scd__version-label">
              {state.mode === 'type2' ? 'Type 2 · 保存历史版本' : 'Type 1 · 直接覆盖'}
            </span>
            <strong>
              {state.mode === 'type2' ? '两行记录，两个有效区间' : 'dim_user 只保留一行'}
            </strong>
            <p>
              {state.mode === 'type2'
                ? '旧版本在升级时结束，新版本从升级时刻开始生效。'
                : 'UPDATE member_level = “黄金会员” 后，普通会员这条历史状态不再存在。'}
            </p>
          </div>
          <DimensionVersionTable
            versions={activeVersions}
            showHistoryFields={state.mode === 'type2'}
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
              <span>点击“用户升级为黄金会员”，再查看 2026-02-10 的订单。</span>
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
              <span>同一个 user_id 有两个版本，查询时由订单时间命中当时有效的那一行。</span>
            </>
          )}
        </div>
      </section>

      <section className="scd__query" aria-labelledby="scd-query-title">
        <div className="scd__subheading">
          <div>
            <span className="eyebrow">Stage 03 · 时间点查询</span>
            <h3 id="scd-query-title">订单发生时，用户到底是什么状态？</h3>
          </div>
          <p>点击不同订单，观察同一个 U1001 如何命中不同维度版本。</p>
        </div>
        <TimelineSwitcher
          labels={timelineLabels}
          changeAt={visualization.change.effectiveFrom}
          orders={visualization.orders}
          selectedOrderId={state.selectedOrderId}
          onSelect={(selectedOrderId) => setState((current) => ({ ...current, selectedOrderId }))}
        />
        {selectedOrder ? (
          <OrderJoinResult order={selectedOrder} version={selectedVersion} mode={state.mode} />
        ) : (
          <p className="scd__empty-state">暂无可查询的订单。</p>
        )}
      </section>
    </div>
  )
}

export type { SlowlyChangingDimensionProps }
