import { useMemo, useState } from 'react'
import type {
  BankingSchemaFieldGroup,
  BankingSchemaFieldGroupRole,
  BankingSchemaTable,
  BankingStarSchemaVisualization,
  StarSchemaFieldRole,
  TeachingTableData,
} from '../../types'

interface BankingStarSchemaLabProps {
  visualization: BankingStarSchemaVisualization
}

type BankingStarStage = 0 | 1 | 2

const stageLabels = ['先问发生了什么', '再找观察角度', '组织星型模型']

const fieldRoleLabels: Record<StarSchemaFieldRole, string> = {
  key: '键',
  attribute: '属性',
  measure: '度量',
}

const groupRoleLabels: Record<BankingSchemaFieldGroupRole, string> = {
  event: '事件信息',
  angle: '观察角度',
  measure: '事实度量',
}

function formatCell(value: string | number | undefined): string {
  if (typeof value === 'number') {
    return value.toLocaleString('zh-CN')
  }

  return value ?? '—'
}

function getFieldGroup(
  fieldGroups: readonly BankingSchemaFieldGroup[],
  field: string,
): BankingSchemaFieldGroup | undefined {
  return fieldGroups.find((group) => group.fields.includes(field))
}

function getFactTable(tables: readonly BankingSchemaTable[]): BankingSchemaTable | undefined {
  return tables.find((table) => table.type === 'fact')
}

function DataTable({ data, caption }: { data: TeachingTableData; caption: string }) {
  return (
    <div className="banking-lab__table-wrap">
      <table className="banking-lab__table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {data.columns.map((column) => (
              <th key={column}>
                <code>{column}</code>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIndex) => (
            <tr
              key={`${rowIndex}-${data.columns.map((column) => String(row[column] ?? '')).join('-')}`}
            >
              {data.columns.map((column) => (
                <td key={column}>{formatCell(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StageRail({
  stage,
  onSelect,
}: {
  stage: BankingStarStage
  onSelect: (stage: BankingStarStage) => void
}) {
  return (
    <div className="banking-star__stage-rail" role="tablist" aria-label="事实与维度推导步骤">
      {stageLabels.map((label, index) => {
        const step = index as BankingStarStage
        const isSelected = step === stage
        return (
          <button
            className={`banking-star__stage${isSelected ? ' is-selected' : ''}`}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls="banking-star-stage-panel"
            onClick={() => onSelect(step)}
            key={label}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{label}</strong>
          </button>
        )
      })}
    </div>
  )
}

function FieldBoard({
  fieldGroups,
  selectedField,
  onSelect,
}: {
  fieldGroups: readonly BankingSchemaFieldGroup[]
  selectedField: string
  onSelect: (field: string) => void
}) {
  const selectedGroup = getFieldGroup(fieldGroups, selectedField)

  return (
    <>
      <div className="banking-star__field-board" aria-label="交易字段角色归位">
        {fieldGroups.map((group) => (
          <article
            className={`banking-star__field-group banking-star__field-group--${group.tone}`}
            key={group.id}
          >
            <div className="banking-star__field-heading">
              <div>
                <span>{groupRoleLabels[group.role]}</span>
                <strong>{group.label}</strong>
              </div>
              <small>{group.fields.length} 个字段</small>
            </div>
            <div className="banking-star__field-chips">
              {group.fields.map((field) => (
                <button
                  className={`banking-star__field-chip${selectedField === field ? ' is-selected' : ''}`}
                  type="button"
                  aria-pressed={selectedField === field}
                  onClick={() => onSelect(field)}
                  key={field}
                >
                  <code>{field}</code>
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
      {selectedGroup && (
        <aside className="banking-star__field-explanation" aria-live="polite">
          <div>
            <span>为什么这样放？</span>
            <code>{selectedField}</code>
          </div>
          <p>{selectedGroup.explanation}</p>
        </aside>
      )}
    </>
  )
}

function TableNode({
  table,
  isSelected,
  onSelect,
}: {
  table: BankingSchemaTable
  isSelected: boolean
  onSelect: (tableId: string) => void
}) {
  return (
    <button
      className={`banking-star__table-node banking-star__table-node--${table.type}${isSelected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={isSelected}
      aria-label={`${table.name}，${table.rowMeaning}`}
      onClick={() => onSelect(table.id)}
    >
      <span>{table.type === 'fact' ? 'FACT · 事实' : 'DIMENSION · 维度'}</span>
      <strong>{table.name}</strong>
      <small>{table.rowMeaning}</small>
      <code>
        {table.key.label}：{table.key.value}
      </code>
    </button>
  )
}

function BankingTopology({
  tables,
  selectedTableId,
  onSelect,
}: {
  tables: readonly BankingSchemaTable[]
  selectedTableId: string
  onSelect: (tableId: string) => void
}) {
  const fact = getFactTable(tables)
  const dimensions = tables.filter((table) => table.type === 'dimension')
  const selectedTable = tables.find((table) => table.id === selectedTableId)

  return (
    <section className="banking-star__topology" aria-labelledby="banking-star-topology-title">
      <div className="banking-star__subheading">
        <div>
          <span className="eyebrow">STAR SCHEMA · 星型模型</span>
          <h3 id="banking-star-topology-title">事实在中间，观察角度围绕它</h3>
        </div>
        <p>点击表或连接键，观察同一笔交易如何换一个角度被切分。</p>
      </div>
      <div className="banking-star__schema-canvas">
        <div className="banking-star__dimension-row">
          {dimensions.map((table) => (
            <TableNode
              key={table.id}
              table={table}
              isSelected={table.id === selectedTableId}
              onSelect={onSelect}
            />
          ))}
        </div>
        <div className="banking-star__schema-spokes" aria-hidden="true">
          {dimensions.map((table) => (
            <span className={table.id === selectedTableId ? 'is-active' : ''} key={table.id} />
          ))}
        </div>
        {fact && (
          <div className="banking-star__fact-center">
            <TableNode table={fact} isSelected={fact.id === selectedTableId} onSelect={onSelect} />
          </div>
        )}
      </div>
      <div className="banking-star__relations" aria-label="事实表和维度表的连接键">
        {dimensions.map((dimension) => {
          const isActive = selectedTableId === dimension.id || selectedTableId === fact?.id
          return (
            <button
              className={`banking-star__relation${isActive ? ' is-active' : ''}`}
              type="button"
              aria-pressed={selectedTableId === dimension.id}
              onClick={() => onSelect(dimension.id)}
              key={dimension.id}
            >
              <span>{dimension.name}</span>
              <code>{dimension.key.value}</code>
              <b aria-hidden="true">↔</b>
              <code>fact.{dimension.key.value}</code>
            </button>
          )
        })}
      </div>
      {selectedTable && (
        <aside className="banking-star__table-inspector" aria-live="polite">
          <div>
            <span>当前节点</span>
            <strong>{selectedTable.name}</strong>
          </div>
          <p>{selectedTable.responsibility}</p>
          <div className="banking-star__inspector-fields">
            {selectedTable.fields.slice(0, 6).map((field) => (
              <span key={field.name}>
                <code>{field.name}</code>
                <small>{fieldRoleLabels[field.role]}</small>
              </span>
            ))}
          </div>
        </aside>
      )}
    </section>
  )
}

function ObservationSwitcher({
  observations,
  selectedId,
  onSelect,
}: {
  observations: BankingStarSchemaVisualization['observations']
  selectedId: string
  onSelect: (id: string) => void
}) {
  const selected =
    observations.find((observation) => observation.id === selectedId) ?? observations[0]

  if (!selected) {
    return null
  }

  return (
    <section
      className="banking-star__observations"
      aria-labelledby="banking-star-observations-title"
    >
      <div className="banking-star__subheading">
        <div>
          <span className="eyebrow">SAME FACT · 换观察角度</span>
          <h3 id="banking-star-observations-title">Fact 没变，问题换了一个问法</h3>
        </div>
        <p>选择客户、账户、机构、产品或日期，事实记录仍然是 T10001。</p>
      </div>
      <div className="banking-star__observation-tabs" role="group" aria-label="交易观察角度">
        {observations.map((observation) => (
          <button
            className={`banking-star__observation-tab${observation.id === selected.id ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={observation.id === selected.id}
            onClick={() => onSelect(observation.id)}
            key={observation.id}
          >
            {observation.label}
          </button>
        ))}
      </div>
      <div className="banking-star__observation-result" aria-live="polite">
        <span>{selected.question}</span>
        <strong>{selected.answer}</strong>
        <p>{selected.detail}</p>
      </div>
    </section>
  )
}

function SnowflakeComparison({
  comparison,
}: {
  comparison: BankingStarSchemaVisualization['snowflake']
}) {
  return (
    <section className="banking-star__snowflake" aria-labelledby="banking-star-snowflake-title">
      <div className="banking-star__subheading">
        <div>
          <span className="eyebrow">SMALL CONTRAST · 小型对照</span>
          <h3 id="banking-star-snowflake-title">Product 要不要再拆一层？</h3>
        </div>
        <p>星型和雪花模型是组织观察角度的取舍，不是图形审美题。</p>
      </div>
      <div className="banking-star__snowflake-grid">
        <article>
          <span>STAR</span>
          <strong>{comparison.starLabel}</strong>
          <p>{comparison.starDetail}</p>
        </article>
        <article>
          <span>SNOWFLAKE</span>
          <strong>{comparison.snowflakeLabel}</strong>
          <p>{comparison.snowflakeDetail}</p>
        </article>
      </div>
      <p className="banking-star__snowflake-decision">{comparison.decision}</p>
    </section>
  )
}

export function BankingStarSchemaLab({ visualization }: BankingStarSchemaLabProps) {
  const fact = getFactTable(visualization.tables)
  const [stage, setStage] = useState<BankingStarStage>(0)
  const [selectedField, setSelectedField] = useState(visualization.fieldGroups[0]?.fields[0] ?? '')
  const [selectedTableId, setSelectedTableId] = useState(
    fact?.id ?? visualization.tables[0]?.id ?? '',
  )
  const [selectedObservationId, setSelectedObservationId] = useState(
    visualization.observations[0]?.id ?? '',
  )

  const selectedGroup = useMemo(
    () => getFieldGroup(visualization.fieldGroups, selectedField),
    [selectedField, visualization.fieldGroups],
  )

  function reset() {
    setStage(0)
    setSelectedField(visualization.fieldGroups[0]?.fields[0] ?? '')
    setSelectedTableId(fact?.id ?? visualization.tables[0]?.id ?? '')
    setSelectedObservationId(visualization.observations[0]?.id ?? '')
  }

  return (
    <div className="banking-star-lab">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">账户交易建模实验台</span>
          <p aria-live="polite">
            当前：{stageLabels[stage]} · {selectedGroup?.label ?? '交易记录'}
          </p>
        </div>
        <button className="button button--quiet button--small" type="button" onClick={reset}>
          重置推导
        </button>
      </div>
      <StageRail stage={stage} onSelect={setStage} />
      <div className="banking-star__stage-panel" id="banking-star-stage-panel">
        {stage === 0 && (
          <div className="banking-star__event-stage">
            <div className="banking-star__stage-heading">
              <div>
                <span className="eyebrow">STEP 01 · 先看事件</span>
                <h3>这条记录里，发生了什么？</h3>
              </div>
              <p>先读业务事件，再决定从哪些角度观察它。</p>
            </div>
            <DataTable data={visualization.rawTable} caption="账户交易原始记录" />
            <div className="banking-star__event-answer">
              <span>事件答案</span>
              <strong>一笔账户交易 · Transaction</strong>
              <p>交易金额属于这次事件；客户、账户、机构、产品是描述它的不同观察角度。</p>
            </div>
          </div>
        )}
        {stage === 1 && (
          <div className="banking-star__roles-stage">
            <div className="banking-star__stage-heading">
              <div>
                <span className="eyebrow">STEP 02 · 字段归位</span>
                <h3>同一条交易记录，字段角色不同</h3>
              </div>
              <p>点击字段，查看它为什么成为事件信息、观察角度或事实度量。</p>
            </div>
            <FieldBoard
              fieldGroups={visualization.fieldGroups}
              selectedField={selectedField}
              onSelect={setSelectedField}
            />
          </div>
        )}
        {stage === 2 && (
          <div className="banking-star__schema-stage">
            <BankingTopology
              tables={visualization.tables}
              selectedTableId={selectedTableId}
              onSelect={setSelectedTableId}
            />
            <ObservationSwitcher
              observations={visualization.observations}
              selectedId={selectedObservationId}
              onSelect={setSelectedObservationId}
            />
            <SnowflakeComparison comparison={visualization.snowflake} />
          </div>
        )}
      </div>
    </div>
  )
}

export type { BankingStarSchemaLabProps }
