import { useMemo, useState } from 'react'
import type {
  BankingCustomerHistoryVisualization,
  BankingCustomerTimelinePoint,
  BankingCustomerVersion,
} from '../../types'
import {
  addCustomerDays,
  applyCustomerType1Update,
  applyCustomerType2Update,
  diffCustomerDays,
  getCustomerHistoryCursorView,
  getCustomerVersionAt,
} from '../../utils/customer-history'
import type { CustomerHistoryCursorView } from '../../utils/customer-history'

interface BankingCustomerHistoryLabProps {
  visualization: BankingCustomerHistoryVisualization
}

type HistoryMode = 'type1' | 'type2'

function getDefaultCursorIndex(visualization: BankingCustomerHistoryVisualization): number {
  const loanNotePoint = visualization.timeline.find((point) => point.kind === 'loan-note')
  const anchorDate = loanNotePoint?.date ?? visualization.loanNote.disbursedDate

  return Math.max(0, diffCustomerDays(visualization.initialVersion.effectiveFrom, anchorDate))
}

function formatRatio(ratio: number): string {
  return `${(ratio * 100).toFixed(4)}%`
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
        <caption className="sr-only">
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

function HistoryFeedback({
  mode,
  isUpdated,
  view,
}: {
  mode: HistoryMode
  isUpdated: boolean
  view: CustomerHistoryCursorView
}) {
  if (!isUpdated) {
    return (
      <div className="banking-history__feedback">
        <strong>先写入一次属性变化</strong>
        <span>
          更新 Customer 后，把业务日期游标停在 2025-10-10，查看历史 LoanNote 命中的客户状态； 再移到{' '}
          {view.boundaryDayBefore} 和 {view.boundaryDate} 观察版本边界。
        </span>
      </div>
    )
  }

  if (mode === 'type1') {
    return (
      <div className="banking-history__feedback banking-history__feedback--wrong" role="alert">
        <strong>覆盖更新丢失了历史语义</strong>
        <span>
          2025-10-10 的 N001 当时属于普通客户、杭州支行，但覆盖更新后整段时间都返回 VIP、上海支行——
          把游标移到 {view.boundaryDayBefore} 和 {view.boundaryDate}，命中结果不会变化。
        </span>
      </div>
    )
  }

  return (
    <div className="banking-history__feedback banking-history__feedback--correct" role="status">
      <strong>拉链表保留了历史版本</strong>
      <span>
        同一个 customer_id 保留多行版本。把游标停在 {view.boundaryDayBefore} 命中 customer_sk{' '}
        {view.bars[0]?.version.customerSk}，移到 {view.boundaryDate} 就切换为 customer_sk{' '}
        {view.bars[1]?.version.customerSk ?? view.bars[0]?.version.customerSk}。
      </span>
    </div>
  )
}

function VersionIntervalRail({
  view,
  mode,
}: {
  view: CustomerHistoryCursorView
  mode: HistoryMode
}) {
  const isTypeTwo = mode === 'type2'
  const boundaryRatio = diffCustomerDays(view.windowStart, view.boundaryDate) / view.totalDays
  const cursorRatio = diffCustomerDays(view.windowStart, view.cursorDate) / view.totalDays

  return (
    <div className="banking-history__intervals">
      <div className="banking-history__interval-heading">
        <span className="eyebrow">VERSION INTERVALS · 版本有效区间</span>
        <h4>每个版本都是半开区间 [start_date, end_date)</h4>
        <p>
          {`start 包含（≤），end 不包含（<）；变更日 ${view.boundaryDate} 只属于新版本。`}
          {isTypeTwo
            ? '两段区间不重叠，所以同一个业务日期只会命中一个版本。'
            : ' Type 1 没有版本边界：只有一行覆盖更新，整段时间都返回同一行当前属性。'}
        </p>
      </div>
      <div className="banking-history__interval-axis">
        <span className="banking-history__interval-axis-spacer" aria-hidden="true" />
        <div className="banking-history__interval-axis-track">
          <span>{view.windowStart}</span>
          <span>{view.windowEnd}（视图窗口）</span>
        </div>
      </div>
      <ol className="banking-history__interval-list" aria-label="Customer 版本有效区间">
        {view.bars.map((bar) => (
          <li
            className={`banking-history__interval-row${bar.isActive ? ' is-active' : ''}`}
            data-state={bar.isActive ? 'active' : 'inactive'}
            key={bar.version.customerSk}
          >
            <div className="banking-history__interval-label">
              <strong>v{bar.ordinal}</strong>
              <code>customer_sk {bar.version.customerSk}</code>
              <span className="banking-history__interval-badge">
                {bar.isActive ? '当前命中' : '未命中'}
              </span>
            </div>
            <div className="banking-history__interval-track">
              <span
                className="banking-history__interval-span"
                data-open-end={bar.isOpenEnd ? 'true' : undefined}
                style={{
                  left: formatRatio(bar.startRatio),
                  width: formatRatio(bar.endRatio - bar.startRatio),
                }}
                aria-hidden="true"
              />
              <span
                className="banking-history__interval-boundary"
                style={{ left: formatRatio(boundaryRatio) }}
                aria-hidden="true"
              />
              <span
                className="banking-history__interval-cursor"
                style={{ left: formatRatio(cursorRatio) }}
                aria-hidden="true"
              />
            </div>
            <p className="banking-history__interval-range">
              <code>
                {bar.version.effectiveFrom} ≤ t &lt; {bar.version.effectiveTo}
              </code>
              <span>
                {bar.version.level} · {bar.version.branch}
                {bar.isOpenEnd ? ' · 开放结束' : ''}
              </span>
            </p>
          </li>
        ))}
      </ol>
      <div className="banking-history__interval-legend">
        <span>
          <i
            className="banking-history__interval-legend-mark banking-history__interval-legend-mark--cursor"
            aria-hidden="true"
          />
          业务日期游标 {view.cursorDate}
        </span>
        <span>
          <i
            className="banking-history__interval-legend-mark banking-history__interval-legend-mark--boundary"
            aria-hidden="true"
          />
          {isTypeTwo ? '版本边界' : '变更发生日'} {view.boundaryDate}
        </span>
      </div>
    </div>
  )
}

function BoundaryZoom({
  view,
  versions,
  mode,
}: {
  view: CustomerHistoryCursorView
  versions: readonly BankingCustomerVersion[]
  mode: HistoryMode
}) {
  const dates = [
    addCustomerDays(view.boundaryDate, -2),
    view.boundaryDayBefore,
    view.boundaryDate,
    addCustomerDays(view.boundaryDate, 1),
  ]

  return (
    <div className="banking-history__boundary-zoom">
      <div className="banking-history__boundary-zoom-heading">
        <span className="eyebrow">BOUNDARY ZOOM · 边界放大</span>
        <p>
          {mode === 'type2'
            ? `${view.boundaryDayBefore} 仍命中旧版本，${view.boundaryDate} 起命中新版本——因为 end_date 不包含变更日。`
            : `Type 1 没有版本边界：这 4 天都返回同一行当前属性。`}
        </p>
      </div>
      <ol className="banking-history__boundary-days">
        {dates.map((date) => {
          const hit = getCustomerVersionAt(versions, date)
          const ordinal = hit
            ? versions.findIndex((item) => item.customerSk === hit.customerSk) + 1
            : 0
          const isCursor = date === view.cursorDate

          return (
            <li
              className={`banking-history__boundary-day${isCursor ? ' is-cursor' : ''}`}
              data-state={isCursor ? 'cursor' : 'idle'}
              key={date}
            >
              <span>{date}</span>
              <strong>{hit ? `v${ordinal} · customer_sk ${hit.customerSk}` : '未命中'}</strong>
              <small>{hit ? `${hit.level} · ${hit.branch}` : '—'}</small>
              <em className="banking-history__boundary-day-flag">{isCursor ? '游标在此' : ''}</em>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function DateCursorControls({
  view,
  points,
  onSelectIndex,
  onSelectDate,
}: {
  view: CustomerHistoryCursorView
  points: readonly BankingCustomerTimelinePoint[]
  onSelectIndex: (index: number) => void
  onSelectDate: (date: string) => void
}) {
  const cursorIndex = diffCustomerDays(view.windowStart, view.cursorDate)

  return (
    <>
      <div className="banking-history__cursor-controls">
        <label className="banking-history__slider">
          <span>业务日期游标（日粒度）</span>
          <input
            type="range"
            min="0"
            max={view.totalDays}
            step="1"
            value={cursorIndex}
            aria-label="业务日期游标"
            aria-valuetext={
              view.hit
                ? `${view.cursorDate}，命中 customer_sk ${view.hit.customerSk}，${view.hit.level}，${view.hit.branch}`
                : `${view.cursorDate}，没有命中任何版本`
            }
            onChange={(event) => onSelectIndex(Number(event.target.value))}
          />
        </label>
        <div
          className="banking-history__cursor-steps"
          role="group"
          aria-label="按天移动业务日期游标"
        >
          <button
            className="button button--quiet button--small"
            type="button"
            disabled={view.cursorDate === view.windowStart}
            onClick={() => onSelectDate(addCustomerDays(view.cursorDate, -1))}
          >
            前一天
          </button>
          <button
            className="button button--quiet button--small"
            type="button"
            disabled={view.cursorDate === view.windowEnd}
            onClick={() => onSelectDate(addCustomerDays(view.cursorDate, 1))}
          >
            后一天
          </button>
        </div>
      </div>
      <div className="banking-history__cursor-presets">
        <div
          className="banking-history__cursor-preset-group"
          role="group"
          aria-label="版本边界对照日期"
        >
          <span>边界对照</span>
          <button
            className={`banking-history__preset${view.cursorDate === view.boundaryDayBefore ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={view.cursorDate === view.boundaryDayBefore}
            onClick={() => onSelectDate(view.boundaryDayBefore)}
          >
            {view.boundaryDayBefore} · 旧版本
          </button>
          <button
            className={`banking-history__preset${view.cursorDate === view.boundaryDate ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={view.cursorDate === view.boundaryDate}
            onClick={() => onSelectDate(view.boundaryDate)}
          >
            {view.boundaryDate} · 新版本
          </button>
        </div>
        <div
          className="banking-history__cursor-preset-group"
          role="group"
          aria-label="事件日期快捷跳转"
        >
          <span>事件锚点</span>
          {points.map((point) => {
            const isSelected = point.date === view.cursorDate

            return (
              <button
                className={`banking-history__preset banking-history__preset--${point.kind}${isSelected ? ' is-selected' : ''}`}
                type="button"
                aria-pressed={isSelected}
                title={`${point.detail}（${point.date}）`}
                onClick={() => onSelectIndex(diffCustomerDays(view.windowStart, point.date))}
                key={`${point.date}-${point.kind}`}
              >
                {point.label} · {point.date}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

function HistoryResult({
  view,
  loanNote,
  mode,
}: {
  view: CustomerHistoryCursorView
  loanNote: BankingCustomerHistoryVisualization['loanNote']
  mode: HistoryMode
}) {
  const version = view.hit
  const isActualLoanDate = view.cursorDate === loanNote.disbursedDate

  return (
    <div className="banking-history__result">
      <div className="banking-history__result-heading">
        <div>
          <span className="eyebrow">AS-OF QUERY · 截止时间查询</span>
          <h4>业务日期 t = {view.cursorDate} 时的 Customer 版本</h4>
        </div>
        <span className={`banking-history__answer banking-history__answer--${mode}`}>
          {mode === 'type2' ? '按 [start_date, end_date) 命中' : '读取当前唯一行'}
        </span>
      </div>
      <div className="banking-history__version-answer">
        <span>customer_id = {loanNote.customerId}</span>
        <strong
          className="banking-history__switch-indicator"
          key={`${mode}-${version?.customerSk ?? 'none'}`}
        >
          {version
            ? `customer_sk ${version.customerSk} · ${version.level} · ${version.branch}`
            : '没有匹配版本'}
        </strong>
        <small>
          {version
            ? `${version.effectiveFrom} ≤ t < ${version.effectiveTo}（${version.isCurrent ? '当前版本' : '历史版本'}）`
            : '请检查有效时间区间'}
        </small>
      </div>
      <div className="banking-history__join-result">
        <article>
          <span>LoanNote</span>
          <strong>{loanNote.noteId}</strong>
          <small>
            {loanNote.disbursedDate} · ¥{loanNote.disbursedPrincipal.toLocaleString('zh-CN')}
          </small>
        </article>
        <b aria-hidden="true">JOIN</b>
        <article data-state={version ? 'hit' : 'miss'}>
          <span>Customer</span>
          <strong>{version ? `${version.level} · ${version.branch}` : '未命中'}</strong>
          <small>{version ? `customer_sk ${version.customerSk}` : '无历史版本'}</small>
        </article>
      </div>
      <p className="banking-history__result-note">
        {isActualLoanDate
          ? `N001 的实际放款日就是 ${loanNote.disbursedDate}，这是真实的历史查询。`
          : `N001 的实际放款日是 ${loanNote.disbursedDate}；这里把业务日期改成 ${view.cursorDate}，用来对照同一个 [start_date, end_date) 会命中哪一版。`}
      </p>
    </div>
  )
}

export function BankingCustomerHistoryLab({ visualization }: BankingCustomerHistoryLabProps) {
  const [mode, setMode] = useState<HistoryMode>('type1')
  const [isUpdated, setIsUpdated] = useState(false)
  const [cursorIndex, setCursorIndex] = useState(() => getDefaultCursorIndex(visualization))
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
  const activeVersions = useMemo(
    () => (mode === 'type2' && isUpdated ? type2Versions : [type1Version]),
    [isUpdated, mode, type1Version, type2Versions],
  )
  const cursorView = useMemo(
    () => getCustomerHistoryCursorView(visualization, activeVersions, cursorIndex),
    [activeVersions, cursorIndex, visualization],
  )

  function selectIndex(index: number) {
    setCursorIndex(Math.min(Math.max(Math.trunc(index), 0), cursorView.totalDays))
  }

  function selectDate(date: string) {
    selectIndex(diffCustomerDays(cursorView.windowStart, date))
  }

  function reset() {
    setMode('type1')
    setIsUpdated(false)
    setCursorIndex(getDefaultCursorIndex(visualization))
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
            selectedVersion={cursorView.hit}
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
        <HistoryFeedback mode={mode} isUpdated={isUpdated} view={cursorView} />
      </section>
      <section className="banking-history__query" aria-labelledby="banking-history-query-title">
        <div className="banking-history__section-heading">
          <div>
            <span className="eyebrow">AS-OF · 时间点查询</span>
            <h3 id="banking-history-query-title">
              同一个 N001，在不同业务日期命中哪个 Customer 版本？
            </h3>
          </div>
          <p>
            把业务日期游标停在任意一天，观察 [start_date, end_date) 如何决定命中的 customer_sk
            与历史属性。
          </p>
        </div>
        <div className="banking-history__timeline">
          <div className="banking-history__timeline-heading">
            <div>
              <span className="eyebrow">DATE CURSOR · 日期游标</span>
              <h4>拖动游标，跨过 {cursorView.boundaryDate} 观察版本切换</h4>
            </div>
            <div className="banking-history__readout" role="status" aria-live="polite">
              <span>业务日期 t</span>
              <strong>{cursorView.cursorDate}</strong>
              <small>
                {cursorView.hit
                  ? `命中 customer_sk ${cursorView.hit.customerSk} · ${cursorView.hit.level} · ${cursorView.hit.branch}`
                  : '没有命中任何版本'}
              </small>
            </div>
          </div>
          <VersionIntervalRail view={cursorView} mode={mode} />
          <DateCursorControls
            view={cursorView}
            points={visualization.timeline}
            onSelectIndex={selectIndex}
            onSelectDate={selectDate}
          />
          <BoundaryZoom view={cursorView} versions={activeVersions} mode={mode} />
        </div>
        <HistoryResult view={cursorView} loanNote={visualization.loanNote} mode={mode} />
      </section>
    </div>
  )
}

export type { BankingCustomerHistoryLabProps }
