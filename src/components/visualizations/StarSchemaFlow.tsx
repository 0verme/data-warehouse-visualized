import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  GrainId,
  GrainErrorDemo,
  GrainOption,
  StarSchemaFieldGroup,
  StarSchemaFieldRole,
  StarSchemaTable,
  StarSchemaTableData,
  StarSchemaTableType,
  StarSchemaTone,
  StarSchemaVisualization,
} from '../../types'
import { calculateGrainErrorResult, getGrainOption } from '../../utils/star-schema'

interface StarSchemaFlowProps {
  visualization: StarSchemaVisualization
}

type ModelingPhase = 'raw' | 'splitting' | 'modeled'
type ErrorStep = 'wrong' | 'calculated' | 'fixed'

const tableTypeLabels = {
  fact: '事实表',
  dimension: '维度表',
} satisfies Record<StarSchemaTableType, string>

const fieldRoleLabels = {
  key: '键',
  attribute: '属性',
  measure: '事实',
} satisfies Record<StarSchemaFieldRole, string>

const modelingPhaseLabels = {
  raw: '字段仍然混在 order_raw 大宽表中',
  splitting: '正在按业务实体拆分字段……',
  modeled: '事实表居中，维度表围绕四周',
} satisfies Record<ModelingPhase, string>

const errorStepLabels = {
  wrong: '先观察错误模型',
  calculated: 'SUM 已经暴露重复计算',
  fixed: '字段和粒度已经对齐',
} satisfies Record<ErrorStep, string>

function getModelingActionLabel(phase: ModelingPhase): string {
  if (phase === 'modeled') {
    return '重新播放'
  }

  if (phase === 'splitting') {
    return '建模中…'
  }

  return '开始建模'
}

function getToneClass(tone: StarSchemaTone): string {
  return `star-schema__table-cell--${tone}`
}

function DataTable({
  data,
  caption,
  fieldGroups,
  compact = false,
}: {
  data: StarSchemaTableData
  caption: string
  fieldGroups?: readonly StarSchemaFieldGroup[]
  compact?: boolean
}) {
  return (
    <div className={`star-schema__table-wrap${compact ? ' is-compact' : ''}`}>
      <table className="star-schema__table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {data.columns.map((column) => {
              const fieldGroup = fieldGroups?.find((group) => group.fields.includes(column))
              return (
                <th className={fieldGroup ? getToneClass(fieldGroup.tone) : undefined} key={column}>
                  {column}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIndex) => (
            <tr
              key={`${rowIndex}-${data.columns.map((column) => String(row[column] ?? '')).join('-')}`}
            >
              {data.columns.map((column) => {
                const fieldGroup = fieldGroups?.find((group) => group.fields.includes(column))
                return (
                  <td
                    className={fieldGroup ? getToneClass(fieldGroup.tone) : undefined}
                    key={column}
                  >
                    {String(row[column] ?? '—')}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TableNode({
  table,
  isSelected,
  onSelect,
}: {
  table: StarSchemaTable
  isSelected: boolean
  onSelect: (tableId: string) => void
}) {
  return (
    <button
      className={`star-schema__table-node star-schema__table-node--${table.type}${
        isSelected ? ' is-selected' : ''
      }`}
      type="button"
      aria-pressed={isSelected}
      aria-label={`${table.name}，${tableTypeLabels[table.type]}，${table.rowMeaning}`}
      onClick={() => onSelect(table.id)}
    >
      <span className="star-schema__table-node-topline">
        <span>{tableTypeLabels[table.type]}</span>
        <span aria-hidden="true">{isSelected ? '●' : '○'}</span>
      </span>
      <strong>{table.name}</strong>
      <small>{table.rowMeaning}</small>
      <span className="star-schema__table-node-fields">
        {table.fields
          .slice(0, 4)
          .map((field) => field.name)
          .join(' · ')}
        {table.fields.length > 4 ? ' …' : ''}
      </span>
    </button>
  )
}

function StarModelDiagram({
  tables,
  selectedTableId,
  onSelect,
}: {
  tables: readonly StarSchemaTable[]
  selectedTableId: string
  onSelect: (tableId: string) => void
}) {
  const dimensions = tables.filter((table) => table.type === 'dimension')
  const fact = tables.find((table) => table.type === 'fact')

  return (
    <div className="star-schema__diagram" aria-label="事实表和维度表组成的星型模型">
      <div className="star-schema__diagram-note">
        <span className="eyebrow eyebrow--small">STAR SCHEMA</span>
        <p>点击任意节点，查看它在模型中的职责</p>
      </div>
      <div className="star-schema__diagram-grid">
        {dimensions.map((table, index) => (
          <div
            className={`star-schema__table-position star-schema__table-position--dimension-${index}`}
            key={table.id}
          >
            <TableNode
              table={table}
              isSelected={table.id === selectedTableId}
              onSelect={onSelect}
            />
          </div>
        ))}
        <div className="star-schema__spokes" aria-hidden="true">
          {dimensions.map((dimension) => (
            <span key={dimension.id}>连接外键</span>
          ))}
        </div>
        {fact && (
          <div className="star-schema__table-position star-schema__table-position--fact">
            <TableNode table={fact} isSelected={fact.id === selectedTableId} onSelect={onSelect} />
          </div>
        )}
      </div>
      <div className="star-schema__legend" aria-label="模型图例">
        <span>
          <i className="star-schema__legend-dot star-schema__legend-dot--fact" aria-hidden="true" />
          事实表：保存事件和可度量数值
        </span>
        <span>
          <i
            className="star-schema__legend-dot star-schema__legend-dot--dimension"
            aria-hidden="true"
          />
          维度表：提供观察事实的角度
        </span>
      </div>
    </div>
  )
}

function TableInspector({ table }: { table?: StarSchemaTable }) {
  if (!table) {
    return null
  }

  return (
    <aside className="star-schema__inspector" aria-live="polite">
      <div className="star-schema__inspector-heading">
        <div>
          <span className="eyebrow eyebrow--small">当前节点</span>
          <h4>{table.name}</h4>
        </div>
        <span className={`star-schema__type-badge star-schema__type-badge--${table.type}`}>
          {tableTypeLabels[table.type]}
        </span>
      </div>
      <dl className="star-schema__inspector-facts">
        <div>
          <dt>一行代表</dt>
          <dd>{table.rowMeaning}</dd>
        </div>
        <div>
          <dt>{table.key.label}</dt>
          <dd>{table.key.value}</dd>
        </div>
        <div>
          <dt>模型职责</dt>
          <dd>{table.responsibility}</dd>
        </div>
      </dl>
      <div className="star-schema__field-list">
        <span>关键字段</span>
        <ul>
          {table.fields.map((field) => (
            <li key={field.name}>
              <code>{field.name}</code>
              <small>
                {field.label} · {fieldRoleLabels[field.role]}
              </small>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

function RawTableStage({ visualization }: { visualization: StarSchemaVisualization }) {
  return (
    <div className="star-schema__raw-stage">
      <div className="star-schema__raw-stage-heading">
        <div>
          <span className="star-schema__stage-number">01</span>
          <strong>order_raw · 一张大宽表</strong>
        </div>
        <span>所有属性暂时挤在一起</span>
      </div>
      <DataTable
        data={visualization.rawTable}
        caption="订单原始大宽表：同一个用户、店铺和订单属性会在多条明细中重复"
        fieldGroups={visualization.rawFieldGroups}
      />
      <div className="star-schema__field-legend" aria-label="大宽表字段分组">
        {visualization.rawFieldGroups.map((group) => (
          <span key={group.id}>
            <i className={`star-schema__legend-bar star-schema__legend-bar--${group.tone}`} />
            {group.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function SplittingStage({ visualization }: { visualization: StarSchemaVisualization }) {
  return (
    <div className="star-schema__split-stage">
      <div className="star-schema__split-source">
        <span className="star-schema__stage-number">01</span>
        <strong>order_raw</strong>
        <small>识别字段属于谁</small>
        <div className="star-schema__split-pills">
          {visualization.rawFieldGroups.map((group) => (
            <span
              className={`star-schema__split-pill star-schema__split-pill--${group.tone}`}
              key={group.id}
            >
              {group.label}
            </span>
          ))}
        </div>
      </div>
      <div className="star-schema__split-arrow" aria-hidden="true">
        <span>按业务实体拆分</span>
        <strong>→</strong>
      </div>
      <div className="star-schema__split-targets">
        {visualization.tables.map((table) => (
          <div
            className={`star-schema__split-target star-schema__split-target--${table.type}`}
            key={table.id}
          >
            <span>{tableTypeLabels[table.type]}</span>
            <strong>{table.name}</strong>
            <small>
              {table.fields
                .slice(0, 4)
                .map((field) => field.name)
                .join(' · ')}
            </small>
          </div>
        ))}
      </div>
    </div>
  )
}

function GrainSelector({
  options,
  selectedGrainId,
  onSelect,
}: {
  options: readonly GrainOption[]
  selectedGrainId: GrainId
  onSelect: (grainId: GrainId) => void
}) {
  return (
    <div className="grain-lab__options" role="tablist" aria-label="事实表粒度选择">
      {options.map((option, index) => {
        const isSelected = option.id === selectedGrainId
        return (
          <button
            className={`grain-lab__option${isSelected ? ' is-selected' : ''}`}
            type="button"
            role="tab"
            id={`grain-tab-${option.id}`}
            aria-selected={isSelected}
            aria-controls={`grain-panel-${option.id}`}
            onClick={() => onSelect(option.id)}
            key={option.id}
          >
            <span>0{index + 1}</span>
            <strong>{option.label}</strong>
            {option.recommended && <small>本例推荐</small>}
          </button>
        )
      })}
    </div>
  )
}

function GrainLab({
  options,
  selectedGrainId,
  onSelect,
}: {
  options: readonly GrainOption[]
  selectedGrainId: GrainId
  onSelect: (grainId: GrainId) => void
}) {
  const selectedGrain = getGrainOption(options, selectedGrainId) ?? options[0]

  if (!selectedGrain) {
    return null
  }

  return (
    <section className="star-schema__grain-lab" aria-labelledby="grain-lab-title">
      <div className="star-schema__subheading">
        <div>
          <span className="eyebrow">Stage 03 · 粒度实验</span>
          <h3 id="grain-lab-title">选择事实表粒度</h3>
        </div>
        <p>先说清楚“一行代表什么”，表结构和指标才能有边界。</p>
      </div>
      <GrainSelector options={options} selectedGrainId={selectedGrain.id} onSelect={onSelect} />
      <div
        className="grain-lab__panel"
        id={`grain-panel-${selectedGrain.id}`}
        role="tabpanel"
        aria-labelledby={`grain-tab-${selectedGrain.id}`}
      >
        <div className="grain-lab__answer">
          <span className="grain-lab__answer-label">这一行代表</span>
          <strong>{selectedGrain.statement}</strong>
          <p>{selectedGrain.description}</p>
          {selectedGrain.recommended && (
            <span className="grain-lab__recommendation">当前案例推荐</span>
          )}
        </div>
        <div className="grain-lab__use-case">
          <div>
            <span>适合回答</span>
            <p>{selectedGrain.useCase}</p>
          </div>
          <div>
            <span>边界提醒</span>
            <p>{selectedGrain.boundary}</p>
          </div>
        </div>
        <DataTable
          data={{ columns: selectedGrain.columns, rows: selectedGrain.rows }}
          caption={`${selectedGrain.label}示例数据`}
          compact
        />
      </div>
    </section>
  )
}

function GrainErrorDemo({
  demo,
  step,
  result,
  onStepChange,
}: {
  demo: GrainErrorDemo
  step: ErrorStep
  result: ReturnType<typeof calculateGrainErrorResult>
  onStepChange: (step: ErrorStep) => void
}) {
  const isCalculated = step !== 'wrong'
  const isFixed = step === 'fixed'
  const displayedTotal = isFixed ? result.fixedTotal : result.wrongTotal

  return (
    <section className="star-schema__error-demo" aria-labelledby="grain-error-title">
      <div className="star-schema__subheading">
        <div>
          <span className="eyebrow">Stage 04 · 粒度错误模拟</span>
          <h3 id="grain-error-title">同一个订单，为什么会被算成 600 元？</h3>
        </div>
        <p aria-live="polite">{errorStepLabels[step]}</p>
      </div>
      <div className="error-demo__scenario">
        <strong>订单 1001</strong>
        <span>商品 A：100 元</span>
        <span>商品 B：200 元</span>
        <b>实际订单金额：{demo.actualAmount} 元</b>
      </div>
      <div className="error-demo__steps" aria-label="粒度错误修复步骤">
        <span className={step === 'wrong' ? 'is-current' : 'is-done'}>01 错误模型</span>
        <i aria-hidden="true">→</i>
        <span className={isCalculated ? 'is-current' : ''}>02 执行 SUM</span>
        <i aria-hidden="true">→</i>
        <span className={isFixed ? 'is-current' : ''}>03 修复模型</span>
      </div>
      <div className={`error-demo__models error-demo__models--${step}`}>
        <article className="error-demo__model error-demo__model--wrong">
          <div className="error-demo__model-heading">
            <div>
              <span>错误设计</span>
              <strong>order_total_amount 被重复保存</strong>
            </div>
            <code>{demo.wrongMeasure}</code>
          </div>
          <DataTable
            data={{ columns: demo.wrongColumns, rows: demo.wrongRows }}
            caption="错误模型：每个商品行都携带同一个订单总额"
            compact
          />
          <code className="error-demo__sql">{demo.wrongSql}</code>
        </article>
        {isFixed && (
          <article className="error-demo__model error-demo__model--fixed">
            <div className="error-demo__model-heading">
              <div>
                <span>修复设计</span>
                <strong>每个商品行只保存自己的金额</strong>
              </div>
              <code>{demo.fixedMeasure}</code>
            </div>
            <DataTable
              data={{ columns: demo.fixedColumns, rows: demo.fixedRows }}
              caption="修复模型：订单明细粒度对应商品金额"
              compact
            />
            <code className="error-demo__sql">{demo.fixedSql}</code>
          </article>
        )}
      </div>
      <div className="error-demo__actions">
        <button
          className="button button--primary button--small"
          type="button"
          disabled={isCalculated}
          onClick={() => onStepChange('calculated')}
        >
          执行 {demo.wrongSql}
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          disabled={!isCalculated || isFixed}
          onClick={() => onStepChange('fixed')}
        >
          修复模型
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => onStepChange('wrong')}
        >
          重置演示
        </button>
      </div>
      <div className={`error-demo__result error-demo__result--${step}`} aria-live="polite">
        <div>
          <span>实际金额</span>
          <strong>{result.actualAmount} 元</strong>
        </div>
        <div>
          <span>{isFixed ? '修复后 SUM' : '错误统计'}</span>
          <strong>{isCalculated ? `${displayedTotal} 元` : '—'}</strong>
        </div>
        <p>
          {step === 'wrong' && '点击执行 SUM，看看重复的订单总额会发生什么。'}
          {step === 'calculated' && (
            <>
              错误统计比实际金额多出 <b>{result.wrongDifference} 元</b>：两条商品行各自带着 300 元。
            </>
          )}
          {step === 'fixed' && (
            <>
              {demo.fixedMeasure} 与订单明细粒度一致，SUM 后回到 <b>{result.fixedTotal} 元</b>。
            </>
          )}
        </p>
      </div>
    </section>
  )
}

export function StarSchemaFlow({ visualization }: StarSchemaFlowProps) {
  const factTable = visualization.tables.find((table) => table.type === 'fact')
  const recommendedGrainId =
    visualization.grains.find((grain) => grain.recommended)?.id ??
    visualization.grains[0]?.id ??
    'order-item'
  const [modelingPhase, setModelingPhase] = useState<ModelingPhase>('raw')
  const [selectedTableId, setSelectedTableId] = useState(
    factTable?.id ?? visualization.tables[0]?.id ?? '',
  )
  const [selectedGrainId, setSelectedGrainId] = useState<GrainId>(recommendedGrainId)
  const [errorStep, setErrorStep] = useState<ErrorStep>('wrong')
  const timerIds = useRef<number[]>([])
  const errorResult = useMemo(
    () => calculateGrainErrorResult(visualization.errorDemo),
    [visualization.errorDemo],
  )
  const selectedTable = visualization.tables.find((table) => table.id === selectedTableId)

  function clearTimers() {
    timerIds.current.forEach((timerId) => window.clearTimeout(timerId))
    timerIds.current = []
  }

  function startModeling() {
    clearTimers()

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setModelingPhase('modeled')
      return
    }

    setModelingPhase('splitting')
    const modelingTimer = window.setTimeout(() => setModelingPhase('modeled'), 950)
    timerIds.current.push(modelingTimer)
  }

  function resetLesson() {
    clearTimers()
    setModelingPhase('raw')
    setSelectedTableId(factTable?.id ?? visualization.tables[0]?.id ?? '')
    setSelectedGrainId(recommendedGrainId)
    setErrorStep('wrong')
  }

  useEffect(() => {
    return () => clearTimers()
  }, [])

  return (
    <div className="star-schema-flow">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">星型模型建模实验</span>
          <p aria-live="polite">{modelingPhaseLabels[modelingPhase]}</p>
        </div>
        <div className="visualization-toolbar__actions">
          <button
            className="button button--primary button--small"
            type="button"
            onClick={startModeling}
            disabled={modelingPhase === 'splitting'}
          >
            {getModelingActionLabel(modelingPhase)}
          </button>
          <button
            className="button button--quiet button--small"
            type="button"
            onClick={resetLesson}
          >
            重置
          </button>
        </div>
      </div>

      <section className={`star-schema__modeling star-schema__modeling--${modelingPhase}`}>
        <div className="star-schema__subheading">
          <div>
            <span className="eyebrow">Stage 01 → 02 · 建模转换</span>
            <h3>从订单大宽表，走到一颗星</h3>
          </div>
          <p>{modelingPhaseLabels[modelingPhase]}</p>
        </div>
        {modelingPhase === 'raw' && <RawTableStage visualization={visualization} />}
        {modelingPhase === 'splitting' && <SplittingStage visualization={visualization} />}
        {modelingPhase === 'modeled' && (
          <>
            <StarModelDiagram
              tables={visualization.tables}
              selectedTableId={selectedTableId}
              onSelect={setSelectedTableId}
            />
            <TableInspector table={selectedTable} />
          </>
        )}
      </section>

      <GrainLab
        options={visualization.grains}
        selectedGrainId={selectedGrainId}
        onSelect={setSelectedGrainId}
      />
      <GrainErrorDemo
        demo={visualization.errorDemo}
        step={errorStep}
        result={errorResult}
        onStepChange={setErrorStep}
      />
    </div>
  )
}

export type { StarSchemaFlowProps }
