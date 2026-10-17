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
  REPROCESSING_HISTORICAL_BUSINESS_DATE,
  REPROCESSING_INCIDENT_BUSINESS_DATE,
  REPROCESSING_PREVIOUS_BUSINESS_DATE,
  REPROCESSING_TASK_IDS,
  createReprocessingFixture,
} from '../../features/dependency-reprocessing/fixture'
import {
  createParallelPlan,
  evaluateCurrentBatch,
  evaluateDownstreamClosure,
  orderTaskIdsByDependencies,
} from '../../features/dependency-reprocessing/model'
import {
  STOP_WAIT_FAIL_TASK_ID,
  applyStopWaitRedoAction,
  buildStopWaitRedoNodeViews,
  createStopWaitRedoSession,
  summarizeStopWaitRedoSession,
  type StopWaitRedoPhase,
} from '../../features/dependency-reprocessing/session'
import type {
  ConsumerConfirmation,
  ConsumerEvidence,
  DependencyReprocessingVisualization,
  VersionChangeType,
} from '../../features/dependency-reprocessing/types'
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

const STOP_WAIT_PHASE_HINTS: Record<StopWaitRedoPhase, string> = {
  detected: '影响范围已圈定：先停止 / 阻断受影响实例，再验证 ODS 修复。',
  stopped: '受影响实例已停止或阻断并进入等待；只有 ODS 验证通过才能放行重做。',
  blocked: 'ODS 验证未通过：不生成重做计划，等待再次修复后重新验证。',
  validated: 'ODS 修复验证通过：可以按当前血缘 / 依赖生成重做计划。',
  scheduled: '重做计划已生成：按依赖顺序自动调用，上游先于下游。',
  failed: '重做中发生任务失败：按正常生产故障流程处理，上游成功状态保持不变。',
  completed: '受影响实例全部重做完成：可以继续处理下游消费恢复或再次修复。',
  repaired: 'ODS 再次修复：受影响 SUCCESS 已失效并重新等待，历史日志保留。',
}

const SCHEDULE_ACTION_LABELS = {
  'redo-after-stop': '停止后重做',
  'redo-executed': '已执行重做',
  'run-waiting': '等待后执行',
} as const

function StopWaitRedoLab() {
  const [session, dispatch] = useReducer(
    applyStopWaitRedoAction,
    undefined,
    createStopWaitRedoSession,
  )
  const summary = summarizeStopWaitRedoSession(session)
  const nodes = buildStopWaitRedoNodeViews(session)
  const nodeById = new Map(nodes.map((node) => [node.instanceId, node]))
  const schedule = session.schedule
  const armDisabled = !(
    ['detected', 'stopped', 'validated', 'scheduled'] as StopWaitRedoPhase[]
  ).includes(session.phase)

  return (
    <section
      className="dependency-reprocessing dependency-reprocessing__scope"
      data-diagram-type="state-machine"
      data-reprocessing-mode="stop-wait-redo"
      aria-label="停止、等待与自动依赖重做"
    >
      <p className="dependency-reprocessing__phase" data-phase={session.phase} aria-live="polite">
        <strong>当前阶段：{summary.phaseLabel}</strong>
        <span>{STOP_WAIT_PHASE_HINTS[session.phase]}</span>
      </p>

      <div
        className="dependency-reprocessing__scope-actions"
        role="group"
        aria-label="恢复流程控制"
      >
        <button
          className="button button--primary button--small"
          type="button"
          disabled={session.phase !== 'detected'}
          onClick={() => dispatch({ type: 'stop-affected' })}
        >
          停止受影响任务
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          disabled={session.phase !== 'stopped' && session.phase !== 'blocked'}
          onClick={() => dispatch({ type: 'validate', outcome: 'passed' })}
        >
          ODS 验证通过
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          disabled={session.phase !== 'stopped' && session.phase !== 'blocked'}
          onClick={() => dispatch({ type: 'validate', outcome: 'failed' })}
        >
          ODS 验证不通过
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          disabled={session.phase !== 'validated'}
          onClick={() => dispatch({ type: 'create-schedule' })}
        >
          生成重做计划
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          disabled={session.phase !== 'scheduled'}
          onClick={() => dispatch({ type: 'execute' })}
        >
          执行重做
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          disabled={session.phase !== 'failed'}
          onClick={() => dispatch({ type: 'retry-failed' })}
        >
          重试失败任务
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          disabled={session.phase !== 'completed'}
          onClick={() => dispatch({ type: 're-repair' })}
        >
          ODS 再次修复
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          disabled={session.phase !== 'repaired'}
          onClick={() => dispatch({ type: 'requeue' })}
        >
          重新入队
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => dispatch({ type: 'reset' })}
        >
          重置
        </button>
      </div>

      <label className="dependency-reprocessing__arm">
        <input
          type="checkbox"
          checked={session.failTaskId === STOP_WAIT_FAIL_TASK_ID}
          disabled={armDisabled}
          onChange={(event) =>
            dispatch({
              type: 'arm-failure',
              taskId: event.target.checked ? STOP_WAIT_FAIL_TASK_ID : null,
            })
          }
        />
        <span>教学开关：让 DWD 重做失败一次（验证正常生产故障流程）</span>
      </label>

      <p className="dependency-reprocessing__scope-summary" data-summary="true">
        受影响 <strong>{summary.affectedCount}</strong> · 完成{' '}
        <strong>{summary.successCount}</strong> · 等待 <strong>{summary.waitingCount}</strong> ·
        失败 <strong>{summary.failedCount}</strong> · 消费方{' '}
        <strong>{summary.consumerCount}</strong>
      </p>

      <ol className="dependency-reprocessing__chain" data-reprocessing-chain data-swr-chain>
        {nodes.map((node) => (
          <li
            key={node.instanceId}
            className="dependency-reprocessing__node"
            data-node={node.taskId}
            data-instance={node.instanceId}
            data-state={node.state}
            data-consumer={node.isConsumer}
          >
            <header className="dependency-reprocessing__node-header">
              <span className="dependency-reprocessing__node-layer">
                {LAYER_LABELS[node.layer] ?? node.layer}
              </span>
              <span
                className="dependency-reprocessing__node-state"
                data-tone={
                  node.state === 'success'
                    ? 'success'
                    : node.state === 'failed'
                      ? 'danger'
                      : 'muted'
                }
              >
                {STATE_LABELS[node.state] ?? node.state}
              </span>
            </header>
            <p className="dependency-reprocessing__node-task">{node.label}</p>
            {node.isConsumer && (
              <span className="dependency-reprocessing__node-badge" data-tone="accent">
                消费方
              </span>
            )}
          </li>
        ))}
      </ol>

      {session.phase === 'blocked' && session.validation && (
        <section className="dependency-reprocessing__panel" data-panel="gate-blocked">
          <header className="dependency-reprocessing__panel-header">
            <span>ODS 验证门禁</span>
            <strong>未通过</strong>
          </header>
          <p>{session.validation.blockedReason}</p>
          <ul className="dependency-reprocessing__evidence">
            {session.validation.checks.map((check) => (
              <li key={check.id} data-check={check.id} data-passed={check.passed}>
                {check.label}：{check.detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      {schedule && (
        <section className="dependency-reprocessing__panel" data-panel="redo-schedule">
          <header className="dependency-reprocessing__panel-header">
            <span>重做计划（按依赖顺序）</span>
            <strong>{schedule.items.length} 个实例</strong>
          </header>
          <ol className="dependency-reprocessing__dedup">
            {schedule.items.map((item, index) => {
              const node = nodeById.get(item.instanceId)
              return (
                <li
                  key={item.instanceId}
                  data-instance={item.instanceId}
                  data-action={item.action}
                  data-state={node?.state}
                >
                  <span>
                    {index + 1}. {node?.label ?? item.taskId}
                  </span>
                  <small>{SCHEDULE_ACTION_LABELS[item.action]}</small>
                  <code>{node?.state ?? 'unknown'}</code>
                </li>
              )
            })}
          </ol>
          <p>
            模拟器内部标识 {schedule.simulatorPlanId}
            ；仅用于演示与当前正常计划的隔离，不是平台批次机制。
          </p>
        </section>
      )}

      <section className="dependency-reprocessing__panel" data-panel="event-log">
        <header className="dependency-reprocessing__panel-header">
          <span>执行日志</span>
          <strong>{session.events.length} 条</strong>
        </header>
        <ol className="dependency-reprocessing__log">
          {session.events.map((event, index) => (
            <li key={`${event.at}-${index}`} data-kind={event.kind}>
              <time>{event.at}</time>
              <span>{event.detail}</span>
            </li>
          ))}
        </ol>
        <p>日志按时间顺序追加；保留历史执行记录，不引入轮次 / generation 字段。</p>
      </section>
    </section>
  )
}

const HISTORICAL_TARGET_DATES = [
  REPROCESSING_HISTORICAL_BUSINESS_DATE,
  REPROCESSING_PREVIOUS_BUSINESS_DATE,
] as const

const PARALLEL_PROGRAM_VERSION = 'v3'

function HistoricalModeLab() {
  const [currentCompleted, setCurrentCompleted] = useState(false)
  const model = useMemo(
    () => createReprocessingFixture({ variant: currentCompleted ? 'completed' : 'mid-flight' }),
    [currentCompleted],
  )
  const [mode, setMode] = useState<'current' | 'historical'>('historical')
  const [targetDate, setTargetDate] = useState<string>(REPROCESSING_HISTORICAL_BUSINESS_DATE)
  const [planRequested, setPlanRequested] = useState(false)

  const labels = useMemo(
    () => new Map(model.tasks.map((task) => [task.taskId, task.label])),
    [model],
  )
  const gate = useMemo(
    () => evaluateCurrentBatch(model, REPROCESSING_INCIDENT_BUSINESS_DATE),
    [model],
  )
  const decision = useMemo(() => {
    if (!planRequested) return null
    return createParallelPlan(model, {
      currentBusinessDate: REPROCESSING_INCIDENT_BUSINESS_DATE,
      targetBusinessDate: targetDate,
      sourceTaskId: REPROCESSING_TASK_IDS.ingestTransaction,
      programVersion: PARALLEL_PROGRAM_VERSION,
      changeType: 'sql-logic',
    })
  }, [model, planRequested, targetDate])

  const currentInstances = model.instances.filter(
    (instance) => instance.businessDate === REPROCESSING_INCIDENT_BUSINESS_DATE,
  )
  const currentFinished = currentInstances.length - gate.pendingInstanceIds.length

  const handleModeChange = (nextMode: 'current' | 'historical'): void => {
    setMode(nextMode)
    setPlanRequested(false)
  }

  const handleTargetDateChange = (nextDate: string): void => {
    setTargetDate(nextDate)
    setPlanRequested(false)
  }

  const handleSimulateCompleted = (): void => {
    setCurrentCompleted((previous) => !previous)
    setPlanRequested(false)
  }

  return (
    <section
      className="dependency-reprocessing dependency-reprocessing__scope"
      data-diagram-type="plan-isolation"
      data-reprocessing-mode="historical-parallel"
      aria-label="当日与历史重做模式"
    >
      <div className="dependency-reprocessing__scope-actions" role="group" aria-label="模式选择">
        <button
          className={
            mode === 'current'
              ? 'button button--primary button--small'
              : 'button button--quiet button--small'
          }
          type="button"
          aria-pressed={mode === 'current'}
          onClick={() => handleModeChange('current')}
        >
          当日重做
        </button>
        <button
          className={
            mode === 'historical'
              ? 'button button--primary button--small'
              : 'button button--quiet button--small'
          }
          type="button"
          aria-pressed={mode === 'historical'}
          onClick={() => handleModeChange('historical')}
        >
          历史重做
        </button>
      </div>

      <p
        className="dependency-reprocessing__scope-summary"
        data-role="historical-status"
        aria-live="polite"
      >
        {mode === 'current'
          ? `当日重做：当前批次 ${REPROCESSING_INCIDENT_BUSINESS_DATE} ${
              gate.completed ? '已全部结束' : '尚未全部结束'
            }。`
          : decision
            ? decision.status === 'allowed'
              ? `历史重做：已生成平行 Job / Plan，绑定 ${decision.parallelPlan?.targetBusinessDate}，使用最新程序 ${decision.parallelPlan?.programVersion}。`
              : decision.status === 'blocked'
                ? '历史重做：平行计划被日切门禁阻断。'
                : '历史重做：程序不兼容，禁止直接历史重做。'
            : `历史重做：当前批次 ${
                gate.completed ? '已全部结束，可以生成平行 Job / Plan' : '尚未全部结束，门禁阻断'
              }。`}
      </p>

      {mode === 'current' ? (
        <section className="dependency-reprocessing__panel" data-panel="current-mode">
          <header className="dependency-reprocessing__panel-header">
            <span>当日重做</span>
            <strong>沿现有生产 Job / Plan</strong>
          </header>
          <p>
            「当日」指当前生产日切批次（可跨自然日）。当日重做不生成平行 Job /
            Plan，而是在现有生产链路上停止、等待、验证与重新调用；具体恢复流程见 14-3 的实验。
          </p>
          <ul className="dependency-reprocessing__evidence">
            <li>当前批次：{REPROCESSING_INCIDENT_BUSINESS_DATE}</li>
            <li>
              批次状态：
              {gate.completed
                ? '已全部结束'
                : `未结束（${gate.pendingInstanceIds.length} 个实例未到终态）`}
            </li>
            <li>当日重做沿现有链路恢复，不重置为新的计划。</li>
          </ul>
        </section>
      ) : (
        <>
          <section
            className="dependency-reprocessing__panel"
            data-panel="current-batch-gate"
            data-gate-status={gate.completed ? 'completed' : 'blocked'}
          >
            <header className="dependency-reprocessing__panel-header">
              <span>当日日切门禁</span>
              <strong>{gate.completed ? '已结束' : '未结束'}</strong>
            </header>
            {gate.completed ? (
              <p>
                当前生产日切批次 {REPROCESSING_INCIDENT_BUSINESS_DATE}{' '}
                已全部结束，可以生成历史日期的平行 Job / Plan。
              </p>
            ) : (
              <p>
                当前生产日切批次 {REPROCESSING_INCIDENT_BUSINESS_DATE} 尚未全部结束：
                {gate.pendingInstanceIds
                  .map((instanceId) => labels.get(taskIdFromInstanceId(instanceId)) ?? instanceId)
                  .join('、')}
                。历史重做必须先等当日跑批结束。
              </p>
            )}
            <button
              className="button button--quiet button--small"
              type="button"
              onClick={handleSimulateCompleted}
            >
              {currentCompleted ? '模拟当日跑批未结束' : '模拟当日跑批完成'}
            </button>
          </section>

          <div
            className="dependency-reprocessing__scope-actions"
            role="group"
            aria-label="平行计划控制"
          >
            <label className="dependency-reprocessing__arm">
              <span>历史目标日期</span>
              <select
                value={targetDate}
                data-role="target-date"
                onChange={(event) => handleTargetDateChange(event.target.value)}
              >
                {HISTORICAL_TARGET_DATES.map((date) => (
                  <option key={date} value={date}>
                    {date}
                  </option>
                ))}
              </select>
            </label>
            <span className="dependency-reprocessing__node-state" data-tone="muted">
              最新程序 {PARALLEL_PROGRAM_VERSION}
            </span>
            <button
              className="button button--primary button--small"
              type="button"
              onClick={() => setPlanRequested(true)}
            >
              生成平行 Job / Plan
            </button>
            <button
              className="button button--quiet button--small"
              type="button"
              disabled={!planRequested}
              onClick={() => setPlanRequested(false)}
            >
              清空结果
            </button>
          </div>

          {decision && (
            <section
              className="dependency-reprocessing__panel"
              data-panel="parallel-plan"
              data-plan-status={decision.status}
            >
              <header className="dependency-reprocessing__panel-header">
                <span>平行 Job / Plan</span>
                <strong>
                  {decision.status === 'allowed'
                    ? '已生成'
                    : decision.status === 'blocked'
                      ? '被阻断'
                      : '被禁止'}
                </strong>
              </header>
              {decision.status === 'blocked' && (
                <ul className="dependency-reprocessing__evidence">
                  {decision.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              )}
              {decision.status === 'forbidden' && <p>{decision.requiredAction}</p>}
              {decision.parallelPlan && (
                <>
                  <p>
                    绑定历史日期 <strong>{decision.parallelPlan.targetBusinessDate}</strong>
                    ；使用当前有效血缘 / 依赖与
                    <strong>最新程序 {decision.parallelPlan.programVersion}</strong>
                    ；模拟器内部标识 {decision.parallelPlan.simulatorPlanId}
                    （仅用于演示隔离，不是平台批次机制）。
                  </p>
                  <ol className="dependency-reprocessing__dedup" data-plan-items>
                    {decision.parallelPlan.items.map((item, index) => (
                      <li
                        key={item.instanceId}
                        data-instance={item.instanceId}
                        data-target-date={item.targetBusinessDate}
                      >
                        <span>
                          {index + 1}. {labels.get(item.taskId) ?? item.taskId}
                        </span>
                        <code>{item.targetBusinessDate}</code>
                        <small>{item.programVersion}</small>
                      </li>
                    ))}
                  </ol>
                  <p data-plan-note="isolation">
                    平行计划只绑定历史日期；当前正常 Job / Plan（
                    {REPROCESSING_INCIDENT_BUSINESS_DATE}）的状态未被修改：完成 {currentFinished} /
                    共 {currentInstances.length} 个实例。
                  </p>
                </>
              )}
            </section>
          )}

          <p className="dependency-reprocessing__scope-summary">
            程序 / 表结构 / 业务语义不兼容（尤其新老系统重大重构）会直接禁止历史重做，详见 14-5。
          </p>
        </>
      )}
    </section>
  )
}

const VERSION_CHANGE_OPTIONS: readonly {
  type: VersionChangeType
  label: string
  hint: string
}[] = [
  { type: 'none', label: '无变更', hint: '程序与契约没有变化，历史输入兼容。' },
  { type: 'sql-logic', label: 'SQL 逻辑调整', hint: '加工逻辑变化，但输入契约保持兼容。' },
  {
    type: 'schema-breaking',
    label: '表结构破坏性变更',
    hint: '字段、类型或表结构不兼容历史输入。',
  },
  { type: 'semantics-changed', label: '业务语义变化', hint: '口径或业务含义已经变化。' },
  {
    type: 'input-contract-changed',
    label: '输入契约变化',
    hint: '历史输入与最新程序的契约不一致。',
  },
  { type: 'major-refactor', label: '新老系统重大重构', hint: '重构导致历史输入不兼容。' },
]

function VersionBoundaryLab() {
  const model = useMemo(() => createReprocessingFixture({ variant: 'completed' }), [])
  const [changeType, setChangeType] = useState<VersionChangeType>('sql-logic')
  const [trialRequested, setTrialRequested] = useState(false)

  const decision = useMemo(
    () =>
      createParallelPlan(model, {
        currentBusinessDate: REPROCESSING_INCIDENT_BUSINESS_DATE,
        targetBusinessDate: REPROCESSING_HISTORICAL_BUSINESS_DATE,
        sourceTaskId: REPROCESSING_TASK_IDS.ingestTransaction,
        programVersion: PARALLEL_PROGRAM_VERSION,
        changeType,
      }),
    [model, changeType],
  )

  const selectedOption =
    VERSION_CHANGE_OPTIONS.find((option) => option.type === changeType) ?? VERSION_CHANGE_OPTIONS[0]
  const compatible = decision.compatibility.compatible
  const labels = new Map(model.tasks.map((task) => [task.taskId, task.label]))

  const handleChangeType = (nextType: VersionChangeType): void => {
    setChangeType(nextType)
    setTrialRequested(false)
  }

  return (
    <section
      className="dependency-reprocessing dependency-reprocessing__scope"
      data-diagram-type="decision"
      data-reprocessing-mode="version-boundary"
      aria-label="历史重做版本兼容边界"
    >
      <div className="dependency-reprocessing__scope-actions" role="group" aria-label="变更类型">
        {VERSION_CHANGE_OPTIONS.map((option) => (
          <button
            key={option.type}
            className={
              changeType === option.type
                ? 'button button--primary button--small'
                : 'button button--quiet button--small'
            }
            type="button"
            data-change-type={option.type}
            aria-pressed={changeType === option.type}
            onClick={() => handleChangeType(option.type)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p
        className="dependency-reprocessing__scope-summary"
        data-role="version-status"
        aria-live="polite"
      >
        变更类型：<strong>{selectedOption.label}</strong>（{selectedOption.hint}）。判定：
        {compatible ? '兼容，可以生成平行 Job / Plan' : '禁止直接历史重做，转专项修复'}。
      </p>

      <section
        className="dependency-reprocessing__panel"
        data-panel="version-verdict"
        data-verdict={compatible ? 'compatible' : 'forbidden'}
      >
        <header className="dependency-reprocessing__panel-header">
          <span>版本兼容性判定（历史目标 {REPROCESSING_HISTORICAL_BUSINESS_DATE}）</span>
          <strong>{compatible ? '兼容' : '禁止'}</strong>
        </header>
        <ul className="dependency-reprocessing__evidence">
          {decision.compatibility.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        {decision.compatibility.requiredAction && (
          <p data-role="required-action">{decision.compatibility.requiredAction}</p>
        )}

        {!compatible && (
          <div
            className="dependency-reprocessing__scope-actions"
            role="group"
            aria-label="试跑模拟"
          >
            <button
              className="button button--quiet button--small"
              type="button"
              onClick={() => setTrialRequested(true)}
            >
              模拟仅凭 SQL 试跑通过
            </button>
            <button
              className="button button--quiet button--small"
              type="button"
              disabled={!trialRequested}
              onClick={() => setTrialRequested(false)}
            >
              清除试跑结论
            </button>
          </div>
        )}

        {trialRequested && !compatible && (
          <p data-role="trial-note">
            SQL
            试跑通过：只说明语法与执行计划可运行，不构成历史输入兼容性证据；本次判定仍为禁止直接历史重做。
          </p>
        )}

        {decision.parallelPlan && (
          <>
            <p>
              平行 Job / Plan 使用最新程序 {decision.parallelPlan.programVersion}，绑定历史日期{' '}
              {decision.parallelPlan.targetBusinessDate}；当前正常计划状态不被修改。
            </p>
            <ol className="dependency-reprocessing__dedup" data-plan-items>
              {decision.parallelPlan.items.map((item, index) => (
                <li key={item.instanceId} data-instance={item.instanceId}>
                  <span>
                    {index + 1}. {labels.get(item.taskId) ?? item.taskId}
                  </span>
                  <code>{item.programVersion}</code>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <p className="dependency-reprocessing__scope-summary">
        不因 SQL 能运行就认定安全：变更类型不兼容时，正确动作是先完成数据迁移与历史回填的专项方案。
      </p>
    </section>
  )
}

const CONSUMER_KIND_LABELS: Record<ConsumerEvidence['kind'], string> = {
  load: '装数',
  interface: '接口',
  file: '文件',
  report: '报表',
  regulatory: '监管',
}

const INITIAL_CONSUMERS: readonly ConsumerEvidence[] = [
  {
    consumerId: 'interface.push',
    label: '交易报表推送',
    kind: 'interface',
    consumedInstanceId: 'publish.ads-transaction-report.daily.v3@2026-10-10',
    consumedNewResult: false,
    confirmation: 'pending',
  },
  {
    consumerId: 'file.export',
    label: '交易文件投递',
    kind: 'file',
    consumedInstanceId: 'deliver.transaction-file.daily.v1@2026-10-10',
    consumedNewResult: false,
    confirmation: 'pending',
  },
  {
    consumerId: 'report.bi',
    label: '经营分析报表',
    kind: 'report',
    consumedInstanceId: 'publish.ads-transaction-report.daily.v3@2026-10-10',
    consumedNewResult: false,
    confirmation: 'pending',
  },
  {
    consumerId: 'regulator.submit',
    label: '监管报送',
    kind: 'regulatory',
    consumedInstanceId: 'publish.ads-transaction-report.daily.v3@2026-10-10',
    consumedNewResult: false,
    confirmation: 'pending',
  },
  {
    consumerId: 'load.new',
    label: '新建装载任务',
    kind: 'load',
    consumedInstanceId: null,
    consumedNewResult: false,
    confirmation: 'pending',
  },
  {
    consumerId: 'interface.fresh',
    label: '已消费新结果的接口',
    kind: 'interface',
    consumedInstanceId: 'publish.ads-transaction-report.daily.v3@2026-10-16',
    consumedNewResult: true,
    confirmation: 'confirmed',
  },
]

function ConsumerClosureLab() {
  const [consumers, setConsumers] = useState<readonly ConsumerEvidence[]>(INITIAL_CONSUMERS)
  const closure = useMemo(() => evaluateDownstreamClosure(consumers), [consumers])

  const actionRequiredRows = closure.rows.filter((row) => row.requiredAction !== 'none')
  const pendingCount = closure.pendingConfirmationCount
  const actionCounts = {
    reload: closure.rows.filter((row) => row.requiredAction === 'reload').length,
    refresh: closure.rows.filter((row) => row.requiredAction === 'refresh').length,
    correct: closure.rows.filter((row) => row.requiredAction === 'correct').length,
  }

  const setConfirmation = (consumerId: string, confirmation: ConsumerConfirmation): void => {
    setConsumers((previous) =>
      previous.map((consumer) =>
        consumer.consumerId === consumerId ? { ...consumer, confirmation } : consumer,
      ),
    )
  }

  const confirmAll = (): void => {
    setConsumers((previous) =>
      previous.map((consumer) => ({ ...consumer, confirmation: 'confirmed' })),
    )
  }

  return (
    <section
      className="dependency-reprocessing dependency-reprocessing__scope"
      data-diagram-type="closure"
      data-reprocessing-mode="consumer-closure"
      aria-label="下游消费与重新装数闭环"
    >
      <p
        className="dependency-reprocessing__scope-summary"
        data-role="closure-status"
        aria-live="polite"
      >
        数仓任务：<strong>全部 SUCCESS</strong>（重做已完成） · 受影响消费方{' '}
        <strong>{actionRequiredRows.length}</strong> 个 · 待确认 <strong>{pendingCount}</strong> 个
        · {closure.allConfirmed ? '消费端恢复闭环已完成' : '消费端尚未全部恢复'}
      </p>

      <div className="dependency-reprocessing__scope-actions" role="group" aria-label="闭环控制">
        <button
          className="button button--primary button--small"
          type="button"
          disabled={closure.allConfirmed}
          onClick={confirmAll}
        >
          一键确认全部受影响消费方
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => setConsumers(INITIAL_CONSUMERS)}
        >
          重置
        </button>
      </div>

      <section
        className="dependency-reprocessing__panel"
        data-panel="downstream-closure"
        data-all-confirmed={closure.allConfirmed}
      >
        <header className="dependency-reprocessing__panel-header">
          <span>下游消费闭环</span>
          <strong>{closure.allConfirmed ? '已闭环' : `待确认 ${pendingCount} 个`}</strong>
        </header>
        <p>
          重装 {actionCounts.reload} · 刷新 {actionCounts.refresh} · 更正 {actionCounts.correct}
          ；动作完成后需要确认跟踪，确认是闭环的一部分。
        </p>
        <ul className="dependency-reprocessing__consumers">
          {closure.rows.map((row) => (
            <li
              key={row.consumerId}
              data-consumer-id={row.consumerId}
              data-kind={row.kind}
              data-action={row.requiredAction}
              data-confirmation={row.confirmation}
            >
              <div className="dependency-reprocessing__consumer-title">
                <strong>{row.label}</strong>
                <span className="dependency-reprocessing__consumer-kind" data-kind={row.kind}>
                  {CONSUMER_KIND_LABELS[row.kind]}
                </span>
              </div>
              <p>{row.note}</p>
              <div className="dependency-reprocessing__consumer-actions">
                <span data-role="action-label">{row.actionLabel}</span>
                {row.requiredAction === 'none' ? (
                  <span data-role="no-action">无需处理</span>
                ) : (
                  <button
                    className="button button--quiet button--small"
                    type="button"
                    onClick={() =>
                      setConfirmation(
                        row.consumerId,
                        row.confirmation === 'confirmed' ? 'pending' : 'confirmed',
                      )
                    }
                  >
                    {row.confirmation === 'confirmed' ? '撤销确认' : '标记已确认'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <p className="dependency-reprocessing__scope-summary">
        数仓任务 SUCCESS
        不等于消费端恢复：报表要刷新缓存、文件要重新投递、对外报送要更正并确认。14-7
        会继续讨论连续多日历史补数的顺序约束。
      </p>
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

  if (visualization.lessonFocus === 'stop-wait-redo') {
    return <StopWaitRedoLab />
  }

  if (visualization.lessonFocus === 'current-vs-historical') {
    return <HistoricalModeLab />
  }

  if (visualization.lessonFocus === 'version-boundary') {
    return <VersionBoundaryLab />
  }

  if (visualization.lessonFocus === 'consumer-closure') {
    return <ConsumerClosureLab />
  }

  return (
    <p className="dependency-reprocessing__pending" role="status">
      该实验模式将在后续课程中开放。
    </p>
  )
}
