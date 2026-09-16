import { useMemo, useState } from 'react'
import type {
  DailyCounterpartyRelation,
  FirstSeenRecord,
  PerformanceFirstSeenVisualization,
} from '../../features/performance/types'
import {
  applyFirstSeenState,
  buildCustomerDayFeature,
  buildDailyCounterpartyRelations,
} from '../../utils/performance'
import {
  ArrowSeparator,
  LayerMarker,
  PerformanceMetric,
  PerformanceMetricGrid,
  PerformancePanelHeading,
  SimulationNote,
} from './PerformanceLabShared'

function relationKey(relation: DailyCounterpartyRelation): string {
  return `${relation.businessDate}|${relation.customerId}|${relation.counterpartyId}`
}

function FirstSeenTable({
  rows,
  highlightKey,
}: {
  rows: readonly FirstSeenRecord[]
  highlightKey?: string
}) {
  return (
    <div className="performance-state__table-wrap">
      <table className="performance-state__table">
        <caption>customer_counterparty_first_seen · 当前状态</caption>
        <thead>
          <tr>
            <th scope="col">customer_id</th>
            <th scope="col">counterparty_id</th>
            <th scope="col">first_seen_date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = `${row.customerId}|${row.counterpartyId}`
            return (
              <tr className={key === highlightKey ? 'is-highlighted' : undefined} key={key}>
                <th scope="row">{row.customerId}</th>
                <td>{row.counterpartyId}</td>
                <td>{row.firstSeenDate}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RelationTable({
  rows,
  selectedKey,
  onSelect,
  evaluations,
}: {
  rows: readonly DailyCounterpartyRelation[]
  selectedKey: string
  onSelect: (key: string) => void
  evaluations: ReturnType<typeof applyFirstSeenState>['evaluations']
}) {
  return (
    <div className="performance-state__table-wrap">
      <table className="performance-state__table">
        <caption>当日交易对手关系 · business_date = 2026-09-16</caption>
        <thead>
          <tr>
            <th scope="col">business_date</th>
            <th scope="col">customer_id</th>
            <th scope="col">counterparty_id</th>
            <th scope="col">交易笔数</th>
            <th scope="col">first_seen 判断</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = relationKey(row)
            const evaluation = evaluations.find((item) => relationKey(item.relation) === key)
            const isSelected = key === selectedKey
            return (
              <tr className={isSelected ? 'is-selected' : undefined} key={key}>
                <td>{row.businessDate}</td>
                <th scope="row">{row.customerId}</th>
                <td>{row.counterpartyId}</td>
                <td>{row.transactionCount}</td>
                <td>
                  <button
                    className="performance-state__row-button"
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelect(key)}
                  >
                    {evaluation?.isFirstSeen ? '首次出现 · 写入' : '已存在 · 非首次'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function PerformanceStateLab({
  visualization,
}: {
  visualization: PerformanceFirstSeenVisualization
}) {
  const data = visualization.state
  const dailyRelations = useMemo(
    () => buildDailyCounterpartyRelations(data.todayTransactions),
    [data.todayTransactions],
  )
  const update = useMemo(
    () => applyFirstSeenState(data.existingFirstSeen, dailyRelations, data.todayBusinessDate),
    [data.existingFirstSeen, data.todayBusinessDate, dailyRelations],
  )
  const [selectedKey, setSelectedKey] = useState(() => relationKey(dailyRelations[0]!))
  const [isCommitted, setIsCommitted] = useState(false)
  const selectedEvaluation = update.evaluations.find(
    (item) => relationKey(item.relation) === selectedKey,
  )
  const stateRows = isCommitted ? update.state : data.existingFirstSeen
  const featureRows = data.featureRows.map((row) =>
    isCommitted
      ? buildCustomerDayFeature(
          stateRows,
          data.recent30DayRelations,
          row.customerId,
          row.businessDate,
        )
      : row,
  )
  const selectedRelation = selectedEvaluation?.relation
  const selectedStateKey = selectedRelation
    ? `${selectedRelation.customerId}|${selectedRelation.counterpartyId}`
    : undefined

  return (
    <div className="performance-lab performance-lab--state">
      <LayerMarker layer="business-semantics" />
      <SimulationNote text={visualization.simulationNote} />

      <section
        className="performance-state__problem"
        aria-labelledby="performance-state-problem-title"
      >
        <PerformancePanelHeading
          eyebrow="11-4 · 重新理解问题"
          title="“是否曾经出现”为什么每天都要翻完整历史？"
          description="业务真正要判断的是 customer_id + counterparty_id 过去是否出现过。这个判断可以由一份有业务含义的增量状态承接。"
          id="performance-state-problem-title"
        />
        <div className="performance-state__old-flow" aria-label="重复历史扫描方案">
          <div>
            <span>每天</span>
            <strong>扫描完整历史 Transaction</strong>
            <small>随着历史增长，读取范围不断变大</small>
          </div>
          <ArrowSeparator />
          <div>
            <span>重新构建</span>
            <strong>客户所有历史交易对手集合</strong>
            <small>反复计算已经知道的关系</small>
          </div>
          <ArrowSeparator />
          <div>
            <span>最后判断</span>
            <strong>是不是第一次出现</strong>
            <small>真正需要的状态只有一行关系</small>
          </div>
        </div>
        <div className="performance-state__semantic-note">
          <strong>counterparty_id 是分析标识 / 特征键</strong>
          <span>本章不新增 Counterparty Canonical Entity。</span>
        </div>
      </section>

      <section
        className="performance-state__relations"
        aria-labelledby="performance-relations-title"
      >
        <PerformancePanelHeading
          eyebrow="先收束 Transaction · 当日关系"
          title="先把交易事件压到当日 customer-counterparty 关系"
          description="同一天 A001 → B003 出现两笔 Transaction，但关系 Grain 只保留一行，并记录交易笔数作为教学提示。"
          id="performance-relations-title"
        />
        <RelationTable
          rows={dailyRelations}
          selectedKey={selectedKey}
          onSelect={(key) => {
            setSelectedKey(key)
            setIsCommitted(false)
          }}
          evaluations={update.evaluations}
        />
        <p className="performance-state__grain-line">
          Grain：<code>business_date × customer_id × counterparty_id</code>
        </p>
      </section>

      <section className="performance-state__update" aria-labelledby="performance-first-seen-title">
        <PerformancePanelHeading
          eyebrow="增量状态 · 业务语义层"
          title="选择今天的关系，判断是否需要写入 first_seen"
          description="状态表的行含义是 customer_id × counterparty_id；它不再保存每一笔 Transaction。"
          id="performance-first-seen-title"
        />
        <div className="performance-state__update-grid">
          <div>
            <span className="performance-state__subheading">当天关系</span>
            {selectedEvaluation ? (
              <div className="performance-state__selected-relation" aria-live="polite">
                <strong>
                  {selectedEvaluation.relation.customerId} →{' '}
                  {selectedEvaluation.relation.counterpartyId}
                </strong>
                <span>
                  {selectedEvaluation.relation.businessDate} ·{' '}
                  {selectedEvaluation.relation.transactionCount} 笔 Transaction
                </span>
                <b className={selectedEvaluation.isFirstSeen ? 'is-new' : 'is-known'}>
                  {selectedEvaluation.isFirstSeen
                    ? '状态中不存在：首次出现'
                    : '状态中已存在：非首次'}
                </b>
                <button
                  className="button button--primary button--small"
                  type="button"
                  onClick={() => setIsCommitted(true)}
                  disabled={isCommitted}
                >
                  {isCommitted ? '已写入本次状态' : '写入当日 first_seen 状态'}
                </button>
              </div>
            ) : (
              <p>从上面的关系表选择一行。</p>
            )}
          </div>
          <div>
            <span className="performance-state__subheading">
              {isCommitted ? '写入后' : '写入前'}状态表
            </span>
            <FirstSeenTable rows={stateRows} highlightKey={selectedStateKey} />
          </div>
        </div>
        {isCommitted && selectedEvaluation && (
          <p className="performance-state__commit-result" role="status">
            {selectedEvaluation.isFirstSeen
              ? `${selectedEvaluation.relation.customerId} | ${selectedEvaluation.relation.counterpartyId} | ${selectedEvaluation.relation.businessDate} 已写入 first_seen。`
              : '这条关系已经存在，不需要重复写入；状态保持原来的 first_seen_date。'}
          </p>
        )}
      </section>

      <section className="performance-state__features" aria-labelledby="performance-feature-title">
        <PerformancePanelHeading
          eyebrow="状态如何服务客户日特征"
          title="累计数、日关系和固定 30 天结果各自回答什么？"
          description="预计算可以减少重复读取，但每个结果仍要保留自己的 Grain。7 天、90 天可以采用同类固定窗口，本文不展开完整实现。"
          id="performance-feature-title"
        />
        <PerformanceMetricGrid>
          <PerformanceMetric
            label="历史累计交易对手数"
            value="customer_id × business_date"
            detail="读取 first_seen 截至该业务日的关系数"
          />
          <PerformanceMetric
            label="最近 30 天交易对手数"
            value="customer_id × business_date"
            detail="固定窗口：2026-08-18 → 2026-09-16"
          />
          <PerformanceMetric
            label="当前是否首次出现"
            value="customer_id × counterparty_id × business_date"
            detail="由当日关系和 first_seen 状态判断"
          />
        </PerformanceMetricGrid>
        <div className="performance-state__feature-table-wrap">
          <table className="performance-state__table">
            <caption>客户日特征 · 业务日期 = 2026-09-16</caption>
            <thead>
              <tr>
                <th scope="col">customer_id</th>
                <th scope="col">business_date</th>
                <th scope="col">历史累计交易对手数</th>
                <th scope="col">最近 30 天交易对手数</th>
              </tr>
            </thead>
            <tbody>
              {featureRows.map((row) => (
                <tr key={`${row.customerId}|${row.businessDate}`}>
                  <th scope="row">{row.customerId}</th>
                  <td>{row.businessDate}</td>
                  <td>{row.historicalCounterpartyCount}</td>
                  <td>{row.recent30DayCounterpartyCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="performance-state__grains" aria-labelledby="performance-grain-title">
        <PerformancePanelHeading
          eyebrow="Grain check"
          title="不要把四种结果混成一张语义模糊的表"
          description="同一个客户日可以同时消费关系事实和状态结果，但它们的行含义、更新方式和使用问题不同。"
          id="performance-grain-title"
        />
        <div className="performance-state__grain-grid">
          {data.grainNotes.map((note) => (
            <article key={note.label}>
              <span>{note.label}</span>
              <strong>{note.value}</strong>
              <p>{note.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
