import { useMemo, useState } from 'react'
import type {
  SqlTransformationVisualization,
  TransformationEvidence,
  TransformationGrain,
  TransformationLayer,
  TransformationLayerSnapshot,
  TransformationPrediction,
  TransformationRow,
  TransformationRowChangeKind,
  TransformationStepId,
  TransformationStepResult,
  TransformationTableSnapshot,
  TransformationWorkbenchState,
} from '../../features/sql-transformation/types'
import { CodeRenderer } from '../lesson/CodeRenderer'
import type { CodeHighlightMap } from '../../utils/code-highlight'
import { getCodeHighlightKey } from '../../utils/code-highlight'
import {
  TRANSFORMATION_LAYER_ORDER,
  TRANSFORMATION_STEPS,
  canExecuteTransformationStep,
  createInitialTransformationState,
  executeTransformationStep,
  getLayerSnapshots,
  getTableMetrics,
  getTransformationStepResult,
  selectTransformationGrain,
  selectTransformationStep,
  setTransformationPrediction,
} from '../../utils/sql-transformation'
import '../../styles/lessons/sql-workbench.css'

interface SqlTransformationWorkbenchProps {
  visualization: SqlTransformationVisualization
  codeHighlights?: CodeHighlightMap
}

type SnapshotLayer = TransformationLayer

type GrainOption = {
  value: TransformationGrain
  label: string
  statement: string
  detail: string
}

const grainOptions: readonly GrainOption[] = [
  {
    value: 'order-item',
    label: '订单商品',
    statement: '一行 = 一个订单中的一个商品',
    detail: '保留最细的交易明细，退款按明细金额分摊。',
  },
  {
    value: 'order',
    label: '订单',
    statement: '一行 = 一个订单',
    detail: '本例销售额推荐粒度，支付和退款都能一对一对齐。',
  },
  {
    value: 'day',
    label: '支付日',
    statement: '一行 = 一个支付日',
    detail: '可以直接回答日报，但会过早丢失订单和商品明细。',
  },
]

const layerLabels: Record<SnapshotLayer, string> = {
  ods: '原始数据',
  dwd: '标准明细',
  dws: '主题汇总',
  ads: '应用指标',
}

const predictionOptions: readonly {
  value: TransformationPrediction
  label: string
  detail: string
}[] = [
  { value: 'increase', label: '增加', detail: '输出行数或金额会变大' },
  { value: 'decrease', label: '减少', detail: '输出行数或金额会变小' },
  { value: 'unchanged', label: '不变', detail: '粒度和金额应保持一致' },
]

const changeLabels: Record<TransformationRowChangeKind, string> = {
  same: '未变化',
  added: '新增',
  removed: '删除',
  merged: '合并',
  duplicated: '重复',
  updated: '更新',
}

const evidenceLabels: Record<TransformationEvidence['kind'], string> = {
  'duplicate-event': '重复事件',
  'null-preserved': 'NULL 保留',
  'many-to-many': '多对多 JOIN',
  'grain-mismatch': '粒度错位',
  'time-boundary': '时间边界',
  'late-partition': '迟到分区',
}

function getGrainOption(grain: TransformationGrain | null): GrainOption | undefined {
  return grainOptions.find((option) => option.value === grain)
}

function formatCell(value: string | number | null) {
  if (value === null) {
    return <span className="sql-workbench__null">NULL</span>
  }

  return typeof value === 'number' ? value.toLocaleString('zh-CN') : value
}

function getRowKey(row: TransformationRow, columns: readonly string[]): string {
  return columns
    .map((column) => {
      const value =
        column === 'paid_date' && !Object.prototype.hasOwnProperty.call(row, 'paid_date')
          ? row.dt
          : column === 'dt' && !Object.prototype.hasOwnProperty.call(row, 'dt')
            ? row.paid_date
            : row[column]
      return `${column}=${String(value ?? 'NULL')}`
    })
    .join('|')
}

function getChangeLabel(kind: TransformationRowChangeKind): string {
  return changeLabels[kind]
}

function SnapshotTable({
  table,
  changes = [],
  comparisonColumns,
  caption,
}: {
  table: TransformationTableSnapshot
  changes?: TransformationStepResult['changes']
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
            const rowLabel = getChangeLabel(changeKind)

            return (
              <tr
                className={`is-${changeKind}`}
                key={`${rowIndex}-${getRowKey(row, table.rowKey)}`}
              >
                <th scope="row" className="sql-workbench__change-cell">
                  <span title={rowLabel}>{changeKind === 'same' ? '·' : rowLabel}</span>
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

function TablePlaceholder({ tableName }: { tableName: string }) {
  return (
    <div className="sql-workbench__table-placeholder" role="status">
      <span className="sql-workbench__placeholder-mark" aria-hidden="true">
        ?
      </span>
      <strong>执行后查看 {tableName}</strong>
      <p>先预测行数和金额的变化，再按下执行。</p>
    </div>
  )
}

function StepList({
  state,
  onSelect,
}: {
  state: TransformationWorkbenchState
  onSelect: (stepId: TransformationStepId) => void
}) {
  const nextStepIndex = state.completedStepIds.length

  return (
    <nav className="sql-workbench__steps" aria-label="SQL 加工步骤">
      <div className="sql-workbench__steps-heading">
        <span className="eyebrow eyebrow--small">PROCESS</span>
        <h3>加工步骤</h3>
        <p>每一步只改变一件事，先预测再执行。</p>
      </div>
      <ol>
        {TRANSFORMATION_STEPS.map((step, index) => {
          const isCompleted = state.completedStepIds.includes(step.id)
          const isActive = state.activeStepId === step.id
          const isLocked = index > nextStepIndex

          return (
            <li key={step.id}>
              <button
                className={`sql-workbench__step${isActive ? ' is-active' : ''}${isCompleted ? ' is-completed' : ''}`}
                type="button"
                disabled={isLocked}
                aria-current={isActive ? 'step' : undefined}
                onClick={() => onSelect(step.id)}
              >
                <span className="sql-workbench__step-number">{step.number}</span>
                <span className="sql-workbench__step-copy">
                  <strong>{step.label}</strong>
                  <small>{step.title}</small>
                </span>
                <span className="sql-workbench__step-status" aria-hidden="true">
                  {isCompleted ? '✓' : isLocked ? '锁' : '→'}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function GrainGate({
  selectedGrain,
  onSelect,
}: {
  selectedGrain: TransformationGrain | null
  onSelect: (grain: TransformationGrain) => void
}) {
  return (
    <section className="sql-workbench__grain-gate" aria-labelledby="sql-grain-gate-title">
      <div className="sql-workbench__grain-heading">
        <span className="eyebrow">STEP 00 · GRAIN FIRST</span>
        <h3 id="sql-grain-gate-title">先选择目标粒度</h3>
        <p>在执行任何 SQL 之前，先回答：输出表里的一行究竟代表什么？</p>
      </div>
      <div className="sql-workbench__grain-options" role="radiogroup" aria-label="目标粒度">
        {grainOptions.map((option) => {
          const isSelected = selectedGrain === option.value
          return (
            <button
              className={`sql-workbench__grain-option${isSelected ? ' is-selected' : ''}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(option.value)}
              key={option.value}
            >
              <span className="sql-workbench__radio" aria-hidden="true">
                {isSelected ? '●' : '○'}
              </span>
              <span>
                <strong>{option.label}</strong>
                <small>{option.statement}</small>
                <em>{option.detail}</em>
              </span>
            </button>
          )
        })}
      </div>
      {!selectedGrain && (
        <p className="sql-workbench__gate-note" role="status">
          还没有目标粒度；左侧步骤已锁定。
        </p>
      )}
    </section>
  )
}

function PredictionPanel({
  step,
  prediction,
  onSelect,
  onExecute,
  canExecute,
  isExecuted,
}: {
  step: TransformationStepResult['step']
  prediction: TransformationPrediction | undefined
  onSelect: (prediction: TransformationPrediction) => void
  onExecute: () => void
  canExecute: boolean
  isExecuted: boolean
}) {
  return (
    <section className="sql-workbench__prediction" aria-labelledby="sql-prediction-title">
      <div>
        <span className="eyebrow eyebrow--small">PREDICT FIRST</span>
        <h3 id="sql-prediction-title">执行前，你认为会怎样？</h3>
        <p>{step.expectedChangeLabel}。选完预测，才会解锁执行。</p>
      </div>
      <div className="sql-workbench__prediction-actions">
        <div className="sql-workbench__prediction-options" role="group" aria-label="预测行数变化">
          {predictionOptions.map((option) => {
            const isSelected = prediction === option.value
            return (
              <button
                className={`sql-workbench__prediction-option${isSelected ? ' is-selected' : ''}`}
                type="button"
                aria-pressed={isSelected}
                disabled={isExecuted}
                onClick={() => onSelect(option.value)}
                key={option.value}
              >
                <strong>{option.label}</strong>
                <small>{option.detail}</small>
              </button>
            )
          })}
        </div>
        <button
          className="button button--primary sql-workbench__execute"
          type="button"
          disabled={!canExecute || isExecuted}
          onClick={onExecute}
        >
          {isExecuted ? '已执行' : `执行 ${step.number}`}
        </button>
      </div>
    </section>
  )
}

function StepCode({
  step,
  codeHighlights,
}: {
  step: TransformationStepResult['step']
  codeHighlights?: CodeHighlightMap
}) {
  const highlightedCode = codeHighlights?.[getCodeHighlightKey('sql', step.sql)]

  return (
    <section className="sql-workbench__sql" aria-labelledby="sql-fragment-title">
      <div className="sql-workbench__sql-heading">
        <div>
          <span className="eyebrow eyebrow--small">SQL CONTROL</span>
          <h3 id="sql-fragment-title">{step.title}</h3>
        </div>
        <span>{step.layer}</span>
      </div>
      <p>{step.description}</p>
      <CodeRenderer
        className="sql-workbench__code"
        code={step.sql}
        highlightedCode={highlightedCode}
      />
      <small>这是本地确定性实验片段，不会连接数据库或执行任意 SQL。</small>
    </section>
  )
}

function MetricsBar({ result }: { result: TransformationStepResult }) {
  const cards = [
    ['输入行数', result.inputMetrics.rowCount, '输出', result.outputMetrics.rowCount],
    [
      '输入金额',
      result.inputMetrics.amount,
      '输出',
      result.outputMetrics.amount,
      result.outputMetrics.amountColumn,
    ],
    ['目标日期金额', result.inputMetrics.targetAmount, '输出', result.outputMetrics.targetAmount],
  ] as const

  return (
    <div className="sql-workbench__metrics" aria-live="polite">
      {cards.map(([label, inputValue, outputLabel, outputValue, note]) => (
        <div className="sql-workbench__metric" key={label}>
          <span>{label}</span>
          <div>
            <strong>{inputValue.toLocaleString('zh-CN')}</strong>
            <b aria-hidden="true">→</b>
            <strong>{outputValue.toLocaleString('zh-CN')}</strong>
          </div>
          <small>
            {outputLabel} {note ? `· ${note}` : ''}
          </small>
        </div>
      ))}
    </div>
  )
}

function ChangeLegend({ changes }: { changes: TransformationStepResult['changes'] }) {
  const counts = changes.reduce<Partial<Record<TransformationRowChangeKind, number>>>(
    (result, change) => {
      result[change.kind] = (result[change.kind] ?? 0) + 1
      return result
    },
    {},
  )
  const visibleChanges = Object.entries(counts).filter(([kind]) => kind !== 'same') as Array<
    [TransformationRowChangeKind, number]
  >

  if (visibleChanges.length === 0) {
    return (
      <p className="sql-workbench__change-note">
        没有检测到行级变化；这一步主要改变字段或验证边界。
      </p>
    )
  }

  return (
    <div className="sql-workbench__change-legend" aria-label="表快照差异图例">
      <span>差异证据</span>
      {visibleChanges.map(([kind, count]) => (
        <span className={`is-${kind}`} key={kind}>
          <i aria-hidden="true" />
          {getChangeLabel(kind)} {count}
        </span>
      ))}
    </div>
  )
}

function EvidencePanel({ evidence }: { evidence: readonly TransformationEvidence[] }) {
  return (
    <section
      className="sql-workbench__evidence"
      aria-labelledby="sql-evidence-title"
      aria-live="polite"
    >
      <div className="sql-workbench__evidence-heading">
        <span className="eyebrow eyebrow--small">PROOF</span>
        <h3 id="sql-evidence-title">证据，不只是答案</h3>
      </div>
      <div className="sql-workbench__evidence-list">
        {evidence.map((item) => (
          <article className="sql-workbench__evidence-item" key={`${item.kind}-${item.title}`}>
            <div>
              <span>{evidenceLabels[item.kind]}</span>
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

function TableComparison({
  result,
  executed,
}: {
  result: TransformationStepResult
  executed: boolean
}) {
  return (
    <section className="sql-workbench__comparison" aria-labelledby="sql-comparison-title">
      <div className="sql-workbench__comparison-heading">
        <div>
          <span className="eyebrow eyebrow--small">SNAPSHOT DIFF</span>
          <h3 id="sql-comparison-title">输入表 → 输出表</h3>
        </div>
        <p>
          输入：<code>{result.input.name}</code> · 输出：<code>{result.output.name}</code>
        </p>
      </div>
      <div className="sql-workbench__tables">
        <article className="sql-workbench__table-panel">
          <div className="sql-workbench__table-panel-heading">
            <span>输入表</span>
            <strong>{result.input.grain}</strong>
          </div>
          <SnapshotTable
            table={result.input}
            changes={executed ? result.changes : []}
            comparisonColumns={result.comparisonColumns}
            caption={`${result.input.name} 输入快照`}
          />
        </article>
        <div className="sql-workbench__table-arrow" aria-hidden="true">
          →
        </div>
        <article className="sql-workbench__table-panel">
          <div className="sql-workbench__table-panel-heading">
            <span>输出表</span>
            <strong>{result.output.grain}</strong>
          </div>
          {executed ? (
            <SnapshotTable
              table={result.output}
              changes={executed ? result.changes : []}
              comparisonColumns={result.comparisonColumns}
              caption={`${result.output.name} 输出快照`}
            />
          ) : (
            <TablePlaceholder tableName={result.output.name} />
          )}
        </article>
      </div>
      {executed && <ChangeLegend changes={result.changes} />}
    </section>
  )
}

function ResultFeedback({
  result,
  prediction,
}: {
  result: TransformationStepResult
  prediction: TransformationPrediction | undefined
}) {
  const isCorrect = prediction === result.actualChange
  const predictionText = prediction
    ? predictionOptions.find((option) => option.value === prediction)?.label
    : '未选择'
  const actualText = predictionOptions.find((option) => option.value === result.actualChange)?.label

  return (
    <div
      className={`sql-workbench__feedback${isCorrect ? ' is-correct' : ' is-mismatch'}`}
      role="status"
    >
      <strong>{isCorrect ? '预测命中' : '预测与快照不一致'}</strong>
      <span>
        你的预测：{predictionText} · 实际行数变化：{actualText}
      </span>
    </div>
  )
}

function SnapshotExplorer({
  snapshots,
  targetDate,
  selectedLayer,
  selectedTableId,
  onSelectLayer,
  onSelectTable,
}: {
  snapshots: readonly TransformationLayerSnapshot[]
  targetDate: string
  selectedLayer: SnapshotLayer
  selectedTableId: string
  onSelectLayer: (layer: SnapshotLayer) => void
  onSelectTable: (tableId: string) => void
}) {
  const activeSnapshot =
    snapshots.find((snapshot) => snapshot.layer === selectedLayer) ?? snapshots[0]
  const activeTable =
    activeSnapshot?.tables.find((table) => table.id === selectedTableId) ??
    activeSnapshot?.tables[0]
  const activeIndex = TRANSFORMATION_LAYER_ORDER.indexOf(selectedLayer)
  const previousSnapshot = activeIndex > 0 ? snapshots[activeIndex - 1] : undefined
  const previousTable = previousSnapshot?.tables[0]
  const activeMetrics = activeTable ? getTableMetrics(activeTable, targetDate) : undefined

  if (!activeSnapshot || !activeTable) {
    return null
  }

  return (
    <section className="sql-workbench__snapshots" aria-labelledby="sql-snapshots-title">
      <div className="sql-workbench__snapshot-heading">
        <div>
          <span className="eyebrow">LAYER SNAPSHOTS</span>
          <h3 id="sql-snapshots-title">切换 ODS → DWD → DWS → ADS</h3>
        </div>
        <p>同一个销售问题，在不同层看到的行数、粒度和金额并不相同。</p>
      </div>
      <div className="sql-workbench__layer-tabs" role="tablist" aria-label="数仓分层快照">
        {snapshots.map((snapshot) => {
          const isSelected = snapshot.layer === selectedLayer
          return (
            <button
              className={`sql-workbench__layer-tab${isSelected ? ' is-selected' : ''}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`sql-layer-panel-${snapshot.layer}`}
              onClick={() => onSelectLayer(snapshot.layer)}
              key={snapshot.layer}
            >
              <strong>{snapshot.label}</strong>
              <span>{layerLabels[snapshot.layer]}</span>
            </button>
          )
        })}
      </div>
      <div
        className="sql-workbench__snapshot-panel"
        id={`sql-layer-panel-${activeSnapshot.layer}`}
        role="tabpanel"
      >
        <div className="sql-workbench__snapshot-panel-heading">
          <div>
            <span className="eyebrow eyebrow--small">{activeSnapshot.label}</span>
            <h4>{activeSnapshot.title}</h4>
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
                className={`sql-workbench__table-tab${table.id === activeTable.id ? ' is-selected' : ''}`}
                type="button"
                role="tab"
                aria-selected={table.id === activeTable.id}
                onClick={() => onSelectTable(table.id)}
                key={table.id}
              >
                {table.name}
              </button>
            ))}
          </div>
        )}
        <div className="sql-workbench__snapshot-meta" aria-live="polite">
          <div>
            <span>当前粒度</span>
            <strong>{activeTable.grain}</strong>
          </div>
          <div>
            <span>行数</span>
            <strong>{activeTable.rows.length}</strong>
          </div>
          <div>
            <span>金额字段</span>
            <strong>{activeTable.amountColumn ?? '—'}</strong>
          </div>
          <div>
            <span>表金额</span>
            <strong>{activeMetrics?.amount.toLocaleString('zh-CN') ?? '0'}</strong>
          </div>
        </div>
        <SnapshotTable table={activeTable} caption={`${activeTable.name} 分层快照`} />
        {previousTable && (
          <p className="sql-workbench__snapshot-diff-note">
            <span>上一层对照：</span>
            {previousTable.rows.length} 行 → {activeTable.rows.length}{' '}
            行；执行步骤后的差异表会用颜色标记新增、删除、合并、重复或更新。
          </p>
        )}
      </div>
    </section>
  )
}

function TaskContract({ visualization }: { visualization: SqlTransformationVisualization }) {
  const { taskContract } = visualization

  return (
    <section className="sql-workbench__contract" aria-labelledby="sql-contract-title">
      <div className="sql-workbench__contract-heading">
        <div>
          <span className="eyebrow">HANDOFF TO #12</span>
          <h3 id="sql-contract-title">给调度系统的稳定任务描述</h3>
        </div>
        <p>这里只定义调度器未来要消费的输入，不在本章实现调度。</p>
      </div>
      <dl>
        <div>
          <dt>task id</dt>
          <dd>
            <code>{taskContract.taskId}</code>
          </dd>
        </div>
        <div>
          <dt>输入表</dt>
          <dd>
            {taskContract.inputTables.map((table) => (
              <code key={table}>{table}</code>
            ))}
          </dd>
        </div>
        <div>
          <dt>输出表</dt>
          <dd>
            <code>{taskContract.outputTable}</code>
          </dd>
        </div>
        <div>
          <dt>数据分区</dt>
          <dd>
            <code>
              {taskContract.partition.column} = {taskContract.partition.value}
            </code>
          </dd>
        </div>
        <div>
          <dt>依赖</dt>
          <dd>
            {taskContract.dependencies.map((dependency) => (
              <code key={dependency}>{dependency}</code>
            ))}
          </dd>
        </div>
        <div>
          <dt>幂等 / 局部重跑</dt>
          <dd>
            <span className="sql-workbench__boolean">
              {taskContract.isIdempotent ? '是' : '否'}
            </span>
            <span className="sql-workbench__boolean">
              {taskContract.supportsPartialRerun ? '支持' : '不支持'}
            </span>
          </dd>
        </div>
      </dl>
      <p className="sql-workbench__rerun-hint">
        <strong>迟到数据提示：</strong> {taskContract.rerunHint}
      </p>
    </section>
  )
}

export function SqlTransformationWorkbench({
  visualization,
  codeHighlights,
}: SqlTransformationWorkbenchProps) {
  const [state, setState] = useState<TransformationWorkbenchState>(createInitialTransformationState)
  const [selectedLayer, setSelectedLayer] = useState<SnapshotLayer>('ods')
  const [selectedTableId, setSelectedTableId] = useState('ods-orders')

  const targetGrain = state.targetGrain ?? 'order'
  const includeLateData = state.completedStepIds.includes('late-data')
  const snapshots = useMemo(
    () => getLayerSnapshots(visualization.dataset, targetGrain, includeLateData),
    [includeLateData, targetGrain, visualization.dataset],
  )
  const activeStep =
    TRANSFORMATION_STEPS.find((step) => step.id === state.activeStepId) ?? TRANSFORMATION_STEPS[0]!
  const activeResult = useMemo(
    () => getTransformationStepResult(visualization.dataset, targetGrain, activeStep.id),
    [activeStep.id, targetGrain, visualization.dataset],
  )
  const isActiveStepExecuted = state.completedStepIds.includes(activeStep.id)
  const canExecute = Boolean(state.targetGrain && canExecuteTransformationStep(state))
  const selectedGrainOption = getGrainOption(state.targetGrain)
  const completedCount = state.completedStepIds.length

  function handleSelectGrain(grain: TransformationGrain) {
    setState((current) => selectTransformationGrain(current, grain))
    setSelectedLayer('ods')
    setSelectedTableId('ods-orders')
  }

  function handleSelectStep(stepId: TransformationStepId) {
    setState((current) => selectTransformationStep(current, stepId))
  }

  function handlePrediction(prediction: TransformationPrediction) {
    setState((current) => setTransformationPrediction(current, prediction))
  }

  function handleExecute() {
    setState((current) => executeTransformationStep(current))
  }

  function resetExperiment() {
    setState(createInitialTransformationState())
    setSelectedLayer('ods')
    setSelectedTableId('ods-orders')
  }

  return (
    <div className="sql-transformation-workbench">
      <div className="sql-workbench__toolbar">
        <div>
          <span className="sql-workbench__toolbar-label">SQL 工作台 · 本地确定性实验</span>
          <p aria-live="polite">
            {state.targetGrain
              ? `目标粒度：${selectedGrainOption?.statement ?? '—'} · 已完成 ${completedCount}/${TRANSFORMATION_STEPS.length} 步`
              : '目标粒度未选择 · 核心实验尚未解锁'}
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={resetExperiment}
        >
          重置实验
        </button>
      </div>

      <GrainGate selectedGrain={state.targetGrain} onSelect={handleSelectGrain} />

      <div className="sql-workbench__workspace">
        <StepList state={state} onSelect={handleSelectStep} />
        <section className="sql-workbench__main" aria-labelledby="sql-active-step-title">
          <div className="sql-workbench__active-heading">
            <div>
              <span className="eyebrow">
                STEP {activeStep.number} · {activeStep.layer}
              </span>
              <h3 id="sql-active-step-title">{activeStep.title}</h3>
            </div>
            <span className="sql-workbench__active-grain">
              {selectedGrainOption?.label ?? '等待选择粒度'}
            </span>
          </div>

          {state.targetGrain ? (
            <>
              <StepCode step={activeResult.step} codeHighlights={codeHighlights} />
              <PredictionPanel
                step={activeResult.step}
                prediction={state.predictions[activeStep.id]}
                onSelect={handlePrediction}
                onExecute={handleExecute}
                canExecute={canExecute}
                isExecuted={isActiveStepExecuted}
              />
              <TableComparison result={activeResult} executed={isActiveStepExecuted} />
              {isActiveStepExecuted && (
                <>
                  <MetricsBar result={activeResult} />
                  <ResultFeedback
                    result={activeResult}
                    prediction={state.predictions[activeStep.id]}
                  />
                  <EvidencePanel evidence={activeResult.evidence} />
                </>
              )}
            </>
          ) : (
            <div className="sql-workbench__locked" role="status">
              <span aria-hidden="true">01</span>
              <strong>目标粒度是实验的入口</strong>
              <p>先在上方选择订单商品、订单或支付日，才能看到可执行的 SQL 和输出快照。</p>
            </div>
          )}
        </section>
      </div>

      <SnapshotExplorer
        snapshots={snapshots}
        targetDate={visualization.targetDate}
        selectedLayer={selectedLayer}
        selectedTableId={selectedTableId}
        onSelectLayer={(layer) => {
          setSelectedLayer(layer)
          const nextSnapshot = snapshots.find((snapshot) => snapshot.layer === layer)
          setSelectedTableId(nextSnapshot?.tables[0]?.id ?? '')
        }}
        onSelectTable={setSelectedTableId}
      />
      <TaskContract visualization={visualization} />
    </div>
  )
}

export type { SqlTransformationWorkbenchProps }
