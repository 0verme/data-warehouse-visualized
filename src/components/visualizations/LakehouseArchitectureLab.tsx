import { useMemo, useState } from 'react'
import type {
  LakehouseArchitecture,
  LakehouseCapability,
  LakehouseConstraint,
  LakehouseDataVolumeCategory,
  LakehouseRow,
  LakehouseSnapshot,
  LakehouseVisualization,
  LakehouseWorkload,
} from '../../types'
import {
  buildDecisionRecord,
  commitSnapshot,
  evaluateArchitecture,
  getArchitectureFlow,
  getArchitectureState,
  getCapabilityMatrix,
  getConsumerStates,
  getLatestSnapshot,
  LAKEHOUSE_ARCHITECTURE_OPTIONS,
  LAKEHOUSE_CAPABILITY_LABELS,
  LAKEHOUSE_CONSTRAINT_OPTIONS,
  LAKEHOUSE_WORKLOAD_OPTIONS,
  timeTravelTo,
} from '../../utils/lakehouse'
import { ModelingPerspectiveSwitcher } from './ModelingPerspectiveSwitcher'

interface LakehouseArchitectureLabProps {
  visualization: LakehouseVisualization
}

const CAPABILITY_ORDER: readonly LakehouseCapability[] = [
  'flexible-storage',
  'schema-management',
  'transactions',
  'version-history',
  'stable-query',
  'ad-hoc-analysis',
  'ml-access',
  'streaming-writes',
  'governance',
  'compute-separation',
]

const LEVEL_LABELS = {
  strong: '具备',
  partial: '部分',
  limited: '缺口',
} as const

const VOLUME_LABELS: Record<LakehouseDataVolumeCategory, string> = {
  small: '小规模',
  medium: '中规模',
  large: '大规模',
}

function getArchitectureLabel(architecture: LakehouseArchitecture): string {
  return (
    LAKEHOUSE_ARCHITECTURE_OPTIONS.find((option) => option.id === architecture)?.shortLabel ??
    architecture
  )
}

function getWorkloadLabel(workload: LakehouseWorkload): string {
  return LAKEHOUSE_WORKLOAD_OPTIONS.find((option) => option.id === workload)?.label ?? workload
}

function getLevelDetail(level: keyof typeof LEVEL_LABELS): string {
  if (level === 'strong') {
    return '路径中有明确能力'
  }

  if (level === 'partial') {
    return '需要补充流程或工具'
  }

  return '当前架构不保证'
}

function SourceInputs({ visualization }: { visualization: LakehouseVisualization }) {
  return (
    <section className="lakehouse-lab__inputs" aria-labelledby="lakehouse-inputs-title">
      <div className="lakehouse-lab__subheading">
        <div>
          <span className="eyebrow eyebrow--small">同一份输入</span>
          <h3 id="lakehouse-inputs-title">三种数据形态一起到达</h3>
        </div>
        <p>切换架构不会替换数据，只会改变承接它们的能力边界。</p>
      </div>
      <div className="lakehouse-inputs__grid">
        {visualization.dataSources.map((source) => (
          <article className={`lakehouse-input lakehouse-input--${source.format}`} key={source.id}>
            <span>
              {source.format === 'table'
                ? 'TABLE'
                : source.format === 'event-log'
                  ? 'EVENT'
                  : 'FILE'}
            </span>
            <strong>{source.label}</strong>
            <small>{source.example}</small>
            <p>{source.detail}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function ArchitectureFlow({ architecture }: { architecture: LakehouseArchitecture }) {
  const stages = getArchitectureFlow(architecture)
  const consumers = getConsumerStates(architecture)

  return (
    <section className="lakehouse-flow" aria-labelledby="lakehouse-flow-title">
      <div className="lakehouse-lab__subheading">
        <div>
          <span className="eyebrow eyebrow--small">数据流画布</span>
          <h3 id="lakehouse-flow-title">
            Ingestion → Storage → Table Layer → Compute → Governance
          </h3>
        </div>
        <p aria-live="polite">当前查看：{getArchitectureLabel(architecture)}</p>
      </div>
      <ol
        className="lakehouse-flow__stages"
        aria-label={`${getArchitectureLabel(architecture)} 数据流`}
      >
        {stages.map((stage, index) => (
          <li className="lakehouse-flow__stage-wrap" key={stage.id}>
            <article className={`lakehouse-flow__stage is-${stage.status}`}>
              <div className="lakehouse-flow__stage-topline">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <b>{LEVEL_LABELS[stage.status]}</b>
              </div>
              <small>{stage.label}</small>
              <h4>{stage.title}</h4>
              <p>{stage.detail}</p>
            </article>
            {index < stages.length - 1 && (
              <span className="lakehouse-flow__arrow" aria-hidden="true">
                →
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className="lakehouse-flow__consumers" aria-label="数据消费者">
        <span className="lakehouse-flow__consumer-label">Consumer</span>
        {consumers.map((consumer) => (
          <article className={`lakehouse-consumer is-${consumer.status}`} key={consumer.id}>
            <div>
              <strong>{consumer.label}</strong>
              <span>{LEVEL_LABELS[consumer.status]}</span>
            </div>
            <p>{consumer.detail}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function CapabilityMatrix({ architecture }: { architecture: LakehouseArchitecture }) {
  const matrix = getCapabilityMatrix(architecture)

  return (
    <section className="lakehouse-capabilities" aria-labelledby="lakehouse-capabilities-title">
      <div className="lakehouse-lab__subheading">
        <div>
          <span className="eyebrow eyebrow--small">能力矩阵</span>
          <h3 id="lakehouse-capabilities-title">架构能力最终落到工程承诺</h3>
        </div>
        <p>“部分”意味着需要额外流程、工具或团队约定。</p>
      </div>
      <div className="lakehouse-capabilities__table-wrap">
        <table className="lakehouse-capabilities__table">
          <caption>{getArchitectureLabel(architecture)} 当前能力</caption>
          <thead>
            <tr>
              <th scope="col">能力</th>
              <th scope="col">状态</th>
              <th scope="col">含义</th>
            </tr>
          </thead>
          <tbody>
            {CAPABILITY_ORDER.map((capability) => {
              const level = matrix[capability]
              return (
                <tr key={capability}>
                  <th scope="row">{LAKEHOUSE_CAPABILITY_LABELS[capability]}</th>
                  <td>
                    <span className={`lakehouse-capability-status is-${level}`}>
                      {LEVEL_LABELS[level]}
                    </span>
                  </td>
                  <td>{getLevelDetail(level)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function WorkloadControls({
  workload,
  constraints,
  scenarios,
  activeScenarioId,
  onWorkloadChange,
  onConstraintToggle,
  onScenarioChange,
}: {
  workload: LakehouseWorkload
  constraints: readonly LakehouseConstraint[]
  scenarios: LakehouseVisualization['scenarios']
  activeScenarioId: string
  onWorkloadChange: (workload: LakehouseWorkload) => void
  onConstraintToggle: (constraint: LakehouseConstraint) => void
  onScenarioChange: (scenarioId: string) => void
}) {
  return (
    <section className="lakehouse-controls" aria-labelledby="lakehouse-controls-title">
      <div className="lakehouse-lab__subheading">
        <div>
          <span className="eyebrow eyebrow--small">改变问题</span>
          <h3 id="lakehouse-controls-title">Workload × Constraints</h3>
        </div>
        <p>同一架构在不同问题下，证据和代价会重新排序。</p>
      </div>
      <div className="lakehouse-scenarios" aria-label="教学场景">
        {scenarios.map((scenario) => (
          <button
            className={`lakehouse-scenario${activeScenarioId === scenario.id ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={activeScenarioId === scenario.id}
            key={scenario.id}
            onClick={() => onScenarioChange(scenario.id)}
          >
            <strong>{scenario.label}</strong>
            <small>{scenario.description}</small>
          </button>
        ))}
      </div>
      <div className="lakehouse-controls__grid">
        <fieldset>
          <legend>Workload</legend>
          <div className="lakehouse-control-options">
            {LAKEHOUSE_WORKLOAD_OPTIONS.map((option) => (
              <button
                className={`lakehouse-control-choice${workload === option.id ? ' is-selected' : ''}`}
                type="button"
                aria-pressed={workload === option.id}
                key={option.id}
                onClick={() => onWorkloadChange(option.id)}
              >
                <strong>{option.label}</strong>
                <small>{option.detail}</small>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Constraints（可多选）</legend>
          <div className="lakehouse-control-options lakehouse-control-options--constraints">
            {LAKEHOUSE_CONSTRAINT_OPTIONS.map((option) => {
              const isSelected = constraints.includes(option.id)
              return (
                <button
                  className={`lakehouse-control-choice${isSelected ? ' is-selected' : ''}`}
                  type="button"
                  aria-pressed={isSelected}
                  key={option.id}
                  onClick={() => onConstraintToggle(option.id)}
                >
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </button>
              )
            })}
          </div>
        </fieldset>
      </div>
    </section>
  )
}

function ArchitectureDecision({
  architecture,
  workload,
  constraints,
  decision,
  onArchitectureChange,
}: {
  architecture: LakehouseArchitecture
  workload: LakehouseWorkload
  constraints: readonly LakehouseConstraint[]
  decision: ReturnType<typeof evaluateArchitecture>
  onArchitectureChange: (architecture: LakehouseArchitecture) => void
}) {
  const record = buildDecisionRecord(architecture, workload, constraints)

  return (
    <section className="lakehouse-decision" aria-labelledby="lakehouse-decision-title">
      <div className="lakehouse-lab__subheading">
        <div>
          <span className="eyebrow eyebrow--small">Architecture Decision Record</span>
          <h3 id="lakehouse-decision-title">依据证据选择要承担的边界</h3>
        </div>
        <p aria-live="polite">
          当前问题：{getWorkloadLabel(workload)} · {constraints.length} 项约束
        </p>
      </div>
      <div className="lakehouse-decision__recommendation">
        <div>
          <span>证据建议</span>
          <strong>{getArchitectureLabel(decision.recommendedArchitecture)}</strong>
          <p>这不是永久答案，只是当前 workload 和 constraints 下得分最高的路径。</p>
        </div>
        <div className="lakehouse-decision__scores" aria-label="架构得分">
          {LAKEHOUSE_ARCHITECTURE_OPTIONS.map((option) => (
            <button
              className={`lakehouse-score${architecture === option.id ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={architecture === option.id}
              key={option.id}
              onClick={() => onArchitectureChange(option.id)}
            >
              <span>{option.shortLabel}</span>
              <strong>{decision.scores[option.id]}</strong>
            </button>
          ))}
        </div>
      </div>
      <ul className="lakehouse-decision__evidence" aria-label="决策证据">
        {decision.evidence.map((item, index) => (
          <li className={`is-${item.kind}`} key={`${item.kind}-${index}`}>
            <span aria-hidden="true">
              {item.kind === 'fit' ? '＋' : item.kind === 'tradeoff' ? '↔' : '!'}
            </span>
            <p>{item.text}</p>
          </li>
        ))}
      </ul>
      <div className="lakehouse-record" aria-label="当前架构决策记录">
        <div className="lakehouse-record__heading">
          <span>chosen architecture</span>
          <strong>{getArchitectureLabel(record.chosenArchitecture)}</strong>
        </div>
        <div className="lakehouse-record__grid">
          <DecisionList title="benefits" items={record.benefits} tone="positive" />
          <DecisionList title="trade-offs" items={record.tradeoffs} tone="neutral" />
          <DecisionList title="risks" items={record.risks} tone="warning" />
          <DecisionList title="not suitable when…" items={record.notSuitableWhen} tone="muted" />
        </div>
      </div>
    </section>
  )
}

function DecisionList({
  title,
  items,
  tone,
}: {
  title: string
  items: readonly string[]
  tone: 'positive' | 'neutral' | 'warning' | 'muted'
}) {
  return (
    <section className={`lakehouse-record__section is-${tone}`}>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

function SnapshotTable({ snapshot }: { snapshot: LakehouseSnapshot }) {
  return (
    <div className="lakehouse-snapshot__table-wrap">
      <table className="lakehouse-snapshot__table">
        <caption>
          v{snapshot.version} · {snapshot.committedAt}
        </caption>
        <thead>
          <tr>
            {snapshot.columns.map((column) => (
              <th scope="col" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {snapshot.rows.map((row, index) => (
            <tr key={`${snapshot.id}-${index}`}>
              {snapshot.columns.map((column) => (
                <td key={column}>{formatCell(row, column)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatCell(row: LakehouseRow, column: string): string {
  const value = row[column]
  return value === null || value === undefined ? '—' : String(value)
}

function SnapshotExperiment({ visualization }: { visualization: LakehouseVisualization }) {
  const [snapshots, setSnapshots] = useState<LakehouseSnapshot[]>(visualization.snapshots)
  const initialVersion = visualization.snapshots[0]?.version ?? 1
  const [selectedVersion, setSelectedVersion] = useState(initialVersion)
  const currentSnapshot = getLatestSnapshot(snapshots)
  const viewedSnapshot = timeTravelTo(snapshots, selectedVersion) ?? currentSnapshot
  const hasCommittedEvolution = snapshots.length > visualization.snapshots.length

  function commitEvolution() {
    if (hasCommittedEvolution) {
      return
    }

    const nextSnapshots = commitSnapshot(snapshots, visualization.evolutionCommit)
    setSnapshots(nextSnapshots)
    setSelectedVersion(nextSnapshots[nextSnapshots.length - 1]?.version ?? initialVersion)
  }

  function resetSnapshots() {
    setSnapshots(visualization.snapshots)
    setSelectedVersion(initialVersion)
  }

  return (
    <section className="lakehouse-snapshot" aria-labelledby="lakehouse-snapshot-title">
      <div className="lakehouse-lab__subheading">
        <div>
          <span className="eyebrow eyebrow--small">Open Table Format · 抽象实验</span>
          <h3 id="lakehouse-snapshot-title">文件堆 vs 可管理表</h3>
        </div>
        <p aria-live="polite">
          {viewedSnapshot
            ? `当前读取 v${viewedSnapshot.version}：${viewedSnapshot.change}`
            : '等待初始 snapshot'}
        </p>
      </div>
      <div className="lakehouse-snapshot__compare">
        <article className="lakehouse-file-pile">
          <div className="lakehouse-snapshot__card-heading">
            <span>普通文件堆</span>
            <strong>文件能放，不代表表可管</strong>
          </div>
          <div className="lakehouse-file-pile__files">
            <div>
              <code>events-001.json</code>
              <small>event_id · order_id · event_type</small>
            </div>
            <div className={hasCommittedEvolution ? 'is-arrived' : ''}>
              <code>events-002.json</code>
              <small>新增 device_type，等待读取方解释</small>
            </div>
          </div>
          <ul>
            <li>没有共同的 commit 边界</li>
            <li>schema 由读取方自行合并</li>
            <li>历史时点需要额外约定</li>
          </ul>
        </article>
        <article className="lakehouse-managed-table">
          <div className="lakehouse-snapshot__card-heading">
            <span>可管理表</span>
            <strong>commit → schema evolution → time travel</strong>
          </div>
          <div className="lakehouse-snapshot__actions">
            <button
              className="button button--primary button--small"
              type="button"
              onClick={commitEvolution}
              disabled={hasCommittedEvolution}
            >
              {hasCommittedEvolution ? '已提交 v2' : '提交 v2：加入 device_type'}
            </button>
            <button
              className="button button--quiet button--small"
              type="button"
              onClick={resetSnapshots}
            >
              重置版本
            </button>
          </div>
          <div className="lakehouse-snapshot__timeline" aria-label="选择要读取的 snapshot">
            {snapshots.map((snapshot) => (
              <button
                className={selectedVersion === snapshot.version ? 'is-selected' : ''}
                type="button"
                aria-pressed={selectedVersion === snapshot.version}
                key={snapshot.id}
                onClick={() => setSelectedVersion(snapshot.version)}
              >
                <span>v{snapshot.version}</span>
                <small>{snapshot.committedAt.slice(11)}</small>
              </button>
            ))}
          </div>
          {viewedSnapshot && <SnapshotTable snapshot={viewedSnapshot} />}
          <p className="lakehouse-snapshot__hint">
            {selectedVersion === currentSnapshot?.version
              ? '当前查询读最新版本。'
              : `time travel 已回到 v${selectedVersion}，新字段不在这个历史视图中。`}
          </p>
        </article>
      </div>
    </section>
  )
}

export function LakehouseArchitectureLab({ visualization }: LakehouseArchitectureLabProps) {
  const initialScenario = visualization.scenarios[0]
  const initialDecision = evaluateArchitecture(
    initialScenario?.workload ?? 'bi',
    initialScenario?.constraints ?? [],
  )
  const [architecture, setArchitecture] = useState<LakehouseArchitecture>(
    initialDecision.recommendedArchitecture,
  )
  const [workload, setWorkload] = useState<LakehouseWorkload>(initialScenario?.workload ?? 'bi')
  const [constraints, setConstraints] = useState<LakehouseConstraint[]>(
    initialScenario?.constraints ?? [],
  )
  const [activeScenarioId, setActiveScenarioId] = useState(initialScenario?.id ?? '')
  const [dataVolumeCategory, setDataVolumeCategory] = useState<LakehouseDataVolumeCategory>(
    initialScenario?.dataVolumeCategory ?? 'medium',
  )
  const decision = useMemo(
    () => evaluateArchitecture(workload, constraints),
    [constraints, workload],
  )
  const architectureState = useMemo(
    () => getArchitectureState(architecture, workload, dataVolumeCategory),
    [architecture, dataVolumeCategory, workload],
  )

  function toggleConstraint(constraint: LakehouseConstraint) {
    setActiveScenarioId('')
    setConstraints((current) =>
      current.includes(constraint)
        ? current.filter((item) => item !== constraint)
        : [...current, constraint],
    )
  }

  function changeWorkload(nextWorkload: LakehouseWorkload) {
    setActiveScenarioId('')
    setWorkload(nextWorkload)
  }

  function applyScenario(scenarioId: string) {
    const scenario = visualization.scenarios.find((item) => item.id === scenarioId)
    if (!scenario) {
      return
    }

    const nextDecision = evaluateArchitecture(scenario.workload, scenario.constraints)
    setActiveScenarioId(scenario.id)
    setWorkload(scenario.workload)
    setConstraints(scenario.constraints)
    setDataVolumeCategory(scenario.dataVolumeCategory)
    setArchitecture(nextDecision.recommendedArchitecture)
  }

  function resetLab() {
    if (!initialScenario) {
      return
    }

    applyScenario(initialScenario.id)
  }

  return (
    <div className="lakehouse-lab">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">Lakehouse Architecture Lab</span>
          <p aria-live="polite">
            当前：{getArchitectureLabel(architecture)} · 推荐：
            {getArchitectureLabel(decision.recommendedArchitecture)} ·{' '}
            {VOLUME_LABELS[architectureState.dataVolumeCategory]}
          </p>
        </div>
        <button className="button button--quiet button--small" type="button" onClick={resetLab}>
          重置切换台
        </button>
      </div>

      <section
        className="lakehouse-architecture-switcher"
        aria-labelledby="lakehouse-switcher-title"
      >
        <div className="lakehouse-lab__subheading">
          <div>
            <span className="eyebrow eyebrow--small">Architecture Switcher</span>
            <h3 id="lakehouse-switcher-title">同一数据，切换承接方式</h3>
          </div>
          <p>按钮会同时改变下面的数据流、消费者状态和能力矩阵。</p>
        </div>
        <div className="lakehouse-architecture-tabs" role="group" aria-label="选择数据架构">
          {LAKEHOUSE_ARCHITECTURE_OPTIONS.map((option) => (
            <button
              className={`lakehouse-architecture-tab${architecture === option.id ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={architecture === option.id}
              key={option.id}
              onClick={() => setArchitecture(option.id)}
            >
              <span>{option.label}</span>
              <strong>{option.shortLabel}</strong>
              <small>{option.detail}</small>
            </button>
          ))}
        </div>
      </section>

      <SourceInputs visualization={visualization} />
      <ArchitectureFlow architecture={architecture} />
      <section className="lakehouse-state-strip" aria-label="给性能章节的架构状态">
        <div>
          <span>storage type</span>
          <strong>{architectureState.storageType}</strong>
        </div>
        <div>
          <span>compute separation</span>
          <strong>{architectureState.computeSeparation}</strong>
        </div>
        <div>
          <span>partition / file layout hint</span>
          <strong>{architectureState.partitionFileLayoutHint}</strong>
        </div>
      </section>
      <CapabilityMatrix architecture={architecture} />
      <WorkloadControls
        workload={workload}
        constraints={constraints}
        scenarios={visualization.scenarios}
        activeScenarioId={activeScenarioId}
        onWorkloadChange={changeWorkload}
        onConstraintToggle={toggleConstraint}
        onScenarioChange={applyScenario}
      />
      <ArchitectureDecision
        architecture={architecture}
        workload={workload}
        constraints={constraints}
        decision={decision}
        onArchitectureChange={setArchitecture}
      />
      <SnapshotExperiment visualization={visualization} />
      <ModelingPerspectiveSwitcher />
    </div>
  )
}

export type { LakehouseArchitectureLabProps }
