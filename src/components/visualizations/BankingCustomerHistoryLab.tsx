import { useMemo, useState } from 'react'
import type {
  BankingCustomerHistoryVisualization,
  BankingCustomerTimelinePoint,
  BankingCustomerVersion,
} from '../../types'
import {
  applyCustomerType1Update,
  applyCustomerType2Update,
  getCustomerVersionAt,
} from '../../utils/customer-history'

interface BankingCustomerHistoryLabProps {
  visualization: BankingCustomerHistoryVisualization
}

type HistoryMode = 'type1' | 'type2'

function getVersionForPoint(
  point: BankingCustomerTimelinePoint | undefined,
  mode: HistoryMode,
  isUpdated: boolean,
  type1Version: BankingCustomerVersion,
  type2Versions: readonly BankingCustomerVersion[],
): BankingCustomerVersion | undefined {
  if (!point) {
    return undefined
  }

  if (mode === 'type2' && isUpdated) {
    return getCustomerVersionAt(type2Versions, point.date)
  }

  return type1Version
}

function VersionTable({
  versions,
  showHistoryFields,
  selectedVersion,
}: {
  versions: readonly BankingCustomerVersion[]
  showHistoryFields: boolean
  selectedVersion: BankingCustomerVersion | undefined
}) {
  return (
    <div className="banking-lab__table-wrap">
      <table className="banking-lab__table banking-history__version-table">
        <caption>
          {showHistoryFields ? 'Customer 拉链表版本' : 'Customer 覆盖更新后的当前行'}
        </caption>
        <thead>
          <tr>
            {showHistoryFields && (
              <th>
                <code>customer_sk</code>
              </th>
            )}
            <th>
              <code>customer_id</code>
            </th>
            <th>
              <code>level</code>
            </th>
            <th>
              <code>branch</code>
            </th>
            {showHistoryFields && (
              <>
                <th>
                  <code>start_date</code>
                </th>
                <th>
                  <code>end_date</code>
                </th>
                <th>
                  <code>is_current</code>
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => {
            const isSelected = selectedVersion?.customerSk === version.customerSk
            return (
              <tr className={isSelected ? 'is-selected' : undefined} key={version.customerSk}>
                {showHistoryFields && <td>{version.customerSk}</td>}
                <td>{version.customerId}</td>
                <td>
                  <strong>{version.level}</strong>
                </td>
                <td>{version.branch}</td>
                {showHistoryFields && (
                  <>
                    <td>{version.effectiveFrom}</td>
                    <td>{version.effectiveTo}</td>
                    <td>{String(version.isCurrent)}</td>
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

function HistoryScenario({
  visualization,
  isUpdated,
}: {
  visualization: BankingCustomerHistoryVisualization
  isUpdated: boolean
}) {
  const { initialVersion, change, loanNote } = visualization

  return (
    <section className="banking-history__scenario" aria-labelledby="banking-history-scenario-title">
      <div className="banking-history__section-heading">
        <div>
          <span className="eyebrow">THE HISTORY QUESTION · 历史问题</span>
          <h3 id="banking-history-scenario-title">客户今天的属性，能不能改写贷款的昨天？</h3>
        </div>
        <p>
          {change.effectiveFrom}，客户从{initialVersion.level}变为{change.level}。
        </p>
      </div>
      <div className="banking-history__change-strip">
        <article>
          <span>
            {initialVersion.effectiveFrom} → {change.effectiveFrom}
          </span>
          <strong>
            {initialVersion.level} · {initialVersion.branch}
          </strong>
          <small>customer_sk {initialVersion.customerSk}</small>
        </article>
        <div aria-hidden="true">
          <span>{change.effectiveFrom}</span>
          <strong>→</strong>
        </div>
        <article className={isUpdated ? 'is-active' : undefined}>
          <span>{change.effectiveFrom} → 现在</span>
          <strong>
            {change.level} · {change.branch}
          </strong>
          <small>customer_sk {change.customerSk}</small>
        </article>
      </div>
      <div className="banking-history__note-card">
        <span>历史 LoanNote</span>
        <strong>{loanNote.noteId}</strong>
        <p>
          {loanNote.disbursedDate} · {loanNote.customerId} · ¥
          {loanNote.disbursedPrincipal.toLocaleString('zh-CN')}
        </p>
      </div>
    </section>
  )
}

function VersionControls({
  mode,
  isUpdated,
  onUpdate,
  onSelectType1,
  onSelectType2,
}: {
  mode: HistoryMode
  isUpdated: boolean
  onUpdate: () => void
  onSelectType1: () => void
  onSelectType2: () => void
}) {
  return (
    <div className="banking-history__controls">
      <div className="banking-history__mode-switch" role="tablist" aria-label="选择维度历史策略">
        <button
          className={`banking-history__mode${mode === 'type1' ? ' is-selected' : ''}`}
          type="button"
          role="tab"
          aria-selected={mode === 'type1'}
          onClick={onSelectType1}
        >
          <span>TYPE 1</span>
          <strong>覆盖更新</strong>
          <small>覆盖更新（SCD Type 1）</small>
        </button>
        <button
          className={`banking-history__mode${mode === 'type2' ? ' is-selected' : ''}`}
          type="button"
          role="tab"
          aria-selected={mode === 'type2'}
          disabled={!isUpdated}
          onClick={onSelectType2}
        >
          <span>TYPE 2</span>
          <strong>拉链表</strong>
          <small>拉链表（SCD Type 2 / Slowly Changing Dimension Type 2）</small>
        </button>
      </div>
      <div className="banking-history__actions">
        <button
          className="button button--primary button--small"
          type="button"
          onClick={onUpdate}
          disabled={isUpdated}
        >
          {isUpdated ? '客户变更已写入' : '执行：升级为 VIP 并转入上海支行'}
        </button>
        {mode === 'type2' && (
          <button
            className="button button--quiet button--small"
            type="button"
            onClick={onSelectType1}
          >
            回看覆盖更新
          </button>
        )}
      </div>
    </div>
  )
}

function HistoryFeedback({ mode, isUpdated }: { mode: HistoryMode; isUpdated: boolean }) {
  if (!isUpdated) {
    return (
      <div className="banking-history__feedback">
        <strong>先写入一次属性变化</strong>
        <span>更新 Customer 后，把时间拨到 2025-10-10，查看历史 LoanNote 命中的客户状态。</span>
      </div>
    )
  }

  if (mode === 'type1') {
    return (
      <div className="banking-history__feedback banking-history__feedback--wrong" role="alert">
        <strong>覆盖更新丢失了历史语义</strong>
        <span>
          2025-10-10 的 N001 当时属于普通客户、杭州支行，但当前唯一一行已经显示为 VIP、上海支行。
        </span>
      </div>
    )
  }

  return (
    <div className="banking-history__feedback banking-history__feedback--correct" role="status">
      <strong>拉链表保留了历史版本</strong>
      <span>同一个 customer_id 保留多行版本，查询时间点时可以还原 N001 当时的客户等级和机构。</span>
    </div>
  )
}

function TimeMachine({
  points,
  selectedIndex,
  selectedPoint,
  onSelect,
}: {
  points: readonly BankingCustomerTimelinePoint[]
  selectedIndex: number
  selectedPoint: BankingCustomerTimelinePoint | undefined
  onSelect: (index: number) => void
}) {
  if (!selectedPoint) {
    return null
  }

  return (
    <div className="banking-history__timeline">
      <div className="banking-history__timeline-heading">
        <div>
          <span className="eyebrow">TIME TRAVEL · 时间点查询</span>
          <h4>把日期拨回去，查看 Customer 当时的属性</h4>
        </div>
        <div className="banking-history__readout" aria-live="polite">
          <span>当前日期</span>
          <strong>{selectedPoint.date}</strong>
          <small>{selectedPoint.detail}</small>
        </div>
      </div>
      <div className="banking-history__point-rail">
        {points.map((point, index) => (
          <button
            className={`banking-history__time-point banking-history__time-point--${point.kind}${index === selectedIndex ? ' is-selected' : ''}`}
            type="button"
            aria-current={index === selectedIndex ? 'step' : undefined}
            aria-label={`${point.label}，${point.date}，${point.detail}`}
            onClick={() => onSelect(index)}
            key={`${point.date}-${point.kind}`}
          >
            <i aria-hidden="true" />
            <strong>{point.label}</strong>
            <small>{point.date}</small>
          </button>
        ))}
      </div>
      <label className="banking-history__slider">
        <span>拖动时间滑块</span>
        <input
          type="range"
          min="0"
          max={Math.max(points.length - 1, 0)}
          step="1"
          value={selectedIndex}
          aria-label="拖动时间滑块查看客户历史属性"
          aria-valuetext={`${selectedPoint.date}，${selectedPoint.detail}`}
          onChange={(event) => onSelect(Number(event.target.value))}
        />
      </label>
    </div>
  )
}

function HistoryResult({
  point,
  version,
  loanNote,
  mode,
}: {
  point: BankingCustomerTimelinePoint
  version: BankingCustomerVersion | undefined
  loanNote: BankingCustomerHistoryVisualization['loanNote']
  mode: HistoryMode
}) {
  const isLoanPoint = point.kind === 'loan-note'

  return (
    <div className="banking-history__result" aria-live="polite">
      <div className="banking-history__result-heading">
        <div>
          <span className="eyebrow">AS-OF QUERY · 截止时间查询</span>
          <h4>{point.date} 的 Customer 版本</h4>
        </div>
        <span className={`banking-history__answer banking-history__answer--${mode}`}>
          {mode === 'type2' ? '按有效区间命中' : '读取当前唯一行'}
        </span>
      </div>
      <div className="banking-history__version-answer">
        <span>customer_id = {loanNote.customerId}</span>
        <strong>
          {version?.level ?? '没有匹配版本'} · {version?.branch ?? '—'}
        </strong>
        <small>
          {version
            ? `customer_sk ${version.customerSk} · ${version.effectiveFrom} ≤ t < ${version.effectiveTo}`
            : '请检查有效时间区间'}
        </small>
      </div>
      {isLoanPoint && (
        <div className="banking-history__join-result">
          <article>
            <span>LoanNote</span>
            <strong>{loanNote.noteId}</strong>
            <small>
              {loanNote.disbursedDate} · ¥{loanNote.disbursedPrincipal.toLocaleString('zh-CN')}
            </small>
          </article>
          <b aria-hidden="true">JOIN</b>
          <article>
            <span>Customer</span>
            <strong>{version?.level ?? '未命中'}</strong>
            <small>{version?.branch ?? '无历史版本'}</small>
          </article>
        </div>
      )}
    </div>
  )
}

export function BankingCustomerHistoryLab({ visualization }: BankingCustomerHistoryLabProps) {
  const [mode, setMode] = useState<HistoryMode>('type1')
  const [isUpdated, setIsUpdated] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(
      0,
      visualization.timeline.findIndex((point) => point.kind === 'loan-note'),
    ),
  )
  const type1Version = useMemo(
    () =>
      isUpdated
        ? applyCustomerType1Update(visualization.initialVersion, visualization.change)
        : visualization.initialVersion,
    [isUpdated, visualization.change, visualization.initialVersion],
  )
  const type2Versions = useMemo(
    () => applyCustomerType2Update([visualization.initialVersion], visualization.change),
    [visualization.change, visualization.initialVersion],
  )
  const selectedPoint = visualization.timeline[selectedIndex] ?? visualization.timeline[0]
  const selectedVersion = getVersionForPoint(
    selectedPoint,
    mode,
    isUpdated,
    type1Version,
    type2Versions,
  )
  const activeVersions = mode === 'type2' && isUpdated ? type2Versions : [type1Version]

  function reset() {
    setMode('type1')
    setIsUpdated(false)
    setSelectedIndex(
      Math.max(
        0,
        visualization.timeline.findIndex((point) => point.kind === 'loan-note'),
      ),
    )
  }

  function updateCustomer() {
    setIsUpdated(true)
    setMode('type1')
  }

  return (
    <div className={`banking-history-lab banking-history-lab--${mode}`}>
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">Customer 历史版本实验台</span>
          <p aria-live="polite">同一个 customer_id，是否需要保留多个属性版本？</p>
        </div>
        <button className="button button--quiet button--small" type="button" onClick={reset}>
          重置历史
        </button>
      </div>
      <HistoryScenario visualization={visualization} isUpdated={isUpdated} />
      <section
        className="banking-history__experiment"
        aria-labelledby="banking-history-experiment-title"
      >
        <div className="banking-history__section-heading">
          <div>
            <span className="eyebrow">HISTORY STRATEGY · 历史策略</span>
            <h3 id="banking-history-experiment-title">覆盖更新与拉链表，保留的答案不同</h3>
          </div>
          <p>先执行客户变更，再切换两种策略看历史 LoanNote 的结果。</p>
        </div>
        <VersionControls
          mode={mode}
          isUpdated={isUpdated}
          onUpdate={updateCustomer}
          onSelectType1={() => setMode('type1')}
          onSelectType2={() => {
            if (isUpdated) setMode('type2')
          }}
        />
        <div className="banking-history__version-layout">
          <div className="banking-history__version-copy">
            <span>{mode === 'type2' ? 'TYPE 2 · 拉链表' : 'TYPE 1 · 覆盖更新'}</span>
            <strong>
              {mode === 'type2' ? '关闭旧版本，再插入新版本' : 'Customer 只保留当前属性'}
            </strong>
            <p>
              {mode === 'type2'
                ? '旧版本在变更日结束，新版本从变更日开始生效，两个时间区间不重叠。'
                : '直接更新 level 和 branch 后，杭州支行与普通等级不再出现在当前行中。'}
            </p>
          </div>
          <VersionTable
            versions={activeVersions}
            showHistoryFields={mode === 'type2'}
            selectedVersion={selectedVersion}
          />
        </div>
        <div className="banking-history__key-note">
          <div>
            <span>稳定业务 identity</span>
            <strong>customer_id = {visualization.initialVersion.customerId}</strong>
          </div>
          <div>
            <span>历史版本 key</span>
            <strong>
              customer_sk = {visualization.initialVersion.customerSk} /{' '}
              {visualization.change.customerSk}
            </strong>
          </div>
          <p>customer_id 说明“是哪位客户”，customer_sk 说明“这位客户的哪一个历史版本”。</p>
        </div>
        <HistoryFeedback mode={mode} isUpdated={isUpdated} />
      </section>
      <section className="banking-history__query" aria-labelledby="banking-history-query-title">
        <div className="banking-history__section-heading">
          <div>
            <span className="eyebrow">AS-OF · 时间点查询</span>
            <h3 id="banking-history-query-title">分析 2025 年贷款时，客户当时是什么状态？</h3>
          </div>
          <p>点击时间点或拖动滑块，观察同一笔 LoanNote 命中哪个 Customer 版本。</p>
        </div>
        {selectedPoint ? (
          <>
            <TimeMachine
              points={visualization.timeline}
              selectedIndex={selectedIndex}
              selectedPoint={selectedPoint}
              onSelect={setSelectedIndex}
            />
            <HistoryResult
              point={selectedPoint}
              version={selectedVersion}
              loanNote={visualization.loanNote}
              mode={mode}
            />
          </>
        ) : (
          <p className="banking-history__empty">暂无可查询的时间点。</p>
        )}
      </section>
    </div>
  )
}

export type { BankingCustomerHistoryLabProps }
