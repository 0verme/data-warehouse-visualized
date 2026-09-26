import { useMemo, useReducer } from 'react'
import { ObjectLifecycleLab } from './ObjectLifecycleLab'
import {
  accountBalanceSnapshotFixture,
  getDayEvidence,
  getDayPathSteps,
  getInputEvidence,
  getLifecycleTestMatrix,
} from '../../features/lifecycle-path/model'
import { createLifecyclePathKernel } from '../../features/lifecycle-path/steps'
import type {
  LifecycleDayRun,
  LifecyclePathHighlight,
  LifecyclePathStepKind,
  LifecyclePathStepState,
  LifecycleSnapshotState,
} from '../../features/lifecycle-path/types'
import {
  applyVisualizationPlayerAction,
  createVisualizationPlayer,
  getCurrentVisualizationStep,
  getVisualizationPlayerProgress,
  isVisualizationPlayerAtEnd,
  isVisualizationPlayerAtStart,
} from '../../utils/visualization-steps'

const STEP_KIND_LABELS: Record<LifecyclePathStepKind, string> = {
  symptom: '现象',
  evidence: '证据',
  divergence: '路径分叉',
  diagnose: '定位',
  fix: '处理',
  rerun: '验证',
  prevent: '防复发',
}

const PATH_STEP_STATE_LABELS: Record<LifecyclePathStepState, string> = {
  done: '已完成',
  failed: '失败',
  pending: '未执行',
}

function DayColumn({
  day,
  highlight,
}: {
  day: LifecycleDayRun
  highlight: LifecyclePathHighlight
}) {
  const { reveal } = highlight
  const evidence = getDayEvidence(day, reveal)
  const pathSteps = reveal.writeUnit ? getDayPathSteps(day, accountBalanceSnapshotFixture) : []
  const focus =
    highlight.focus === 'day1' || highlight.focus === 'day2'
      ? highlight.focus === `day${day.day}`
        ? 'primary'
        : 'context'
      : undefined

  return (
    <article
      className="lifecycle-path__day"
      data-day={day.day}
      data-status={day.jobStatus === 'SUCCESS' ? 'success' : 'danger'}
      data-focus={focus}
      aria-label={`Day ${day.day} 运行状态`}
    >
      <header className="lifecycle-path__day-header">
        <div className="lifecycle-path__day-heading">
          <span className="lifecycle-path__day-name">Day {day.day}</span>
          <strong className="lifecycle-path__day-date">
            {reveal.run ? day.businessDate : '—'}
          </strong>
        </div>
        <span
          className="lifecycle-path__status"
          data-tone={day.jobStatus === 'SUCCESS' ? 'success' : 'danger'}
        >
          {day.jobStatus}
          {day.maintainValidated && !day.rerunExecuted ? <small>最近一次运行</small> : null}
        </span>
      </header>

      {reveal.target && (
        <div className="lifecycle-path__target">
          <span>运行前目标对象</span>
          <strong>{day.targetBefore === 'missing' ? '不存在' : '已存在'}</strong>
          <span className="lifecycle-path__path-badge">{day.path}</span>
        </div>
      )}

      {pathSteps.length > 0 && (
        <ol className="lifecycle-path__path" aria-label={`Day ${day.day} 执行路径`}>
          {pathSteps.map((pathStep) => (
            <li className="lifecycle-path__path-step" data-state={pathStep.state} key={pathStep.id}>
              <span className="lifecycle-path__path-step-state">
                {PATH_STEP_STATE_LABELS[pathStep.state]}
              </span>
              <span className="lifecycle-path__path-step-label">{pathStep.label}</span>
              {pathStep.detail ? <small>{pathStep.detail}</small> : null}
            </li>
          ))}
        </ol>
      )}

      <dl className="lifecycle-path__evidence" aria-label={`Day ${day.day} Evidence Panel`}>
        {evidence.map((row) => (
          <div className="lifecycle-path__evidence-row" key={row.field}>
            <dt>{row.field}</dt>
            <dd data-state={row.state}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

function InputEvidenceStrip({ day2 }: { day2: LifecycleDayRun }) {
  const items = getInputEvidence(accountBalanceSnapshotFixture, day2)

  return (
    <section className="lifecycle-path__inputs" aria-label="第一批证据">
      {items.map((item) => (
        <div className="lifecycle-path__input" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <small>{item.detail}</small>
        </div>
      ))}
    </section>
  )
}

function WriteUnitPanel({ state }: { state: LifecycleSnapshotState }) {
  const { day2, dataset } = state
  const beforeFix = !day2.maintainValidated
  const note = beforeFix
    ? day2.failure
    : day2.rerunExecuted
      ? `${day2.businessDate} 写入单元已就绪，Rerun 已写入 ${day2.rowsWritten} 行。`
      : '修正后的规则由 business_date 推导并确保写入单元存在；prepare 已单独验证通过，目标对象没有被重新创建。'

  return (
    <section
      className="lifecycle-path__panel"
      data-tone={beforeFix ? 'risk' : 'ok'}
      aria-label="maintain.prepare 写入单元"
    >
      <header className="lifecycle-path__panel-header">
        <span>maintain.prepare · 当前业务日期的写入单元</span>
        <strong>{beforeFix ? '规则缺口' : '规则已就绪'}</strong>
      </header>
      <dl className="lifecycle-path__write-unit">
        <div>
          <dt>目标对象已有写入单元</dt>
          <dd>{dataset.writeUnits.join('、')}</dd>
        </div>
        <div>
          <dt>本次 business_date 需要</dt>
          <dd>{day2.businessDate}</dd>
        </div>
      </dl>
      <p>{note}</p>
    </section>
  )
}

function FixPanel({ day2 }: { day2: LifecycleDayRun }) {
  return (
    <section className="lifecycle-path__panel" data-tone="accent" aria-label="处理：修正准备规则">
      <header className="lifecycle-path__panel-header">
        <span>处理步骤</span>
        <strong>先验证同一路径，再重跑</strong>
      </header>
      <ol className="lifecycle-path__fix-list">
        <li>
          <strong>修正准备规则</strong>
          <span>由 business_date 推导并确保当前业务日期的写入单元存在。</span>
        </li>
        <li>
          <strong>单独验证 maintain</strong>
          <span>在「目标对象已经存在」条件下执行 prepare：通过，且目标对象没有被重新创建。</span>
        </li>
        <li>
          <strong>下一步才是 Rerun</strong>
          <span>对 {day2.businessDate} 做同 business_date 的 Rerun，再检查数据结果。</span>
        </li>
      </ol>
    </section>
  )
}

function VerificationPanel({ state }: { state: LifecycleSnapshotState }) {
  const passedCount = state.verification.filter((check) => check.passed).length
  const allPassed = passedCount === state.verification.length && state.verification.length > 0

  return (
    <section
      className="lifecycle-path__panel"
      data-tone={allPassed ? 'ok' : 'risk'}
      aria-label="5 项数据验证"
    >
      <header className="lifecycle-path__panel-header">
        <span>Job SUCCESS 之后的数据验证</span>
        <strong>
          {passedCount} / {state.verification.length} 通过
        </strong>
      </header>
      <ul className="lifecycle-path__checks">
        {state.verification.map((check) => (
          <li data-passed={check.passed} key={check.id}>
            <span className="lifecycle-path__check-mark" aria-hidden="true">
              {check.passed ? '✓' : '!'}
            </span>
            <div>
              <strong>{check.label}</strong>
              <small>{check.detail}</small>
            </div>
          </li>
        ))}
      </ul>
      {state.idempotency && (
        <p className="lifecycle-path__idempotency">
          同 business_date 再执行一次：{state.idempotency.rowsBefore} 行 →{' '}
          {state.idempotency.rowsAfter} 行，新增 {state.idempotency.added} 行。
        </p>
      )}
    </section>
  )
}

function MatrixPanel() {
  const matrix = getLifecycleTestMatrix()

  return (
    <section className="lifecycle-path__panel" data-tone="accent" aria-label="三状态最小测试矩阵">
      <header className="lifecycle-path__panel-header">
        <span>防复发：生命周期任务最小矩阵</span>
        <strong>3 种运行状态</strong>
      </header>
      <div className="lifecycle-path__matrix-scroll">
        <table className="lifecycle-path__matrix">
          <caption>最小矩阵只覆盖生命周期状态差异，不承诺穷尽全部生产状态。</caption>
          <thead>
            <tr>
              <th scope="col">运行状态</th>
              <th scope="col">覆盖的执行路径</th>
              <th scope="col">本案例对应</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.state}>
                <td>
                  <code>{row.state}</code>
                </td>
                <td>{row.covers}</td>
                <td>{row.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function LifecyclePathLab() {
  const kernel = useMemo(() => createLifecyclePathKernel(), [])
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
    throw new Error(`Golden Sample 步骤 ${step.id} 缺少 highlight 契约`)
  }

  const highlight = step.highlight
  const state = step.state

  return (
    <section
      className="lifecycle-path"
      data-diagram-type="state"
      aria-label="生命周期执行路径分步实验"
      data-step-id={step.id}
      data-step-kind={highlight.kind}
    >
      <div className="visualization-toolbar lifecycle-path__toolbar">
        <div className="lifecycle-path__toolbar-main">
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
        className="lifecycle-path__progress"
        role="progressbar"
        aria-label="分步进度"
        aria-valuemin={1}
        aria-valuemax={progress.total}
        aria-valuenow={progress.current}
        aria-valuetext={`第 ${progress.current} 步，共 ${progress.total} 步`}
      >
        <span style={{ width: `${progress.ratio * 100}%` }} />
      </div>

      {highlight.kind === 'evidence' && <InputEvidenceStrip day2={state.day2} />}

      <div className="lifecycle-path__days">
        <DayColumn day={state.day1} highlight={highlight} />
        <span className="lifecycle-path__stack-arrow" aria-hidden="true">
          ↓
        </span>
        <DayColumn day={state.day2} highlight={highlight} />
      </div>

      {highlight.reveal.writeUnit && <WriteUnitPanel state={state} />}
      {highlight.kind === 'fix' && <FixPanel day2={state.day2} />}
      {highlight.reveal.verification && <VerificationPanel state={state} />}
      {highlight.reveal.matrix && <MatrixPanel />}
      <ObjectLifecycleLab />
    </section>
  )
}
