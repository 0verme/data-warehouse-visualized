import { useMemo, useState } from 'react'
import type {
  LakehouseArchitecture,
  LakehouseDataVolumeCategory,
  LakehouseWorkload,
} from '../../types'
import { DEFAULT_PERFORMANCE_CONFIG, comparePerformanceStates } from '../../utils/performance'
import type { PerformanceConfig, PerformanceVisualization } from '../../features/performance/types'
import { getArchitectureState } from '../../utils/lakehouse'

interface PerformanceLabProps {
  visualization: PerformanceVisualization
}

const architectureOptions: readonly { value: LakehouseArchitecture; label: string }[] = [
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'lake', label: 'Data Lake' },
  { value: 'lakehouse', label: 'Lakehouse' },
]

const workloadOptions: readonly { value: LakehouseWorkload; label: string }[] = [
  { value: 'bi', label: '稳定 BI 日报' },
  { value: 'exploration', label: '探索分析' },
  { value: 'ml', label: 'ML 特征' },
  { value: 'streaming', label: '流式写入' },
]

function formatRows(rows: number): string {
  if (rows >= 1_000_000) return `${(rows / 1_000_000).toFixed(2)}M`
  return rows.toLocaleString('zh-CN')
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`
  return `${(bytes / 1_000_000).toFixed(2)} MB`
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="performance-lab__metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  onChange: (value: number) => void
}) {
  return (
    <label className="performance-lab__range">
      <span>
        <strong>{label}</strong>
        <b>{step < 1 ? `${Math.round(value * 100)}${suffix}` : `${value}${suffix}`}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function StrategyControls({
  config,
  setValue,
}: {
  config: PerformanceConfig
  setValue: <K extends keyof PerformanceConfig>(key: K, value: PerformanceConfig[K]) => void
}) {
  return (
    <div className="performance-lab__strategies">
      <fieldset>
        <legend>扫描与处理策略</legend>
        <label>
          <input
            type="checkbox"
            checked={config.partitionPruning}
            onChange={(event) => setValue('partitionPruning', event.target.checked)}
          />
          开启 Partition Pruning
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.layoutAdjustment}
            onChange={(event) => setValue('layoutAdjustment', event.target.checked)}
          />
          调整布局 / 合并文件
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.processingMode === 'incremental'}
            onChange={(event) =>
              setValue('processingMode', event.target.checked ? 'incremental' : 'full')
            }
          />
          增量处理
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.reuseMode === 'materialized'}
            onChange={(event) =>
              setValue('reuseMode', event.target.checked ? 'materialized' : 'none')
            }
          />
          预计算 / 物化复用
        </label>
      </fieldset>
      <fieldset>
        <legend>Join 与 Aggregate</legend>
        <label>
          Join
          <select
            value={config.joinStrategy}
            onChange={(event) =>
              setValue('joinStrategy', event.target.value as PerformanceConfig['joinStrategy'])
            }
          >
            <option value="shuffle">Shuffle Join</option>
            <option value="broadcast">Broadcast Join</option>
          </select>
        </label>
        <label>
          Aggregate
          <select
            value={config.aggregationStrategy}
            onChange={(event) =>
              setValue(
                'aggregationStrategy',
                event.target.value as PerformanceConfig['aggregationStrategy'],
              )
            }
          >
            <option value="single-stage">单阶段聚合</option>
            <option value="two-phase">两阶段聚合</option>
          </select>
        </label>
      </fieldset>
    </div>
  )
}

export function PerformanceLab({ visualization }: PerformanceLabProps) {
  const [architecture, setArchitecture] = useState(visualization.architecture.architecture)
  const [workload, setWorkload] = useState(visualization.architecture.workload)
  const [dataVolumeCategory, setDataVolumeCategory] = useState<LakehouseDataVolumeCategory>(
    visualization.architecture.dataVolumeCategory,
  )
  const [config, setConfig] = useState<PerformanceConfig>({
    ...DEFAULT_PERFORMANCE_CONFIG,
    ...visualization.defaults,
  })

  const architectureState = useMemo(
    () => getArchitectureState(architecture, workload, dataVolumeCategory),
    [architecture, dataVolumeCategory, workload],
  )
  const comparison = useMemo(() => {
    const before = {
      ...config,
      partitionPruning: false,
      layoutAdjustment: false,
      joinStrategy: 'shuffle' as const,
      aggregationStrategy: 'single-stage' as const,
      processingMode: 'full' as const,
      reuseMode: 'none' as const,
    }
    return comparePerformanceStates(before, config, architectureState)
  }, [architectureState, config])
  const setValue = <K extends keyof PerformanceConfig>(key: K, value: PerformanceConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }))
  }
  const { before, after, changes } = comparison

  return (
    <div className="performance-lab">
      <div className="performance-lab__notice" role="note">
        <strong>先说清楚口径：</strong>下方所有数字都是 deterministic simulation / relative
        estimate， 用于观察方向，不是任何真实引擎 benchmark。
      </div>

      <section
        className="performance-lab__architecture"
        aria-labelledby="performance-architecture-title"
      >
        <div className="performance-lab__section-heading">
          <div>
            <span className="eyebrow eyebrow--small">连接第 10 章 · Architecture state</span>
            <h3 id="performance-architecture-title">同一个销售任务，先确认运行边界</h3>
          </div>
          <label>
            Workload
            <select
              value={workload}
              onChange={(event) => setWorkload(event.target.value as LakehouseWorkload)}
            >
              {workloadOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          className="performance-lab__architecture-tabs"
          role="group"
          aria-label="选择第 10 章架构"
        >
          {architectureOptions.map((option) => (
            <button
              type="button"
              className={architecture === option.value ? 'is-selected' : ''}
              aria-pressed={architecture === option.value}
              onClick={() => setArchitecture(option.value)}
              key={option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="performance-lab__state" aria-live="polite">
          <span>{architectureState.storageType}</span>
          <span>compute: {architectureState.computeSeparation}</span>
          <span>layout: {architectureState.partitionFileLayoutHint}</span>
          <label>
            data volume category
            <select
              value={dataVolumeCategory}
              onChange={(event) =>
                setDataVolumeCategory(event.target.value as LakehouseDataVolumeCategory)
              }
            >
              <option value="small">small</option>
              <option value="medium">medium</option>
              <option value="large">large</option>
            </select>
          </label>
        </div>
      </section>

      <section className="performance-lab__controls" aria-labelledby="performance-inputs-title">
        <div className="performance-lab__section-heading">
          <div>
            <span className="eyebrow eyebrow--small">可控变量</span>
            <h3 id="performance-inputs-title">把规模和数据布局调到会超时的位置</h3>
          </div>
          <span className="performance-lab__units">data volume：百万行 · ratio：0–100%</span>
        </div>
        <div className="performance-lab__ranges">
          <RangeControl
            label="Data volume"
            value={config.dataVolume}
            min={1}
            max={100}
            step={1}
            suffix="M rows"
            onChange={(value) => setValue('dataVolume', value)}
          />
          <RangeControl
            label="Partition count"
            value={config.partitionCount}
            min={4}
            max={500}
            step={4}
            suffix=""
            onChange={(value) => setValue('partitionCount', value)}
          />
          <RangeControl
            label="Partition filter selectivity"
            value={config.partitionFilterSelectivity}
            min={0}
            max={1}
            step={0.05}
            suffix="%"
            onChange={(value) => setValue('partitionFilterSelectivity', value)}
          />
          <RangeControl
            label="Skew / hot key ratio"
            value={config.hotKeyRatio}
            min={0}
            max={0.5}
            step={0.01}
            suffix="%"
            onChange={(value) => setValue('hotKeyRatio', value)}
          />
          <RangeControl
            label="File fragmentation"
            value={config.fileFragmentation}
            min={0}
            max={1}
            step={0.05}
            suffix="%"
            onChange={(value) => setValue('fileFragmentation', value)}
          />
        </div>
        <StrategyControls config={config} setValue={setValue} />
      </section>

      <section
        className="performance-lab__comparison"
        aria-labelledby="performance-result-title"
        aria-live="polite"
      >
        <div className="performance-lab__section-heading">
          <div>
            <span className="eyebrow eyebrow--small">Before / After · pipeline trace</span>
            <h3 id="performance-result-title">Scan → Join → Shuffle → Aggregate → Write</h3>
          </div>
          <p>before 是同一组参数下未启用优化的基线；after 是当前方案。</p>
        </div>
        <div className="performance-lab__columns">
          <div>
            <h4>Before · 基线</h4>
            <div className="performance-lab__metrics">
              <MetricCard
                label="Scanned rows / blocks"
                value={`${formatRows(before.scannedRows)} / ${before.scannedBlocks}`}
                detail="simulation"
              />
              <MetricCard
                label="Partitions touched"
                value={`${before.partitionsTouched}`}
                detail="relative estimate"
              />
              <MetricCard
                label="Shuffle volume"
                value={formatBytes(before.shuffleVolume)}
                detail="relative estimate"
              />
              <MetricCard
                label="Longest worker / stage"
                value={`${formatRows(before.longestWorker)} / ${before.longestStage}`}
                detail="relative estimate"
              />
              <MetricCard
                label="Relative runtime / cost"
                value={`${before.relativeRuntime}× / ${before.relativeCost}×`}
                detail="baseline reference"
              />
              <MetricCard
                label="Write cost / storage"
                value={`${before.writeCost}× / ${before.storageImpact}×`}
                detail="relative estimate"
              />
              <MetricCard
                label="Freshness impact"
                value={`${before.freshnessImpact}×`}
                detail="relative estimate"
              />
            </div>
          </div>
          <div className="is-after">
            <h4>After · 当前方案</h4>
            <div className="performance-lab__metrics">
              <MetricCard
                label="Scanned rows / blocks"
                value={`${formatRows(after.scannedRows)} / ${after.scannedBlocks}`}
                detail={`变化 ${formatRows(changes.scannedRows)}`}
              />
              <MetricCard
                label="Partitions touched"
                value={`${after.partitionsTouched}`}
                detail={`变化 ${changes.partitionsTouched}`}
              />
              <MetricCard
                label="Shuffle volume"
                value={formatBytes(after.shuffleVolume)}
                detail={`变化 ${formatBytes(changes.shuffleVolume)}`}
              />
              <MetricCard
                label="Longest worker / stage"
                value={`${formatRows(after.longestWorker)} / ${after.longestStage}`}
                detail={`变化 ${formatRows(changes.longestWorker)}`}
              />
              <MetricCard
                label="Relative runtime / cost"
                value={`${after.relativeRuntime}× / ${after.relativeCost}×`}
                detail="relative estimate"
              />
              <MetricCard
                label="Write cost / storage"
                value={`${after.writeCost}× / ${after.storageImpact}×`}
                detail={`变化 ${changes.writeCost}× / ${changes.storageImpact}×`}
              />
              <MetricCard
                label="Freshness impact"
                value={`${after.freshnessImpact}×`}
                detail="relative estimate"
              />
            </div>
          </div>
        </div>
        <div className="performance-lab__stages" aria-label="阶段相对工作量">
          {after.stages.map((stage) => (
            <div key={stage.stage}>
              <span>{stage.label}</span>
              <div>
                <i style={{ width: `${Math.min(100, Math.max(4, stage.relativeWork * 8))}%` }} />
              </div>
              <small>{stage.relativeWork}×</small>
            </div>
          ))}
        </div>
        <section className="performance-lab__workers" aria-labelledby="performance-workers-title">
          <h4 id="performance-workers-title">Data Skew · Worker load distribution</h4>
          <p>hot key 会集中到第一个 worker；最长 worker 决定阶段何时结束。</p>
          <div className="performance-lab__worker-grid">
            {after.workerLoads.map((load, index) => (
              <div key={`worker-${index + 1}`}>
                <span>W{index + 1}</span>
                <div>
                  <i
                    style={{
                      width: `${Math.min(100, Math.max(4, (load / Math.max(after.longestWorker, 1)) * 100))}%`,
                    }}
                  />
                </div>
                <small>{formatRows(load)}</small>
              </div>
            ))}
          </div>
        </section>
        {after.tradeoffs.length > 0 && (
          <aside className="performance-lab__tradeoffs" aria-label="工程取舍">
            <strong>你换来了收益，也承担了：</strong>
            <ul>
              {after.tradeoffs.map((tradeoff) => (
                <li key={tradeoff}>{tradeoff}</li>
              ))}
            </ul>
          </aside>
        )}
      </section>
    </div>
  )
}
