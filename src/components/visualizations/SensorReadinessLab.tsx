import { useState } from 'react'
import {
  advanceSensorReadinessRun,
  createSensorReadinessRun,
  getNextSensorActionAt,
  getSensorFileState,
  resolveSensorTimeout,
  SENSOR_POLL_INTERVAL_OPTIONS,
  SENSOR_READY_SIGNAL_APPEARS_AT,
  SENSOR_TIMEOUT_OPTIONS,
  type SensorFileState,
  type SensorReadinessConfig,
  type SensorReadinessRun,
  type SensorRunStatus,
} from '../../features/scheduler/sensor-readiness'

const SENSOR_STATUS_LABELS: Record<SensorRunStatus, string> = {
  waiting: '等待首次检测',
  polling: '继续等待 · 定时检查',
  success: 'SUCCESS · 条件满足',
  timeout: 'TIMEOUT · 等待上限已到',
  'manual-action': '转人工处理',
  failed: 'FAILED · 明确失败',
}

const FILE_STATE_LABELS: Record<SensorFileState, string> = {
  absent: '文件尚未出现',
  incomplete: '文件已出现 · 仍在写入',
  complete: '文件完整 · 完成信号已出现',
}

function getReadyStateLabel(run: SensorReadinessRun, fileState: SensorFileState): string {
  if (run.status === 'success' && fileState !== 'complete') {
    return '误判 ready · 文件仍不完整'
  }
  if (run.status === 'success') {
    return '已确认 · ready protocol 满足'
  }
  if (run.config.requireReadySignal) {
    return '未满足 · 等待 data.csv.done'
  }
  if (fileState === 'absent') {
    return '未满足 · 尚无 data.csv'
  }
  return '存在检查将放行 · 缺少完整性证明'
}

function getCheckResultLabel(fileState: SensorFileState, conditionSatisfied: boolean): string {
  if (conditionSatisfied && fileState !== 'complete') {
    return '按文件存在条件放行；文件实际仍在写入'
  }
  if (conditionSatisfied) {
    return '完成信号已出现，条件满足'
  }
  if (fileState === 'incomplete') {
    return '文件存在但 incomplete，继续等待'
  }
  return '未发现可消费的数据，继续等待'
}

function getStatusTone(status: SensorRunStatus): string {
  if (status === 'success') return 'success'
  if (status === 'timeout' || status === 'failed') return 'danger'
  if (status === 'manual-action') return 'warning'
  return 'waiting'
}

export function SensorReadinessLab() {
  const [run, setRun] = useState(() => createSensorReadinessRun())
  const fileState = getSensorFileState(run.currentAt)
  const nextActionAt = getNextSensorActionAt(run)
  const prematureRelease = run.status === 'success' && fileState !== 'complete'

  function updateConfig(config: Partial<SensorReadinessConfig>) {
    setRun((current) => createSensorReadinessRun({ ...current.config, ...config }))
  }

  function step() {
    setRun((current) => advanceSensorReadinessRun(current))
  }

  function reset() {
    setRun((current) => createSensorReadinessRun(current.config))
  }

  return (
    <section className="sensor-readiness-lab" aria-labelledby="sensor-readiness-lab-title">
      <div className="sensor-readiness-lab__heading">
        <div>
          <span className="eyebrow eyebrow--small">EXTERNAL CONDITION · 局部确定性模型</span>
          <h3 id="sensor-readiness-lab-title">Sensor 怎样证明外部数据 ready？</h3>
        </div>
        <p>
          此处 Sensor 状态与现有 Scheduler Run
          时间轴独立；手动推进便于观察，不代表生产环境必须采用固定轮询周期。
        </p>
      </div>

      <div className="sensor-readiness-lab__settings">
        <label>
          <span>Polling interval</span>
          <select
            aria-label="Polling interval"
            value={run.config.pollingIntervalMinutes}
            onChange={(event) =>
              updateConfig({ pollingIntervalMinutes: Number(event.target.value) })
            }
          >
            {SENSOR_POLL_INTERVAL_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                每 {minutes} 分钟检查
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Timeout</span>
          <select
            aria-label="Timeout"
            value={run.config.timeoutMinutes}
            onChange={(event) => updateConfig({ timeoutMinutes: Number(event.target.value) })}
          >
            {SENSOR_TIMEOUT_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                等待 {minutes} 分钟
              </option>
            ))}
          </select>
        </label>
        <label className="sensor-readiness-lab__protocol">
          <input
            type="checkbox"
            checked={run.config.requireReadySignal}
            onChange={(event) => updateConfig({ requireReadySignal: event.target.checked })}
          />
          <span>
            <strong>要求完成信号</strong>
            <small>data.csv + data.csv.done 才算 ready</small>
          </span>
        </label>
      </div>

      <dl className="sensor-readiness-lab__observations" aria-live="polite">
        <div>
          <dt>当前时间</dt>
          <dd>{run.currentAt}</dd>
        </div>
        <div className={`is-${getStatusTone(run.status)}`}>
          <dt>Sensor State</dt>
          <dd>{SENSOR_STATUS_LABELS[run.status]}</dd>
        </div>
        <div className={`is-${fileState}`}>
          <dt>File State</dt>
          <dd>{FILE_STATE_LABELS[fileState]}</dd>
        </div>
        <div className={prematureRelease ? 'is-danger' : ''}>
          <dt>Ready State</dt>
          <dd>{getReadyStateLabel(run, fileState)}</dd>
        </div>
        <div
          className={run.downstreamEligible ? (prematureRelease ? 'is-danger' : 'is-success') : ''}
        >
          <dt>Downstream State</dt>
          <dd>
            {run.downstreamEligible
              ? prematureRelease
                ? '已获运行资格 · 但文件仍未完整'
                : '已获运行资格'
              : run.status === 'failed'
                ? 'FAILED · 下游阻断'
                : '等待 · 尚未放行'}
          </dd>
        </div>
      </dl>

      <ol className="sensor-readiness-lab__delivery" aria-label="外部文件交付过程">
        <li className={run.currentAt >= '2026-10-01 02:07' ? 'is-reached' : ''}>
          <time dateTime="2026-10-01T02:07">02:07</time>
          <span>
            <code>data.csv</code> 文件名出现，上传仍可能继续。
          </span>
        </li>
        <li className={run.currentAt >= SENSOR_READY_SIGNAL_APPEARS_AT ? 'is-reached' : ''}>
          <time dateTime="2026-10-01T02:10">02:10</time>
          <span>
            <code>data.csv.done</code> 出现，表示本批次按约定完成。
          </span>
        </li>
      </ol>

      {run.polls.length > 0 && (
        <div className="sensor-readiness-lab__checks">
          <h4>检测记录</h4>
          <ol>
            {run.polls.map((poll) => (
              <li key={poll.checkedAt}>
                <time dateTime={poll.checkedAt.replace(' ', 'T')}>{poll.checkedAt}</time>
                <span>{getCheckResultLabel(poll.fileState, poll.conditionSatisfied)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {prematureRelease && (
        <p className="sensor-readiness-lab__alert" role="alert">
          反例：只检查“文件存在”会在 02:07 后提前放行；Sensor 的 SUCCESS 不能弥补错误的 ready 条件。
        </p>
      )}
      {run.status === 'timeout' && (
        <div className="sensor-readiness-lab__timeout" role="status">
          <p>
            已到 timeout，但 timeout 本身不必然等于自动失败。根据约定转人工核对，或明确记录
            FAILED；下游目前仍未放行。
          </p>
          <div>
            <button
              className="button button--quiet button--small"
              type="button"
              onClick={() => setRun((current) => resolveSensorTimeout(current, 'manual-action'))}
            >
              转人工处理
            </button>
            <button
              className="button button--quiet button--small"
              type="button"
              onClick={() => setRun((current) => resolveSensorTimeout(current, 'failed'))}
            >
              明确标记 FAILED
            </button>
          </div>
        </div>
      )}
      {run.status === 'manual-action' && (
        <p className="sensor-readiness-lab__notice" role="status">
          已转人工处理，下游仍在等待；需要核实交付状态后，再按运行约定决定重新检查或失败。
        </p>
      )}
      {run.status === 'failed' && (
        <p className="sensor-readiness-lab__alert" role="status">
          已明确记录 FAILED，下游保持阻断；这不是所有 Sensor timeout 都必须采用的自动策略。
        </p>
      )}

      <div className="sensor-readiness-lab__actions">
        <p>
          {nextActionAt
            ? `下一步：${nextActionAt === run.currentAt ? '现在检查' : `推进到 ${nextActionAt}`}`
            : '当前流程已结束；可重置后再次观察。'}
        </p>
        <div>
          <button
            className="button button--primary button--small"
            type="button"
            onClick={step}
            disabled={!nextActionAt}
          >
            {run.status === 'waiting' ? '等待并执行首次检查' : '等待到下一步'}
          </button>
          <button className="button button--quiet button--small" type="button" onClick={reset}>
            重置 Sensor
          </button>
        </div>
      </div>

      <p className="sensor-readiness-lab__tradeoff">
        短间隔可能更快发现，但会增加检查次数与外部系统压力；长间隔减少检查，却可能延迟发现。timeout
        和完成协议也需要按交付约定选择，没有通用固定值。
      </p>
    </section>
  )
}
