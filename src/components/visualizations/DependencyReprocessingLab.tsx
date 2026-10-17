import { useMemo, useReducer } from 'react'
import {
  createIncidentTimelineKernel,
  type IncidentTimelineHighlight,
  type IncidentTimelineState,
} from '../../features/dependency-reprocessing/steps'
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

/**
 * 依赖链重做实验室入口。
 *
 * Phase 2-A 只实现 E1 事故时间线；其余 focus 由后续课程逐步接入，
 * 未接入时给出明确占位说明，不伪造交互。
 */
export function DependencyReprocessingLab({
  visualization,
}: {
  visualization: DependencyReprocessingVisualization
}) {
  if (visualization.lessonFocus === 'incident-timeline') {
    return <IncidentTimelineLab />
  }

  return (
    <p className="dependency-reprocessing__pending" role="status">
      该实验模式将在后续课程中开放。
    </p>
  )
}
