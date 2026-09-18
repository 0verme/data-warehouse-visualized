import { useMemo, useState } from 'react'
import type {
  SqlTransformationVisualization,
  TransformationEvidence,
  TransformationFocus,
  TransformationLayer,
  TransformationRow,
  TransformationRowChange,
  TransformationStepDefinition,
  TransformationStepId,
  TransformationStepResult,
  TransformationTableSnapshot,
} from '../../features/sql-transformation/types'
import type { CodeHighlightMap } from '../../utils/code-highlight'
import { getCodeHighlightKey } from '../../utils/code-highlight'
import {
  TRANSFORMATION_LAYER_ORDER,
  getLayerSnapshots,
  getTableMetrics,
  getTransformationStep,
  getTransformationStepResult,
} from '../../utils/sql-transformation'
import { CodeRenderer } from '../lesson/CodeRenderer'

interface SqlTransformationWorkbenchProps {
  visualization: SqlTransformationVisualization
  codeHighlights?: CodeHighlightMap
}

type Layer = TransformationLayer

type PlanField = {
  key: string
  label: string
  source: string
  value: string
  detail: string
}

const LAYER_LABELS: Record<Layer, string> = {
  ods: '原始输入',
  dwd: '可信明细',
  dws: '主题汇总',
  ads: '指标结果',
}

const EVIDENCE_LABELS: Record<TransformationEvidence['kind'], string> = {
  'duplicate-snapshot': '重复快照',
  'missing-dimension': '缺失关联',
  'currency-normalized': '编码标准化',
  'one-to-many': '一对多 Join',
  'grain-mismatch': '数据粒度',
  'target-scope': '指标口径',
}

const PLAN_FIELDS: readonly PlanField[] = [
  {
    key: 'snapshot_date',
    label: '统计日期',
    source: 'AccountBalanceSnapshot.snapshot_date',
    value: '2026-09-30',
    detail: '确定这次加工读取哪个业务日期分区。',
  },
  {
    key: 'balance',
    label: '度量',
    source: 'AccountBalanceSnapshot.balance',
    value: 'balance',
    detail: '账户余额快照提供要聚合的数值。',
  },
  {
    key: 'customer_scope',
    label: '客户口径',
    source: 'Customer.customer_scope',
    value: '小微',
    detail: '客户维度提供指标卡要求的客户范围。',
  },
  {
    key: 'product_type',
    label: '产品口径',
    source: 'Product.product_type',
    value: '定期',
    detail: '产品维度提供产品分类。',
  },
  {
    key: 'branch_name',
    label: '机构范围',
    source: 'Branch.branch_name',
    value: '杭州分行',
    detail: '机构维度提供统计范围。',
  },
  {
    key: 'currency',
    label: '币种',
    source: 'AccountBalanceSnapshot.currency',
    value: 'CNY',
    detail: '进入稳定层前统一同义编码。',
  },
]

function getStep(stepId: TransformationStepId): TransformationStepDefinition {
  const step = getTransformationStep(stepId)
  if (!step) {
    throw new Error(`找不到 SQL 加工步骤: ${stepId}`)
  }

  return step
}

function getRowKey(row: TransformationRow, columns: readonly string[]): string {
  return columns.map((column) => `${column}=${String(row[column] ?? 'NULL')}`).join('|')
}

function formatCell(value: string | number | null) {
  if (value === null) {
    return <span className="sql-workbench__null">NULL</span>
  }

  return typeof value === 'number' ? value.toLocaleString('zh-CN') : value
}

function SnapshotTable({
  table,
  changes = [],
  comparisonColumns,
  caption,
}: {
  table: TransformationTableSnapshot
  changes?: readonly TransformationRowChange[]
  comparisonColumns?: readonly string[]
  caption: string
}) {
  const changeByKey = new Map(changes.map((change) => [change.key, change]))
  const keyColumns = comparisonColumns ?? table.rowKey

  return (
    <div className="sql-workbench__table-wrap">
      <table className="sql-workbench__table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="sql-workbench__change-column">
              变化
            </th>
            {table.columns.map((column) => (
              <th scope="col" key={column}>
                <code>{column}</code>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => {
            const change = changeByKey.get(getRowKey(row, keyColumns))
            const changeKind = change?.kind ?? 'same'
            const changeLabel = changeKind === 'same' ? '·' : changeKind

            return (
              <tr
                className={`is-${changeKind}`}
                key={`${rowIndex}-${getRowKey(row, table.rowKey)}`}
              >
                <th scope="row" className="sql-workbench__change-cell">
                  {changeLabel}
                </th>
                {table.columns.map((column) => (
                  <td key={column}>{formatCell(row[column] ?? null)}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CodePanel({
  stepId,
  codeHighlights,
}: {
  stepId: TransformationStepId
  codeHighlights?: CodeHighlightMap
}) {
  const step = getStep(stepId)
  const highlightedCode = codeHighlights?.[getCodeHighlightKey('sql', step.sql)]

  return (
    <section className="sql-workbench__code-panel" aria-labelledby={`sql-code-${step.id}`}>
      <div className="sql-workbench__section-heading">
        <div>
          <span className="eyebrow eyebrow--small">SQL 只是表达工具</span>
          <h3 id={`sql-code-${step.id}`}>{step.title}</h3>
        </div>
        <span>{step.layer}</span>
      </div>
      <p>{step.description}</p>
      <CodeRenderer
        className="sql-workbench__code"
        code={step.sql}
        highlightedCode={highlightedCode}
      />
    </section>
  )
}

function MetricsStrip({ result }: { result: TransformationStepResult }) {
  const metrics = [
    {
      label: '行数',
      before: result.inputMetrics.rowCount,
      after: result.outputMetrics.rowCount,
      suffix: '行',
    },
    {
      label: '总余额',
      before: result.inputMetrics.amount,
      after: result.outputMetrics.amount,
      suffix: '元',
    },
    {
      label: '目标日期余额',
      before: result.inputMetrics.targetAmount,
      after: result.outputMetrics.targetAmount,
      suffix: '元',
    },
  ]

  return (
    <div className="sql-workbench__metrics" aria-live="polite">
      {metrics.map((metric) => (
        <div className="sql-workbench__metric" key={metric.label}>
          <span>{metric.label}</span>
          <div>
            <strong>{metric.before.toLocaleString('zh-CN')}</strong>
            <b aria-hidden="true">→</b>
            <strong>{metric.after.toLocaleString('zh-CN')}</strong>
          </div>
          <small>{metric.suffix} · 输入 → 输出</small>
        </div>
      ))}
    </div>
  )
}

function EvidenceList({ evidence }: { evidence: readonly TransformationEvidence[] }) {
  return (
    <section className="sql-workbench__evidence" aria-labelledby="sql-evidence-title">
      <div className="sql-workbench__section-heading">
        <div>
          <span className="eyebrow eyebrow--small">PROOF · 证据</span>
          <h3 id="sql-evidence-title">每个变化都能指出原因</h3>
        </div>
      </div>
      <div className="sql-workbench__evidence-list">
        {evidence.map((item) => (
          <article className="sql-workbench__evidence-item" key={`${item.kind}-${item.title}`}>
            <div>
              <span>{EVIDENCE_LABELS[item.kind]}</span>
              <strong>{item.title}</strong>
            </div>
            <p>{item.detail}</p>
            <div className="sql-workbench__evidence-keys">
              {item.keys.map((key) => (
                <code key={key}>{key}</code>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function TablePair({
  result,
  outputOverride,
  outputCaption,
}: {
  result: TransformationStepResult
  outputOverride?: TransformationTableSnapshot
  outputCaption?: string
}) {
  const output = outputOverride ?? result.output

  return (
    <div className="sql-workbench__table-pair">
      <article className="sql-workbench__table-card">
        <div className="sql-workbench__table-card-heading">
          <span>加工前</span>
          <strong>{result.input.name}</strong>
          <small>{result.input.grain}</small>
        </div>
        <SnapshotTable
          table={result.input}
          changes={result.changes}
          comparisonColumns={result.comparisonColumns}
          caption={`${result.input.name} 加工前快照`}
        />
      </article>
      <div className="sql-workbench__table-arrow" aria-hidden="true">
        →
      </div>
      <article className="sql-workbench__table-card">
        <div className="sql-workbench__table-card-heading">
          <span>加工后</span>
          <strong>{output.name}</strong>
          <small>{output.grain}</small>
        </div>
        <SnapshotTable
          table={output}
          changes={result.changes}
          comparisonColumns={result.comparisonColumns}
          caption={outputCaption ?? `${output.name} 加工后快照`}
        />
      </article>
    </div>
  )
}

function PlanView({
  visualization,
  codeHighlights,
}: {
  visualization: SqlTransformationVisualization
  codeHighlights?: CodeHighlightMap
}) {
  const result = useMemo(
    () => getTransformationStepResult(visualization.dataset, 'plan'),
    [visualization.dataset],
  )
  const [selectedField, setSelectedField] = useState('branch_name')
  const selected = PLAN_FIELDS.find((field) => field.key === selectedField) ?? PLAN_FIELDS[0]!

  return (
    <div className="sql-workbench__focus sql-workbench__focus--plan">
      <div className="sql-workbench__focus-intro">
        <div>
          <span className="eyebrow">01 · 指标定义 → 加工计划</span>
          <h3>先确认每个条件从哪张表来</h3>
        </div>
        <p>目标业务日期：{visualization.targetDate}</p>
      </div>
      <div className="sql-workbench__plan-layout">
        <div className="sql-workbench__plan-fields" role="list" aria-label="指标卡字段映射">
          {PLAN_FIELDS.map((field) => (
            <button
              className={`sql-workbench__plan-field${field.key === selected.key ? ' is-selected' : ''}`}
              type="button"
              role="listitem"
              onClick={() => setSelectedField(field.key)}
              key={field.key}
            >
              <span>{field.label}</span>
              <strong>{field.value}</strong>
              <small>{field.source}</small>
            </button>
          ))}
        </div>
        <aside className="sql-workbench__plan-detail" aria-live="polite">
          <span className="eyebrow eyebrow--small">当前映射</span>
          <strong>{selected.label}</strong>
          <code>{selected.source}</code>
          <p>{selected.detail}</p>
          <div className="sql-workbench__plan-grain">
            <span>目标数据粒度</span>
            <b>snapshot_date × 机构 × 客户口径 × 产品 × 币种</b>
          </div>
        </aside>
      </div>
      <TablePair result={result} />
      <CodePanel stepId="plan" codeHighlights={codeHighlights} />
      <EvidenceList evidence={result.evidence} />
    </div>
  )
}

function CleaningView({
  visualization,
  codeHighlights,
}: {
  visualization: SqlTransformationVisualization
  codeHighlights?: CodeHighlightMap
}) {
  const result = useMemo(
    () => getTransformationStepResult(visualization.dataset, 'clean-detail'),
    [visualization.dataset],
  )
  const [selectedEvidence, setSelectedEvidence] = useState(0)
  const selected = result.evidence[selectedEvidence] ?? result.evidence[0]

  return (
    <div className="sql-workbench__focus sql-workbench__focus--cleaning">
      <div className="sql-workbench__focus-intro">
        <div>
          <span className="eyebrow">02 · ODS → DWD</span>
          <h3>处理异常，但不把异常藏起来</h3>
        </div>
        <p>目标：一行 = 一个账户 × 一个快照日</p>
      </div>
      <MetricsStrip result={result} />
      <div className="sql-workbench__cleaning-layout">
        <div className="sql-workbench__cleaning-table">
          <TablePair result={result} />
        </div>
        <aside className="sql-workbench__signal-panel" aria-labelledby="sql-cleaning-signals-title">
          <span className="eyebrow eyebrow--small">三类处理</span>
          <h4 id="sql-cleaning-signals-title">点击一条证据</h4>
          <div className="sql-workbench__signal-list">
            {result.evidence.map((item, index) => (
              <button
                className={`sql-workbench__signal${selected === item ? ' is-selected' : ''}`}
                type="button"
                onClick={() => setSelectedEvidence(index)}
                key={item.kind}
              >
                <span>{EVIDENCE_LABELS[item.kind]}</span>
                <strong>{item.title}</strong>
              </button>
            ))}
          </div>
          {selected && (
            <div className="sql-workbench__signal-detail" aria-live="polite">
              <p>{selected.detail}</p>
              <div>
                {selected.keys.map((key) => (
                  <code key={key}>{key}</code>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
      <CodePanel stepId="clean-detail" codeHighlights={codeHighlights} />
    </div>
  )
}

function JoinView({
  visualization,
  codeHighlights,
}: {
  visualization: SqlTransformationVisualization
  codeHighlights?: CodeHighlightMap
}) {
  const result = useMemo(
    () => getTransformationStepResult(visualization.dataset, 'join-fanout'),
    [visualization.dataset],
  )
  const [mode, setMode] = useState<'wrong' | 'safe'>('wrong')
  const analysis = result.joinAnalysis!
  const ods = getLayerSnapshots(visualization.dataset)[0]!
  const mediumTable = ods.tables.find((table) => table.id === 'ods-account-media')!
  const safeOutput = result.input

  return (
    <div className="sql-workbench__focus sql-workbench__focus--join">
      <div className="sql-workbench__focus-intro">
        <div>
          <span className="eyebrow">03 · Join 对照</span>
          <h3>先数匹配行，再决定要不要 Join</h3>
        </div>
        <p>Join key：{analysis.joinKey}</p>
      </div>
      <div className="sql-workbench__join-facts" aria-label="Join 前后行数与金额">
        <div>
          <span>左表</span>
          <strong>{analysis.leftRows} 行</strong>
          <small>账户 × 快照日</small>
        </div>
        <div>
          <span>右表</span>
          <strong>{analysis.rightRows} 行</strong>
          <small>账户 × 账户介质</small>
        </div>
        <div className="is-danger">
          <span>直接 Join 后</span>
          <strong>{analysis.outputRows} 行</strong>
          <small>目标余额 {analysis.wrongTargetAmount.toLocaleString('zh-CN')}</small>
        </div>
        <div className="is-safe">
          <span>保持账户日粒度</span>
          <strong>{analysis.correctOutputRows} 行</strong>
          <small>目标余额 {analysis.correctTargetAmount.toLocaleString('zh-CN')}</small>
        </div>
      </div>
      <div className="sql-workbench__join-mode" role="group" aria-label="选择 Join 对照">
        <button
          className={mode === 'wrong' ? 'is-selected' : ''}
          type="button"
          onClick={() => setMode('wrong')}
        >
          查看错误 Join
        </button>
        <button
          className={mode === 'safe' ? 'is-selected' : ''}
          type="button"
          onClick={() => setMode('safe')}
        >
          保持账户日粒度
        </button>
      </div>
      <div className="sql-workbench__join-match-grid">
        <article className="sql-workbench__join-match-card">
          <div className="sql-workbench__section-heading">
            <div>
              <span className="eyebrow eyebrow--small">KEY CARDINALITY</span>
              <h4>每个账户最多匹配几行？</h4>
            </div>
          </div>
          <table className="sql-workbench__match-table">
            <thead>
              <tr>
                <th scope="col">account_id</th>
                <th scope="col">左表</th>
                <th scope="col">右表</th>
                <th scope="col">Join 后</th>
              </tr>
            </thead>
            <tbody>
              {analysis.matches.map((match) => (
                <tr className={match.rightCount > 1 ? 'is-danger' : undefined} key={match.key}>
                  <th scope="row">{match.key}</th>
                  <td>{match.leftCount}</td>
                  <td>{match.rightCount || '—'}</td>
                  <td>{match.outputCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="sql-workbench__join-reason">
          <span className="eyebrow eyebrow--small">一行代表什么？</span>
          <strong>{mode === 'wrong' ? '错误结果改变了数据粒度' : '当前指标不需要这张表'}</strong>
          <p>
            {mode === 'wrong'
              ? 'A001 的 100000 被复制到三个账户介质行，SQL 没报错，但按行求和已经失去账户日余额的含义。'
              : '如果业务只需要存款余额，就直接使用 DWD。若要判断是否有介质，应先把 AccountMedium 聚合到账户级，或使用 EXISTS。'}
          </p>
        </article>
      </div>
      <div className="sql-workbench__join-tables">
        <article className="sql-workbench__table-card">
          <div className="sql-workbench__table-card-heading">
            <span>左表</span>
            <strong>{result.input.name}</strong>
            <small>{result.input.grain}</small>
          </div>
          <SnapshotTable table={result.input} caption="DWD 存款余额明细" />
        </article>
        <article className="sql-workbench__table-card">
          <div className="sql-workbench__table-card-heading">
            <span>右表</span>
            <strong>{mediumTable.name}</strong>
            <small>{mediumTable.grain}</small>
          </div>
          <SnapshotTable table={mediumTable} caption="账户介质辅助表" />
        </article>
      </div>
      <article className="sql-workbench__join-output">
        <div className="sql-workbench__table-card-heading">
          <span>{mode === 'wrong' ? '错误 Join 输出' : '不 Join 的结果'}</span>
          <strong>{mode === 'wrong' ? result.output.name : safeOutput.name}</strong>
          <small>{mode === 'wrong' ? result.output.grain : safeOutput.grain}</small>
        </div>
        <SnapshotTable
          table={mode === 'wrong' ? result.output : safeOutput}
          changes={mode === 'wrong' ? result.changes : []}
          comparisonColumns={mode === 'wrong' ? result.comparisonColumns : undefined}
          caption="Join 结果快照"
        />
      </article>
      <CodePanel stepId="join-fanout" codeHighlights={codeHighlights} />
      <EvidenceList evidence={result.evidence} />
    </div>
  )
}

function LayerView({
  visualization,
  codeHighlights,
}: {
  visualization: SqlTransformationVisualization
  codeHighlights?: CodeHighlightMap
}) {
  const snapshots = useMemo(() => getLayerSnapshots(visualization.dataset), [visualization.dataset])
  const [selectedLayer, setSelectedLayer] = useState<Layer>('dwd')
  const [selectedTableId, setSelectedTableId] = useState('dwd-deposit-balance-detail')
  const activeSnapshot =
    snapshots.find((snapshot) => snapshot.layer === selectedLayer) ?? snapshots[0]!
  const activeTable =
    activeSnapshot.tables.find((table) => table.id === selectedTableId) ?? activeSnapshot.tables[0]!
  const activeMetrics = getTableMetrics(activeTable, visualization.targetDate)
  const result = useMemo(
    () => getTransformationStepResult(visualization.dataset, 'aggregate-layers'),
    [visualization.dataset],
  )

  function selectLayer(layer: Layer) {
    const nextSnapshot = snapshots.find((snapshot) => snapshot.layer === layer)
    setSelectedLayer(layer)
    setSelectedTableId(nextSnapshot?.tables[0]?.id ?? '')
  }

  return (
    <div className="sql-workbench__focus sql-workbench__focus--layers">
      <div className="sql-workbench__focus-intro">
        <div>
          <span className="eyebrow">04 · 分层快照</span>
          <h3>切换一层，重新读一行</h3>
        </div>
        <p>业务日期：{visualization.targetDate}</p>
      </div>
      <div className="sql-workbench__layer-flow" aria-label="存款余额加工链">
        {TRANSFORMATION_LAYER_ORDER.map((layer, index) => {
          const snapshot = snapshots.find((candidate) => candidate.layer === layer)!
          const table = snapshot.tables[0]!
          return (
            <div className="sql-workbench__layer-flow-item" key={layer}>
              <button
                className={selectedLayer === layer ? 'is-selected' : ''}
                type="button"
                onClick={() => selectLayer(layer)}
              >
                <span>{snapshot.label}</span>
                <strong>{table.rows.length} 行</strong>
                <small>{LAYER_LABELS[layer]}</small>
              </button>
              {index < TRANSFORMATION_LAYER_ORDER.length - 1 && <b aria-hidden="true">→</b>}
            </div>
          )
        })}
      </div>
      <section className="sql-workbench__layer-panel" aria-labelledby="sql-layer-panel-title">
        <div className="sql-workbench__section-heading">
          <div>
            <span className="eyebrow eyebrow--small">{activeSnapshot.label}</span>
            <h4 id="sql-layer-panel-title">{activeSnapshot.title}</h4>
          </div>
          <p>{activeSnapshot.description}</p>
        </div>
        {activeSnapshot.tables.length > 1 && (
          <div
            className="sql-workbench__table-tabs"
            role="tablist"
            aria-label={`${activeSnapshot.label} 表选择`}
          >
            {activeSnapshot.tables.map((table) => (
              <button
                className={activeTable.id === table.id ? 'is-selected' : ''}
                type="button"
                role="tab"
                aria-selected={activeTable.id === table.id}
                onClick={() => setSelectedTableId(table.id)}
                key={table.id}
              >
                {table.name}
              </button>
            ))}
          </div>
        )}
        <div className="sql-workbench__layer-meta">
          <div>
            <span>当前一行</span>
            <strong>{activeTable.grain}</strong>
          </div>
          <div>
            <span>行数</span>
            <strong>{activeMetrics.rowCount}</strong>
          </div>
          <div>
            <span>金额合计</span>
            <strong>{activeMetrics.amount.toLocaleString('zh-CN')}</strong>
          </div>
        </div>
        <SnapshotTable table={activeTable} caption={`${activeTable.name} 分层快照`} />
      </section>
      <div className="sql-workbench__layer-observation">
        <div>
          <span className="eyebrow eyebrow--small">变化解释</span>
          <strong>DWD 4 行 → DWS 3 行 → ADS 1 行</strong>
        </div>
        <p>
          A001 与 A002 在 DWS 合并为杭州分行、小微、定期、CNY 这一组，目标余额是{' '}
          {result.output.rows
            .find((row) => row.customer_scope === '小微')
            ?.balance?.toLocaleString('zh-CN') ?? '0'}{' '}
          元；ADS 再筛出指标卡对应的一行。
        </p>
      </div>
      <CodePanel stepId="aggregate-layers" codeHighlights={codeHighlights} />
      <EvidenceList evidence={result.evidence} />
    </div>
  )
}

function ContractView({
  visualization,
  codeHighlights,
}: {
  visualization: SqlTransformationVisualization
  codeHighlights?: CodeHighlightMap
}) {
  const result = useMemo(
    () => getTransformationStepResult(visualization.dataset, 'contract'),
    [visualization.dataset],
  )
  const { taskContract } = visualization

  return (
    <div className="sql-workbench__focus sql-workbench__focus--contract">
      <div className="sql-workbench__focus-intro">
        <div>
          <span className="eyebrow">05 · 加工契约（Task Contract）</span>
          <h3>把数据语义交给下一环节</h3>
        </div>
        <p>先写边界，再交给运行系统安排</p>
      </div>
      <section className="sql-workbench__contract-card" aria-labelledby="sql-contract-title">
        <div className="sql-workbench__section-heading">
          <div>
            <span className="eyebrow eyebrow--small">DELIVERY BOUNDARY</span>
            <h4 id="sql-contract-title">存款余额加工契约</h4>
          </div>
          <code>{taskContract.taskId}</code>
        </div>
        <dl className="sql-workbench__contract-grid">
          <div>
            <dt>输入</dt>
            <dd>
              {taskContract.inputTables.map((table) => (
                <code key={table}>{table}</code>
              ))}
            </dd>
          </div>
          <div>
            <dt>输出</dt>
            <dd>
              <code>{taskContract.outputTable}</code>
            </dd>
          </div>
          <div>
            <dt>数据粒度</dt>
            <dd>
              <strong>{taskContract.outputGrain}</strong>
            </dd>
          </div>
          <div>
            <dt>业务日期</dt>
            <dd>
              <strong>{taskContract.businessDate}</strong>
            </dd>
          </div>
          <div>
            <dt>目标分区</dt>
            <dd>
              <code>
                {taskContract.partition.column} = {taskContract.partition.value}
              </code>
            </dd>
          </div>
          <div>
            <dt>上游依赖</dt>
            <dd>
              {taskContract.dependencies.map((dependency) => (
                <code key={dependency}>{dependency}</code>
              ))}
            </dd>
          </div>
          <div className="sql-workbench__contract-grid-wide">
            <dt>重复执行预期</dt>
            <dd>
              <strong>{taskContract.repeatExecution}</strong>
            </dd>
          </div>
        </dl>
      </section>
      <TablePair result={result} />
      <div className="sql-workbench__handoff-note">
        <strong>留给运行系统的问题：</strong>
        如果属于 {taskContract.businessDate}{' '}
        的输入晚到，什么时候触发这条加工、需要重新处理哪个分区，由调度系统根据依赖和运行记录决定。
      </div>
      <CodePanel stepId="contract" codeHighlights={codeHighlights} />
      <EvidenceList evidence={result.evidence} />
    </div>
  )
}

export function SqlTransformationWorkbench({
  visualization,
  codeHighlights,
}: SqlTransformationWorkbenchProps) {
  const focus: TransformationFocus = visualization.focus ?? 'layers'

  return (
    <div className={`sql-transformation-workbench sql-transformation-workbench--${focus}`}>
      <div className="sql-workbench__toolbar">
        <div>
          <span className="sql-workbench__toolbar-label">
            SQL 与数据加工 · Banking Teaching Domain
          </span>
          <p>业务日期 {visualization.targetDate} · 账户余额快照 → 存款余额指标</p>
        </div>
      </div>
      {focus === 'plan' && (
        <PlanView visualization={visualization} codeHighlights={codeHighlights} />
      )}
      {focus === 'cleaning' && (
        <CleaningView visualization={visualization} codeHighlights={codeHighlights} />
      )}
      {focus === 'join' && (
        <JoinView visualization={visualization} codeHighlights={codeHighlights} />
      )}
      {focus === 'layers' && (
        <LayerView visualization={visualization} codeHighlights={codeHighlights} />
      )}
      {focus === 'contract' && (
        <ContractView visualization={visualization} codeHighlights={codeHighlights} />
      )}
    </div>
  )
}

export type { SqlTransformationWorkbenchProps }
