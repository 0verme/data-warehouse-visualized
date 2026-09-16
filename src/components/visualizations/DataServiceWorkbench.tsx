import { useMemo, useState, type FormEvent } from 'react'
import {
  getDataServiceApiResponse,
  getDataServiceChoiceResult,
  getDataServiceFileState,
} from '../../features/data-service/banking'
import type {
  DataServiceConsumer,
  DataServiceDecisionScenario,
  DataServiceFileStage,
  DataServicePublishedBalance,
  DataServiceReportView,
  DataServiceVisualization,
} from '../../features/data-service/types'

const consumerOptions: readonly {
  value: DataServiceConsumer
  label: string
  shortLabel: string
  detail: string
}[] = [
  {
    value: 'report',
    label: '报表 / BI',
    shortLabel: '报表',
    detail: '经营 / 分析人员主动查看和比较数据。',
  },
  {
    value: 'file',
    label: '文件接口',
    shortLabel: '文件',
    detail: '下游系统按批次接收大量数据。',
  },
  {
    value: 'api',
    label: 'API',
    shortLabel: 'API',
    detail: '业务应用按条件获取少量结果。',
  },
]

const consumerOptionByValue = Object.fromEntries(
  consumerOptions.map((option) => [option.value, option]),
) as Record<DataServiceConsumer, (typeof consumerOptions)[number]>

function formatBalance(amount: number): string {
  return `${amount.toLocaleString('zh-CN')} 元`
}

function formatChange(current: number, previous: number): string {
  const change = current - previous
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toLocaleString('zh-CN')} 元`
}

function getDateOptions(balances: readonly DataServicePublishedBalance[]): string[] {
  return Array.from(new Set(balances.map((balance) => balance.businessDate))).sort()
}

function getBranchOptions(balances: readonly DataServicePublishedBalance[]) {
  return Array.from(
    new Map(balances.map((balance) => [balance.branchId, balance.branchName])).entries(),
  )
}

function AssetHeader({ visualization }: { visualization: DataServiceVisualization }) {
  return (
    <header className="data-service__asset-header">
      <div>
        <span className="eyebrow eyebrow--small">数据消费工作台</span>
        <h3>{visualization.asset.label}</h3>
        <code>{visualization.asset.assetName}</code>
      </div>
      <dl className="data-service__asset-facts">
        <div>
          <dt>业务日期</dt>
          <dd>{visualization.asset.businessDate}</dd>
        </div>
        <div>
          <dt>状态</dt>
          <dd className="is-published">{visualization.asset.status}</dd>
        </div>
        <div>
          <dt>粒度</dt>
          <dd>{visualization.asset.grain}</dd>
        </div>
      </dl>
    </header>
  )
}

function ConsumerButton({
  consumer,
  selected,
  onSelect,
}: {
  consumer: (typeof consumerOptions)[number]
  selected: boolean
  onSelect: (consumer: DataServiceConsumer) => void
}) {
  return (
    <button
      className={`data-service__consumer${selected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(consumer.value)}
    >
      <span className="data-service__consumer-icon" aria-hidden="true">
        {consumer.shortLabel}
      </span>
      <strong>{consumer.label}</strong>
      <small>{consumer.detail}</small>
    </button>
  )
}

function OverviewMode({ visualization }: { visualization: DataServiceVisualization }) {
  const [selectedConsumer, setSelectedConsumer] = useState<DataServiceConsumer>('report')
  const selectedOption = consumerOptionByValue[selectedConsumer]

  return (
    <div className="data-service__overview">
      <div className="data-service__flow" aria-label="数据生产、正式发布和消费者">
        <div className="data-service__flow-stage">
          <span className="data-service__flow-label">数据生产</span>
          <strong>加工与质量检查完成</strong>
          <small>{visualization.asset.sourceLabel}</small>
        </div>
        <span className="data-service__flow-arrow" aria-hidden="true">
          →
        </span>
        <div className="data-service__flow-stage data-service__flow-stage--published">
          <span className="data-service__flow-label">正式发布</span>
          <strong>{visualization.asset.label}</strong>
          <small>{visualization.asset.businessDate} · 可供消费</small>
        </div>
        <span className="data-service__flow-arrow" aria-hidden="true">
          →
        </span>
        <div className="data-service__flow-consumers">
          <span className="data-service__flow-label">消费者</span>
          <div className="data-service__consumer-grid">
            {consumerOptions.map((consumer) => (
              <ConsumerButton
                key={consumer.value}
                consumer={consumer}
                selected={consumer.value === selectedConsumer}
                onSelect={setSelectedConsumer}
              />
            ))}
          </div>
        </div>
      </div>

      <section className="data-service__consumer-detail" aria-live="polite">
        <span className="eyebrow eyebrow--small">当前查看 · {selectedOption.label}</span>
        <h4>{selectedOption.label}如何接住这份数据？</h4>
        <p>{selectedOption.detail}</p>
        <p className="data-service__boundary-note">
          普通业务系统不直接连接数仓；只有受控的报表 / BI 分析消费者可以按权限查询指定数据表或
          View。
        </p>
      </section>
    </div>
  )
}

function ReportTable({
  rows,
  onSelectBranch,
}: {
  rows: readonly DataServicePublishedBalance[]
  onSelectBranch: (branchId: string) => void
}) {
  return (
    <div className="data-service__table-wrap">
      <table className="data-service__table">
        <caption>已发布存款余额 · 当前筛选结果</caption>
        <thead>
          <tr>
            <th scope="col">机构</th>
            <th scope="col">业务日期</th>
            <th scope="col">存款余额</th>
            <th scope="col">较上一业务日</th>
            <th scope="col">币种</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.branchId}>
              <th scope="row">
                <button
                  className="data-service__table-link"
                  type="button"
                  onClick={() => onSelectBranch(row.branchId)}
                >
                  {row.branchName}
                </button>
                <small>{row.branchId}</small>
              </th>
              <td>{row.businessDate}</td>
              <td className="data-service__amount">{formatBalance(row.depositBalance)}</td>
              <td className={row.depositBalance >= row.previousDepositBalance ? 'is-positive' : ''}>
                {formatChange(row.depositBalance, row.previousDepositBalance)}
              </td>
              <td>{row.currency}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReportTrend({ rows }: { rows: readonly DataServicePublishedBalance[] }) {
  return (
    <div className="data-service__trend-list" aria-label="机构存款余额趋势">
      {rows.map((row) => {
        const maximum = Math.max(row.depositBalance, row.previousDepositBalance)
        const previousWidth = (row.previousDepositBalance / maximum) * 100
        const currentWidth = (row.depositBalance / maximum) * 100

        return (
          <article className="data-service__trend-card" key={row.branchId}>
            <div className="data-service__trend-heading">
              <div>
                <strong>{row.branchName}</strong>
                <code>{row.branchId}</code>
              </div>
              <span className="is-positive">
                {formatChange(row.depositBalance, row.previousDepositBalance)}
              </span>
            </div>
            <div className="data-service__trend-bars" aria-label={`${row.branchName}余额对比`}>
              <div className="data-service__trend-row">
                <span>上一业务日</span>
                <div className="data-service__bar-track">
                  <span
                    className="data-service__bar data-service__bar--previous"
                    style={{ width: `${previousWidth}%` }}
                  />
                </div>
                <b>{formatBalance(row.previousDepositBalance)}</b>
              </div>
              <div className="data-service__trend-row">
                <span>{row.businessDate}</span>
                <div className="data-service__bar-track">
                  <span
                    className="data-service__bar data-service__bar--current"
                    style={{ width: `${currentWidth}%` }}
                  />
                </div>
                <b>{formatBalance(row.depositBalance)}</b>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function ReportMode({ visualization }: { visualization: DataServiceVisualization }) {
  const dateOptions = getDateOptions(visualization.publishedBalances)
  const branchOptions = getBranchOptions(visualization.publishedBalances)
  const [businessDate, setBusinessDate] = useState(visualization.asset.businessDate)
  const [branchId, setBranchId] = useState('all')
  const [view, setView] = useState<DataServiceReportView>('table')
  const rows = useMemo(
    () =>
      visualization.publishedBalances.filter(
        (row) =>
          row.businessDate === businessDate && (branchId === 'all' || row.branchId === branchId),
      ),
    [branchId, businessDate, visualization.publishedBalances],
  )

  return (
    <div className="data-service__report">
      <div className="data-service__notice" role="note">
        <strong>给人看的数据：</strong>
        报表 / BI 平台可以在权限控制下查询指定数据表或 View；这里模拟的是查看语义，不是完整 BI
        产品。
      </div>

      <div className="data-service__controls">
        <label>
          <span>业务日期</span>
          <select value={businessDate} onChange={(event) => setBusinessDate(event.target.value)}>
            {dateOptions.map((date) => (
              <option value={date} key={date}>
                {date} · 已发布
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>机构筛选</span>
          <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            <option value="all">全部机构</option>
            {branchOptions.map(([id, name]) => (
              <option value={id} key={id}>
                {name}（{id}）
              </option>
            ))}
          </select>
        </label>
        <div className="data-service__view-switch" role="group" aria-label="报表查看方式">
          <span>查看方式</span>
          <button
            className={view === 'table' ? 'is-selected' : ''}
            type="button"
            aria-pressed={view === 'table'}
            onClick={() => setView('table')}
          >
            表格
          </button>
          <button
            className={view === 'trend' ? 'is-selected' : ''}
            type="button"
            aria-pressed={view === 'trend'}
            onClick={() => setView('trend')}
          >
            趋势
          </button>
        </div>
      </div>

      <p className="data-service__filter-status" aria-live="polite">
        当前查看：
        {branchId === 'all'
          ? '全部机构'
          : branchOptions.find(([id]) => id === branchId)?.[1]} · {businessDate} · {rows.length}{' '}
        条已发布记录
      </p>

      {view === 'table' ? (
        <ReportTable rows={rows} onSelectBranch={setBranchId} />
      ) : (
        <ReportTrend rows={rows} />
      )}

      <div className="data-service__report-semantics">
        <span>固定报表</span>
        <span>筛选</span>
        <span>趋势</span>
        <span>简单钻取</span>
      </div>
    </div>
  )
}

function FileTimeline({
  stage,
  onChange,
}: {
  stage: DataServiceFileStage
  onChange: (stage: DataServiceFileStage) => void
}) {
  return (
    <ol className="data-service__file-timeline" aria-label="文件交付阶段">
      <li className={stage === 'txt' ? 'is-current' : 'is-complete'}>
        <button type="button" aria-pressed={stage === 'txt'} onClick={() => onChange('txt')}>
          <span>01</span>
          <strong>TXT 出现</strong>
          <small>数据文件可能仍在写入</small>
        </button>
      </li>
      <li className={stage === 'complete' ? 'is-current is-complete' : ''}>
        <button
          type="button"
          aria-pressed={stage === 'complete'}
          onClick={() => onChange('complete')}
        >
          <span>02</span>
          <strong>FLAG 出现</strong>
          <small>这批数据可以消费</small>
        </button>
      </li>
    </ol>
  )
}

function FileMode({ visualization }: { visualization: DataServiceVisualization }) {
  const [stage, setStage] = useState<DataServiceFileStage>('txt')
  const [consumed, setConsumed] = useState(false)
  const state = getDataServiceFileState(stage)
  const file = visualization.file

  function changeStage(nextStage: DataServiceFileStage) {
    setStage(nextStage)
    setConsumed(false)
  }

  return (
    <div className="data-service__file">
      <div className="data-service__notice" role="note">
        <strong>给系统批量交付：</strong>
        文件名、业务日期、字段顺序和完成信号需要事先约定。数据文件出现，不代表交付已经完成。
      </div>

      <FileTimeline stage={stage} onChange={changeStage} />

      <section className="data-service__file-card" aria-labelledby="data-service-file-title">
        <div className="data-service__file-heading">
          <div>
            <span className="eyebrow eyebrow--small">批次文件 · {file.businessDate}</span>
            <h4 id="data-service-file-title">同一批数据的两个文件</h4>
          </div>
          <span className={`data-service__file-status is-${state.status}`} aria-live="polite">
            {state.status === 'ready' ? 'READY' : 'IN PROGRESS'}
          </span>
        </div>
        <div className="data-service__file-list">
          <div className="data-service__file-row is-visible">
            <code>{file.dataFileName}</code>
            <span>已出现 · TXT 数据文件</span>
          </div>
          <div
            className={`data-service__file-row ${state.flagFileVisible ? 'is-visible' : 'is-pending'}`}
          >
            <code>{file.flagFileName}</code>
            <span>{state.flagFileVisible ? '已出现 · 完成标志' : '尚未出现 · 等待完成标志'}</span>
          </div>
        </div>
        <p className="data-service__file-status-text" role="status">
          {state.statusLabel}
        </p>
      </section>

      <div className="data-service__file-action">
        <button
          className="button button--primary button--small"
          type="button"
          disabled={!state.canConsume}
          onClick={() => setConsumed(true)}
        >
          开始消费这批数据
        </button>
        {consumed && <span role="status">下游已在 FLAG 到达后开始读取。</span>}
      </div>

      <dl className="data-service__file-spec">
        <div>
          <dt>business_date</dt>
          <dd>{file.businessDate}</dd>
        </div>
        <div>
          <dt>字段顺序</dt>
          <dd>{file.fieldOrder.join(' | ')}</dd>
        </div>
        <div>
          <dt>分隔符 / 编码</dt>
          <dd>
            {file.delimiter} · {file.encoding}
          </dd>
        </div>
        <div>
          <dt>本次交付</dt>
          <dd>{file.deliveryType === 'full' ? '全量' : '增量'}</dd>
        </div>
      </dl>
      <p className="data-service__muted-note">{file.transferHint}</p>
      <p className="data-service__muted-note">
        全量 / 增量是双方需要先约定的交付语义，本节不展开 CDC、边界或水位线。
      </p>
    </div>
  )
}

function ApiMode({ visualization }: { visualization: DataServiceVisualization }) {
  const dateOptions = getDateOptions(visualization.publishedBalances)
  const branchOptions = getBranchOptions(visualization.publishedBalances)
  const [branchId, setBranchId] = useState(visualization.api.defaultBranchId)
  const [businessDate, setBusinessDate] = useState(visualization.api.defaultBusinessDate)
  const [request, setRequest] = useState({
    branchId: visualization.api.defaultBranchId,
    businessDate: visualization.api.defaultBusinessDate,
  })
  const response = useMemo(
    () =>
      getDataServiceApiResponse(
        visualization.publishedBalances,
        request.branchId,
        request.businessDate,
      ),
    [request, visualization.publishedBalances],
  )

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRequest({ branchId, businessDate })
  }

  return (
    <div className="data-service__api">
      <div className="data-service__notice" role="note">
        <strong>按需获取：</strong>
        如果系统只需要一条或少量结果，就可以按条件请求已发布数据，不必每天交换整批文件。
      </div>

      <form className="data-service__api-form" onSubmit={submitRequest}>
        <label>
          <span>branch_id</span>
          <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            {branchOptions.map(([id, name]) => (
              <option value={id} key={id}>
                {id} · {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>business_date</span>
          <select value={businessDate} onChange={(event) => setBusinessDate(event.target.value)}>
            {dateOptions.map((date) => (
              <option value={date} key={date}>
                {date}
              </option>
            ))}
          </select>
        </label>
        <button className="button button--primary button--small" type="submit">
          发送请求
        </button>
      </form>

      <div className="data-service__api-flow" aria-live="polite">
        <div className="data-service__api-step">
          <span className="data-service__flow-label">请求</span>
          <code>
            {visualization.api.method} {visualization.api.route}?branch_id={request.branchId}
            &amp;business_date={request.businessDate}
          </code>
        </div>
        <span className="data-service__api-arrow" aria-hidden="true">
          →
        </span>
        <div className="data-service__api-step data-service__api-step--response">
          <span className="data-service__flow-label">响应 · JSON</span>
          <pre>{JSON.stringify(response ?? { error: '未找到已发布记录' }, null, 2)}</pre>
        </div>
      </div>

      <div className="data-service__api-contract">
        <div>
          <span className="eyebrow eyebrow--small">输入契约</span>
          <ul>
            {visualization.api.parameters.map((parameter) => (
              <li key={parameter.key}>
                <code>{parameter.key}</code>
                <span>{parameter.description}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <span className="eyebrow eyebrow--small">输出契约</span>
          <p>稳定返回以下字段：</p>
          <div className="data-service__field-list">
            {visualization.api.responseFields.map((field) => (
              <code key={field}>{field}</code>
            ))}
          </div>
        </div>
      </div>

      <div className="data-service__api-reality" role="note">
        <strong>API ≠ 实时数据</strong>
        <p>
          这次请求返回的是 {request.businessDate} 的日终离线存款余额。API 描述数据访问方式，
          <code>business_date</code> 才说明结果属于哪一天；文件也不必然低频，API 也不自动实时。
        </p>
      </div>
      <p className="data-service__muted-note">
        真实 API 通常还会考虑鉴权、错误码和分页；本节只观察请求参数与响应契约。
      </p>
    </div>
  )
}

function ScenarioButton({
  scenario,
  selected,
  onSelect,
}: {
  scenario: DataServiceDecisionScenario
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      className={`data-service__scenario${selected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span>{scenario.label}</span>
      <strong>{scenario.title}</strong>
      <small>{scenario.description}</small>
    </button>
  )
}

function DecisionMode({ visualization }: { visualization: DataServiceVisualization }) {
  const [scenarioId, setScenarioId] = useState(visualization.scenarios[0]?.id ?? '')
  const [selectedConsumer, setSelectedConsumer] = useState<DataServiceConsumer | null>(null)
  const selectedScenario =
    visualization.scenarios.find((scenario) => scenario.id === scenarioId) ??
    visualization.scenarios[0]
  const choiceResult =
    selectedScenario && selectedConsumer
      ? getDataServiceChoiceResult(selectedScenario, selectedConsumer)
      : undefined

  if (!selectedScenario) {
    return null
  }

  function selectScenario(id: string) {
    setScenarioId(id)
    setSelectedConsumer(null)
  }

  return (
    <div className="data-service__decision">
      <div className="data-service__decision-scenarios">
        <span className="data-service__flow-label">先读需求，再选交付方式</span>
        <div className="data-service__scenario-grid">
          {visualization.scenarios.map((scenario) => (
            <ScenarioButton
              key={scenario.id}
              scenario={scenario}
              selected={scenario.id === selectedScenario.id}
              onSelect={() => selectScenario(scenario.id)}
            />
          ))}
        </div>
      </div>

      <section
        className="data-service__decision-choice"
        aria-labelledby="data-service-choice-title"
      >
        <div>
          <span className="eyebrow eyebrow--small">{selectedScenario.label} · 消费方式选择</span>
          <h4 id="data-service-choice-title">{selectedScenario.title}</h4>
        </div>
        <div className="data-service__choice-grid" role="group" aria-label="选择数据交付方式">
          {consumerOptions.map((consumer) => (
            <button
              className={selectedConsumer === consumer.value ? 'is-selected' : ''}
              type="button"
              aria-pressed={selectedConsumer === consumer.value}
              key={consumer.value}
              onClick={() => setSelectedConsumer(consumer.value)}
            >
              <strong>{consumer.value === 'file' ? '文件（TXT + FLAG）' : consumer.label}</strong>
              <small>{consumer.detail}</small>
            </button>
          ))}
        </div>
        <div className="data-service__decision-result" aria-live="polite">
          {choiceResult ? (
            <>
              <strong className={choiceResult.isCorrect ? 'is-correct' : 'is-guidance'}>
                {choiceResult.isCorrect ? '匹配当前需求' : `更适合：${choiceResult.label}`}
              </strong>
              <p>{choiceResult.explanation}</p>
            </>
          ) : (
            <p>点击一种消费方式，查看它是否适合当前需求。</p>
          )}
        </div>
      </section>

      <div className="data-service__comparison">
        <span className="data-service__flow-label">典型模式对照</span>
        <div className="data-service__table-wrap">
          <table className="data-service__table">
            <caption>报表 / BI、文件接口和 API 的典型消费模式</caption>
            <thead>
              <tr>
                <th scope="col">判断维度</th>
                <th scope="col">报表 / BI</th>
                <th scope="col">文件接口</th>
                <th scope="col">API</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">主要消费者</th>
                <td>人</td>
                <td>系统</td>
                <td>系统</td>
              </tr>
              <tr>
                <th scope="row">一次数据量</th>
                <td>小～中</td>
                <td>大</td>
                <td>小～中</td>
              </tr>
              <tr>
                <th scope="row">典型模式</th>
                <td>查看 / 分析</td>
                <td>批量交换</td>
                <td>按请求获取</td>
              </tr>
              <tr>
                <th scope="row">触发方式</th>
                <td>人主动查询</td>
                <td>定时 / 批次</td>
                <td>请求触发</td>
              </tr>
              <tr>
                <th scope="row">常见输出</th>
                <td>页面 / 图表</td>
                <td>TXT</td>
                <td>JSON</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="data-service__muted-note">
          这是典型模式，不是绝对限制：API 可以分页，BI 可能查询大量数据，文件也可能高频产生。
        </p>
      </div>
    </div>
  )
}

function renderMode(visualization: DataServiceVisualization) {
  switch (visualization.mode) {
    case 'overview':
      return <OverviewMode visualization={visualization} />
    case 'report':
      return <ReportMode visualization={visualization} />
    case 'file':
      return <FileMode visualization={visualization} />
    case 'api':
      return <ApiMode visualization={visualization} />
    case 'decision':
      return <DecisionMode visualization={visualization} />
  }
}

export function DataServiceWorkbench({
  visualization,
}: {
  visualization: DataServiceVisualization
}) {
  return (
    <div className={`data-service-workbench data-service-workbench--${visualization.mode}`}>
      <AssetHeader visualization={visualization} />
      {renderMode(visualization)}
    </div>
  )
}
