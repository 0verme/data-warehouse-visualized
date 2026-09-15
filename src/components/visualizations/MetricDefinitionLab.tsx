import { useMemo, useState } from 'react'
import type {
  MetricConfig,
  MetricDefinition,
  MetricGrainMode,
  MetricRefundRule,
  MetricStatusRule,
  MetricTimeField,
  MetricVisualization,
} from '../../types'
import {
  calculateMetric,
  DEFAULT_METRIC_CONFIG,
  type MetricExclusionReason,
  type MetricOrderEvaluation,
} from '../../utils/metrics'

interface MetricDefinitionLabProps {
  visualization: MetricVisualization
}

type RuleOption<Value extends string> = {
  value: Value
  label: string
  detail: string
}

const statusOptions: RuleOption<MetricStatusRule>[] = [
  { value: 'all', label: '统计所有订单', detail: '包含待支付订单' },
  { value: 'paid', label: '仅统计支付成功订单', detail: '排除未支付订单' },
]

const refundOptions: RuleOption<MetricRefundRule>[] = [
  { value: 'gross', label: '退款不扣除', detail: '使用订单金额' },
  { value: 'net', label: '扣除退款金额', detail: '订单金额 − 退款' },
]

const timeOptions: RuleOption<MetricTimeField>[] = [
  { value: 'orderTime', label: '按下单时间', detail: 'O003 属于 9 月 13 日' },
  { value: 'payTime', label: '按支付时间', detail: 'O003 属于 9 月 14 日' },
]

const grainOptions: RuleOption<MetricGrainMode>[] = [
  { value: 'correct', label: '正确：回到订单粒度', detail: 'O001 贡献 100 元' },
  { value: 'duplicated', label: '错误：明细上直接 SUM', detail: 'O001 被重复计算' },
]

const exclusionReasonLabels: Record<MetricExclusionReason, string> = {
  'not-paid': '未支付',
  'missing-time': '没有支付时间',
  'date-mismatch': '时间不属于统计日',
}

function RuleControl<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: Value
  options: readonly RuleOption<Value>[]
  onChange: (value: Value) => void
}) {
  return (
    <fieldset className="metric-lab__control">
      <legend>{label}</legend>
      <div className="metric-lab__control-options">
        {options.map((option) => {
          const isSelected = option.value === value
          return (
            <button
              className={`metric-lab__choice${isSelected ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(option.value)}
              key={option.value}
            >
              <span className="metric-lab__choice-indicator" aria-hidden="true">
                {isSelected ? '✓' : ''}
              </span>
              <span>
                <strong>{option.label}</strong>
                <small>{option.detail}</small>
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function DefinitionPanel({
  definition,
  targetDate,
}: {
  definition: MetricDefinition
  targetDate: string
}) {
  const facts = [
    ['指标', definition.name],
    ['业务过程', definition.businessProcess],
    ['统计对象', definition.subject],
    ['统计日期', targetDate],
    ['时间字段', definition.timeField],
    ['状态', definition.statusRule],
    ['度量', definition.measure],
    ['退款', definition.refundRule],
    ['粒度', definition.grain],
    ['统计周期', definition.period],
  ]

  return (
    <div className="metric-lab__definition">
      <div className="metric-lab__definition-heading">
        <span className="eyebrow eyebrow--small">当前指标定义</span>
        <strong>{definition.name}</strong>
      </div>
      <dl>
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function getOrderStatusText(evaluation: MetricOrderEvaluation): string {
  if (evaluation.included) {
    return '纳入计算'
  }

  return `排除 · ${evaluation.exclusionReason ? exclusionReasonLabels[evaluation.exclusionReason] : '规则不匹配'}`
}

function OrderParticipationTable({
  evaluations,
}: {
  evaluations: readonly MetricOrderEvaluation[]
}) {
  return (
    <div className="metric-lab__table-wrap">
      <table className="metric-lab__orders-table">
        <caption>订单参与计算明细</caption>
        <thead>
          <tr>
            <th>订单</th>
            <th>下单时间</th>
            <th>支付时间</th>
            <th>状态</th>
            <th>原金额</th>
            <th>退款</th>
            <th>当前贡献</th>
            <th>计算状态</th>
          </tr>
        </thead>
        <tbody>
          {evaluations.map((evaluation) => {
            const { order } = evaluation
            return (
              <tr className={evaluation.included ? 'is-included' : 'is-excluded'} key={order.id}>
                <th scope="row">{order.id}</th>
                <td>{order.orderTime}</td>
                <td>{order.payTime ?? '—'}</td>
                <td>{order.status === 'PAID' ? '已支付' : '待支付'}</td>
                <td>{order.orderAmount} 元</td>
                <td>{order.refundAmount} 元</td>
                <td className="metric-lab__contribution">
                  {evaluation.contribution === null ? '—' : `${evaluation.contribution} 元`}
                </td>
                <td>
                  <span className="metric-lab__row-status">
                    <i aria-hidden="true">{evaluation.included ? '✓' : '—'}</i>
                    <span>{getOrderStatusText(evaluation)}</span>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function GrainDetail({
  visualization,
  grainMode,
}: {
  visualization: MetricVisualization
  grainMode: MetricGrainMode
}) {
  const isDuplicated = grainMode === 'duplicated'
  const orderOneRows = visualization.detailRows.filter((row) => row.orderId === 'O001')

  return (
    <section className="metric-lab__grain" aria-labelledby="metric-grain-title">
      <div className="metric-lab__section-heading">
        <div>
          <span className="eyebrow eyebrow--small">粒度与指标</span>
          <h3 id="metric-grain-title">同一个订单在明细表里出现了两行</h3>
        </div>
        <p>
          {isDuplicated
            ? '错误模式：订单金额被带到每个商品行。'
            : '正确模式：回到订单粒度后再计算。'}
        </p>
      </div>
      <div className={`metric-lab__grain-callout${isDuplicated ? ' is-warning' : ''}`}>
        <div>
          <span>O001 · {orderOneRows.length} 条商品明细</span>
          <strong>
            {isDuplicated ? '直接 SUM(order_amount) = 200 元' : '订单粒度贡献 = 100 元'}
          </strong>
        </div>
        <p>
          {isDuplicated
            ? '商品 A、商品 B 各带着 100 元；重复行不是新的订单金额。'
            : '先把两条明细还原为一笔订单，避免把同一笔订单金额加两次。'}
        </p>
      </div>
      <div className="metric-lab__table-wrap metric-lab__table-wrap--grain">
        <table className="metric-lab__detail-table">
          <caption>订单明细粒度示例</caption>
          <thead>
            <tr>
              <th>订单</th>
              <th>商品</th>
              <th>重复保存的 order_amount</th>
            </tr>
          </thead>
          <tbody>
            {visualization.detailRows.map((row, index) => (
              <tr key={`${row.orderId}-${row.product}-${index}`}>
                <th scope="row">{row.orderId}</th>
                <td>{row.product}</td>
                <td>{row.orderAmount} 元</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function getResultExplanation(config: MetricConfig, includedCount: number, total: number): string {
  const statusText = config.statusRule === 'paid' ? '支付成功' : '所有状态'
  const timeText = config.timeField === 'orderTime' ? '下单时间' : '支付时间'
  const refundText = config.refundRule === 'net' ? '已扣除退款' : '未扣除退款'
  const grainText = config.grainMode === 'correct' ? '订单粒度正确' : '明细粒度重复'

  return `${includedCount} 笔订单符合“${statusText} + ${timeText}”，${refundText}，${grainText}，合计 ${total} 元。`
}

export function MetricDefinitionLab({ visualization }: MetricDefinitionLabProps) {
  const [config, setConfig] = useState<MetricConfig>(DEFAULT_METRIC_CONFIG)
  const calculation = useMemo(() => calculateMetric(visualization, config), [config, visualization])
  const includedCount = calculation.evaluations.filter((evaluation) => evaluation.included).length

  function updateConfig<Key extends keyof MetricConfig>(key: Key, value: MetricConfig[Key]) {
    setConfig((current) => ({ ...current, [key]: value }))
  }

  function resetExperiment() {
    setConfig(DEFAULT_METRIC_CONFIG)
  }

  return (
    <div className="metric-definition-lab">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">
            指标口径实验 · 统计日 {visualization.targetDate}
          </span>
          <p aria-live="polite">
            {includedCount} / {visualization.orders.length} 笔订单当前参与计算
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={resetExperiment}
        >
          重置口径
        </button>
      </div>

      <section className="metric-lab__workspace" aria-label="指标口径控制与结果">
        <div className="metric-lab__controls">
          <div className="metric-lab__section-heading">
            <div>
              <span className="eyebrow eyebrow--small">改变定义</span>
              <h3>选择当前口径</h3>
            </div>
            <p>每个选择都会同时影响参与订单和结果数字。</p>
          </div>
          <div className="metric-lab__controls-grid">
            <RuleControl
              label="状态口径"
              value={config.statusRule}
              options={statusOptions}
              onChange={(value) => updateConfig('statusRule', value)}
            />
            <RuleControl
              label="退款口径"
              value={config.refundRule}
              options={refundOptions}
              onChange={(value) => updateConfig('refundRule', value)}
            />
            <RuleControl
              label="时间口径"
              value={config.timeField}
              options={timeOptions}
              onChange={(value) => updateConfig('timeField', value)}
            />
            <RuleControl
              label="粒度处理"
              value={config.grainMode}
              options={grainOptions}
              onChange={(value) => updateConfig('grainMode', value)}
            />
          </div>
        </div>

        <div className="metric-lab__result-panel">
          <div className="metric-lab__result-card">
            <span>当前指标结果</span>
            <strong aria-live="polite">
              {calculation.total} <small>元</small>
            </strong>
            <p>{getResultExplanation(config, includedCount, calculation.total)}</p>
          </div>
          <DefinitionPanel
            definition={calculation.definition}
            targetDate={visualization.targetDate}
          />
        </div>
      </section>

      <section className="metric-lab__orders" aria-labelledby="metric-orders-title">
        <div className="metric-lab__section-heading">
          <div>
            <span className="eyebrow eyebrow--small">数据参与过程</span>
            <h3 id="metric-orders-title">哪些订单被纳入，哪些被排除？</h3>
          </div>
          <p>排除原因也要可解释：状态不符、时间不符，或没有可用时间。</p>
        </div>
        <OrderParticipationTable evaluations={calculation.evaluations} />
      </section>

      <GrainDetail visualization={visualization} grainMode={config.grainMode} />
    </div>
  )
}

export type { MetricDefinitionLabProps }
