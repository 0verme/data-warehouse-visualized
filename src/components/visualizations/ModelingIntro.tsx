import { useMemo, useState } from 'react'
import type {
  ModelingFieldGroup,
  ModelingFieldRole,
  ModelingIntroStep,
  ModelingIntroVisualization,
  ModelingOutputTable,
} from '../../types'

interface ModelingIntroProps {
  visualization: ModelingIntroVisualization
}

type ModelingStage = 0 | 1 | 2 | 3

const roleLabels: Record<ModelingFieldRole, string> = {
  'process-key': '业务过程',
  dimension: '维度属性',
  fact: '事实度量',
}

function getFieldGroup(fieldGroups: readonly ModelingFieldGroup[], field: string) {
  for (const group of fieldGroups) {
    if (group.fields.indexOf(field) >= 0) {
      return group
    }
  }

  return undefined
}

function RawOrderTable({
  visualization,
  fieldGroups,
}: {
  visualization: ModelingIntroVisualization
  fieldGroups: readonly ModelingFieldGroup[]
}) {
  return (
    <div className="modeling-lab__table-wrap">
      <table className="modeling-lab__table">
        <caption className="sr-only">原始订单数据：订单、用户、商品和店铺字段暂时混在一起</caption>
        <thead>
          <tr>
            {visualization.rawTable.columns.map((column) => {
              const group = getFieldGroup(fieldGroups, column)
              return (
                <th className={group ? `is-${group.tone}` : undefined} key={column}>
                  <code>{column}</code>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {visualization.rawTable.rows.map((row, rowIndex) => (
            <tr
              key={`${rowIndex}-${visualization.rawTable.columns
                .map((column) => String(row[column] ?? ''))
                .join('-')}`}
            >
              {visualization.rawTable.columns.map((column) => {
                const group = getFieldGroup(fieldGroups, column)
                return (
                  <td className={group ? `is-${group.tone}` : undefined} key={column}>
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

function StageRail({
  steps,
  stage,
  onStageChange,
}: {
  steps: readonly ModelingIntroStep[]
  stage: ModelingStage
  onStageChange: (stage: ModelingStage) => void
}) {
  return (
    <div className="modeling-lab__stage-rail" role="tablist" aria-label="建模拆解步骤">
      {steps.map((step, index) => {
        const stepIndex = Math.min(index, 3) as ModelingStage
        const isSelected = index === stage
        return (
          <button
            className={`modeling-lab__stage${isSelected ? ' is-selected' : ''}`}
            type="button"
            role="tab"
            id={`modeling-stage-tab-${step.id}`}
            aria-selected={isSelected}
            aria-controls="modeling-stage-panel"
            onClick={() => onStageChange(stepIndex)}
            key={step.id}
          >
            <span>{index < 9 ? `0${index + 1}` : String(index + 1)}</span>
            <strong>{step.title}</strong>
            <small>{step.example}</small>
          </button>
        )
      })}
    </div>
  )
}

function FieldGroupBoard({
  fieldGroups,
  selectedField,
  onSelectField,
}: {
  fieldGroups: readonly ModelingFieldGroup[]
  selectedField: string
  onSelectField: (field: string) => void
}) {
  return (
    <div className="modeling-lab__field-board" aria-label="字段角色归类">
      {fieldGroups.map((group) => (
        <article
          className={`modeling-lab__field-group modeling-lab__field-group--${group.tone}`}
          key={group.id}
        >
          <div className="modeling-lab__field-group-heading">
            <div>
              <span>{roleLabels[group.role]}</span>
              <strong>{group.label}</strong>
            </div>
            <small>{group.fields.length} 个字段</small>
          </div>
          <div className="modeling-lab__field-chips">
            {group.fields.map((field) => (
              <button
                className={`modeling-lab__field-chip${selectedField === field ? ' is-selected' : ''}`}
                type="button"
                aria-pressed={selectedField === field}
                onClick={() => onSelectField(field)}
                key={field}
              >
                <code>{field}</code>
              </button>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}

function FieldExplanation({
  selectedField,
  selectedGroup,
}: {
  selectedField: string
  selectedGroup?: ModelingFieldGroup
}) {
  if (!selectedGroup) {
    return null
  }

  return (
    <aside className="modeling-lab__field-explanation" aria-live="polite">
      <div>
        <span>为什么这样归类？</span>
        <code>{selectedField}</code>
      </div>
      <p>{selectedGroup.explanation}</p>
    </aside>
  )
}

function OutputTable({ table }: { table: ModelingOutputTable }) {
  return (
    <article className={`modeling-lab__output modeling-lab__output--${table.type}`}>
      <div className="modeling-lab__output-heading">
        <span>{table.type === 'fact' ? '事实表' : '维度表'}</span>
        <strong>{table.name}</strong>
      </div>
      <p>{table.rowMeaning}</p>
      <div className="modeling-lab__output-fields">
        {table.fields.map((field) => (
          <code key={field}>{field}</code>
        ))}
      </div>
    </article>
  )
}

function SplitStage({
  fieldGroups,
  outputTables,
}: {
  fieldGroups: readonly ModelingFieldGroup[]
  outputTables: readonly ModelingOutputTable[]
}) {
  return (
    <div className="modeling-lab__split-stage">
      <div className="modeling-lab__source-stack">
        <span className="modeling-lab__stage-kicker">原始业务表</span>
        <strong>order_raw</strong>
        <div className="modeling-lab__source-fields">
          {fieldGroups.map((group) => (
            <span className={`is-${group.tone}`} key={group.id}>
              {group.label}
            </span>
          ))}
        </div>
      </div>
      <div className="modeling-lab__split-arrow" aria-hidden="true">
        <span>按业务含义拆开</span>
        <strong>→</strong>
      </div>
      <div className="modeling-lab__outputs">
        {outputTables.map((table) => (
          <OutputTable table={table} key={table.id} />
        ))}
      </div>
    </div>
  )
}

function StagePanel({
  stage,
  visualization,
  fieldGroups,
  selectedField,
  selectedGroup,
  onSelectField,
}: {
  stage: ModelingStage
  visualization: ModelingIntroVisualization
  fieldGroups: readonly ModelingFieldGroup[]
  selectedField: string
  selectedGroup?: ModelingFieldGroup
  onSelectField: (field: string) => void
}) {
  if (stage === 0) {
    return (
      <div
        className="modeling-lab__stage-panel modeling-lab__stage-panel--raw"
        id="modeling-stage-panel"
      >
        <div className="modeling-lab__panel-heading">
          <div>
            <span className="modeling-lab__stage-kicker">输入</span>
            <strong>字段还没有角色</strong>
          </div>
          <p>同一行里同时出现订单、用户、商品、店铺和金额。</p>
        </div>
        <RawOrderTable visualization={visualization} fieldGroups={fieldGroups} />
        <div className="modeling-lab__legend" aria-label="原始字段分组颜色图例">
          {fieldGroups.map((group) => (
            <span key={group.id}>
              <i className={`is-${group.tone}`} aria-hidden="true" />
              {group.label}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (stage === 1) {
    return (
      <div
        className="modeling-lab__stage-panel modeling-lab__stage-panel--grain"
        id="modeling-stage-panel"
      >
        <div className="modeling-lab__grain-statement">
          <span>先锁定这一句</span>
          <strong>{visualization.steps[1]?.example ?? '一行代表一个业务事件'}</strong>
          <p>没有 Grain，后面的字段归类和金额计算都没有参照物。</p>
        </div>
        <RawOrderTable visualization={visualization} fieldGroups={fieldGroups} />
      </div>
    )
  }

  if (stage === 2) {
    return (
      <div
        className="modeling-lab__stage-panel modeling-lab__stage-panel--classify"
        id="modeling-stage-panel"
      >
        <div className="modeling-lab__panel-heading">
          <div>
            <span className="modeling-lab__stage-kicker">归类</span>
            <strong>字段开始各归其位</strong>
          </div>
          <p>点击字段，查看它为什么属于业务过程、维度或事实。</p>
        </div>
        <FieldGroupBoard
          fieldGroups={fieldGroups}
          selectedField={selectedField}
          onSelectField={onSelectField}
        />
        <FieldExplanation selectedField={selectedField} selectedGroup={selectedGroup} />
      </div>
    )
  }

  return (
    <div
      className="modeling-lab__stage-panel modeling-lab__stage-panel--split"
      id="modeling-stage-panel"
    >
      <div className="modeling-lab__panel-heading">
        <div>
          <span className="modeling-lab__stage-kicker">输出</span>
          <strong>字段移动到各自的表</strong>
        </div>
        <p>事实表保留可度量事件，维度表承载稳定的观察角度。</p>
      </div>
      <SplitStage fieldGroups={fieldGroups} outputTables={visualization.outputTables} />
      <FieldExplanation selectedField={selectedField} selectedGroup={selectedGroup} />
    </div>
  )
}

export function ModelingIntro({ visualization }: ModelingIntroProps) {
  const [stage, setStage] = useState<ModelingStage>(0)
  const [selectedField, setSelectedField] = useState(visualization.fieldGroups[0]?.fields[0] ?? '')
  const selectedGroup = useMemo(
    () => getFieldGroup(visualization.fieldGroups, selectedField),
    [selectedField, visualization.fieldGroups],
  )
  const activeStep = visualization.steps[Math.min(stage, visualization.steps.length - 1)]

  function reset() {
    setStage(0)
    setSelectedField(visualization.fieldGroups[0]?.fields[0] ?? '')
  }

  function moveToNextStage() {
    setStage((current) => (current < 3 ? ((current + 1) as ModelingStage) : current))
  }

  return (
    <div className={`modeling-lab modeling-lab--stage-${stage}`}>
      <div className="modeling-lab__toolbar">
        <div>
          <span className="visualization-toolbar__label">拆解一张业务大宽表</span>
          <p aria-live="polite">当前：{activeStep?.title ?? '完成拆解'}</p>
        </div>
        <div className="modeling-lab__toolbar-actions">
          <button
            className="button button--primary button--small"
            type="button"
            onClick={moveToNextStage}
            disabled={stage === 3}
          >
            {stage === 3 ? '拆解完成' : '下一步'}
          </button>
          <button className="button button--quiet button--small" type="button" onClick={reset}>
            重置
          </button>
        </div>
      </div>
      <StageRail steps={visualization.steps} stage={stage} onStageChange={setStage} />
      <StagePanel
        stage={stage}
        visualization={visualization}
        fieldGroups={visualization.fieldGroups}
        selectedField={selectedField}
        selectedGroup={selectedGroup}
        onSelectField={setSelectedField}
      />
    </div>
  )
}

export type { ModelingIntroProps }
