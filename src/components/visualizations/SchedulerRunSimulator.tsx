import { useEffect, useMemo, useState } from 'react'
import type {
  SchedulerDependencyState,
  SchedulerEvent,
  SchedulerEventType,
  SchedulerLessonFocus,
  SchedulerTaskReferences,
  SchedulerOutputComparison,
  SchedulerRerunMode,
  SchedulerRerunPlan,
  SchedulerRunState,
  SchedulerScenario,
  SchedulerSlaState,
  SchedulerTaskDefinition,
  SchedulerTaskRunRecord,
  SchedulerVisualization,
} from '../../features/scheduler/types'
import {
  BANKING_DEPOSIT_BALANCE_ARRIVAL_AT,
  BANKING_DEPOSIT_BALANCE_EXPECTED_ARRIVAL_AT,
  BANKING_DEPOSIT_BALANCE_FTP_ARRIVAL_AT,
  BANKING_DEPOSIT_BALANCE_FTP_DETECTED_AT,
  BANKING_DEPOSIT_BALANCE_RESULT_LABEL,
  BANKING_SCHEDULER_TASK_IDS,
} from '../../features/scheduler/banking'
import {
  addSchedulerMinutes,
  advanceSchedulerRun,
  compareRerunOutputs,
  createInitialSchedulerRun,
  createPartitionRerunPlan,
  getOutputStateLabel,
  transitionSchedulerRun,
} from '../../utils/scheduler'

interface SchedulerRunSimulatorProps {
  visualization: SchedulerVisualization
}

type Layer = SchedulerTaskDefinition['layer']
type StoryMoment = SchedulerEventType | 'terminal'
type ReadinessMode = 'timed-extract' | 'upstream-signal' | 'ftp-detection'
type RerunTeachingMode = 'retry' | 'rerun' | 'backfill'

const LAYER_ORDER: readonly Layer[] = ['ods', 'dwd', 'dws', 'ads']

const LAYER_LABELS: Record<Layer, string> = {
  ods: '原始落地',
  dwd: '明细标准',
  dws: '主题汇总',
  ads: '应用发布',
}

const STATUS_LABELS: Record<SchedulerTaskRunRecord['status'], string> = {
  queued: 'queued · 排队',
  running: 'running · 运行中',
  success: 'success · 成功',
  failed: 'failed · 失败',
  retry: 'retry · 重试中',
  skipped: 'skipped · 已跳过',
}

const STATUS_SHORT_LABELS: Record<SchedulerTaskRunRecord['status'], string> = {
  queued: 'queued',
  running: 'running',
  success: 'success',
  failed: 'failed',
  retry: 'retry',
  skipped: 'skipped',
}

const DEPENDENCY_LABELS: Record<SchedulerDependencyState, string> = {
  waiting: 'waiting · 等待依赖',
  ready: 'ready · 可以运行',
  satisfied: 'satisfied · 依赖满足',
  blocked: 'blocked · 已阻断',
}

const SLA_LABELS: Record<SchedulerSlaState, string> = {
  'not-started': 'not-started · 未开始',
  'on-time': 'on-time · 按时',
  'at-risk': 'at-risk · 有风险',
  breached: 'breached · 已超时',
}

const EVENT_LABELS: Record<SchedulerEventType, string> = {
  schedule: 'schedule 触发',
  queue: 'task 入队',
  start: 'task 开始',
  success: 'task 成功',
  failure: 'task 失败',
  retry: '进入 retry',
  skip: '下游 skipped',
  'upstream-late': '输入就绪',
  rerun: '重跑触发',
  recovery: '人工 recovery',
}

function getTask(tasks: readonly SchedulerTaskDefinition[], taskId: string) {
  return tasks.find((task) => task.taskId === taskId)
}

function getTaskReferences(visualization: SchedulerVisualization): SchedulerTaskReferences {
  return (
    visualization.taskReferences ?? {
      dwd: BANKING_SCHEDULER_TASK_IDS.dwd,
      dws: BANKING_SCHEDULER_TASK_IDS.dws,
      ads: BANKING_SCHEDULER_TASK_IDS.ads,
      lateInput: BANKING_SCHEDULER_TASK_IDS.accountBalanceSnapshot,
      failure: BANKING_SCHEDULER_TASK_IDS.dwd,
    }
  )
}

function getTeachingTaskState(taskRun: SchedulerTaskRunRecord | undefined): string {
  if (!taskRun) {
    return '未创建'
  }

  if (taskRun.status === 'running') {
    return '运行中'
  }

  if (taskRun.status === 'success') {
    return '成功'
  }

  if (taskRun.status === 'failed') {
    return '失败'
  }

  if (taskRun.status === 'retry') {
    return '等待重试'
  }

  if (taskRun.dependencyState === 'blocked' || taskRun.status === 'skipped') {
    return '等待上游'
  }

  if (taskRun.dependencyState === 'ready') {
    return '可以开始'
  }

  return taskRun.dependencyTaskIds.length > 0 ? '等待上游' : '等待输入'
}

function formatTime(value: string | null): string {
  return value ?? '—'
}

function formatRuntime(value: number | null): string {
  return value === null ? '—' : `${value} min`
}

function formatDateForRun(date: string): string {
  return date.replace(/-/gu, '')
}

function getTaskDependencyText(task: SchedulerTaskDefinition): string {
  return task.dependsOn.length === 0 ? '无上游任务' : `${task.dependsOn.length} 个上游任务`
}

function TaskNode({
  task,
  taskRun,
  selected,
  onSelect,
}: {
  task: SchedulerTaskDefinition
  taskRun: SchedulerTaskRunRecord
  selected: boolean
  onSelect: (taskId: string) => void
}) {
  return (
    <button
      className={`scheduler-task-node is-${taskRun.status}${selected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={selected}
      aria-label={`${task.label}，${STATUS_LABELS[taskRun.status]}，${DEPENDENCY_LABELS[taskRun.dependencyState]}`}
      onClick={() => onSelect(task.taskId)}
    >
      <span className="scheduler-task-node__topline">
        <code>{task.layer.toUpperCase()}</code>
        <span className="scheduler-task-node__status">{STATUS_SHORT_LABELS[taskRun.status]}</span>
      </span>
      <strong>{task.label}</strong>
      <small>{task.taskId}</small>
      <span className="scheduler-task-node__dependency">
        {taskRun.dependencyState === 'blocked' ? '依赖已阻断' : getTaskDependencyText(task)}
      </span>
      <span className="scheduler-task-node__time">
        {taskRun.startedAt
          ? `开始 ${taskRun.startedAt.slice(11)}`
          : `排队 ${taskRun.queuedAt.slice(11)}`}
      </span>
    </button>
  )
}

function DagCanvas({
  tasks,
  taskRuns,
  selectedTaskId,
  onSelectTask,
}: {
  tasks: readonly SchedulerTaskDefinition[]
  taskRuns: Readonly<Record<string, SchedulerTaskRunRecord>>
  selectedTaskId: string
  onSelectTask: (taskId: string) => void
}) {
  return (
    <section className="scheduler-dag" aria-labelledby="scheduler-dag-title">
      <div className="scheduler-panel-heading">
        <div>
          <span className="eyebrow eyebrow--small">DEPENDENCY GRAPH</span>
          <h3 id="scheduler-dag-title">ODS → DWD → DWS → ADS</h3>
        </div>
        <p>节点是任务，边是可执行条件；状态会沿依赖传播。</p>
      </div>
      <div className="scheduler-dag__track" aria-label="调度任务依赖图">
        {LAYER_ORDER.map((layer, layerIndex) => {
          const layerTasks = tasks.filter((task) => task.layer === layer)
          return (
            <div className="scheduler-dag__layer-wrap" key={layer}>
              <div className={`scheduler-dag__layer scheduler-dag__layer--${layer}`}>
                <div className="scheduler-dag__layer-heading">
                  <span>{String(layerIndex + 1).padStart(2, '0')}</span>
                  <strong>{layer.toUpperCase()}</strong>
                  <small>{LAYER_LABELS[layer]}</small>
                </div>
                <div className="scheduler-dag__nodes">
                  {layerTasks.map((task) => {
                    const taskRun = taskRuns[task.taskId]
                    if (!taskRun) {
                      return null
                    }

                    return (
                      <TaskNode
                        key={task.taskId}
                        task={task}
                        taskRun={taskRun}
                        selected={selectedTaskId === task.taskId}
                        onSelect={onSelectTask}
                      />
                    )
                  })}
                </div>
              </div>
              {layerIndex < LAYER_ORDER.length - 1 && (
                <div className="scheduler-dag__connector" aria-hidden="true">
                  <span>依赖</span>
                  <strong>→</strong>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="scheduler-dag__edge-note">
        <span>拓扑依赖</span>
        <p>
          {tasks.filter((task) => task.layer === 'ods').length} 个输入任务都成功后，才会放行 DWD；
          DWD success 后才放行 DWS，最后由 ADS 发布结果。
        </p>
      </div>
    </section>
  )
}

function TaskDetail({
  state,
  task,
  onRecover,
  teaching = false,
}: {
  state: SchedulerRunState
  task: SchedulerTaskDefinition
  onRecover: (taskId: string) => void
  teaching?: boolean
}) {
  const taskRun = state.taskRuns[task.taskId]
  if (!taskRun) {
    return null
  }

  return (
    <section className="scheduler-task-detail" aria-labelledby="scheduler-task-detail-title">
      <div className="scheduler-panel-heading">
        <div>
          <span className="eyebrow eyebrow--small">运行记录</span>
          <h3 id="scheduler-task-detail-title">{task.label}</h3>
        </div>
        <span className={`scheduler-state-badge is-${taskRun.status}`}>
          {teaching ? getTeachingTaskState(taskRun) : STATUS_LABELS[taskRun.status]}
        </span>
      </div>
      <p className="scheduler-task-detail__description">{task.description}</p>
      <dl className="scheduler-run-facts">
        <div>
          <dt>任务标识</dt>
          <dd>
            <code>{task.taskId}</code>
          </dd>
        </div>
        <div>
          <dt>运行实例</dt>
          <dd>
            <code>{state.runId}</code>
          </dd>
        </div>
        <div>
          <dt>业务日期 / 分区</dt>
          <dd>
            <code>
              {taskRun.partition.column} = {taskRun.partition.value}
            </code>
          </dd>
        </div>
        <div>
          <dt>重试次数</dt>
          <dd>
            <strong>{taskRun.attempt || '—'}</strong>
            {taskRun.attempts.length > 0 && <small> · {taskRun.attempts.length} 条记录</small>}
          </dd>
        </div>
        <div>
          <dt>依赖状态</dt>
          <dd>{DEPENDENCY_LABELS[taskRun.dependencyState]}</dd>
        </div>
        <div>
          <dt>SLA 状态</dt>
          <dd className={`is-${taskRun.slaState}`}>{SLA_LABELS[taskRun.slaState]}</dd>
        </div>
        <div>
          <dt>起止时间 / 耗时</dt>
          <dd>
            {formatTime(taskRun.startedAt)} → {formatTime(taskRun.endedAt)} ·{' '}
            {formatRuntime(taskRun.runtimeMinutes)}
          </dd>
        </div>
        <div>
          <dt>相对计划的延迟</dt>
          <dd>{taskRun.delayMinutes} min</dd>
        </div>
        <div>
          <dt>输出状态</dt>
          <dd className={`is-${taskRun.outputState}`}>
            {getOutputStateLabel(taskRun.outputState)}
          </dd>
        </div>
      </dl>
      {taskRun.failureReason && (
        <p className="scheduler-task-detail__failure" role="status">
          <strong>失败证据：</strong> {taskRun.failureReason}
        </p>
      )}
      {taskRun.status === 'failed' && (
        <button
          className="button button--quiet button--small scheduler-task-detail__recover"
          type="button"
          onClick={() => onRecover(task.taskId)}
        >
          人工 recovery：重新放行 {task.label}
        </button>
      )}
      <div className="scheduler-contract-grid">
        <div>
          <span>输入表</span>
          <p>
            {task.contract.inputTables.map((table) => (
              <code key={table}>{table}</code>
            ))}
          </p>
        </div>
        <div>
          <span>输出表</span>
          <p>
            <code>{task.contract.outputTable}</code>
          </p>
        </div>
        <div>
          <span>输入表依赖</span>
          <p>
            {task.contract.dependencies.map((dependency) => (
              <code key={dependency}>{dependency}</code>
            ))}
          </p>
        </div>
        <div>
          <span>任务依赖</span>
          <p>
            {task.dependsOn.length > 0
              ? task.dependsOn.map((dependency) => <code key={dependency}>{dependency}</code>)
              : '无上游任务'}
          </p>
        </div>
        <div>
          <span>幂等写入 / 局部补数</span>
          <p>
            <b>{task.contract.isIdempotent ? '是' : '否'}</b> /{' '}
            <b>{task.contract.supportsPartialRerun ? '支持' : '不支持'}</b>
          </p>
        </div>
        <div>
          <span>补数提示</span>
          <p>{task.contract.rerunHint}</p>
        </div>
      </div>
      <AttemptTable attempts={taskRun.attempts} teaching={teaching} />
    </section>
  )
}

function AttemptTable({
  attempts,
  teaching = false,
}: {
  attempts: readonly SchedulerTaskRunRecord['attempts'][number][]
  teaching?: boolean
}) {
  return (
    <div className="scheduler-attempts">
      <div className="scheduler-subheading">
        <div>
          <span className="eyebrow eyebrow--small">ATTEMPT LOG</span>
          <h4>每一次执行都保留</h4>
        </div>
        <p>{attempts.length > 0 ? `${attempts.length} 次 attempt` : '尚未开始执行'}</p>
      </div>
      {attempts.length > 0 ? (
        <div className="scheduler-table-wrap">
          <table>
            <caption className="sr-only">任务 attempt 记录</caption>
            <thead>
              <tr>
                <th scope="col">attempt</th>
                <th scope="col">status</th>
                <th scope="col">queued</th>
                <th scope="col">start → end</th>
                <th scope="col">runtime</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr key={attempt.attempt}>
                  <th scope="row">#{attempt.attempt}</th>
                  <td className={`is-${attempt.status}`}>
                    {teaching
                      ? attempt.status === 'running'
                        ? '运行中'
                        : attempt.status === 'success'
                          ? '成功'
                          : '失败'
                      : STATUS_SHORT_LABELS[attempt.status]}
                  </td>
                  <td>{attempt.queuedAt}</td>
                  <td>
                    {formatTime(attempt.startedAt)} → {formatTime(attempt.endedAt)}
                  </td>
                  <td>{formatRuntime(attempt.runtimeMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="scheduler-empty">单步或播放时间轴后，这里会出现 attempt 证据。</p>
      )}
    </div>
  )
}

function EventLog({ state }: { state: SchedulerRunState }) {
  return (
    <section className="scheduler-event-log" aria-labelledby="scheduler-event-log-title">
      <div className="scheduler-panel-heading">
        <div>
          <span className="eyebrow eyebrow--small">EVENT LOG</span>
          <h3 id="scheduler-event-log-title">运行事件日志</h3>
        </div>
        <p>{state.events.length} 条事件 · 每条都带分区和触发上下文</p>
      </div>
      <ol>
        {state.events.map((event) => (
          <EventLogItem event={event} tasks={state.tasks} key={event.eventId} />
        ))}
      </ol>
    </section>
  )
}

function EventLogItem({
  event,
  tasks,
}: {
  event: SchedulerEvent
  tasks: readonly SchedulerTaskDefinition[]
}) {
  const task = event.taskId ? getTask(tasks, event.taskId) : undefined

  return (
    <li className={`scheduler-event scheduler-event--${event.type}`}>
      <time dateTime={event.timestamp.replace(' ', 'T')}>{event.timestamp}</time>
      <div className="scheduler-event__body">
        <div>
          <strong>{EVENT_LABELS[event.type]}</strong>
          {task && <span>{task.label}</span>}
          {event.attempt && <small>attempt {event.attempt}</small>}
        </div>
        <p>{event.message}</p>
        <small>
          {event.partition.column} = {event.partition.value}
          {event.slaState ? ` · SLA ${SLA_LABELS[event.slaState]}` : ''}
          {event.outputState ? ` · output ${getOutputStateLabel(event.outputState)}` : ''}
        </small>
      </div>
    </li>
  )
}

function RerunPlanner({
  state,
  visualization,
  mode,
  targetTaskId,
  plan,
  comparison,
  onModeChange,
  onTargetChange,
  onApply,
  taskReferences,
}: {
  state: SchedulerRunState
  visualization: SchedulerVisualization
  mode: SchedulerRerunMode
  targetTaskId: string
  plan: SchedulerRerunPlan
  comparison: ReturnType<typeof compareRerunOutputs>
  onModeChange: (mode: SchedulerRerunMode) => void
  onTargetChange: (taskId: string) => void
  onApply: () => void
  taskReferences?: SchedulerTaskReferences
}) {
  const references = taskReferences ?? getTaskReferences(visualization)
  const targetTask = getTask(visualization.tasks, targetTaskId)!
  const outputRows = Math.max(1, visualization.outputPreview.beforeLateRows)

  return (
    <section className="scheduler-rerun" aria-labelledby="scheduler-rerun-title">
      <div className="scheduler-panel-heading">
        <div>
          <span className="eyebrow eyebrow--small">分区补数</span>
          <h3 id="scheduler-rerun-title">补数范围要与业务分区一致</h3>
        </div>
        <p>
          当前选择：{state.partition.column} = {state.businessDate}
        </p>
      </div>
      <div className="scheduler-rerun__controls">
        <fieldset>
          <legend>重跑模式</legend>
          <div className="scheduler-choice-group">
            <button
              className={`scheduler-choice${mode === 'partial' ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={mode === 'partial'}
              onClick={() => onModeChange('partial')}
            >
              <strong>partial rerun · 局部补数</strong>
              <small>只跑目标任务及下游，复用上游成功结果。</small>
            </button>
            <button
              className={`scheduler-choice${mode === 'full' ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={mode === 'full'}
              onClick={() => onModeChange('full')}
            >
              <strong>full rerun · 全链路重跑</strong>
              <small>从 ODS 重新走过整条依赖，适合迟到输入。</small>
            </button>
          </div>
        </fieldset>
        <label className="scheduler-rerun__target">
          <span>局部补数目标</span>
          <select
            value={targetTaskId}
            disabled={mode === 'full'}
            aria-label="选择局部补数目标任务"
            onChange={(event) => onTargetChange(event.target.value)}
          >
            {[references.dws, references.ads].map((taskId) => {
              const task = getTask(visualization.tasks, taskId)!
              return (
                <option value={taskId} key={taskId}>
                  {task.label} · {task.contract.outputTable}
                </option>
              )
            })}
          </select>
        </label>
      </div>
      <div className="scheduler-rerun__plan" aria-live="polite">
        <div>
          <span>将运行</span>
          <strong>{plan.taskIds.length} 个任务</strong>
          <small>
            {plan.taskIds.map((taskId) => getTask(visualization.tasks, taskId)?.label).join(' → ')}
          </small>
        </div>
        <div>
          <span>将复用</span>
          <strong>{plan.reusedTaskIds.length} 个上游</strong>
          <small>
            {plan.reusedTaskIds.length > 0
              ? `${plan.reusedTaskIds.length} 个已有 output 保持 available`
              : '没有复用，所有分区重新计算'}
          </small>
        </div>
        <div>
          <span>输出表</span>
          <strong>{plan.outputTables.length} 张</strong>
          <small>{plan.outputTables.join(' · ')}</small>
        </div>
      </div>
      <p className="scheduler-rerun__reason">
        <strong>{targetTask.label}：</strong> {plan.reason}
      </p>
      <button className="button button--primary button--small" type="button" onClick={onApply}>
        执行这个 {mode === 'partial' ? '局部补数' : '全链路重跑'} 计划
      </button>

      <div className="scheduler-output-comparison">
        <div className="scheduler-subheading">
          <div>
            <span className="eyebrow eyebrow--small">输出写入方式</span>
            <h4>幂等 vs 非幂等：第二次运行留下什么？</h4>
          </div>
          <p>同一个 {comparison.outputTable} 分区，其他数据和 SQL 不变。</p>
        </div>
        <div className="scheduler-output-comparison__grid">
          <OutputComparisonCard
            title="分区覆盖 · 幂等"
            comparison={comparison.idempotent}
            rows={outputRows}
          />
          <OutputComparisonCard
            title="对照方案 · append"
            comparison={comparison.nonIdempotent}
            rows={outputRows}
          />
        </div>
      </div>
    </section>
  )
}

function OutputComparisonCard({
  title,
  comparison,
  rows,
}: {
  title: string
  comparison: SchedulerOutputComparison
  rows: number
}) {
  return (
    <article className={`scheduler-output-card is-${comparison.outputState}`}>
      <div>
        <span>{title}</span>
        <strong>{comparison.outputState === 'available' ? '结果保持一份' : '出现重复输出'}</strong>
      </div>
      <dl>
        <div>
          <dt>首次运行</dt>
          <dd>{rows} 行</dd>
        </div>
        <div>
          <dt>重跑写入</dt>
          <dd>{comparison.rerunRows} 行</dd>
        </div>
        <div>
          <dt>最终结果</dt>
          <dd>{comparison.finalRows} 行</dd>
        </div>
        <div>
          <dt>重复行</dt>
          <dd>{comparison.duplicateRows} 行</dd>
        </div>
      </dl>
      <p>{comparison.explanation}</p>
    </article>
  )
}

const READINESS_OPTIONS: readonly {
  value: ReadinessMode
  label: string
  scenario: SchedulerScenario
  detail: string
}[] = [
  {
    value: 'timed-extract',
    label: '定时主动抽数',
    scenario: 'timed-extract',
    detail: '02:00 到点后主动连接上游，抽取 2026-09-30。',
  },
  {
    value: 'upstream-signal',
    label: '上游完成信号',
    scenario: 'upstream-signal',
    detail: '等待当天上游运行从 PROCESSING 变成 SUCCESS。',
  },
  {
    value: 'ftp-detection',
    label: 'FTP 到达检测',
    scenario: 'ftp-detection',
    detail: '文件 02:07 到达，02:30 的下一轮扫描才发现。',
  },
]

const FAILURE_OPTIONS: readonly {
  value: Extract<SchedulerScenario, 'dwd-retry' | 'dwd-blocked'>
  label: string
  detail: string
}[] = [
  {
    value: 'dwd-retry',
    label: '失败后自动 Retry',
    detail: 'DWD Attempt 1 失败，下一次 Attempt 可以恢复。',
  },
  {
    value: 'dwd-blocked',
    label: 'Retry 耗尽，阻断下游',
    detail: 'DWD 失败后，DWS / ADS 只能保持等待上游。',
  },
]

const RERUN_MODE_OPTIONS: readonly {
  value: RerunTeachingMode
  label: string
  detail: string
}[] = [
  {
    value: 'retry',
    label: '重试（Retry）',
    detail: '同一个任务实例增加一次 Attempt。',
  },
  {
    value: 'rerun',
    label: '重跑（Rerun）',
    detail: '对一个已经存在的业务日期重新执行。',
  },
  {
    value: 'backfill',
    label: '补跑（Backfill）',
    detail: '主动批量补跑一段历史业务日期。',
  },
]

const RERUN_DATE_OPTIONS = [
  '2026-09-25',
  '2026-09-26',
  '2026-09-27',
  '2026-09-28',
  '2026-09-29',
  '2026-09-30',
] as const

function getFocusedInitialScenario(focus: SchedulerLessonFocus): SchedulerScenario {
  switch (focus) {
    case 'business-date':
    case 'sla':
      return 'upstream-late'
    case 'readiness':
      return 'timed-extract'
    case 'failure':
      return 'dwd-retry'
    case 'rerun':
      return 'happy-path'
  }
}

function getFocusedRunId(
  businessDate: string,
  trigger: SchedulerRunState['trigger'],
  sequence = 1,
): string {
  const suffix =
    trigger === 'partition-rerun' ? 'rerun' : trigger === 'full-rerun' ? 'full-rerun' : 'daily'
  return `run.deposit.balance.${formatDateForRun(businessDate)}.${suffix}.${String(sequence).padStart(3, '0')}`
}

interface FocusedRunOverrides {
  scenario?: SchedulerScenario
  trigger?: SchedulerRunState['trigger']
  runId?: string
  lateDataAvailableAt?: string
  lateDataDetectedAt?: string
  rerunPlan?: SchedulerRerunPlan
}

function createFocusedRun(
  visualization: SchedulerVisualization,
  businessDate: string,
  overrides: FocusedRunOverrides = {},
): SchedulerRunState {
  const references = getTaskReferences(visualization)
  const trigger = overrides.trigger ?? 'schedule'
  const scenario =
    overrides.scenario ?? getFocusedInitialScenario(visualization.lessonFocus ?? 'readiness')
  const inputTaskCount = visualization.tasks.filter((task) => task.layer === 'ods').length

  return createInitialSchedulerRun(visualization.tasks, {
    businessDate,
    scenario,
    trigger,
    runId: overrides.runId ?? getFocusedRunId(businessDate, trigger),
    scheduledAt: visualization.scheduledAt,
    maxConcurrentTasks: Math.max(1, inputTaskCount),
    lateDataAvailableAt: overrides.lateDataAvailableAt ?? visualization.lateDataArrivalAt,
    lateDataDetectedAt: overrides.lateDataDetectedAt ?? visualization.lateDataDetectionAt,
    lateDataTaskId: references.lateInput,
    failureTaskId: references.failure,
    rerunPlan: overrides.rerunPlan,
  })
}

function getFocusedRunStatusLabel(state: SchedulerRunState): string {
  if (state.status === 'success') {
    return '成功 · 这次运行已完成'
  }

  if (state.status === 'failed') {
    return '失败 · 运行被阻断'
  }

  if (Object.values(state.taskRuns).some((taskRun) => taskRun.status === 'running')) {
    return '运行中 · 时间轴正在推进'
  }

  return '等待 · 仍在等待运行条件'
}

function FocusedRunControls({
  state,
  isPlaying,
  jumpLabel,
  onPlay,
  onStep,
  onJump,
  onReset,
}: {
  state: SchedulerRunState
  isPlaying: boolean
  jumpLabel: string
  onPlay: () => void
  onStep: () => void
  onJump: () => void
  onReset: () => void
}) {
  return (
    <section className="scheduler-focused-controls" aria-label="运行时间轴控制">
      <div>
        <span className="scheduler-toolbar__label">RUN TIMELINE</span>
        <strong>{state.clock}</strong>
        <p aria-live="polite">{getFocusedRunStatusLabel(state)}</p>
      </div>
      <div className="scheduler-toolbar__buttons">
        <button className="button button--primary button--small" type="button" onClick={onPlay}>
          {isPlaying ? '暂停时间轴' : '播放时间轴'}
        </button>
        <button className="button button--quiet button--small" type="button" onClick={onStep}>
          单步推进
        </button>
        <button className="button button--quiet button--small" type="button" onClick={onJump}>
          {jumpLabel}
        </button>
        <button className="button button--quiet button--small" type="button" onClick={onReset}>
          重置 Run
        </button>
      </div>
    </section>
  )
}

function DepositBalanceResultSummary({ visualization }: { visualization: SchedulerVisualization }) {
  return (
    <div className="scheduler-result-summary">
      <div>
        <span>示例结果</span>
        <strong>{BANKING_DEPOSIT_BALANCE_RESULT_LABEL}</strong>
        <small>
          截至 {visualization.targetDate} · {visualization.taskContract.outputTable}
        </small>
      </div>
      <b>
        {visualization.outputPreview.beforeLateAmount.toLocaleString('zh-CN')} →{' '}
        <span className="scheduler-result-summary__amount">
          {visualization.outputPreview.afterLateAmount.toLocaleString('zh-CN')} 元
        </span>
      </b>
    </div>
  )
}

function FocusedRunEvidence({ state }: { state: SchedulerRunState }) {
  return (
    <div className="scheduler-focused-evidence" aria-live="polite">
      <div>
        <span>业务日期</span>
        <strong>{state.businessDate}</strong>
      </div>
      <div>
        <span>目标分区</span>
        <strong>
          {state.partition.column} = {state.partition.value}
        </strong>
      </div>
      <div>
        <span>当前状态</span>
        <strong>{getFocusedRunStatusLabel(state).split(' · ')[0]}</strong>
      </div>
      <div>
        <span>事件</span>
        <strong>{state.events.length}</strong>
      </div>
    </div>
  )
}

function BusinessDateTimeline({
  state,
  visualization,
}: {
  state: SchedulerRunState
  visualization: SchedulerVisualization
}) {
  const references = getTaskReferences(visualization)
  const dwdRun = state.taskRuns[references.dwd]
  const adsRun = state.taskRuns[references.ads]
  const actualArrival = state.lateDataAvailableAt ?? visualization.lateDataArrivalAt
  const timeline = [
    {
      label: '业务日期',
      value: visualization.targetDate,
      detail: '这批日终余额在业务上属于这一天。',
      tone: 'business',
    },
    {
      label: '预计到达',
      value: BANKING_DEPOSIT_BALANCE_EXPECTED_ARRIVAL_AT,
      detail: '上游原计划准备好输入。',
      tone: 'expected',
    },
    {
      label: '触发时间',
      value: state.scheduledAt,
      detail: '日批发出 Trigger；此时任务可能仍在等待。',
      tone: 'trigger',
    },
    {
      label: '实际到达',
      value: actualArrival,
      detail: 'AccountBalanceSnapshot 进入可处理范围。',
      tone: 'arrival',
    },
    {
      label: '实际开始',
      value: dwdRun?.startedAt ?? '推进时间轴后记录',
      detail: 'DWD 真正获得运行资格并开始加工。',
      tone: 'start',
    },
    {
      label: '完成时间',
      value: adsRun?.endedAt ?? '推进时间轴后记录',
      detail: 'ADS 结果完成，才有机会交给业务使用。',
      tone: 'finish',
    },
  ] as const

  return (
    <section className="scheduler-time-semantics" aria-labelledby="scheduler-time-semantics-title">
      <div className="scheduler-panel-heading">
        <div>
          <span className="eyebrow eyebrow--small">BUSINESS DATE · TIME SEMANTICS</span>
          <h3 id="scheduler-time-semantics-title">一条日批时间轴，五类时间语义</h3>
        </div>
        <p>数据归属和系统运行时间要分别记录。</p>
      </div>
      <ol className="scheduler-time-semantics__timeline">
        {timeline.map((item, index) => (
          <li className={`is-${item.tone}`} key={item.label}>
            <span className="scheduler-time-semantics__index">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="scheduler-answer-card">
        <span>最终修改哪个分区？</span>
        <code>
          {state.partition.column} = {state.partition.value}
        </code>
        <p>02:00 触发、02:20 到达，都不会把 9 月 30 日改成 10 月 1 日。</p>
      </div>
      <DepositBalanceResultSummary visualization={visualization} />
    </section>
  )
}

function ReadinessModePanel({
  mode,
  state,
  visualization,
  onModeChange,
}: {
  mode: ReadinessMode
  state: SchedulerRunState
  visualization: SchedulerVisualization
  onModeChange: (mode: ReadinessMode) => void
}) {
  const references = getTaskReferences(visualization)
  const inputRun = state.taskRuns[references.lateInput]
  const dwdRun = state.taskRuns[references.dwd]
  const activeOption = READINESS_OPTIONS.find((option) => option.value === mode)!

  return (
    <section className="scheduler-readiness" aria-labelledby="scheduler-readiness-title">
      <div className="scheduler-panel-heading">
        <div>
          <span className="eyebrow eyebrow--small">RUN CONDITION · 放行条件</span>
          <h3 id="scheduler-readiness-title">时间到了，任务真的可以开始吗？</h3>
        </div>
        <p>{activeOption.detail}</p>
      </div>
      <div className="scheduler-readiness__modes" role="group" aria-label="选择输入放行方式">
        {READINESS_OPTIONS.map((option) => (
          <button
            className={`scheduler-choice${mode === option.value ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={mode === option.value}
            key={option.value}
            onClick={() => onModeChange(option.value)}
          >
            <strong>{option.label}</strong>
            <small>{option.detail}</small>
          </button>
        ))}
      </div>
      <div className="scheduler-condition-grid">
        <article>
          <span>运行窗口</span>
          <strong>{state.scheduledAt}</strong>
          <p>02:00 触发 Run，只是开始检查条件。</p>
        </article>
        <article>
          <span>当前输入</span>
          <strong>{getTeachingTaskState(inputRun)}</strong>
          <p>
            {mode === 'ftp-detection'
              ? `实际到达 ${BANKING_DEPOSIT_BALANCE_FTP_ARRIVAL_AT}，检测 ${BANKING_DEPOSIT_BALANCE_FTP_DETECTED_AT}`
              : mode === 'upstream-signal'
                ? '等待当天上游状态变为 SUCCESS'
                : '由任务主动抽取 2026-09-30'}
          </p>
        </article>
        <article>
          <span>DWD 运行资格</span>
          <strong>{getTeachingTaskState(dwdRun)}</strong>
          <p>五份输入和必要依赖满足后，DWD 才能开始。</p>
        </article>
      </div>
    </section>
  )
}

function FailureModePanel({
  scenario,
  onScenarioChange,
}: {
  scenario: Extract<SchedulerScenario, 'dwd-retry' | 'dwd-blocked'>
  onScenarioChange: (scenario: Extract<SchedulerScenario, 'dwd-retry' | 'dwd-blocked'>) => void
}) {
  return (
    <section className="scheduler-failure-intro" aria-labelledby="scheduler-failure-intro-title">
      <div className="scheduler-panel-heading">
        <div>
          <span className="eyebrow eyebrow--small">FAILURE PROPAGATION · 故障注入</span>
          <h3 id="scheduler-failure-intro-title">让 DWD 失败一次</h3>
        </div>
        <p>观察下游为何等待，以及 Retry 后如何重新获得运行资格。</p>
      </div>
      <div className="scheduler-failure-intro__modes" role="group" aria-label="选择失败场景">
        {FAILURE_OPTIONS.map((option) => (
          <button
            className={`scheduler-choice${scenario === option.value ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={scenario === option.value}
            key={option.value}
            onClick={() => onScenarioChange(option.value)}
          >
            <strong>{option.label}</strong>
            <small>{option.detail}</small>
          </button>
        ))}
      </div>
    </section>
  )
}

function FailurePropagation({
  state,
  visualization,
}: {
  state: SchedulerRunState
  visualization: SchedulerVisualization
}) {
  const references = getTaskReferences(visualization)
  const chain = [
    { id: references.failure, label: 'DWD' },
    { id: references.dws, label: 'DWS' },
    { id: references.ads, label: 'ADS' },
  ]

  return (
    <section className="scheduler-propagation" aria-label="失败状态传播">
      {chain.map((item, index) => {
        const taskRun = state.taskRuns[item.id]
        return (
          <div key={item.id}>
            <span>{item.label}</span>
            <strong>{getTeachingTaskState(taskRun)}</strong>
            <small>
              {getTeachingTaskState(taskRun) === '成功'
                ? '结果可用'
                : getTeachingTaskState(taskRun) === '失败'
                  ? '需要恢复'
                  : '等待上游'}
            </small>
            {index < chain.length - 1 && <b aria-hidden="true">→</b>}
          </div>
        )
      })}
    </section>
  )
}

function RerunTeachingPanel({
  state,
  visualization,
  kind,
  mode,
  targetTaskId,
  plan,
  comparison,
  onKindChange,
  onBusinessDateChange,
  onModeChange,
  onTargetChange,
  onApply,
  onPrepareRetry,
  onContinueRetry,
}: {
  state: SchedulerRunState
  visualization: SchedulerVisualization
  kind: RerunTeachingMode
  mode: SchedulerRerunMode
  targetTaskId: string
  plan: SchedulerRerunPlan
  comparison: ReturnType<typeof compareRerunOutputs>
  onKindChange: (kind: RerunTeachingMode) => void
  onBusinessDateChange: (businessDate: string) => void
  onModeChange: (mode: SchedulerRerunMode) => void
  onTargetChange: (taskId: string) => void
  onApply: () => void
  onPrepareRetry: () => void
  onContinueRetry: () => void
}) {
  const references = getTaskReferences(visualization)
  const failureRun = state.taskRuns[references.failure]
  const dateOptions = kind === 'backfill' ? RERUN_DATE_OPTIONS : [state.businessDate]

  return (
    <section className="scheduler-rerun-lesson" aria-labelledby="scheduler-rerun-lesson-title">
      <div className="scheduler-panel-heading">
        <div>
          <span className="eyebrow eyebrow--small">RUN HISTORY · “再跑一次”</span>
          <h3 id="scheduler-rerun-lesson-title">先辨认动作，再选择日期和 DAG 起点</h3>
        </div>
        <p>当前业务日期：{state.businessDate}</p>
      </div>
      <DepositBalanceResultSummary visualization={visualization} />
      <div className="scheduler-rerun-lesson__kinds" role="group" aria-label="选择重跑动作">
        {RERUN_MODE_OPTIONS.map((option) => (
          <button
            className={`scheduler-choice${kind === option.value ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={kind === option.value}
            key={option.value}
            onClick={() => onKindChange(option.value)}
          >
            <strong>{option.label}</strong>
            <small>{option.detail}</small>
          </button>
        ))}
      </div>
      <div className="scheduler-rerun-lesson__date">
        <label>
          <span>{kind === 'backfill' ? '补跑历史日期' : '业务日期'}</span>
          <select
            value={state.businessDate}
            aria-label={kind === 'backfill' ? '选择补跑历史业务日期' : '选择重新执行的业务日期'}
            onChange={(event) => onBusinessDateChange(event.target.value)}
          >
            {dateOptions.map((date) => (
              <option value={date} key={date}>
                snapshot_date = {date}
              </option>
            ))}
          </select>
        </label>
        {kind === 'backfill' && (
          <p>
            本次 Backfill 范围：2026-09-25 → 2026-09-30，共 6
            个业务日期；每个日期都应用同一套依赖和写入策略。
          </p>
        )}
      </div>
      {kind === 'retry' ? (
        <div className="scheduler-retry-action" aria-live="polite">
          <div>
            <span>当前 Retry 证据</span>
            <strong>{failureRun?.attempts.length ?? 0} 次 Attempt 记录</strong>
            <p>
              {failureRun?.status === 'retry'
                ? 'Attempt 1 已失败；这次 Run 还可以继续执行下一次 Attempt。'
                : '先把 DWD 推进到 Attempt 1 失败的位置。'}
            </p>
          </div>
          {failureRun?.status === 'retry' ? (
            <button
              className="button button--primary button--small"
              type="button"
              onClick={onContinueRetry}
            >
              执行 Retry
            </button>
          ) : (
            <button
              className="button button--quiet button--small"
              type="button"
              onClick={onPrepareRetry}
            >
              定位到 Attempt 1 失败
            </button>
          )}
        </div>
      ) : (
        <RerunPlanner
          state={state}
          visualization={visualization}
          mode={mode}
          targetTaskId={targetTaskId}
          plan={plan}
          comparison={comparison}
          onModeChange={onModeChange}
          onTargetChange={onTargetChange}
          onApply={onApply}
          taskReferences={references}
        />
      )}
    </section>
  )
}

function SlaTimeline({
  state,
  visualization,
  arrivalDelay,
  onArrivalDelayChange,
  onRunToFinish,
}: {
  state: SchedulerRunState
  visualization: SchedulerVisualization
  arrivalDelay: number
  onArrivalDelayChange: (delay: number) => void
  onRunToFinish: () => void
}) {
  const references = getTaskReferences(visualization)
  const adsRun = state.taskRuns[references.ads]
  const arrivalAt = addSchedulerMinutes(state.scheduledAt, arrivalDelay)
  const deadline = visualization.deliverySlaAt ?? addSchedulerMinutes(state.scheduledAt, 330)
  const finalReadyAt = adsRun?.endedAt
  const deliveryState = finalReadyAt
    ? finalReadyAt <= deadline
      ? 'on-time'
      : 'breached'
    : 'not-started'
  const deliveryLabel =
    deliveryState === 'on-time' ? 'SLA MET' : deliveryState === 'breached' ? 'SLA MISS' : '等待 ADS'

  return (
    <section className="scheduler-sla-timeline" aria-labelledby="scheduler-sla-timeline-title">
      <div className="scheduler-panel-heading">
        <div>
          <span className="eyebrow eyebrow--small">DELIVERY SLA · 业务可用时间</span>
          <h3 id="scheduler-sla-timeline-title">上游到达变晚，ADS 何时可用？</h3>
        </div>
        <p>拖动到达时间，再把同一条 DAG 推进到终点。</p>
      </div>
      <label className="scheduler-arrival-slider">
        <span>AccountBalanceSnapshot 实际到达：{arrivalAt}</span>
        <input
          type="range"
          min="0"
          max="420"
          step="1"
          value={arrivalDelay}
          aria-label="调整上游余额快照到达时间"
          onChange={(event) => onArrivalDelayChange(Number(event.target.value))}
        />
        <small>02:00 触发 · 可拖到 09:00，观察是否突破 07:30。</small>
      </label>
      <ol className="scheduler-sla-timeline__events">
        <li>
          <span>业务日期</span>
          <strong>{visualization.targetDate}</strong>
          <small>结果仍属于 9 月 30 日</small>
        </li>
        <li>
          <span>触发</span>
          <strong>{state.scheduledAt}</strong>
          <small>Trigger 不等于 Start</small>
        </li>
        <li>
          <span>输入到达</span>
          <strong>{arrivalAt}</strong>
          <small>迟到会把必要链路整体向后推</small>
        </li>
        <li>
          <span>ADS ready</span>
          <strong>{finalReadyAt ?? '推进后记录'}</strong>
          <small>所有任务 success 也要检查这个时间</small>
        </li>
        <li className={`is-${deliveryState}`}>
          <span>业务 SLA</span>
          <strong>{deadline}</strong>
          <small>{deliveryLabel}</small>
        </li>
      </ol>
      <DepositBalanceResultSummary visualization={visualization} />
      <button
        className="button button--primary button--small"
        type="button"
        onClick={onRunToFinish}
      >
        推进到 ADS 可用
      </button>
    </section>
  )
}

function FocusedSchedulerLab({ visualization }: SchedulerRunSimulatorProps) {
  const focus = visualization.lessonFocus!
  const references = getTaskReferences(visualization)
  const initialScenario = getFocusedInitialScenario(focus)
  const [state, setState] = useState<SchedulerRunState>(() =>
    createFocusedRun(visualization, visualization.targetDate, { scenario: initialScenario }),
  )
  const [isPlaying, setIsPlaying] = useState(false)
  const [readinessMode, setReadinessMode] = useState<ReadinessMode>('timed-extract')
  const [failureScenario, setFailureScenario] =
    useState<Extract<SchedulerScenario, 'dwd-retry' | 'dwd-blocked'>>('dwd-retry')
  const [rerunKind, setRerunKind] = useState<RerunTeachingMode>('rerun')
  const [rerunMode, setRerunMode] = useState<SchedulerRerunMode>('partial')
  const [rerunTargetTaskId, setRerunTargetTaskId] = useState<string>(references.ads)
  const [arrivalDelay, setArrivalDelay] = useState(20)

  const rerunPlan = useMemo(
    () =>
      createPartitionRerunPlan(
        visualization.tasks,
        state.businessDate,
        rerunMode,
        rerunTargetTaskId,
      ),
    [rerunMode, rerunTargetTaskId, state.businessDate, visualization.tasks],
  )
  const rerunComparison = useMemo(
    () => compareRerunOutputs(visualization.taskContract),
    [visualization.taskContract],
  )

  useEffect(() => {
    if (!isPlaying || state.status === 'success' || state.status === 'failed') {
      return
    }

    const timerId = window.setTimeout(() => {
      setState((current) => advanceSchedulerRun(current))
    }, 650)

    return () => window.clearTimeout(timerId)
  }, [isPlaying, state])

  function createRun(businessDate: string, overrides: FocusedRunOverrides = {}) {
    return createFocusedRun(visualization, businessDate, overrides)
  }

  function resetRun() {
    setIsPlaying(false)
    setState(createRun(state.businessDate, { scenario: initialScenario }))
  }

  function selectReadinessMode(mode: ReadinessMode) {
    const option = READINESS_OPTIONS.find((candidate) => candidate.value === mode)!
    setReadinessMode(mode)
    setIsPlaying(false)
    setState(
      createRun(state.businessDate, {
        scenario: option.scenario,
        lateDataAvailableAt:
          mode === 'ftp-detection'
            ? BANKING_DEPOSIT_BALANCE_FTP_ARRIVAL_AT
            : BANKING_DEPOSIT_BALANCE_ARRIVAL_AT,
        lateDataDetectedAt:
          mode === 'ftp-detection'
            ? BANKING_DEPOSIT_BALANCE_FTP_DETECTED_AT
            : BANKING_DEPOSIT_BALANCE_ARRIVAL_AT,
      }),
    )
  }

  function selectFailureScenario(
    scenario: Extract<SchedulerScenario, 'dwd-retry' | 'dwd-blocked'>,
  ) {
    setFailureScenario(scenario)
    setIsPlaying(false)
    setState(createRun(state.businessDate, { scenario }))
  }

  function selectRerunKind(kind: RerunTeachingMode) {
    setRerunKind(kind)
    setIsPlaying(false)
    if (kind === 'retry') {
      const retryRun = createRun(state.businessDate, { scenario: 'dwd-retry' })
      setState(getRunAtStoryMoment(retryRun, 'failure'))
      return
    }

    setState(createRun(state.businessDate, { scenario: 'happy-path' }))
  }

  function changeRerunBusinessDate(businessDate: string) {
    setIsPlaying(false)
    const next = createRun(businessDate, {
      scenario: rerunKind === 'retry' ? 'dwd-retry' : 'happy-path',
    })
    setState(rerunKind === 'retry' ? getRunAtStoryMoment(next, 'failure') : next)
  }

  function advanceOneStep() {
    setIsPlaying(false)
    setState((current) => advanceSchedulerRun(current))
  }

  function playTimeline() {
    if (state.status === 'success' || state.status === 'failed') {
      setIsPlaying(false)
      setState(createRun(state.businessDate, { scenario: state.scenario }))
      return
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setState((current) => getRunAtStoryMoment(current, 'terminal'))
      setIsPlaying(false)
      return
    }

    setIsPlaying((playing) => !playing)
  }

  function jumpToStoryMoment() {
    setIsPlaying(false)
    const moment: StoryMoment =
      focus === 'failure' || (focus === 'rerun' && rerunKind === 'retry') ? 'failure' : 'terminal'
    setState((current) => getRunAtStoryMoment(current, moment))
  }

  function applyRerunPlan() {
    setIsPlaying(false)
    const trigger = rerunMode === 'partial' ? 'partition-rerun' : 'full-rerun'
    const runId = getFocusedRunId(state.businessDate, trigger, 2)
    setState(
      createRun(state.businessDate, {
        scenario: 'happy-path',
        trigger,
        rerunPlan,
        runId,
      }),
    )
  }

  function prepareRetry() {
    setIsPlaying(false)
    const retryRun = createRun(state.businessDate, { scenario: 'dwd-retry' })
    setState(getRunAtStoryMoment(retryRun, 'failure'))
  }

  function continueRetry() {
    setIsPlaying(false)
    setState((current) => advanceSchedulerRun(current))
  }

  function recoverTask(taskId: string) {
    setIsPlaying(false)
    setState((current) => transitionSchedulerRun(current, { type: 'recover-task', taskId }))
  }

  function changeArrivalDelay(delay: number) {
    setArrivalDelay(delay)
    setIsPlaying(false)
    const arrivalAt = addSchedulerMinutes(visualization.scheduledAt ?? state.scheduledAt, delay)
    setState(
      createRun(state.businessDate, {
        scenario: 'upstream-late',
        lateDataAvailableAt: arrivalAt,
        lateDataDetectedAt: arrivalAt,
      }),
    )
  }

  function runToFinish() {
    setIsPlaying(false)
    setState((current) => getRunAtStoryMoment(current, 'terminal'))
  }

  const selectedFailureTask =
    getTask(visualization.tasks, references.failure) ?? visualization.tasks[0]!
  const isActive = isPlaying && state.status !== 'success' && state.status !== 'failed'
  const controls = (
    <FocusedRunControls
      state={state}
      isPlaying={isActive}
      jumpLabel={
        focus === 'failure' || (focus === 'rerun' && rerunKind === 'retry')
          ? '跳到失败'
          : '推进到完成'
      }
      onPlay={playTimeline}
      onStep={advanceOneStep}
      onJump={jumpToStoryMoment}
      onReset={resetRun}
    />
  )

  switch (focus) {
    case 'business-date':
      return (
        <div className="scheduler-run-simulator scheduler-run-simulator--focused is-business-date">
          <BusinessDateTimeline state={state} visualization={visualization} />
          {controls}
          <FocusedRunEvidence state={state} />
        </div>
      )
    case 'readiness':
      return (
        <div className="scheduler-run-simulator scheduler-run-simulator--focused is-readiness">
          <ReadinessModePanel
            mode={readinessMode}
            state={state}
            visualization={visualization}
            onModeChange={selectReadinessMode}
          />
          {controls}
          <FocusedRunEvidence state={state} />
          <DagCanvas
            tasks={visualization.tasks}
            taskRuns={state.taskRuns}
            selectedTaskId={references.dwd}
            onSelectTask={() => undefined}
          />
          <EventLog state={state} />
        </div>
      )
    case 'failure':
      return (
        <div className="scheduler-run-simulator scheduler-run-simulator--focused is-failure">
          <FailureModePanel scenario={failureScenario} onScenarioChange={selectFailureScenario} />
          {controls}
          <FocusedRunEvidence state={state} />
          <FailurePropagation state={state} visualization={visualization} />
          <DagCanvas
            tasks={visualization.tasks}
            taskRuns={state.taskRuns}
            selectedTaskId={selectedFailureTask.taskId}
            onSelectTask={() => undefined}
          />
          <div className="scheduler-inspector-grid">
            <TaskDetail state={state} task={selectedFailureTask} onRecover={recoverTask} teaching />
            <EventLog state={state} />
          </div>
        </div>
      )
    case 'rerun':
      return (
        <div className="scheduler-run-simulator scheduler-run-simulator--focused is-rerun">
          <RerunTeachingPanel
            state={state}
            visualization={visualization}
            kind={rerunKind}
            mode={rerunMode}
            targetTaskId={rerunTargetTaskId}
            plan={rerunPlan}
            comparison={rerunComparison}
            onKindChange={selectRerunKind}
            onBusinessDateChange={changeRerunBusinessDate}
            onModeChange={setRerunMode}
            onTargetChange={setRerunTargetTaskId}
            onApply={applyRerunPlan}
            onPrepareRetry={prepareRetry}
            onContinueRetry={continueRetry}
          />
          {controls}
          <FocusedRunEvidence state={state} />
        </div>
      )
    case 'sla':
      return (
        <div className="scheduler-run-simulator scheduler-run-simulator--focused is-sla">
          <SlaTimeline
            state={state}
            visualization={visualization}
            arrivalDelay={arrivalDelay}
            onArrivalDelayChange={changeArrivalDelay}
            onRunToFinish={runToFinish}
          />
          {controls}
          <FocusedRunEvidence state={state} />
        </div>
      )
  }
}

function getRunAtStoryMoment(state: SchedulerRunState, moment: StoryMoment): SchedulerRunState {
  let next = state
  const maxSteps = state.tasks.length * 12 + 20

  for (let index = 0; index < maxSteps; index += 1) {
    if (moment === 'terminal' && (next.status === 'success' || next.status === 'failed')) {
      break
    }

    if (moment !== 'terminal' && next.events.some((event) => event.type === moment)) {
      break
    }

    const previous = next
    next = advanceSchedulerRun(next)
    if (next === previous) {
      break
    }
  }

  return next
}

export function SchedulerRunSimulator({ visualization }: SchedulerRunSimulatorProps) {
  return <FocusedSchedulerLab visualization={visualization} />
}

export type { SchedulerRunSimulatorProps }
