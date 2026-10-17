import { useMemo, useReducer, useState } from 'react'
import {
  createIncidentTimelineKernel,
  buildImpactScopeViewModel,
  REPROCESSING_INCIDENT_CHAIN_TASK_IDS,
  taskIdFromInstanceId,
  type ImpactScopeSetId,
  type IncidentTimelineHighlight,
  type IncidentTimelineState,
} from '../../features/dependency-reprocessing/steps'
import {
  REPROCESSING_INCIDENT_BUSINESS_DATE,
  REPROCESSING_TASK_IDS,
  createReprocessingFixture,
} from '../../features/dependency-reprocessing/fixture'
import { orderTaskIdsByDependencies } from '../../features/dependency-reprocessing/model'
import type { DependencyReprocessingVisualization } from '../../features/dependency-reprocessing/types'
import {
  applyVisualizationPlayerAction,
  createVisualizationPlayer,
  getCurrentVisualizationStep,
  getVisualizationPlayerProgress,
  isVisualizationPlayerAtEnd,
  isVisualizationPlayerAtStart,
} from '../../utils/visualization-steps'

const STEP_KIND_LABELS: Record<IncidentTimelineHighlight['kind'], string> = {
  arrival: '接入',
  'validation-gap': '校验缺口',
  'detail-propagation': '明细传播',
  'branch-fanout': '分支传播',
  'merge-propagation': '汇合传播',
  'consumer-delivery': '消费端',
  conclusion: '结论',
}

const LAYER_LABELS: Record<string, string> = {
  ods: 'ODS',
  dwd: 'DWD',
  dws: 'DWS',
  ads: 'ADS',
  consumer: '消费方',
}

const STATE_LABELS: Record<string, string> = {
  waiting: 'WAITING',
  ready: 'READY',
  running: 'RUNNING',
  stopping: 'STOPPING',
  stopped: 'STOPPED',
  success: 'SUCCESS',
  failed: 'FAILED',
  blocked: 'BLOCKED',
  skipped: 'SKIPPED',
}

function IncidentTimelineChain({
  state,
  highlight,
}: {
  state: IncidentTimelineState
  highlight: IncidentTimelineHighlight
}) {
  return (
    <ol className="dependency-reprocessing__chain" data-reprocessing-chain>
      {state.nodes.map((node) => {
        const isCurrent = highlight.focusTaskIds.includes(node.taskId)
        return (
          <li
            key={node.instanceId}
            className="dependency-reprocessing__node"
            data-node={node.taskId}
            data-instance={node.instanceId}
            data-layer={node.layer}
            data-state={node.state}
            data-revealed={node.revealed}
            data-contaminated={node.contaminated}
            data-focus={isCurrent ? 'current' : undefined}
          >
            <header className="dependency-reprocessing__node-header">
              <span className="dependency-reprocessing__node-layer">
                {LAYER_LABELS[node.layer] ?? node.layer}
              </span>
              <span
                className="dependency-reprocessing__node-state"
                data-tone={node.revealed && node.state === 'success' ? 'success' : 'muted'}
              >
                {node.revealed ? (STATE_LABELS[node.state] ?? node.state) : '待观察'}
              </span>
            </header>
            <p className="dependency-reprocessing__node-task">{node.label}</p>
            {node.revealed ? (
              <>
                <p className="dependency-reprocessing__node-note">{node.note}</p>
                {node.contaminated && (
                  <span className="dependency-reprocessing__node-badge" data-tone="danger">
                    受影响 · 进入重做范围
                  </span>
                )}
              </>
            ) : (
              <p className="dependency-reprocessing__node-hint">时间线尚未走到这个任务。</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function StepEvidencePanel({ highlight }: { highlight: IncidentTimelineHighlight }) {
  return (
    <section
      className="dependency-reprocessing__panel"
      data-panel="step-evidence"
      aria-label="本步证据"
    >
      <header className="dependency-reprocessing__panel-header">
        <span>本步证据</span>
        <strong>{highlight.newEvidence.length} 条</strong>
      </header>
      <ul className="dependency-reprocessing__evidence">
        {highlight.newEvidence.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

function IncidentTimelineLab() {
  const kernel = useMemo(() => createIncidentTimelineKernel(), [])
  const [player, dispatch] = useReducer(
    applyVisualizationPlayerAction,
    kernel.size,
    createVisualizationPlayer,
  )
  const step = getCurrentVisualizationStep(player, kernel)
  const progress = getVisualizationPlayerProgress(player)
  const atStart = isVisualizationPlayerAtStart(player)
  const atEnd = isVisualizationPlayerAtEnd(player)

  if (!step.highlight) {
    throw new Error(`E1 事故时间线步骤 ${step.id} 缺少 highlight 契约`)
  }

  const { state, highlight } = step

  return (
    <section
      className="dependency-reprocessing"
      data-diagram-type="timeline"
      data-reprocessing-mode="incident-timeline"
      data-step-id={step.id}
      data-step-kind={highlight.kind}
      aria-label="事故时间线与污染传播"
    >
      <div className="visualization-toolbar dependency-reprocessing__toolbar">
        <div className="dependency-reprocessing__toolbar-main">
          <span className="visualization-toolbar__label">
            Step {progress.current} / {progress.total} · {STEP_KIND_LABELS[highlight.kind]}
          </span>
          <p aria-live="polite" aria-atomic="true">
            <strong>{step.title}</strong>：{step.description}
          </p>
        </div>
        <div className="visualization-toolbar__actions" role="group" aria-label="分步控制">
          <button
            className="button button--quiet button--small"
            type="button"
            onClick={() => dispatch('prev')}
            disabled={atStart}
          >
            上一步
          </button>
          <button
            className="button button--quiet button--small"
            type="button"
            onClick={() => dispatch('reset')}
          >
            重置
          </button>
          <button
            className="button button--primary button--small"
            type="button"
            onClick={() => dispatch('next')}
            disabled={atEnd}
          >
            {atEnd ? '已完成' : '下一步'}
          </button>
        </div>
      </div>

      <div
        className="dependency-reprocessing__progress"
        role="progressbar"
        aria-label="分步进度"
        aria-valuemin={1}
        aria-valuemax={progress.total}
        aria-valuenow={progress.current}
        aria-valuetext={`第 ${progress.current} 步，共 ${progress.total} 步；已确认 ${state.revealedCount} / ${state.totalCount} 个任务`}
      >
        <span style={{ width: `${progress.ratio * 100}%` }} />
      </div>

      <p className="dependency-reprocessing__reveal-count">
        已确认任务：{state.revealedCount} / {state.totalCount}
      </p>

      <IncidentTimelineChain state={state} highlight={highlight} />
      <StepEvidencePanel highlight={highlight} />

      <section
        className="dependency-reprocessing__conclusion"
        data-panel="conclusion"
        aria-label="本步小结"
      >
        <strong>本步小结</strong>
        <p>{state.conclusion}</p>
      </section>
    </section>
  )
}

const IMPACT_SET_META: Record<ImpactScopeSetId, { label: string; tone: string }> = {
  stop: { label: '停止集合', tone: 'danger' },
  redo: { label: '重做集合', tone: 'warning' },
  waiting: { label: '等待集合', tone: 'muted' },
  notify: { label: '通知集合', tone: 'accent' },
}

function ImpactScopeLab() {
  const model = useMemo(() => createReprocessingFixture(), [])
  const [sourceTaskId, setSourceTaskId] = useState<string | null>(null)
  const labels = useMemo(
    () => new Map(model.tasks.map((task) => [task.taskId, task.label])),
    [model],
  )
  const orderedTaskIds = useMemo(
    () => orderTaskIdsByDependencies(model, REPROCESSING_INCIDENT_CHAIN_TASK_IDS),
    [model],
  )
  const instanceIdByTaskId = useMemo(
    () =>
      new Map(
        orderedTaskIds.map((taskId) => [
          taskId,
          `${taskId}@${REPROCESSING_INCIDENT_BUSINESS_DATE}`,
        ]),
      ),
    [orderedTaskIds],
  )

  const viewModel = useMemo(() => {
    if (!sourceTaskId) return null
    const instanceId = instanceIdByTaskId.get(sourceTaskId)
    if (!instanceId) return null
    return buildImpactScopeViewModel(model, instanceId)
  }, [instanceIdByTaskId, model, sourceTaskId])

  const roleByInstanceId = useMemo(() => {
    const roles = new Map<string, ImpactScopeSetId | 'source'>()
    if (!viewModel) return roles
    roles.set(viewModel.sourceInstanceId, 'source')
    for (const set of viewModel.sets) {
      for (const instanceId of set.instanceIds) {
        if (!roles.has(instanceId)) roles.set(instanceId, set.id)
      }
    }
    return roles
  }, [viewModel])

  return (
    <section
      className="dependency-reprocessing dependency-reprocessing__scope"
      data-diagram-type="graph"
      data-reprocessing-mode="impact-scope"
      aria-label="依赖链重做影响范围"
    >
      <div className="dependency-reprocessing__scope-intro">
        <p>
          <strong>选择源实例：</strong>点击下方任一任务节点，联合 SQL
          血缘、调度依赖与业务日期分区计算影响范围。事故源是 ODS_TRANSACTION 2026-10-16。
        </p>
        <div
          className="dependency-reprocessing__scope-actions"
          role="group"
          aria-label="影响范围控制"
        >
          <button
            className="button button--primary button--small"
            type="button"
            onClick={() => setSourceTaskId(REPROCESSING_TASK_IDS.ingestTransaction)}
          >
            以事故源圈定范围
          </button>
          <button
            className="button button--quiet button--small"
            type="button"
            onClick={() => setSourceTaskId(null)}
            disabled={!sourceTaskId}
          >
            重置
          </button>
        </div>
      </div>

      <ol className="dependency-reprocessing__chain" data-reprocessing-chain data-scope-chain>
        {orderedTaskIds.map((taskId) => {
          const instanceId = instanceIdByTaskId.get(taskId) ?? taskId
          const instance = model.instances.find((candidate) => candidate.instanceId === instanceId)
          const taskLayer = model.tasks.find((task) => task.taskId === taskId)?.layer
          const role = roleByInstanceId.get(instanceId)
          const isSource = role === 'source'
          return (
            <li
              key={taskId}
              className="dependency-reprocessing__node"
              data-node={taskId}
              data-instance={instanceId}
              data-role={role ?? 'idle'}
              data-affected={role !== undefined}
            >
              <button
                type="button"
                className="dependency-reprocessing__node-button"
                aria-pressed={isSource}
                onClick={() => setSourceTaskId(taskId)}
              >
                <span className="dependency-reprocessing__node-header">
                  <span className="dependency-reprocessing__node-layer">
                    {LAYER_LABELS[taskLayer ?? ''] ?? taskLayer ?? ''}
                  </span>
                  <span
                    className="dependency-reprocessing__node-state"
                    data-tone={instance?.state === 'success' ? 'success' : 'muted'}
                  >
                    {instance ? (STATE_LABELS[instance.state] ?? instance.state) : '未知'}
                  </span>
                </span>
                <span className="dependency-reprocessing__node-task">
                  {labels.get(taskId) ?? taskId}
                </span>
                {isSource && (
                  <span className="dependency-reprocessing__node-badge" data-tone="accent">
                    当前源
                  </span>
                )}
                {role !== undefined && role !== 'source' && (
                  <span
                    className="dependency-reprocessing__node-badge"
                    data-tone={IMPACT_SET_META[role].tone}
                  >
                    {IMPACT_SET_META[role].label}
                  </span>
                )}
                {role === undefined && (
                  <span className="dependency-reprocessing__node-hint">点击作为源</span>
                )}
              </button>
            </li>
          )
        })}
      </ol>

      <p className="dependency-reprocessing__scope-summary" aria-live="polite">
        {!viewModel || !sourceTaskId ? (
          '尚未选择源实例：影响范围、四类集合与去重清单将在选择后计算。'
        ) : (
          <>
            以 <strong>{labels.get(sourceTaskId) ?? sourceTaskId}</strong> 为源：受影响{' '}
            <strong>{viewModel.affectedInstanceIds.length}</strong> 个实例、
            <strong>{viewModel.deduplicatedTaskIds.length}</strong> 个任务（已去重）。
          </>
        )}
      </p>

      {viewModel && sourceTaskId && (
        <>
          <div className="dependency-reprocessing__sets">
            {viewModel.sets.map((set) => (
              <section key={set.id} className="dependency-reprocessing__set" data-set={set.id}>
                <header className="dependency-reprocessing__set-header">
                  <span>{set.label}</span>
                  <strong>{set.instanceIds.length}</strong>
                </header>
                <p>{set.description}</p>
                {set.instanceIds.length === 0 ? (
                  <p className="dependency-reprocessing__set-empty">当前为空</p>
                ) : (
                  <ul>
                    {set.instanceIds.map((instanceId) => (
                      <li key={instanceId} data-instance={instanceId}>
                        {labels.get(taskIdFromInstanceId(instanceId)) ??
                          taskIdFromInstanceId(instanceId)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <section className="dependency-reprocessing__panel" data-panel="dedup-list">
            <header className="dependency-reprocessing__panel-header">
              <span>去重后的重做清单</span>
              <strong>{viewModel.deduplicatedTaskIds.length} 个任务</strong>
            </header>
            <ol className="dependency-reprocessing__dedup">
              {viewModel.deduplicatedTaskIds.map((taskId) => (
                <li key={taskId} data-task={taskId}>
                  {labels.get(taskId) ?? taskId}
                </li>
              ))}
            </ol>
            <p>多支汇合节点只出现一次；没有 SQL 血缘但存在调度依赖的任务同样进入范围。</p>
            {viewModel.schedulerOnlyTaskIds.length > 0 && (
              <p data-panel-detail="scheduler-only">
                仅由调度依赖进入范围：
                {viewModel.schedulerOnlyTaskIds
                  .map((taskId) => labels.get(taskId) ?? taskId)
                  .join('、')}
              </p>
            )}
          </section>

          <section className="dependency-reprocessing__panel" data-panel="impact-evidence">
            <header className="dependency-reprocessing__panel-header">
              <span>影响证据</span>
              <strong>{viewModel.evidenceRows.length} 条</strong>
            </header>
            <ul className="dependency-reprocessing__evidence">
              {viewModel.evidenceRows.map((row) => (
                <li key={row.id} data-evidence-kind={row.kind}>
                  <span
                    className="dependency-reprocessing__evidence-kind"
                    data-tone={row.kind === 'lineage' ? 'accent' : 'warning'}
                  >
                    {row.kind === 'lineage' ? 'SQL 血缘' : '调度依赖'}
                  </span>
                  {row.fromLabel} → {row.toLabel}：{row.detail}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="dependency-reprocessing__panel" data-panel="left-join-note">
        <header className="dependency-reprocessing__panel-header">
          <span>LEFT JOIN 的纳入规则</span>
        </header>
        <p>
          DWS 商户汇总通过 LEFT JOIN
          读取商户资料。只要该任务读取的任一输入在影响范围内，即使连接结果没有变化，这个已经执行的实例也必须重做——不能用「看起来没变」把它排除。
        </p>
      </section>
    </section>
  )
}

/**
 * 依赖链重做实验室入口。
 *
 * Phase 2-A 实现 E1 事故时间线；Phase 2-B 实现 E2 影响范围与去重清单；
 * 其余 focus 由后续课程逐步接入，未接入时给出明确占位说明，不伪造交互。
 */
export function DependencyReprocessingLab({
  visualization,
}: {
  visualization: DependencyReprocessingVisualization
}) {
  if (visualization.lessonFocus === 'incident-timeline') {
    return <IncidentTimelineLab />
  }

  if (visualization.lessonFocus === 'impact-scope') {
    return <ImpactScopeLab />
  }

  return (
    <p className="dependency-reprocessing__pending" role="status">
      该实验模式将在后续课程中开放。
    </p>
  )
}
