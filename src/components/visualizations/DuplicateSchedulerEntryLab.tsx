import { useState } from 'react'
import type { SchedulerVisualization } from '../../features/scheduler/types'
import {
  DEFAULT_DUPLICATE_SCHEDULER_CONFIGURATION,
  simulateDuplicateSchedulerEntries,
  type DuplicateSchedulerEntryConfiguration,
  type DuplicateSchedulerEntryResult,
  type TargetWriteSemantics,
} from '../../features/duplicate-scheduler-entry/model'

interface DuplicateSchedulerEntryLabProps {
  visualization: SchedulerVisualization
}

const METRICS: readonly {
  key: 'triggerCount' | 'executionCount' | 'writeCount' | 'outputRows' | 'fileCount' | 'pushCount'
  label: string
}[] = [
  { key: 'triggerCount', label: 'Trigger Count' },
  { key: 'executionCount', label: 'Execution Count' },
  { key: 'writeCount', label: 'Write Count' },
  { key: 'outputRows', label: 'Output Rows' },
  { key: 'fileCount', label: 'File Count' },
  { key: 'pushCount', label: 'Push Count' },
]

function getImpactMessage(result: DuplicateSchedulerEntryResult): string {
  if (result.executionCount < 2) {
    return result.executionCount === 0
      ? '没有启用的生产入口，本次没有触发或写入。'
      : '只有一个有效入口；本次业务日期只触发并执行一次。'
  }

  if (result.targetSemantics === 'idempotent') {
    return `目标表仍只有 ${result.outputRows} 行正确结果，但同一逻辑被计算 ${result.executionCount} 次，生成 ${result.fileCount} 个文件并推送 ${result.pushCount} 次。`
  }

  return `两个入口各自成功，但 append 留下 ${result.duplicateRows} 行重复数据；文件生成与接口推送也各发生 ${result.executionCount} 次。`
}

export function DuplicateSchedulerEntryLab({ visualization }: DuplicateSchedulerEntryLabProps) {
  const [configuration, setConfiguration] = useState<DuplicateSchedulerEntryConfiguration>({
    ...DEFAULT_DUPLICATE_SCHEDULER_CONFIGURATION,
  })
  const [result, setResult] = useState<DuplicateSchedulerEntryResult | null>(null)
  const enabledEntryCount =
    Number(configuration.oldJobEnabled) + Number(configuration.newJobEnabled)

  function updateConfiguration(patch: Partial<DuplicateSchedulerEntryConfiguration>) {
    setConfiguration((current) => ({ ...current, ...patch }))
    setResult(null)
  }

  function runBusinessDate() {
    setResult(
      simulateDuplicateSchedulerEntries({
        ...configuration,
        businessDate: visualization.targetDate,
        productionLogicId: visualization.taskContract.taskId,
        outputTable: visualization.taskContract.outputTable,
      }),
    )
  }

  function selectTargetSemantics(targetSemantics: TargetWriteSemantics) {
    updateConfiguration({ targetSemantics })
  }

  function resetExperiment() {
    setConfiguration({ ...DEFAULT_DUPLICATE_SCHEDULER_CONFIGURATION })
    setResult(null)
  }

  return (
    <section
      className="duplicate-scheduler-entry"
      aria-labelledby="duplicate-scheduler-entry-title"
      data-duplicate-entry-lab
    >
      <div className="duplicate-scheduler-entry__heading">
        <div>
          <span className="eyebrow eyebrow--small">CUTOVER SIMULATION · 双入口事故链</span>
          <h3 id="duplicate-scheduler-entry-title">两个有效 JOB，指向同一生产逻辑</h3>
        </div>
        <p>
          业务日期：<code>{visualization.targetDate}</code>
        </p>
      </div>

      <div className="duplicate-scheduler-entry__route" aria-label="两个调度入口的共同目标">
        <div className="duplicate-scheduler-entry__sources">
          <article className={configuration.oldJobEnabled ? 'is-enabled' : 'is-disabled'}>
            <span>旧调度定义</span>
            <strong>旧 JOB</strong>
            <small>{configuration.oldJobEnabled ? 'ENABLED · 会触发' : 'DISABLED · 不触发'}</small>
          </article>
          <article className={configuration.newJobEnabled ? 'is-enabled' : 'is-disabled'}>
            <span>新调度定义</span>
            <strong>新 JOB</strong>
            <small>{configuration.newJobEnabled ? 'ENABLED · 会触发' : 'DISABLED · 不触发'}</small>
          </article>
        </div>
        <div className="duplicate-scheduler-entry__converge" aria-hidden="true">
          <span>两个入口</span>
          <strong>↓</strong>
        </div>
        <div className="duplicate-scheduler-entry__target">
          <span>同一生产逻辑</span>
          <code>{visualization.taskContract.taskId}</code>
          <span>同一目标</span>
          <code>
            {visualization.taskContract.outputTable} · {visualization.taskContract.partition.column}{' '}
            = {visualization.targetDate}
          </code>
        </div>
      </div>

      <div className="duplicate-scheduler-entry__controls">
        <fieldset>
          <legend>迁移切换：分别控制两个生产入口</legend>
          <div className="duplicate-scheduler-entry__job-toggles">
            <button
              className={`button button--quiet button--small${configuration.oldJobEnabled ? ' is-enabled' : ''}`}
              type="button"
              aria-pressed={configuration.oldJobEnabled}
              aria-label={`旧 JOB：${configuration.oldJobEnabled ? 'ON' : 'OFF'}`}
              data-entry-toggle="old-job"
              onClick={() => updateConfiguration({ oldJobEnabled: !configuration.oldJobEnabled })}
            >
              <span>旧 JOB</span>
              <strong>{configuration.oldJobEnabled ? 'ON' : 'OFF'}</strong>
            </button>
            <button
              className={`button button--quiet button--small${configuration.newJobEnabled ? ' is-enabled' : ''}`}
              type="button"
              aria-pressed={configuration.newJobEnabled}
              aria-label={`新 JOB：${configuration.newJobEnabled ? 'ON' : 'OFF'}`}
              data-entry-toggle="new-job"
              onClick={() => updateConfiguration({ newJobEnabled: !configuration.newJobEnabled })}
            >
              <span>新 JOB</span>
              <strong>{configuration.newJobEnabled ? 'ON' : 'OFF'}</strong>
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>下游目标写入语义</legend>
          <div
            className="duplicate-scheduler-entry__target-options"
            role="group"
            aria-label="选择目标写入语义"
          >
            <button
              className={`button button--quiet button--small${configuration.targetSemantics === 'idempotent' ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={configuration.targetSemantics === 'idempotent'}
              data-target-semantics="idempotent"
              onClick={() => selectTargetSemantics('idempotent')}
            >
              幂等目标 · 覆盖分区
            </button>
            <button
              className={`button button--quiet button--small${configuration.targetSemantics === 'non-idempotent' ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={configuration.targetSemantics === 'non-idempotent'}
              data-target-semantics="non-idempotent"
              onClick={() => selectTargetSemantics('non-idempotent')}
            >
              非幂等目标 · append
            </button>
          </div>
        </fieldset>
      </div>

      <div className="duplicate-scheduler-entry__actions">
        <button
          className="button button--primary button--small"
          type="button"
          disabled={enabledEntryCount === 0 || result !== null}
          data-run-business-date
          onClick={runBusinessDate}
        >
          {result ? '本次业务日期已运行' : `运行业务日期 ${visualization.targetDate}`}
        </button>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={resetExperiment}
        >
          重置实验
        </button>
        <span>
          当前启用入口：<strong>{enabledEntryCount}</strong> / 2
        </span>
      </div>

      <div className="duplicate-scheduler-entry__evidence" aria-live="polite" aria-atomic="true">
        <div className="duplicate-scheduler-entry__metrics" data-duplicate-entry-metrics>
          {METRICS.map(({ key, label }) => (
            <div key={key} data-metric={key}>
              <span>{label}</span>
              <strong>{result?.[key] ?? 0}</strong>
            </div>
          ))}
        </div>
        <p className="duplicate-scheduler-entry__status" data-duplicate-entry-status>
          {result
            ? getImpactMessage(result)
            : enabledEntryCount === 2
              ? '两个生产入口都已启用；运行一次后，观察幂等目标是否只能保护表结果。'
              : enabledEntryCount === 1
                ? '当前只有一个入口启用；运行后作为单入口基线。'
                : '没有启用的生产入口；开启一个入口后再运行。'}
        </p>
        {result && result.records.length > 0 ? (
          <ol className="duplicate-scheduler-entry__run-history" aria-label="本次运行历史">
            {result.records.map((record) => (
              <li key={record.entryId}>
                <div>
                  <span>{record.entryLabel}</span>
                  <strong>{record.entryId === 'old-job' ? '旧入口触发' : '新入口触发'}</strong>
                </div>
                <code>{record.runId}</code>
                <small>
                  {record.productionLogicId} → {record.outputTable} ·{' '}
                  {record.writeMode === 'overwrite-partition' ? '覆盖同一分区' : 'append'}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p className="duplicate-scheduler-entry__empty-history">
            运行后，这里会显示各入口产生的独立 run record。
          </p>
        )}
      </div>

      <p className="duplicate-scheduler-entry__scope-note">
        确定性模型：假设每个启用入口都在同一业务日期触发且成功；不模拟队列、并发、自动去重或重试。真实平台是否去重、能否有意双跑，取决于配置与发布约定。
      </p>
    </section>
  )
}
