import { useMemo, useState } from 'react'
import type {
  BankingMetricAccountSnapshot,
  BankingMetricBalanceFilter,
  BankingMetricCustomerScope,
  BankingMetricDefinition,
  BankingMetricDefinitionStage,
  BankingMetricDerivationVisualization,
  BankingMetricProduct,
  BankingMetricScopeScenario,
  BankingMetricScopeVisualization,
  BankingMetricTimeMode,
  BankingMetricTimeVisualization,
} from '../../types'
import {
  calculateBankingMetric,
  calculateBankingMetricTime,
  formatBankingMetricYi,
  formatBankingMetricYuan,
  getBankingMetricBranchLabel,
  getBankingMetricCustomerLabel,
  getBankingMetricDefinition,
  getBankingMetricProductLabel,
} from '../../utils/banking-metrics'

function AccountSnapshotTable({
  rows,
  caption,
}: {
  rows: readonly BankingMetricAccountSnapshot[]
  caption: string
}) {
  return (
    <div className="banking-lab__table-wrap">
      <table className="banking-lab__table banking-metric__account-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">账户</th>
            <th scope="col">客户口径</th>
            <th scope="col">产品</th>
            <th scope="col">机构</th>
            <th scope="col">快照日</th>
            <th scope="col">余额</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.accountId}-${row.snapshotDate}`}>
              <th scope="row">
                <code>{row.accountId}</code>
              </th>
              <td>{getBankingMetricCustomerLabel(row.customerScope)}</td>
              <td>{getBankingMetricProductLabel(row.product)}</td>
              <td>{getBankingMetricBranchLabel(row.branch)}</td>
              <td>{row.snapshotDate}</td>
              <td>{formatBankingMetricYi(row.balance, row.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ScopeScenarioCard({
  scenario,
  total,
  isSelected,
  onSelect,
}: {
  scenario: BankingMetricScopeScenario
  total: number
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      className={`banking-metric-scope__scenario${isSelected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(scenario.id)}
    >
      <span className="banking-metric-scope__scenario-label">{scenario.label}</span>
      <strong>{scenario.title}</strong>
      <b>{formatBankingMetricYi(total, scenario.filter.currency)}</b>
      <small>{scenario.description}</small>
    </button>
  )
}

function ScopeDetails({ scenario }: { scenario: BankingMetricScopeScenario }) {
  const excludedProducts = scenario.filter.excludedProducts ?? []
  const productScope =
    scenario.filter.productScope === 'all'
      ? '全部存款产品'
      : `${getBankingMetricProductLabel(scenario.filter.productScope)}存款`
  const exclusions =
    excludedProducts.length > 0
      ? `；排除 ${excludedProducts.map((product) => getBankingMetricProductLabel(product)).join('、')}`
      : ''

  return (
    <dl className="banking-metric-scope__details">
      <div>
        <dt>统计日期</dt>
        <dd>{scenario.filter.snapshotDate}</dd>
      </div>
      <div>
        <dt>客户范围</dt>
        <dd>{getBankingMetricCustomerLabel(scenario.filter.customerScope)}</dd>
      </div>
      <div>
        <dt>产品范围</dt>
        <dd>
          {productScope}
          {exclusions}
        </dd>
      </div>
      <div>
        <dt>机构范围</dt>
        <dd>{getBankingMetricBranchLabel(scenario.filter.branch)}</dd>
      </div>
      <div>
        <dt>币种</dt>
        <dd>{scenario.filter.currency === 'CNY' ? 'CNY（人民币）' : scenario.filter.currency}</dd>
      </div>
      <div>
        <dt>输入 Grain</dt>
        <dd>Account × snapshot_date</dd>
      </div>
    </dl>
  )
}

export function BankingMetricScopeLab({
  visualization,
}: {
  visualization: BankingMetricScopeVisualization
}) {
  const [selectedId, setSelectedId] = useState(visualization.scenarios[0]?.id ?? '')
  const selectedScenario =
    visualization.scenarios.find((scenario) => scenario.id === selectedId) ??
    visualization.scenarios[0]
  const calculation = useMemo(
    () =>
      selectedScenario
        ? calculateBankingMetric(visualization.snapshots, selectedScenario.filter)
        : { total: 0, rows: [] },
    [selectedScenario, visualization.snapshots],
  )

  if (!selectedScenario) {
    return null
  }

  return (
    <div className="banking-metric-lab banking-metric-scope-lab">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">存款余额 · 统计集合对比</span>
          <p aria-live="polite">
            当前：{selectedScenario.title} · {calculation.rows.length} 个账户快照参与计算
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => setSelectedId(visualization.scenarios[0]?.id ?? '')}
        >
          重置对比
        </button>
      </div>

      <section className="banking-metric-scope__chooser" aria-labelledby="metric-scope-title">
        <div className="banking-metric__section-heading">
          <div>
            <span className="eyebrow">THREE ANSWERS · 三组口径</span>
            <h3 id="metric-scope-title">结果不同，先看谁进入了统计集合</h3>
          </div>
          <p>每张卡只改变少量业务条件，点击后查看账户快照和口径说明。</p>
        </div>
        <div className="banking-metric-scope__scenario-grid">
          {visualization.scenarios.map((scenario) => {
            const result = calculateBankingMetric(visualization.snapshots, scenario.filter)
            return (
              <ScopeScenarioCard
                key={scenario.id}
                scenario={scenario}
                total={result.total}
                isSelected={scenario.id === selectedScenario.id}
                onSelect={setSelectedId}
              />
            )
          })}
        </div>
      </section>

      <section className="banking-metric-scope__selected" aria-live="polite">
        <div className="banking-metric__section-heading">
          <div>
            <span className="eyebrow eyebrow--small">当前口径 · {selectedScenario.label}</span>
            <h3>{selectedScenario.title}</h3>
          </div>
          <strong className="banking-metric__big-value">
            {formatBankingMetricYi(calculation.total, selectedScenario.filter.currency)}
          </strong>
        </div>
        <ScopeDetails scenario={selectedScenario} />
        <AccountSnapshotTable
          rows={calculation.rows}
          caption={`${selectedScenario.title}参与统计的账户快照`}
        />
      </section>

      <div className="banking-metric-scope__other-differences">
        <span className="eyebrow eyebrow--small">还要核对什么？</span>
        <div>
          <span>客户：全部 / 个人 / 对公 / 小微口径</span>
          <span>产品：活期 / 定期 / 协定 / 保证金</span>
          <span>机构、币种和统计日期</span>
        </div>
      </div>
    </div>
  )
}

const definitionFields: Array<[keyof BankingMetricDefinition, string]> = [
  ['name', '指标名称'],
  ['businessMeaning', '业务含义'],
  ['statisticTime', '统计时间'],
  ['subject', '统计对象'],
  ['measure', '度量'],
  ['customerScope', '客户口径'],
  ['productScope', '产品口径'],
  ['branch', '机构范围'],
  ['currency', '币种'],
  ['unit', '单位'],
  ['requiredFilters', '必要过滤条件'],
  ['grain', '底层 Grain'],
]

function DefinitionCard({ definition }: { definition: BankingMetricDefinition }) {
  return (
    <article className="banking-metric-definition__card" aria-live="polite">
      <div className="banking-metric-definition__card-heading">
        <div>
          <span className="eyebrow eyebrow--small">当前指标定义</span>
          <h4>{definition.name}</h4>
        </div>
        <span>可复述 / 可复算</span>
      </div>
      <dl>
        {definitionFields.map(([key, label]) => {
          const value = definition[key]
          const isPending = value === '待补充'
          return (
            <div className={isPending ? 'is-pending' : ''} key={key}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          )
        })}
      </dl>
    </article>
  )
}

function DefinitionStageRail({
  stages,
  selectedId,
  onSelect,
}: {
  stages: readonly BankingMetricDefinitionStage[]
  selectedId: string
  onSelect: (id: BankingMetricDefinitionStage['id']) => void
}) {
  return (
    <div
      className="banking-metric-definition__stage-grid"
      role="tablist"
      aria-label="指标定义补全阶段"
    >
      {stages.map((stage, index) => {
        const isSelected = stage.id === selectedId
        return (
          <button
            className={`banking-metric-definition__stage${isSelected ? ' is-selected' : ''}`}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls="banking-metric-definition-panel"
            onClick={() => onSelect(stage.id)}
            key={stage.id}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{stage.label}</strong>
            <small>{stage.description}</small>
          </button>
        )
      })}
    </div>
  )
}

export function BankingMetricDefinitionLab({
  visualization,
}: {
  visualization: { kind: 'banking-metric-definition'; stages: BankingMetricDefinitionStage[] }
}) {
  const [selectedId, setSelectedId] = useState<BankingMetricDefinitionStage['id']>(
    visualization.stages[0]?.id ?? 'name-only',
  )
  const selectedStage =
    visualization.stages.find((stage) => stage.id === selectedId) ?? visualization.stages[0]

  if (!selectedStage) {
    return null
  }

  return (
    <div className="banking-metric-lab banking-metric-definition-lab">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">指标定义卡 · 逐项补全</span>
          <p aria-live="polite">当前：{selectedStage.label}</p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => setSelectedId(visualization.stages[0]?.id ?? 'name-only')}
        >
          重置定义
        </button>
      </div>
      <DefinitionStageRail
        stages={visualization.stages}
        selectedId={selectedStage.id}
        onSelect={setSelectedId}
      />
      <section
        className="banking-metric-definition__panel"
        id="banking-metric-definition-panel"
        role="tabpanel"
      >
        <div className="banking-metric__section-heading">
          <div>
            <span className="eyebrow">STEP · {selectedStage.label}</span>
            <h3>这张卡还缺哪些业务条件？</h3>
          </div>
          <p>{selectedStage.description}</p>
        </div>
        <DefinitionCard definition={selectedStage.definition} />
      </section>
    </div>
  )
}

function TimeModeCard({
  mode,
  isSelected,
  title,
  detail,
  onSelect,
}: {
  mode: BankingMetricTimeMode
  isSelected: boolean
  title: string
  detail: string
  onSelect: (mode: BankingMetricTimeMode) => void
}) {
  return (
    <button
      className={`banking-metric-time__mode${isSelected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(mode)}
    >
      <span>{mode === 'as-of' ? '01' : '02'}</span>
      <strong>{title}</strong>
      <small>{detail}</small>
    </button>
  )
}

function TimeRail({ visualization }: { visualization: BankingMetricTimeVisualization }) {
  const dates = Array.from(
    new Set([
      ...visualization.transactions.map((transaction) => transaction.eventDate),
      visualization.asOfDate,
    ]),
  ).sort()

  return (
    <div className="banking-metric-time__rail" aria-label="存款余额与交易时间轴">
      {dates.map((date) => (
        <div className="banking-metric-time__rail-point" key={date}>
          <i aria-hidden="true" />
          <strong>{date}</strong>
          <small>{date === visualization.asOfDate ? '状态快照' : '交易事件'}</small>
        </div>
      ))}
    </div>
  )
}

function TimeRowsTable({
  visualization,
  mode,
}: {
  visualization: BankingMetricTimeVisualization
  mode: BankingMetricTimeMode
}) {
  if (mode === 'as-of') {
    return (
      <div className="banking-lab__table-wrap">
        <table className="banking-lab__table banking-metric__time-table">
          <caption>截至某天的账户余额快照</caption>
          <thead>
            <tr>
              <th scope="col">快照日</th>
              <th scope="col">账户</th>
              <th scope="col">余额</th>
            </tr>
          </thead>
          <tbody>
            {visualization.snapshots.map((row) => (
              <tr key={`${row.accountId}-${row.snapshotDate}`}>
                <td>{row.snapshotDate}</td>
                <th scope="row">
                  <code>{row.accountId}</code>
                </th>
                <td>{formatBankingMetricYuan(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="banking-lab__table-wrap">
      <table className="banking-lab__table banking-metric__time-table">
        <caption>期间内的账户交易事件</caption>
        <thead>
          <tr>
            <th scope="col">事件日</th>
            <th scope="col">交易</th>
            <th scope="col">账户</th>
            <th scope="col">事件类型</th>
            <th scope="col">金额</th>
          </tr>
        </thead>
        <tbody>
          {visualization.transactions.map((row) => (
            <tr
              className={row.type === 'deposit' ? 'is-included' : 'is-excluded'}
              key={row.transactionId}
            >
              <td>{row.eventDate}</td>
              <th scope="row">
                <code>{row.transactionId}</code>
              </th>
              <td>{row.accountId}</td>
              <td>{row.type === 'deposit' ? '存入 · 纳入' : '取款 · 不纳入'}</td>
              <td>{formatBankingMetricYuan(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function BankingMetricTimeLab({
  visualization,
}: {
  visualization: BankingMetricTimeVisualization
}) {
  const [mode, setMode] = useState<BankingMetricTimeMode>('as-of')
  const calculation = useMemo(
    () => calculateBankingMetricTime(visualization, mode),
    [mode, visualization],
  )

  return (
    <div className="banking-metric-lab banking-metric-time-lab">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">存款余额 · 时间语义对照</span>
          <p aria-live="polite">当前：{calculation.factType}</p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => setMode('as-of')}
        >
          重置时间问题
        </button>
      </div>
      <section className="banking-metric-time__chooser" aria-labelledby="metric-time-title">
        <div className="banking-metric__section-heading">
          <div>
            <span className="eyebrow">POINT OR PERIOD · 时间问题</span>
            <h3 id="metric-time-title">你要回答哪一个问题？</h3>
          </div>
          <p>先选业务问题，再查看对应的事实形态和时间字段。</p>
        </div>
        <div className="banking-metric-time__mode-grid">
          <TimeModeCard
            mode="as-of"
            isSelected={mode === 'as-of'}
            title="截至某天的存款余额"
            detail={`截至 ${visualization.asOfDate} · 某个时间点的状态`}
            onSelect={setMode}
          />
          <TimeModeCard
            mode="period"
            isSelected={mode === 'period'}
            title="9 月累计存入金额"
            detail={`${visualization.periodStart} ~ ${visualization.periodEnd} · 期间事件累计`}
            onSelect={setMode}
          />
        </div>
      </section>
      <TimeRail visualization={visualization} />
      <section className="banking-metric-time__result" aria-live="polite">
        <div className="banking-metric-time__result-heading">
          <div>
            <span className="eyebrow eyebrow--small">当前结果</span>
            <h3>{mode === 'as-of' ? '截至 2026-09-30 的存款余额' : '2026 年 9 月累计存入金额'}</h3>
          </div>
          <strong>{formatBankingMetricYuan(calculation.total)}</strong>
        </div>
        <dl className="banking-metric-time__semantic-grid">
          <div>
            <dt>输入事实</dt>
            <dd>{calculation.factType}</dd>
          </div>
          <div>
            <dt>时间条件</dt>
            <dd>{calculation.timeMeaning}</dd>
          </div>
          <div>
            <dt>它回答什么</dt>
            <dd>{calculation.answer}</dd>
          </div>
        </dl>
        <TimeRowsTable visualization={visualization} mode={mode} />
        {mode === 'period' && (
          <p className="banking-metric-time__note">
            表中 T002 是取款事件，保留在交易事实里，但不属于“累计存入金额”。
          </p>
        )}
      </section>
    </div>
  )
}

interface ChoiceOption<Value extends string> {
  value: Value
  label: string
  detail?: string
}

function ChoiceGroup<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: Value
  options: readonly ChoiceOption<Value>[]
  onChange: (value: Value) => void
}) {
  return (
    <fieldset className="banking-metric-derivation__choice-group">
      <legend>{label}</legend>
      <div>
        {options.map((option) => {
          const isSelected = option.value === value
          return (
            <button
              className={`banking-metric-derivation__choice${isSelected ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(option.value)}
              key={option.value}
            >
              <strong>{option.label}</strong>
              {option.detail && <small>{option.detail}</small>}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

const customerChoiceOptions: readonly ChoiceOption<BankingMetricCustomerScope>[] = [
  { value: 'all', label: '全部' },
  { value: 'individual', label: '个人' },
  { value: 'corporate', label: '对公' },
  { value: 'small-business', label: '小微口径', detail: '上游已提供的标签' },
]

const productChoiceOptions: readonly ChoiceOption<BankingMetricProduct | 'all'>[] = [
  { value: 'all', label: '全部' },
  { value: 'demand', label: '活期' },
  { value: 'term', label: '定期' },
  { value: 'negotiated', label: '协定' },
  { value: 'margin', label: '保证金' },
]

const branchChoiceOptions: readonly ChoiceOption<BankingMetricBalanceFilter['branch']>[] = [
  { value: 'all', label: '全行' },
  { value: 'hangzhou', label: '杭州分行' },
  { value: 'shanghai', label: '上海分行' },
]

const currencyChoiceOptions: readonly ChoiceOption<BankingMetricBalanceFilter['currency']>[] = [
  { value: 'CNY', label: 'CNY', detail: '人民币' },
  { value: 'USD', label: 'USD' },
]

const dateChoiceOptions: readonly ChoiceOption<string>[] = [
  { value: '2026-09-30', label: '09-30' },
  { value: '2026-09-29', label: '09-29' },
]

export function BankingMetricDerivationLab({
  visualization,
}: {
  visualization: BankingMetricDerivationVisualization
}) {
  const [filter, setFilter] = useState<BankingMetricBalanceFilter>(visualization.defaultFilter)
  const calculation = useMemo(
    () => calculateBankingMetric(visualization.snapshots, filter),
    [filter, visualization.snapshots],
  )
  const definition = useMemo(() => getBankingMetricDefinition(filter), [filter])

  function updateFilter<Key extends keyof BankingMetricBalanceFilter>(
    key: Key,
    value: BankingMetricBalanceFilter[Key],
  ) {
    setFilter((current) => ({ ...current, [key]: value, excludedProducts: undefined }))
  }

  function reset() {
    setFilter(visualization.defaultFilter)
  }

  return (
    <div className="banking-metric-lab banking-metric-derivation-lab">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">存款余额 · 口径组合器</span>
          <p aria-live="polite">
            当前统计集合：{calculation.rows.length} 个账户快照 · 基础度量：balance
          </p>
        </div>
        <button className="button button--quiet button--small" type="button" onClick={reset}>
          重置组合
        </button>
      </div>
      <section className="banking-metric-derivation__workspace" aria-label="存款余额口径组合器">
        <div className="banking-metric-derivation__controls">
          <div className="banking-metric__section-heading">
            <div>
              <span className="eyebrow eyebrow--small">CHANGE SCOPE · 改变范围</span>
              <h3>每次只切换一个口径</h3>
            </div>
            <p>这些条件决定哪些 Account 快照进入统计集合。</p>
          </div>
          <ChoiceGroup
            label="客户口径"
            value={filter.customerScope}
            options={customerChoiceOptions}
            onChange={(value) => updateFilter('customerScope', value)}
          />
          <ChoiceGroup
            label="产品口径"
            value={filter.productScope}
            options={productChoiceOptions}
            onChange={(value) => updateFilter('productScope', value)}
          />
          <ChoiceGroup
            label="币种"
            value={filter.currency}
            options={currencyChoiceOptions}
            onChange={(value) => updateFilter('currency', value)}
          />
          <ChoiceGroup
            label="机构"
            value={filter.branch}
            options={branchChoiceOptions}
            onChange={(value) => updateFilter('branch', value)}
          />
          <ChoiceGroup
            label="日期"
            value={filter.snapshotDate}
            options={dateChoiceOptions}
            onChange={(value) => updateFilter('snapshotDate', value)}
          />
        </div>
        <div className="banking-metric-derivation__result" aria-live="polite">
          <span className="eyebrow eyebrow--small">当前指标名称</span>
          <h3>{definition.name}</h3>
          <strong>{formatBankingMetricYi(calculation.total, filter.currency)}</strong>
          <p>{definition.businessMeaning}</p>
          <dl>
            <div>
              <dt>客户口径</dt>
              <dd>{definition.customerScope}</dd>
            </div>
            <div>
              <dt>产品口径</dt>
              <dd>{definition.productScope}</dd>
            </div>
            <div>
              <dt>机构 / 币种</dt>
              <dd>
                {definition.branch} · {definition.currency}
              </dd>
            </div>
            <div>
              <dt>统计时间</dt>
              <dd>{definition.statisticTime}</dd>
            </div>
          </dl>
        </div>
      </section>
      <section
        className="banking-metric-derivation__rows"
        aria-labelledby="metric-derived-rows-title"
      >
        <div className="banking-metric__section-heading">
          <div>
            <span className="eyebrow eyebrow--small">统计集合 · Account × snapshot_date</span>
            <h3 id="metric-derived-rows-title">哪些账户快照贡献了当前结果？</h3>
          </div>
          <p>结果数字随统计集合变化；没有匹配行时，结果明确显示为 0。</p>
        </div>
        {calculation.rows.length > 0 ? (
          <AccountSnapshotTable rows={calculation.rows} caption={`${definition.name}统计集合`} />
        ) : (
          <p className="banking-metric-derivation__empty">当前条件没有匹配的账户快照。</p>
        )}
      </section>
    </div>
  )
}
