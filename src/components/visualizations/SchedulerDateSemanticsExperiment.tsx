import { useState } from 'react'
import {
  DATE_SEMANTICS_SCENARIOS,
  DATE_SEMANTICS_TIME_ZONE,
  DEFAULT_DATE_SEMANTICS_SCENARIO,
  getDateSemanticsSnapshot,
  type DateSemanticsScenarioId,
} from '../../features/scheduler/date-semantics'

const DATE_FACT_LABELS = [
  { key: 'wallClock', label: 'Wall Clock · 实际运行时刻' },
  { key: 'currentDate', label: 'current_date · 环境自然日期' },
  { key: 'scheduleDate', label: 'schedule_date · 调度实例日期' },
  { key: 'businessDate', label: 'biz_date · 数据业务日期' },
] as const

export function SchedulerDateSemanticsExperiment() {
  const [scenarioId, setScenarioId] = useState<DateSemanticsScenarioId>(
    DEFAULT_DATE_SEMANTICS_SCENARIO,
  )
  const [useCurrentDateForPartition, setUseCurrentDateForPartition] = useState(false)
  const snapshot = getDateSemanticsSnapshot(scenarioId, useCurrentDateForPartition)
  const { scenario } = snapshot
  const factValues = {
    wallClock: `${scenario.wallClock} · ${DATE_SEMANTICS_TIME_ZONE}`,
    currentDate: snapshot.currentDate,
    scheduleDate: scenario.scheduleDate,
    businessDate: scenario.businessDate,
  }

  function selectScenario(nextScenarioId: DateSemanticsScenarioId) {
    setScenarioId(nextScenarioId)
    setUseCurrentDateForPartition(false)
  }

  function resetExperiment() {
    selectScenario(DEFAULT_DATE_SEMANTICS_SCENARIO)
  }

  return (
    <section
      className="scheduler-date-semantics"
      aria-labelledby="scheduler-date-semantics-title"
      data-date-semantics-lab
      data-date-scenario={scenario.id}
    >
      <div className="scheduler-panel-heading">
        <div>
          <span className="eyebrow eyebrow--small">DATE SEMANTICS · 日期语义实验</span>
          <h3 id="scheduler-date-semantics-title">运行时刻变了，数据日期一定变吗？</h3>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={resetExperiment}
        >
          重置日期实验
        </button>
      </div>

      <div className="scheduler-date-semantics__scenarios" role="group" aria-label="选择日期场景">
        {DATE_SEMANTICS_SCENARIOS.map((option) => (
          <button
            className={`scheduler-date-semantics__scenario${scenarioId === option.id ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={scenarioId === option.id}
            key={option.id}
            onClick={() => selectScenario(option.id)}
          >
            <strong>{option.label}</strong>
            <small>{option.operation}</small>
          </button>
        ))}
      </div>

      <p className="scheduler-date-semantics__explanation" aria-live="polite">
        {scenario.explanation}
      </p>

      <dl className="scheduler-date-semantics__facts" aria-label="当前场景的日期字段">
        {DATE_FACT_LABELS.map(({ key, label }) => (
          <div key={key}>
            <dt data-date-field={key}>{label}</dt>
            <dd>{factValues[key]}</dd>
          </div>
        ))}
      </dl>

      <p className="scheduler-date-semantics__schedule-note">
        <strong>本例 schedule_date 约定：</strong>
        {scenario.scheduleDateMeaning}调度实例日期如何记录，取决于调度器和任务契约。
      </p>

      <label className="scheduler-date-semantics__wrong-map">
        <input
          type="checkbox"
          checked={useCurrentDateForPartition}
          onChange={(event) => setUseCurrentDateForPartition(event.currentTarget.checked)}
        />
        <span>
          <strong>错误对照：</strong>故意用 current_date 作为目标分区，而不是按 biz_date 映射。
        </span>
      </label>

      <div
        className={`scheduler-date-semantics__partition${snapshot.partitionMatchesBusinessDate ? ' is-correct' : ' is-wrong'}`}
        data-date-partition-value={snapshot.partition.value}
        data-partition-aligned={snapshot.partitionMatchesBusinessDate}
        role={snapshot.partitionMatchesBusinessDate ? 'status' : 'alert'}
        aria-live="polite"
      >
        <div>
          <span>目标分区</span>
          <code>
            {snapshot.partition.column} = {snapshot.partition.value}
          </code>
        </div>
        <strong>
          {snapshot.partitionMatchesBusinessDate
            ? '日期与本例 biz_date 对齐'
            : '分区日期与数据归属不一致'}
        </strong>
        <p>
          {snapshot.partitionMatchesBusinessDate
            ? snapshot.usesCurrentDateForPartition
              ? '本场景 current_date 恰好等于 biz_date；这是日期碰巧相同，不构成可复用的映射规则。'
              : '本例任务契约把 biz_date 映射到 snapshot_date；跨日运行仍写入同一业务日期分区。'
            : `这批 ${snapshot.scenario.businessDate} 的日终余额会被标到 ${snapshot.partition.value} 分区；正确的 ${snapshot.scenario.businessDate} 分区可能缺失或仍是旧值，下游按日期读取时会得到错误结果。`}
        </p>
      </div>

      <p className="scheduler-date-semantics__timezone-note">
        <strong>时区边界：</strong>本实验假定调度器墙上时间与数据库 session 都使用{' '}
        {DATE_SEMANTICS_TIME_ZONE}。SQL 的 <code>current_date</code>{' '}
        通常取决于数据库引擎及执行/session 的当前日期语义；不同引擎、session
        时区或事务语义可能有差异，不能直接当作
        biz_date。接近午夜时，先核对事件时间、时区配置和数据库实际语义。
      </p>
    </section>
  )
}
