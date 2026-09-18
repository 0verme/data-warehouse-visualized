import { useMemo, useReducer, useState } from 'react'
import type {
  GrainErrorDemo,
  GrainId,
  GrainOption,
  StarSchemaFieldRole,
  StarSchemaTable,
  StarSchemaTableData,
  StarSchemaTableType,
  StarSchemaVisualization,
} from '../../types'
import {
  createGrainErrorKernel,
  type GrainErrorStep,
  type GrainErrorStepSpecs,
} from '../../features/grain-error/steps'
import {
  calculateGrainErrorResult,
  getGrainOption,
  type GrainErrorResult,
} from '../../utils/star-schema'
import {
  applyVisualizationPlayerAction,
  createVisualizationPlayer,
  getCurrentVisualizationStep,
} from '../../utils/visualization-steps'

interface StarSchemaFlowProps {
  visualization: StarSchemaVisualization
}

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

const relationshipKeys: Record<string, string> = {
  'dim-user': 'user_id',
  'dim-product': 'product_id',
  'dim-shop': 'shop_id',
}

const errorStepLabels: Record<ErrorStep, string> = {
  wrong: '先观察错误模型',
  calculated: 'SUM 已经暴露重复计算',
  fixed: '字段和粒度已经对齐',
}

const errorStepSpecs = [
  { id: 'wrong', title: '错误模型', description: errorStepLabels.wrong, risk: true },
  {
    id: 'calculated',
    title: '执行 SUM 暴露重复',
    description: errorStepLabels.calculated,
    risk: true,
  },
  { id: 'fixed', title: '修复到明细粒度', description: errorStepLabels.fixed, risk: false },
] as const satisfies GrainErrorStepSpecs<ErrorStep>

function getTableById(tables: readonly StarSchemaTable[], tableId: string) {
  for (const table of tables) {
    if (table.id === tableId) {
      return table
    }
  }

  return undefined
}

function getFactTable(tables: readonly StarSchemaTable[]) {
  for (const table of tables) {
    if (table.type === 'fact') {
      return table
    }
  }

  return undefined
}

function getRecommendedGrainId(options: readonly GrainOption[]): GrainId {
  for (const option of options) {
    if (option.recommended) {
      return option.id
    }
  }

  return options[0]?.id ?? 'order-item'
}

function getGrainKey(grainId: GrainId): string {
  if (grainId === 'order') {
    return 'order_id'
  }

  if (grainId === 'user-day') {
    return 'dt + user_id'
  }

  return 'order_id + product_id'
}

function DataTable({ data, caption }: { data: StarSchemaTableData; caption: string }) {
  return (
    <div className="star-schema__data-table-wrap">
      <table className="star-schema__data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {data.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIndex) => (
            <tr
              key={`${rowIndex}-${data.columns.map((column) => String(row[column] ?? '')).join('-')}`}
            >
              {data.columns.map((column) => (
                <td key={column}>{String(row[column] ?? '—')}</td>
              ))}
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
      className={`star-topology__node star-topology__node--${table.type}${
        isSelected ? ' is-selected' : ''
      }`}
      type="button"
      aria-pressed={isSelected}
      aria-label={`${table.name}，${tableTypeLabels[table.type]}，${table.rowMeaning}`}
      onClick={() => onSelect(table.id)}
    >
      <span className="star-topology__node-topline">
        <span>{tableTypeLabels[table.type]}</span>
        <span aria-hidden="true">{isSelected ? '●' : '○'}</span>
      </span>
      <strong>{table.name}</strong>
      <small>{table.rowMeaning}</small>
      <span className="star-topology__node-fields">
        {table.fields
          .slice(0, 4)
          .map((field) => field.name)
          .join(' · ')}
        {table.fields.length > 4 ? ' …' : ''}
      </span>
    </button>
  )
}

function getNodePosition(index: number): 'left' | 'top' | 'right' | 'bottom' {
  if (index === 0) {
    return 'left'
  }

  if (index === 1) {
    return 'top'
  }

  if (index === 2) {
    return 'right'
  }

  return 'bottom'
}

function StarTopology({
  tables,
  selectedTableId,
  onSelect,
}: {
  tables: readonly StarSchemaTable[]
  selectedTableId: string
  onSelect: (tableId: string) => void
}) {
  const fact = getFactTable(tables)
  const dimensions = tables.filter((table) => table.type === 'dimension')
  const selectedTable = getTableById(tables, selectedTableId)

  return (
    <section className="star-topology" aria-labelledby="star-topology-title">
      <div className="star-topology__heading">
        <div>
          <span className="eyebrow">STAR SCHEMA · 拓扑视角</span>
          <h3 id="star-topology-title">事实表在中央，维度表围绕它</h3>
        </div>
        <p>点击节点或关系，观察事实表用哪个外键连接观察角度。</p>
      </div>
      <div className="star-topology__canvas">
        <div className="star-topology__spokes" aria-hidden="true">
          {dimensions.map((dimension, index) => {
            const position = getNodePosition(index)
            const isActive = selectedTableId === fact?.id || selectedTableId === dimension.id
            return (
              <span
                className={`star-topology__spoke star-topology__spoke--${position}${
                  isActive ? ' is-active' : ''
                }`}
                key={dimension.id}
              />
            )
          })}
        </div>
        {fact && (
          <div className="star-topology__position star-topology__position--fact">
            <TableNode table={fact} isSelected={fact.id === selectedTableId} onSelect={onSelect} />
          </div>
        )}
        {dimensions.map((dimension, index) => {
          const position = getNodePosition(index)
          return (
            <div
              className={`star-topology__position star-topology__position--${position}`}
              key={dimension.id}
            >
              <TableNode
                table={dimension}
                isSelected={dimension.id === selectedTableId}
                onSelect={onSelect}
              />
            </div>
          )
        })}
      </div>
      <ul className="star-topology__relations" aria-label="事实表外键关系">
        {dimensions.map((dimension) => {
          const key = relationshipKeys[dimension.id] ?? dimension.fields[0]?.name ?? 'id'
          const isActive = selectedTableId === dimension.id || selectedTableId === fact?.id
          return (
            <li key={dimension.id}>
              <button
                className={`star-topology__relation${isActive ? ' is-active' : ''}`}
                type="button"
                aria-pressed={selectedTableId === dimension.id}
                onClick={() => onSelect(dimension.id)}
              >
                <span>{dimension.name}</span>
                <code>{key}</code>
                <b aria-hidden="true">↔</b>
                <code>fact.{key}</code>
              </button>
            </li>
          )
        })}
      </ul>
      {selectedTable && (
        <aside className="star-topology__selection" aria-live="polite">
          <div>
            <span>当前节点</span>
            <strong>{selectedTable.name}</strong>
          </div>
          <p>{selectedTable.responsibility}</p>
          <div className="star-topology__selection-key">
            <span>{selectedTable.type === 'fact' ? '事实表外键' : '连接事实表的外键'}</span>
            <code>
              {selectedTable.type === 'fact'
                ? dimensions.map((dimension) => relationshipKeys[dimension.id] ?? 'id').join(' · ')
                : (relationshipKeys[selectedTable.id] ?? selectedTable.key.value)}
            </code>
          </div>
          <div className="star-topology__selection-fields">
            <span>关键字段</span>
            <ul>
              {selectedTable.fields.slice(0, 5).map((field) => (
                <li key={field.name}>
                  <code>{field.name}</code>
                  <small>{fieldRoleLabels[field.role]}</small>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      )}
      <div className="star-topology__legend" aria-label="星型模型图例">
        <span>
          <i
            className="star-topology__legend-dot star-topology__legend-dot--fact"
            aria-hidden="true"
          />
          中央事实表：事件与可度量数值
        </span>
        <span>
          <i
            className="star-topology__legend-dot star-topology__legend-dot--dimension"
            aria-hidden="true"
          />
          周围维度表：观察事实的角度
        </span>
      </div>
    </section>
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
    <div className="star-grain__options" role="tablist" aria-label="事实表粒度选择">
      {options.map((option, index) => {
        const isSelected = option.id === selectedGrainId
        return (
          <button
            className={`star-grain__option${isSelected ? ' is-selected' : ''}`}
            type="button"
            role="tab"
            id={`star-grain-tab-${option.id}`}
            aria-selected={isSelected}
            aria-controls={`star-grain-panel-${option.id}`}
            onClick={() => onSelect(option.id)}
            key={option.id}
          >
            <span>{index < 9 ? `0${index + 1}` : String(index + 1)}</span>
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
    <section className="star-grain" aria-labelledby="star-grain-title">
      <div className="star-grain__heading">
        <div>
          <span className="eyebrow">GRAIN SWITCH · 粒度视角</span>
          <h3 id="star-grain-title">切换粒度，表的形状会一起改变</h3>
        </div>
        <p>粒度不是一句标签：它决定主键、行数，以及这张事实表能回答的问题。</p>
      </div>
      <GrainSelector options={options} selectedGrainId={selectedGrain.id} onSelect={onSelect} />
      <div
        className="star-grain__panel"
        id={`star-grain-panel-${selectedGrain.id}`}
        role="tabpanel"
        aria-labelledby={`star-grain-tab-${selectedGrain.id}`}
      >
        <div className="star-grain__stats" aria-live="polite">
          <div>
            <span>这一行代表</span>
            <strong>{selectedGrain.statement}</strong>
          </div>
          <div>
            <span>示例行数</span>
            <strong>{selectedGrain.rows.length}</strong>
          </div>
          <div>
            <span>主键提示</span>
            <code>{getGrainKey(selectedGrain.id)}</code>
          </div>
        </div>
        <div className="star-grain__explanation">
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
        />
      </div>
    </section>
  )
}

function GrainErrorLab({
  demo,
  currentStep,
  onNext,
  onReset,
}: {
  demo: GrainErrorDemo
  currentStep: GrainErrorStep<ErrorStep, GrainErrorResult>
  onNext: () => void
  onReset: () => void
}) {
  const step = currentStep.state.step
  const result = currentStep.state.result
  const isCalculated = step !== 'wrong'
  const isFixed = step === 'fixed'
  const displayedTotal = isFixed ? result.fixedTotal : result.wrongTotal

  return (
    <section
      className="star-error"
      aria-labelledby="star-error-title"
      data-step-id={currentStep.id}
    >
      <div className="star-error__heading">
        <div>
          <span className="eyebrow">GRAIN CHECK · 错误暴露</span>
          <h3 id="star-error-title">让重复金额自己暴露</h3>
        </div>
        <p aria-live="polite">{currentStep.description}</p>
      </div>
      <div className="star-error__scenario">
        <strong>订单 1001</strong>
        <span>商品 A：100 元</span>
        <span>商品 B：200 元</span>
        <b>实际订单金额：{demo.actualAmount} 元</b>
      </div>
      <div className="star-error__steps" aria-label="粒度错误修复步骤">
        <span className={step === 'wrong' ? 'is-current' : 'is-done'}>01 错误模型</span>
        <i aria-hidden="true">→</i>
        <span className={isCalculated ? 'is-current' : ''}>02 执行 SUM</span>
        <i aria-hidden="true">→</i>
        <span className={isFixed ? 'is-current' : ''}>03 修复模型</span>
      </div>
      <div className={`star-error__models star-error__models--${step}`}>
        <article className="star-error__model star-error__model--wrong">
          <div className="star-error__model-heading">
            <div>
              <span>错误设计</span>
              <strong>订单总额被复制到每个商品行</strong>
            </div>
            <code>{demo.wrongMeasure}</code>
          </div>
          <DataTable
            data={{ columns: demo.wrongColumns, rows: demo.wrongRows }}
            caption="错误模型：每个商品行都携带同一个订单总额"
          />
          <code className="star-error__sql">{demo.wrongSql}</code>
        </article>
        {isFixed && (
          <article className="star-error__model star-error__model--fixed">
            <div className="star-error__model-heading">
              <div>
                <span>修复设计</span>
                <strong>每个商品行只保存自己的金额</strong>
              </div>
              <code>{demo.fixedMeasure}</code>
            </div>
            <DataTable
              data={{ columns: demo.fixedColumns, rows: demo.fixedRows }}
              caption="修复模型：订单明细粒度对应商品金额"
            />
            <code className="star-error__sql">{demo.fixedSql}</code>
          </article>
        )}
      </div>
      <div className="star-error__actions">
        <button
          className="button button--primary button--small"
          type="button"
          disabled={isCalculated}
          onClick={onNext}
        >
          执行 {demo.wrongSql}
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          disabled={!isCalculated || isFixed}
          onClick={onNext}
        >
          修复模型
        </button>
        <button className="button button--quiet button--small" type="button" onClick={onReset}>
          重置演示
        </button>
      </div>
      <div className={`star-error__result star-error__result--${step}`} aria-live="polite">
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
  const factTable = getFactTable(visualization.tables)
  const recommendedGrainId = getRecommendedGrainId(visualization.grains)
  const [selectedTableId, setSelectedTableId] = useState(
    factTable?.id ?? visualization.tables[0]?.id ?? '',
  )
  const [selectedGrainId, setSelectedGrainId] = useState<GrainId>(recommendedGrainId)
  const errorKernel = useMemo(
    () =>
      createGrainErrorKernel(calculateGrainErrorResult(visualization.errorDemo), errorStepSpecs),
    [visualization.errorDemo],
  )
  const [errorPlayer, errorDispatch] = useReducer(
    applyVisualizationPlayerAction,
    errorKernel.size,
    createVisualizationPlayer,
  )
  const currentErrorStep = getCurrentVisualizationStep(errorPlayer, errorKernel)

  function resetLesson() {
    setSelectedTableId(factTable?.id ?? visualization.tables[0]?.id ?? '')
    setSelectedGrainId(recommendedGrainId)
    errorDispatch('reset')
  }

  return (
    <div className="star-schema-flow">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">星型模型实验台</span>
          <p aria-live="polite">中央事实表 · 周围维度表 · 可切换粒度</p>
        </div>
        <button className="button button--quiet button--small" type="button" onClick={resetLesson}>
          重置实验
        </button>
      </div>
      <StarTopology
        tables={visualization.tables}
        selectedTableId={selectedTableId}
        onSelect={setSelectedTableId}
      />
      <GrainLab
        options={visualization.grains}
        selectedGrainId={selectedGrainId}
        onSelect={setSelectedGrainId}
      />
      <GrainErrorLab
        demo={visualization.errorDemo}
        currentStep={currentErrorStep}
        onNext={() => errorDispatch('next')}
        onReset={() => errorDispatch('reset')}
      />
    </div>
  )
}

export type { StarSchemaFlowProps }
