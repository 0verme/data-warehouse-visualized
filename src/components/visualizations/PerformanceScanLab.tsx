import { useMemo, useState } from 'react'
import type {
  PerformanceFileLayout,
  PerformancePartitionDay,
  PerformanceScanLayoutVisualization,
  PerformanceScanMode,
} from '../../features/performance/types'
import { getFileLayout, getScanSnapshot, formatPerformanceNumber } from '../../utils/performance'
import {
  ArrowSeparator,
  LayerMarker,
  PerformanceChoiceButton,
  PerformanceMetric,
  PerformanceMetricGrid,
  PerformancePanelHeading,
  SimulationNote,
} from './PerformanceLabShared'

export function PerformanceScanLab({
  visualization,
}: {
  visualization: PerformanceScanLayoutVisualization
}) {
  const [scanMode, setScanMode] = useState<PerformanceScanMode>('full-history')
  const [fileLayout, setFileLayout] = useState<PerformanceFileLayout>('fragmented')
  const [partitionDay, setPartitionDay] = useState<PerformancePartitionDay>('ordinary')
  const data = visualization.scanLayout
  const scan = useMemo(() => getScanSnapshot(data, scanMode), [data, scanMode])
  const layout = useMemo(() => getFileLayout(data, fileLayout), [data, fileLayout])
  const partition =
    data.partitionSizes.find((item) => item.id === partitionDay) ?? data.partitionSizes[0]!

  return (
    <div className="performance-lab performance-lab--scan">
      <LayerMarker layer="storage-execution" />
      <SimulationNote text={visualization.simulationNote} />

      <section className="performance-scan__scope" aria-labelledby="performance-scan-scope-title">
        <PerformancePanelHeading
          eyebrow="11-2 · 分区扫描"
          title="最近 30 天，真的只读最近 30 天吗？"
          description="同一份按 txn_date 分区的 Transaction，先切换查询范围，再观察分区和 Scan Bytes 是否一起变化。"
          id="performance-scan-scope-title"
        />
        <div className="performance-choice-grid performance-choice-grid--two">
          {data.scanSnapshots.map((snapshot) => (
            <PerformanceChoiceButton
              key={snapshot.id}
              selected={scanMode === snapshot.id}
              label={snapshot.label}
              detail={`${snapshot.historyLabel} · ${snapshot.partitionsTouched} 个分区`}
              onClick={() => setScanMode(snapshot.id)}
            />
          ))}
        </div>
        <div className="performance-scan__range" aria-label="扫描范围变化">
          <div className={scanMode === 'full-history' ? 'is-active' : ''}>
            <span>历史输入</span>
            <strong>{data.historyWindow}</strong>
            <small>按 txn_date 保存的全部历史</small>
          </div>
          <ArrowSeparator />
          <div className={scanMode === 'partition-pruning' ? 'is-active' : ''}>
            <span>查询条件</span>
            <strong>{data.targetWindow}</strong>
            <small>只保留固定最近 30 天范围</small>
          </div>
          <ArrowSeparator />
          <div className="performance-scan__result">
            <span>实际命中</span>
            <strong>{scan.partitionsTouched} 个分区</strong>
            <small>{scan.detail}</small>
          </div>
        </div>
        <PerformanceMetricGrid>
          <PerformanceMetric
            label="Partitions touched"
            value={formatPerformanceNumber(scan.partitionsTouched)}
            detail={scan.historyLabel}
          />
          <PerformanceMetric
            label="Scan Bytes"
            value={scan.scanBytes}
            detail="relative simulation"
          />
          <PerformanceMetric
            label="文件数"
            value={formatPerformanceNumber(scan.fileCount)}
            detail="当前扫描范围"
          />
          <PerformanceMetric label="相对耗时" value={scan.relativeRuntime} detail="同一查询口径" />
        </PerformanceMetricGrid>
      </section>

      <section className="performance-scan__files" aria-labelledby="performance-file-layout-title">
        <PerformancePanelHeading
          eyebrow="文件布局 · 少读不等于读得高效"
          title="分区少了，为什么读取仍然可能慢？"
          description="保持最近 30 天扫描范围不变，只改变分区内文件组织，观察文件数和读取代价。"
          id="performance-file-layout-title"
        />
        <div className="performance-choice-grid performance-choice-grid--two">
          {data.fileLayouts.map((candidate) => (
            <PerformanceChoiceButton
              key={candidate.id}
              selected={fileLayout === candidate.id}
              label={candidate.label}
              detail={`${formatPerformanceNumber(candidate.fileCount)} 个文件 · ${candidate.averageFileSize}`}
              onClick={() => setFileLayout(candidate.id)}
            />
          ))}
        </div>
        <div className="performance-scan__file-story" aria-live="polite">
          <div className="performance-file-stack">
            {Array.from({ length: fileLayout === 'fragmented' ? 12 : 5 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <div>
            <strong>{layout.label}</strong>
            <p>{layout.readDetail}</p>
            <p className="performance-scan__cost-note">{layout.compactionDetail}</p>
          </div>
          <PerformanceMetric
            label="相对读取时间"
            value={layout.relativeRuntime}
            detail="文件布局变化"
          />
        </div>
        <p className="performance-scan__equation">
          <strong>少读数据 ≠ 一定读得高效</strong>
          <span>
            Partition Pruning 解决“读哪些分区”；文件布局和 Compaction 影响“怎样把这些分区读出来”。
          </span>
        </p>
      </section>

      <section className="performance-scan__skew" aria-labelledby="performance-date-skew-title">
        <PerformancePanelHeading
          eyebrow="日期分区倾斜 · 真实业务分布"
          title="双 11 特别大，就说明 txn_date 选错了吗？"
          description="选择一个业务日，比较分区大小、文件数和相对耗时。单日高峰首先是数据分布事实。"
          id="performance-date-skew-title"
        />
        <div className="performance-choice-grid performance-choice-grid--two">
          {data.partitionSizes.map((candidate) => (
            <PerformanceChoiceButton
              key={candidate.id}
              selected={partitionDay === candidate.id}
              label={candidate.label}
              detail={`${candidate.size} · ${formatPerformanceNumber(candidate.fileCount)} 个文件`}
              onClick={() => setPartitionDay(candidate.id)}
            />
          ))}
        </div>
        <div className="performance-partition-detail" aria-live="polite">
          <div className="performance-partition-detail__bar">
            <span>{partition.label}</span>
            <div aria-hidden="true">
              <i style={{ width: partitionDay === 'double-11' ? '100%' : '12%' }} />
            </div>
            <strong>{partition.size}</strong>
          </div>
          <PerformanceMetricGrid>
            <PerformanceMetric label="分区大小" value={partition.size} />
            <PerformanceMetric
              label="文件数"
              value={formatPerformanceNumber(partition.fileCount)}
            />
            <PerformanceMetric label="相对耗时" value={partition.relativeRuntime} />
          </PerformanceMetricGrid>
          <p>
            <strong>判断：</strong> {partition.detail}{' '}
            需要进一步看文件布局、并行度和任务拆分，不能只因为一天很大就否定日期分区。
          </p>
        </div>
      </section>
    </div>
  )
}
