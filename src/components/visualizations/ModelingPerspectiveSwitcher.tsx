import { useMemo, useState } from 'react'
import type {
  ModelingPerspectiveId,
  ModelingPerspectiveStage,
  ModelingPerspectiveView,
} from '../../utils/modeling-perspectives'
import {
  buildModelingPerspectiveView,
  getModelingPerspective,
  getModelingPerspectiveComparison,
  MODELING_ORDER_CASE,
  MODELING_PERSPECTIVE_IDS,
  MODELING_PERSPECTIVES,
} from '../../utils/modeling-perspectives'

const PERSPECTIVE_COLUMN_LABELS = {
  'traditional-dw': '传统数仓',
  medallion: 'Medallion',
  'dbt-ae': 'dbt / AE',
} satisfies Record<ModelingPerspectiveId, string>

function OrderCaseTable() {
  return (
    <section className="lakehouse-modeling__case" aria-labelledby="lakehouse-modeling-case-title">
      <div className="lakehouse-modeling__case-heading">
        <div>
          <span className="eyebrow eyebrow--small">固定输入 · SAME BUSINESS CASE</span>
          <h4 id="lakehouse-modeling-case-title">{MODELING_ORDER_CASE.label}</h4>
          <p>
            <code>{MODELING_ORDER_CASE.source}</code> · {MODELING_ORDER_CASE.grain}
          </p>
        </div>
        <dl className="lakehouse-modeling__case-stats">
          <div>
            <dt>orders</dt>
            <dd>{MODELING_ORDER_CASE.orderCount}</dd>
          </div>
          <div>
            <dt>items</dt>
            <dd>{MODELING_ORDER_CASE.itemCount}</dd>
          </div>
          <div>
            <dt>amount</dt>
            <dd>¥{MODELING_ORDER_CASE.totalAmount}</dd>
          </div>
        </dl>
      </div>
      <div className="lakehouse-modeling__case-table-wrap">
        <table className="lakehouse-modeling__case-table">
          <caption>三种建模视角共同使用的订单明细输入</caption>
          <thead>
            <tr>
              {MODELING_ORDER_CASE.columns.map((column) => (
                <th scope="col" key={column}>
                  <code>{column}</code>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODELING_ORDER_CASE.rows.map((row, rowIndex) => (
              <tr key={`${MODELING_ORDER_CASE.id}-${rowIndex}`}>
                {MODELING_ORDER_CASE.columns.map((column) => (
                  <td key={column}>{String(row[column] ?? '—')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="lakehouse-modeling__case-note">
        切换只改变“谁在何处组织加工、如何发布语义”；订单 1001 的两条明细、订单 1002 的一条明细和
        ¥480 总额保持不变。
      </p>
    </section>
  )
}

function PerspectiveTabs({
  selectedId,
  onSelect,
}: {
  selectedId: ModelingPerspectiveId
  onSelect: (id: ModelingPerspectiveId) => void
}) {
  return (
    <div className="lakehouse-modeling__tabs" role="tablist" aria-label="选择建模组织视角">
      {MODELING_PERSPECTIVES.map((perspective) => {
        const isSelected = perspective.id === selectedId
        return (
          <button
            className={`lakehouse-modeling__tab${isSelected ? ' is-selected' : ''}`}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls="lakehouse-modeling-perspective-panel"
            id={`lakehouse-modeling-tab-${perspective.id}`}
            key={perspective.id}
            onClick={() => onSelect(perspective.id)}
          >
            <span>{perspective.label}</span>
            <strong>{perspective.shortLabel}</strong>
            <small>{perspective.detail}</small>
          </button>
        )
      })}
    </div>
  )
}

function PerspectiveFlow({
  view,
  selectedStageId,
  onSelect,
}: {
  view: ModelingPerspectiveView
  selectedStageId: string
  onSelect: (stageId: string) => void
}) {
  return (
    <ol
      className={`lakehouse-modeling__flow lakehouse-modeling__flow--${view.stages.length}`}
      aria-label={`${view.label} transformation 数据流`}
    >
      {view.stages.map((stage, index) => {
        const isSelected = stage.id === selectedStageId
        return (
          <li className="lakehouse-modeling__flow-item" key={stage.id}>
            <button
              className={`lakehouse-modeling__stage${isSelected ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(stage.id)}
            >
              <span className="lakehouse-modeling__stage-topline">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <span>{stage.label}</span>
              </span>
              <strong>{stage.title}</strong>
              <code>{stage.output}</code>
              <small>{stage.grain}</small>
            </button>
            {index < view.stages.length - 1 && (
              <span className="lakehouse-modeling__flow-arrow" aria-hidden="true">
                →
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function StageDetail({ stage }: { stage: ModelingPerspectiveStage }) {
  return (
    <section
      className="lakehouse-modeling__stage-detail"
      aria-labelledby="lakehouse-modeling-stage-detail-title"
      aria-live="polite"
    >
      <div className="lakehouse-modeling__stage-detail-heading">
        <div>
          <span>{stage.label}</span>
          <h4 id="lakehouse-modeling-stage-detail-title">{stage.title}</h4>
        </div>
        <code>{stage.output}</code>
      </div>
      <p className="lakehouse-modeling__stage-responsibility">{stage.responsibility}</p>
      <dl className="lakehouse-modeling__stage-facts">
        <div>
          <dt>这一层的 Grain</dt>
          <dd>{stage.grain}</dd>
        </div>
        <div>
          <dt>Transformation owner</dt>
          <dd>{stage.owner}</dd>
        </div>
        <div>
          <dt>Quality responsibility</dt>
          <dd>{stage.quality}</dd>
        </div>
        <div>
          <dt>Consumer boundary</dt>
          <dd>{stage.consumer}</dd>
        </div>
      </dl>
    </section>
  )
}

function ResponsibilityStrip({ view }: { view: ModelingPerspectiveView }) {
  return (
    <dl className="lakehouse-modeling__responsibility-strip" aria-label="当前视角的职责边界">
      <div>
        <dt>transformation ownership</dt>
        <dd>{view.transformationOwner}</dd>
      </div>
      <div>
        <dt>quality responsibility</dt>
        <dd>{view.qualityResponsibility}</dd>
      </div>
      <div>
        <dt>consumer boundary</dt>
        <dd>{view.consumerBoundary}</dd>
      </div>
    </dl>
  )
}

function PerspectiveContext({ view }: { view: ModelingPerspectiveView }) {
  return (
    <dl className="lakehouse-modeling__context" aria-label="当前视角的历史与协作边界">
      <div>
        <dt>history approach</dt>
        <dd>{view.historyApproach}</dd>
      </div>
      <div>
        <dt>development collaboration</dt>
        <dd>{view.collaborationApproach}</dd>
      </div>
    </dl>
  )
}

function ComparisonMatrix() {
  const comparison = useMemo(() => getModelingPerspectiveComparison(), [])

  return (
    <section
      className="lakehouse-modeling__comparison"
      aria-labelledby="lakehouse-modeling-comparison-title"
    >
      <div className="lakehouse-modeling__subheading">
        <div>
          <span className="eyebrow eyebrow--small">职责对照 · NOT A RENAME TABLE</span>
          <h4 id="lakehouse-modeling-comparison-title">相似的是问题，不一定是层名</h4>
        </div>
        <p>同一行订单数据，在不同协作语境中会拥有不同的 owner、发布边界和历史责任。</p>
      </div>
      <div className="lakehouse-modeling__comparison-table-wrap">
        <table className="lakehouse-modeling__comparison-table">
          <caption>传统数仓、Medallion 与 dbt / Analytics Engineering 的职责对照</caption>
          <thead>
            <tr>
              <th scope="col">职责问题</th>
              {MODELING_PERSPECTIVE_IDS.map((id) => (
                <th scope="col" key={id}>
                  {PERSPECTIVE_COLUMN_LABELS[id]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.label}</th>
                {MODELING_PERSPECTIVE_IDS.map((id) => (
                  <td key={id}>{row.values[id]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function NonEquivalentBoundary({ view }: { view: ModelingPerspectiveView }) {
  return (
    <aside
      className="lakehouse-modeling__boundary"
      aria-labelledby="lakehouse-modeling-boundary-title"
    >
      <div>
        <span className="eyebrow eyebrow--small">边界检查 · SIMILAR ≠ EQUIVALENT</span>
        <h4 id="lakehouse-modeling-boundary-title">不要把三套层名做成一一映射</h4>
      </div>
      <p>
        ODS、Bronze 和 Sources / Raw 都可能靠近原始入口，但它们的 ownership 不同：ODS
        常是数仓中的落地表，Bronze 强调原始 / 追加记录，而 dbt 的 Sources / Raw
        更常是对上游关系的声明与读取入口，dbt 不因此拥有原始落地。
      </p>
      <p>
        同样，DWS、Gold、Intermediate 和 Marts 也不能排成一条等价线：DWS 常沉淀主题公共汇总，Gold
        可以是明细或聚合，Intermediate 通常不面向消费者，Marts 则把业务语义发布为消费模型。
      </p>
      <div className="lakehouse-modeling__boundary-current">
        <span>当前视角提醒</span>
        <strong>{view.boundaryNote}</strong>
      </div>
    </aside>
  )
}

export function ModelingPerspectiveSwitcher() {
  const [selectedId, setSelectedId] = useState<ModelingPerspectiveId>('traditional-dw')
  const [selectedStageId, setSelectedStageId] = useState('ods')
  const view = useMemo(() => buildModelingPerspectiveView(selectedId), [selectedId])
  const selectedStage = view.stages.find((stage) => stage.id === selectedStageId) ?? view.stages[0]

  function selectPerspective(id: ModelingPerspectiveId) {
    const nextPerspective = getModelingPerspective(id)
    setSelectedId(id)
    setSelectedStageId(nextPerspective.stages[0]?.id ?? '')
  }

  function reset() {
    selectPerspective('traditional-dw')
  }

  if (!selectedStage) {
    return null
  }

  return (
    <section className="lakehouse-modeling" aria-labelledby="lakehouse-modeling-title">
      <div className="lakehouse-lab__subheading">
        <div>
          <span className="eyebrow eyebrow--small">建模视角实验 · MODELING PERSPECTIVES</span>
          <h3 id="lakehouse-modeling-title">同一份订单，切换三种组织视角</h3>
        </div>
        <div className="lakehouse-modeling__heading-actions">
          <p aria-live="polite">
            当前：{view.label} · {view.shortLabel}
          </p>
          <button className="button button--quiet button--small" type="button" onClick={reset}>
            重置视角
          </button>
        </div>
      </div>
      <p className="lakehouse-modeling__intro">
        上面的实验回答“数据放在哪里、由什么能力承接”；这里固定同一订单案例，只切换 transformation
        如何分层、谁拥有模型、质量在哪里负责，以及什么对象交给消费者。
      </p>
      <OrderCaseTable />
      <PerspectiveTabs selectedId={selectedId} onSelect={selectPerspective} />
      <div
        className="lakehouse-modeling__perspective-panel"
        id="lakehouse-modeling-perspective-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`lakehouse-modeling-tab-${selectedId}`}
      >
        <div className="lakehouse-modeling__selected-summary" aria-live="polite">
          <div>
            <span>{view.label}</span>
            <strong>{view.summary}</strong>
          </div>
          <code>{view.caseId}</code>
        </div>
        <PerspectiveFlow
          view={view}
          selectedStageId={selectedStageId}
          onSelect={setSelectedStageId}
        />
        <StageDetail stage={selectedStage} />
        <ResponsibilityStrip view={view} />
        <PerspectiveContext view={view} />
      </div>
      <ComparisonMatrix />
      <NonEquivalentBoundary view={view} />
    </section>
  )
}
