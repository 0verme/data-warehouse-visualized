import { useEffect, useMemo, useState } from 'react'
import type {
  SchedulerDependencyState,
  SchedulerEvent,
  SchedulerEventType,
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
  SCHEDULER_TASK_IDS,
  addSchedulerMinutes,
  advanceSchedulerRun,
  compareRerunOutputs,
  createInitialSchedulerRun,
  createPartitionRerunPlan,
  getOutputStateLabel,
  getTaskStatusCounts,
  transitionSchedulerRun,
} from '../../utils/scheduler'
import '../../styles/lessons/scheduler.css'

interface SchedulerRunSimulatorProps {
  visualization: SchedulerVisualization
}

type Layer = SchedulerTaskDefinition['layer']
type StoryMoment = SchedulerEventType | 'terminal'

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
  'upstream-late': '上游迟到',
  rerun: '重跑触发',
  recovery: '人工 recovery',
}

const SCENARIO_OPTIONS: readonly {
  value: SchedulerScenario
  label: string
  detail: string
  moment: StoryMoment
}[] = [
  {
    value: 'happy-path',
    label: '正常日批',
    detail: '所有 ODS 输入在 06:00 前就绪，DAG 顺序完成。',
    moment: 'terminal',
  },
  {
    value: 'upstream-late',
    label: '上游迟到',
    detail: '账户余额快照 06:20 才到，DWD 在此之前只能等待。',
    moment: 'upstream-late',
  },
  {
    value: 'dwd-retry',
    label: 'DWD 失败后恢复',
    detail: 'DWD 第一次失败，retry 后由 attempt 2 成功。',
    moment: 'failure',
  },
  {
    value: 'dwd-blocked',
    label: '失败阻断下游',
    detail: 'DWD 重试耗尽，DWS / ADS 传播为 skipped。',
    moment: 'failure',
  },
]

const STATUS_ORDER: readonly SchedulerTaskRunRecord['status'][] = [
  'queued',
  'running',
  'success',
  'retry',
  'failed',
  'skipped',
]

function getTask(tasks: readonly SchedulerTaskDefinition[], taskId: string) {
  return tasks.find((task) => task.taskId === taskId)
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

function getPreviousBusinessDate(date: string): string {
  return addSchedulerMinutes(`${date} 00:00`, -24 * 60).slice(0, 10)
}

function getStoryMomentLabel(scenario: SchedulerScenario): string {
  const option = SCENARIO_OPTIONS.find((candidate) => candidate.value === scenario)
  if (!option) {
    return '跳到关键时刻'
  }

  return option.moment === 'terminal' ? '跑到完成' : '跳到故障时刻'
}

function getRunStatusLabel(status: SchedulerRunState['status']): string {
  return {
    queued: 'queued · 等待调度',
    running: 'running · 时间轴推进中',
    success: 'success · DAG Run 完成',
    failed: 'failed · DAG Run 被阻断',
  }[status]
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
      <div className="scheduler-dag__track" aria-label="存款余额日批任务依赖图">
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
          五个 ODS 输入必须全部 success，才会放行 DWD；DWD success 后才放行 DWS，最后由{' '}
          <code>{SCHEDULER_TASK_IDS.ads}</code> 发布 ADS。
        </p>
      </div>
    </section>
  )
}

function StatusSummary({ state }: { state: SchedulerRunState }) {
  const counts = getTaskStatusCounts(state)

  return (
    <div className="scheduler-status-summary" aria-label="任务状态统计">
      {STATUS_ORDER.map((status) => (
        <div className={`scheduler-status-summary__item is-${status}`} key={status}>
          <span>{STATUS_SHORT_LABELS[status]}</span>
          <strong>{counts[status]}</strong>
        </div>
      ))}
    </div>
  )
}

function SimulationToolbar({
  state,
  onScenarioChange,
  onBusinessDateChange,
  isPlaying,
  onPlay,
  onStep,
  onJump,
  onReset,
}: {
  state: SchedulerRunState
  onScenarioChange: (scenario: SchedulerScenario) => void
  onBusinessDateChange: (businessDate: string) => void
  isPlaying: boolean
  onPlay: () => void
  onStep: () => void
  onJump: () => void
  onReset: () => void
}) {
  const scenario = SCENARIO_OPTIONS.find((option) => option.value === state.scenario)!
  const businessDateOptions = [
    state.businessDate,
    getPreviousBusinessDate(state.businessDate),
  ].filter((date, index, dates) => dates.indexOf(date) === index)

  return (
    <section className="scheduler-toolbar" aria-labelledby="scheduler-toolbar-title">
      <div className="scheduler-toolbar__heading">
        <span className="scheduler-toolbar__label">SCHEDULER LAB · 运行时间线</span>
        <h3 id="scheduler-toolbar-title">时间轴：{state.clock}</h3>
        <p aria-live="polite">
          {getRunStatusLabel(state.status)} · {scenario.detail} · 当前分区 {state.partition.column}{' '}
          = {state.businessDate}
        </p>
      </div>
      <div className="scheduler-toolbar__controls">
        <label>
          <span>故障场景</span>
          <select
            value={state.scenario}
            aria-label="选择调度运行场景"
            onChange={(event) => onScenarioChange(event.target.value as SchedulerScenario)}
          >
            {SCENARIO_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>business date</span>
          <select
            value={state.businessDate}
            aria-label="选择业务日期分区"
            onChange={(event) => onBusinessDateChange(event.target.value)}
          >
            {businessDateOptions.map((date) => (
              <option value={date} key={date}>
                snapshot_date = {date}
              </option>
            ))}
          </select>
        </label>
        <div className="scheduler-toolbar__buttons">
          <button className="button button--primary button--small" type="button" onClick={onPlay}>
            {isPlaying
              ? '暂停时间轴'
              : state.status === 'success' || state.status === 'failed'
                ? '重新播放'
                : '播放时间轴'}
          </button>
          <button className="button button--quiet button--small" type="button" onClick={onStep}>
            单步推进
          </button>
          <button className="button button--quiet button--small" type="button" onClick={onJump}>
            {getStoryMomentLabel(state.scenario)}
          </button>
          <button className="button button--quiet button--small" type="button" onClick={onReset}>
            重置 Run
          </button>
        </div>
      </div>
    </section>
  )
}

function TaskDetail({
  state,
  task,
  onRecover,
}: {
  state: SchedulerRunState
  task: SchedulerTaskDefinition
  onRecover: (taskId: string) => void
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
          {STATUS_LABELS[taskRun.status]}
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
      <AttemptTable attempts={taskRun.attempts} />
    </section>
  )
}

function AttemptTable({
  attempts,
}: {
  attempts: readonly SchedulerTaskRunRecord['attempts'][number][]
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
            <caption>任务 attempt 记录</caption>
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
                  <td className={`is-${attempt.status}`}>{STATUS_SHORT_LABELS[attempt.status]}</td>
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
}) {
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
            {[SCHEDULER_TASK_IDS.dws, SCHEDULER_TASK_IDS.ads].map((taskId) => {
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

function OutputPreview({ visualization }: { visualization: SchedulerVisualization }) {
  return (
    <section className="scheduler-output-preview" aria-labelledby="scheduler-output-preview-title">
      <div className="scheduler-panel-heading">
        <div>
          <span className="eyebrow eyebrow--small">业务分区与迟到数据</span>
          <h3 id="scheduler-output-preview-title">同一个业务分区，迟到快照会改变结果</h3>
        </div>
        <p>存款余额加工完成后，迟到到达的快照必须按业务日期补数，重新计算该分区。</p>
      </div>
      <div className="scheduler-output-preview__metric">
        <div>
          <span>迟到前 · {visualization.lateBusinessDate}</span>
          <strong>{visualization.outputPreview.beforeLateAmount} 元</strong>
          <small>{visualization.outputPreview.beforeLateRows} 行 ADS 输出</small>
        </div>
        <b aria-hidden="true">→</b>
        <div>
          <span>迟到后 · 仍是同一分区</span>
          <strong>{visualization.outputPreview.afterLateAmount} 元</strong>
          <small>
            {visualization.outputPreview.afterLateRows} 行 · 到达 {visualization.lateDataArrivalAt}
          </small>
        </div>
      </div>
      <p className="scheduler-output-preview__note">
        任务 <code>{visualization.taskContract.taskId}</code>：
        {visualization.taskContract.rerunHint}
      </p>
    </section>
  )
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
  const [state, setState] = useState<SchedulerRunState>(() =>
    createInitialSchedulerRun(visualization.tasks, {
      businessDate: visualization.targetDate,
      scenario: 'happy-path',
    }),
  )
  const [isPlaying, setIsPlaying] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string>(SCHEDULER_TASK_IDS.ads)
  const [rerunMode, setRerunMode] = useState<SchedulerRerunMode>('partial')
  const [rerunTargetTaskId, setRerunTargetTaskId] = useState<string>(SCHEDULER_TASK_IDS.ads)

  const selectedTask = getTask(visualization.tasks, selectedTaskId) ?? visualization.tasks[0]!
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
    if (!isPlaying) {
      return
    }

    if (state.status === 'success' || state.status === 'failed') {
      return
    }

    const timerId = window.setTimeout(() => {
      setState((current) => advanceSchedulerRun(current))
    }, 650)

    return () => window.clearTimeout(timerId)
  }, [isPlaying, state])

  function createRun(
    scenario: SchedulerScenario,
    businessDate: string,
    trigger: SchedulerRunState['trigger'] = 'schedule',
    rerunPlan?: SchedulerRerunPlan,
    runId?: string,
  ) {
    return createInitialSchedulerRun(visualization.tasks, {
      businessDate,
      scenario,
      trigger,
      rerunPlan,
      runId,
    })
  }

  function resetRun() {
    setIsPlaying(false)
    setState(createRun(state.scenario, state.businessDate))
  }

  function changeScenario(scenario: SchedulerScenario) {
    setIsPlaying(false)
    setState(createRun(scenario, state.businessDate))
  }

  function changeBusinessDate(businessDate: string) {
    setIsPlaying(false)
    setState(createRun(state.scenario, businessDate))
  }

  function advanceOneStep() {
    setIsPlaying(false)
    setState((current) => advanceSchedulerRun(current))
  }

  function playTimeline() {
    if (state.status === 'success' || state.status === 'failed') {
      setIsPlaying(false)
      setState(createRun(state.scenario, state.businessDate))
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
    const moment =
      SCENARIO_OPTIONS.find((option) => option.value === state.scenario)?.moment ?? 'terminal'
    setState((current) => getRunAtStoryMoment(current, moment))
  }

  function applyRerunPlan() {
    setIsPlaying(false)
    const trigger = rerunMode === 'partial' ? 'partition-rerun' : 'full-rerun'
    const runId = `run.deposit-balance.daily.${formatDateForRun(state.businessDate)}.${rerunMode}.002`
    setState(createRun('happy-path', state.businessDate, trigger, rerunPlan, runId))
  }

  function recoverTask(taskId: string) {
    setIsPlaying(false)
    setState((current) => transitionSchedulerRun(current, { type: 'recover-task', taskId }))
  }

  return (
    <div className="scheduler-run-simulator">
      <SimulationToolbar
        state={state}
        onScenarioChange={changeScenario}
        onBusinessDateChange={changeBusinessDate}
        isPlaying={isPlaying && state.status !== 'success' && state.status !== 'failed'}
        onPlay={playTimeline}
        onStep={advanceOneStep}
        onJump={jumpToStoryMoment}
        onReset={resetRun}
      />

      <div className="scheduler-run-strip" aria-live="polite">
        <div>
          <span>RUN</span>
          <strong>{state.runId}</strong>
        </div>
        <div>
          <span>partition</span>
          <strong>
            {state.partition.column} = {state.partition.value}
          </strong>
        </div>
        <div>
          <span>trigger</span>
          <strong>{state.trigger}</strong>
        </div>
        <div>
          <span>并发上限</span>
          <strong>{state.maxConcurrentTasks} tasks</strong>
        </div>
        <div>
          <span>事件</span>
          <strong>{state.events.length}</strong>
        </div>
      </div>

      <StatusSummary state={state} />
      <DagCanvas
        tasks={visualization.tasks}
        taskRuns={state.taskRuns}
        selectedTaskId={selectedTask.taskId}
        onSelectTask={setSelectedTaskId}
      />

      <div className="scheduler-inspector-grid">
        <TaskDetail state={state} task={selectedTask} onRecover={recoverTask} />
        <EventLog state={state} />
      </div>

      <RerunPlanner
        state={state}
        visualization={visualization}
        mode={rerunMode}
        targetTaskId={rerunTargetTaskId}
        plan={rerunPlan}
        comparison={rerunComparison}
        onModeChange={setRerunMode}
        onTargetChange={setRerunTargetTaskId}
        onApply={applyRerunPlan}
      />
      <OutputPreview visualization={visualization} />
      <p className="visualization-note">
        <span aria-hidden="true">↳</span>
        每个场景都沿同一条任务依赖和时间线推进；切换场景，比较迟到、失败、重试与补数如何改变最终输出。
      </p>
    </div>
  )
}

export type { SchedulerRunSimulatorProps }
