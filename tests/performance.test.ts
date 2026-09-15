import { describe, expect, it } from 'vitest'
import { performanceAndPracticeContent } from '../src/content/lessons/performance-and-practice'
import { getLessonBySlug } from '../src/data/course'
import type { PerformanceVisualization } from '../src/features/performance/types'
import { getArchitectureState } from '../src/utils/lakehouse'
import {
  DEFAULT_PERFORMANCE_CONFIG,
  comparePerformanceStates,
  mapArchitectureStateToPerformanceInput,
  simulatePerformance,
} from '../src/utils/performance'

let visualization: PerformanceVisualization | undefined
for (const section of performanceAndPracticeContent.sections) {
  if (section.kind === 'visualization' && section.visualization.kind === 'performance-lab') {
    visualization = section.visualization
    break
  }
}

if (!visualization || visualization.kind !== 'performance-lab') {
  throw new Error('性能测试需要 performance-lab visualization 数据')
}

const performanceVisualization: PerformanceVisualization = visualization
const architectureState = getArchitectureState(
  performanceVisualization.architecture.architecture,
  performanceVisualization.architecture.workload,
  performanceVisualization.architecture.dataVolumeCategory,
)

const baseline = {
  ...DEFAULT_PERFORMANCE_CONFIG,
  ...performanceVisualization.defaults,
}

describe('第 11 章性能实验模型', () => {
  it('课程已注册，并暴露所有可控变量', () => {
    expect(getLessonBySlug('performance-and-practice')).toMatchObject({
      chapter: '11',
      demo: 'performance-lab',
    })
    expect(performanceVisualization.kind).toBe('performance-lab')
    expect(baseline).toMatchObject({
      dataVolume: expect.any(Number),
      partitionCount: expect.any(Number),
      partitionFilterSelectivity: expect.any(Number),
      hotKeyRatio: expect.any(Number),
      fileFragmentation: expect.any(Number),
    })
  })

  it('Partition Pruning 只扫描命中的分区，零命中不会隐式全表扫描', () => {
    const withoutPruning = simulatePerformance(
      { ...baseline, partitionPruning: false },
      architectureState,
    )
    const withPruning = simulatePerformance(
      { ...baseline, partitionPruning: true, partitionFilterSelectivity: 0.1 },
      architectureState,
    )
    const noHit = simulatePerformance(
      { ...baseline, partitionPruning: true, partitionFilterSelectivity: 0 },
      architectureState,
    )

    expect(withPruning.partitionsTouched).toBe(10)
    expect(withPruning.scannedRows).toBeLessThan(withoutPruning.scannedRows)
    expect(withPruning.scannedRows).toBeLessThanOrEqual(withPruning.totalRows)
    expect(withPruning.scannedBlocks).toBeLessThan(withoutPruning.scannedBlocks)
    expect(
      simulatePerformance(
        { ...baseline, partitionPruning: true, partitionFilterSelectivity: 1 },
        getArchitectureState('lake', 'bi', 'medium'),
      ).scannedRows,
    ).toBe(
      simulatePerformance(
        { ...baseline, partitionPruning: true, partitionFilterSelectivity: 1 },
        getArchitectureState('lake', 'bi', 'medium'),
      ).totalRows,
    )
    expect(noHit.partitionsTouched).toBe(0)
    expect(noHit.scannedRows).toBe(0)
    expect(noHit.scannedBlocks).toBe(0)
  })

  it('hot key ratio 会确定性地暴露最长 worker 长尾', () => {
    const uniform = simulatePerformance({ ...baseline, hotKeyRatio: 0 }, architectureState)
    const skewed = simulatePerformance({ ...baseline, hotKeyRatio: 0.4 }, architectureState)

    expect(new Set(uniform.workerLoads).size).toBe(1)
    expect(skewed.longestWorker).toBeGreaterThan(uniform.longestWorker)
    expect(skewed.workerLoads[0]).toBe(skewed.longestWorker)
    expect(skewed.workerLoads[0]).toBeGreaterThan(skewed.workerLoads[1] ?? 0)
    expect(simulatePerformance({ ...baseline, hotKeyRatio: 0.4 }, architectureState)).toEqual(
      skewed,
    )
    expect(skewed.longestStage).toBe('aggregate')
  })

  it('before/after 同时保留 scan、shuffle、长尾、runtime、cost 和 freshness 变化', () => {
    const comparison = comparePerformanceStates(
      { ...baseline, hotKeyRatio: 0.3 },
      {
        ...baseline,
        hotKeyRatio: 0.03,
        partitionPruning: true,
        layoutAdjustment: true,
        joinStrategy: 'broadcast',
        aggregationStrategy: 'two-phase',
        processingMode: 'incremental',
        reuseMode: 'materialized',
      },
      architectureState,
    )

    expect(comparison.after.scannedRows).toBeLessThan(comparison.before.scannedRows)
    expect(comparison.after.shuffleVolume).toBeLessThan(comparison.before.shuffleVolume)
    expect(comparison.after.longestWorker).toBeLessThan(comparison.before.longestWorker)
    expect(comparison.after.relativeRuntime).toBeLessThan(comparison.before.relativeRuntime)
    expect(comparison.after.freshnessImpact).toBeGreaterThan(comparison.before.freshnessImpact)
    expect(comparison.after.writeCost).toBeGreaterThan(comparison.before.writeCost)
    expect(comparison.after.storageImpact).toBeGreaterThan(comparison.before.storageImpact)
    expect(comparison.after.tradeoffs.length).toBeGreaterThan(0)
    expect(comparison.changes.relativeRuntime).toBe(
      comparison.after.relativeRuntime - comparison.before.relativeRuntime,
    )

    const layoutOnly = comparePerformanceStates(
      baseline,
      { ...baseline, layoutAdjustment: true },
      architectureState,
    )
    expect(layoutOnly.after.relativeRuntime).toBeLessThan(layoutOnly.before.relativeRuntime)
    expect(layoutOnly.after.writeCost).toBeGreaterThan(layoutOnly.before.writeCost)
    expect(layoutOnly.after.storageImpact).toBeGreaterThan(layoutOnly.before.storageImpact)
  })

  it('架构状态中的 workload 和数据量类别会改变相对模拟输入', () => {
    const smallBi = simulatePerformance(baseline, getArchitectureState('lakehouse', 'bi', 'small'))
    const largeMl = simulatePerformance(baseline, getArchitectureState('lakehouse', 'ml', 'large'))

    expect(largeMl.totalRows).toBeGreaterThan(smallBi.totalRows)
    expect(largeMl.shuffleVolume).toBeGreaterThan(smallBi.shuffleVolume)
    expect(largeMl.relativeRuntime).not.toBe(smallBi.relativeRuntime)
  })

  it('getArchitectureState 的六字段映射不复制另一套架构状态', () => {
    const mapped = mapArchitectureStateToPerformanceInput(architectureState)
    expect(mapped).toMatchObject({
      architecture: 'lakehouse',
      storageType: architectureState.storageType,
      computeSeparation: architectureState.computeSeparation,
      partitionFileLayoutHint: architectureState.partitionFileLayoutHint,
      workload: 'bi',
      dataVolumeCategory: 'large',
      workloadMultiplier: expect.any(Number),
      dataVolumeMultiplier: expect.any(Number),
    })
    expect(
      mapArchitectureStateToPerformanceInput(getArchitectureState('warehouse', 'bi', 'medium')),
    ).toMatchObject({
      architecture: 'warehouse',
      storageType: '受管理的表存储',
      computeSeparation: 'partial',
    })
  })
})
