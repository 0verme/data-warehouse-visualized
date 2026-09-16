import { useMemo, useState } from 'react'
import type {
  PerformanceSkewMode,
  PerformanceSkewStrategy,
  PerformanceShuffleSkewVisualization,
} from '../../features/performance/types'
import {
  getLongestWorker,
  getSkewStrategyResult,
  formatPerformanceGb,
} from '../../utils/performance'
import {
  LayerMarker,
  PerformanceBar,
  PerformanceChoiceButton,
  PerformanceMetric,
  PerformanceMetricGrid,
  PerformancePanelHeading,
  SimulationNote,
} from './PerformanceLabShared'

export function PerformanceSkewLab({
  visualization,
}: {
  visualization: PerformanceShuffleSkewVisualization
}) {
  const [mode, setMode] = useState<PerformanceSkewMode>('shuffle-key')
  const [strategy, setStrategy] = useState<PerformanceSkewStrategy>('none')
  const data = visualization.skew
  const scenario = data.scenarios.find((candidate) => candidate.id === mode) ?? data.scenarios[0]!
  const result = useMemo(() => getSkewStrategyResult(scenario, strategy), [scenario, strategy])
  const maximumLoad = Math.max(...result.workerLoads.map((worker) => worker.loadGb), 0)
  const averageLoad =
    result.workerLoads.length > 0 ? result.totalLoadGb / result.workerLoads.length : 0
  const longestWorker = result.longestWorker ?? getLongestWorker(scenario.workerLoads)

  return (
    <div className="performance-lab performance-lab--skew">
      <LayerMarker layer={scenario.layer} />
      <SimulationNote text={visualization.simulationNote} />

      <section
        className="performance-skew__scenario"
        aria-labelledby="performance-skew-scenario-title"
      >
        <PerformancePanelHeading
          eyebrow="11-3 · 倾斜发生在哪里"
          title="平均 Task 正常，为什么最后一个还没结束？"
          description="先切换倾斜类型，再看它属于存储 / Scan / Partition，还是 Join / Group By / Shuffle。"
          id="performance-skew-scenario-title"
        />
        <div className="performance-choice-grid performance-choice-grid--two">
          {data.scenarios.map((candidate) => (
            <PerformanceChoiceButton
              key={candidate.id}
              selected={mode === candidate.id}
              label={candidate.label}
              detail={`${candidate.keyLabel} · ${candidate.keyValue}`}
              onClick={() => setMode(candidate.id)}
            />
          ))}
        </div>
        <div className="performance-skew__description">
          <div>
            <span>当前问题</span>
            <strong>{scenario.title}</strong>
            <p>{scenario.detail}</p>
          </div>
          <div>
            <span>数据分布</span>
            <dl>
              {scenario.partitionRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                  <small>{row.detail}</small>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {mode === 'shuffle-key' ? (
        <section className="performance-skew__workers" aria-labelledby="performance-worker-title">
          <PerformancePanelHeading
            eyebrow="Worker / Task distribution"
            title="GROUP BY open_branch_id 把工作量送到了哪里？"
            description="Worker 4 收到线上开户中心的热点 Key；整体完成时间取决于最长 Task，而不是平均 Task。"
            id="performance-worker-title"
          />
          <div
            className="performance-choice-grid performance-choice-grid--strategies"
            role="group"
            aria-label="选择倾斜处理策略"
          >
            {data.strategies.map((candidate) => (
              <PerformanceChoiceButton
                key={candidate.id}
                selected={strategy === candidate.id}
                label={candidate.label}
                detail={candidate.detail}
                onClick={() => setStrategy(candidate.id)}
              />
            ))}
          </div>
          <div className="performance-worker-chart" aria-live="polite">
            {result.workerLoads.map((worker) => (
              <div className="performance-worker-row" key={worker.workerId}>
                <span>{worker.workerId}</span>
                <PerformanceBar
                  value={worker.loadGb}
                  maximum={maximumLoad}
                  tone={worker.loadGb === longestWorker?.loadGb ? 'amber' : 'blue'}
                />
                <strong>{formatPerformanceGb(worker.loadGb)}</strong>
                <small>{worker.detail}</small>
              </div>
            ))}
          </div>
          <PerformanceMetricGrid>
            <PerformanceMetric
              label="平均 Worker 负载"
              value={formatPerformanceGb(Math.round(averageLoad))}
              detail="只作为对照"
            />
            <PerformanceMetric
              label="最长 Task"
              value={longestWorker ? formatPerformanceGb(longestWorker.loadGb) : '—'}
              detail={longestWorker?.workerId ?? '没有 Worker 数据'}
            />
            <PerformanceMetric
              label="当前处理策略"
              value={data.strategies.find((item) => item.id === strategy)?.label ?? strategy}
              detail="通用方向，不绑定厂商语法"
            />
          </PerformanceMetricGrid>
          <p className="performance-skew__conclusion">
            {strategy === 'none'
              ? 'Worker 4 的 680 GB 长尾把阶段拖住。先确认热点 Key，再选择提前过滤、提前聚合、热点拆分、两阶段聚合或调整数据分布。'
              : '策略改变了工作分布，但仍要用实际 Shuffle Bytes、最长 Task 和结果对账验证收益，不能只看一根变短的柱子。'}
          </p>
        </section>
      ) : (
        <section
          className="performance-skew__partition"
          aria-labelledby="performance-skew-partition-title"
        >
          <PerformancePanelHeading
            eyebrow="Storage / Scan / Partition"
            title="这里的倾斜不是 Shuffle Key 倾斜"
            description="双 11 的大分区影响读取和分区处理；它不会因为看起来不均匀，就自动变成 open_branch_id 的热点 Key。"
            id="performance-skew-partition-title"
          />
          <div className="performance-partition-contrast">
            {scenario.partitionRows.slice(0, 2).map((row) => (
              <div key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
                <p>{row.detail}</p>
              </div>
            ))}
          </div>
          <p className="performance-skew__conclusion">
            先处理文件布局、大分区读取、并行度或任务拆分；不要用 Shuffle Key
            的处理方式代替分区问题判断。
          </p>
        </section>
      )}

      <section className="performance-skew__boundary" aria-label="两种数据倾斜的边界">
        <div>
          <span>日期分区倾斜</span>
          <strong>存储 / Scan / Partition</strong>
          <p>例：txn_date = 双 11，单日达到 1.8 TB。</p>
        </div>
        <div>
          <span>Shuffle Key 倾斜</span>
          <strong>Join / Group By / Shuffle</strong>
          <p>例：open_branch_id = 线上开户中心，记录集中到一个 Key。</p>
        </div>
      </section>
    </div>
  )
}
