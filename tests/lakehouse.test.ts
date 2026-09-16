import { describe, expect, it } from 'vitest'
import { lakehouseContent } from '../src/content/lessons/lakehouse'
import { getLessonBySlug } from '../src/data/course'
import type { LessonSection, LessonVisualizationSection } from '../src/content/types'
import type { LakehouseVisualization } from '../src/types'
import {
  buildDecisionRecord,
  commitSnapshot,
  evaluateArchitecture,
  evolveSnapshotSchema,
  getArchitectureFlow,
  getArchitectureState,
  getCapabilityMatrix,
  getConsumerStates,
  timeTravelTo,
} from '../src/utils/lakehouse'

const isLakehouseVisualizationSection = (
  section: LessonSection,
): section is LessonVisualizationSection & { visualization: LakehouseVisualization } =>
  section.kind === 'visualization' && section.visualization.kind === 'lakehouse'

const visualization = lakehouseContent.sections.find(isLakehouseVisualizationSection)?.visualization

if (!visualization || visualization.kind !== 'lakehouse') {
  throw new Error('湖仓测试需要 lakehouse visualization 数据')
}

const lakehouseVisualization: LakehouseVisualization = visualization

const initialSnapshot = lakehouseVisualization.snapshots[0]

if (!initialSnapshot) {
  throw new Error('湖仓测试需要初始 snapshot')
}

describe('湖仓架构选择与版本实验', () => {
  it('课程元数据和同一份多形态输入已注册', () => {
    expect(getLessonBySlug('lakehouse')).toMatchObject({
      title: '湖仓：为什么数据湖最终需要仓库能力',
      chapter: '09',
      demo: 'lakehouse',
    })
    expect(lakehouseVisualization.dataSources.map((source) => source.format)).toEqual([
      'table',
      'event-log',
      'json-file',
    ])
    expect(lakehouseVisualization.scenarios).toHaveLength(3)
  })

  it('能力矩阵会让三种架构的边界发生可见变化', () => {
    expect(getCapabilityMatrix('warehouse')['stable-query']).toBe('strong')
    expect(getCapabilityMatrix('lake')['stable-query']).toBe('limited')
    expect(getCapabilityMatrix('lakehouse')['version-history']).toBe('strong')
    expect(getArchitectureFlow('lake')[2].status).toBe('limited')
    expect(getArchitectureFlow('lakehouse')[2].status).toBe('strong')
    expect(getConsumerStates('warehouse').find((consumer) => consumer.id === 'bi')?.status).toBe(
      'strong',
    )
    expect(getConsumerStates('lake').find((consumer) => consumer.id === 'bi')?.status).toBe(
      'limited',
    )
  })

  it('不同 workload 不会永远得到同一个推荐', () => {
    const recommendations = new Set([
      evaluateArchitecture('bi', []).recommendedArchitecture,
      evaluateArchitecture('exploration', []).recommendedArchitecture,
      evaluateArchitecture('ml', []).recommendedArchitecture,
      evaluateArchitecture('streaming', []).recommendedArchitecture,
    ])

    expect(recommendations).toEqual(new Set(['warehouse', 'lake', 'lakehouse']))
  })

  it('约束组合会改变证据，且 Lakehouse 保留真实 trade-off', () => {
    expect(evaluateArchitecture('bi', ['governance', 'history']).recommendedArchitecture).toBe(
      'warehouse',
    )
    expect(
      evaluateArchitecture('exploration', ['schema-change', 'cost-sensitive'])
        .recommendedArchitecture,
    ).toBe('lake')
    expect(
      evaluateArchitecture('ml', ['schema-change', 'concurrent-writes', 'history'])
        .recommendedArchitecture,
    ).toBe('lakehouse')

    const decision = evaluateArchitecture('bi', [])
    const record = buildDecisionRecord('lakehouse', 'bi', ['cost-sensitive'])

    expect(decision.scores.lakehouse).toBeLessThan(decision.scores.warehouse)
    expect(record.tradeoffs.length).toBeGreaterThan(0)
    expect(record.risks.length).toBeGreaterThan(0)
    expect(record.notSuitableWhen.length).toBeGreaterThan(0)
  })

  it('snapshot commit 会确定性地完成 schema evolution', () => {
    const committed = commitSnapshot(
      lakehouseVisualization.snapshots,
      lakehouseVisualization.evolutionCommit,
    )
    const nextSnapshot = committed[1]

    expect(committed).toHaveLength(2)
    expect(nextSnapshot).toMatchObject({ version: 2, id: 'snapshot-2' })
    expect(nextSnapshot.columns).toEqual(['event_id', 'order_id', 'event_type', 'device_type'])
    expect(nextSnapshot.rows).toEqual([
      { event_id: 'E001', order_id: 'O1001', event_type: 'click', device_type: null },
      { event_id: 'E002', order_id: 'O1001', event_type: 'view', device_type: null },
      { event_id: 'E003', order_id: 'O1002', event_type: 'click', device_type: 'mobile' },
    ])
    expect(initialSnapshot.columns).toEqual(['event_id', 'order_id', 'event_type'])
  })

  it('time travel 能还原 v1，普通 schema 演进不会覆盖历史', () => {
    const evolved = evolveSnapshotSchema(initialSnapshot, [
      { name: 'device_type', label: '设备类型', defaultValue: null },
    ])
    const committed = commitSnapshot(
      lakehouseVisualization.snapshots,
      lakehouseVisualization.evolutionCommit,
    )

    expect(evolved.columns).toContain('device_type')
    expect(evolved.rows[0]?.device_type).toBeNull()
    expect(timeTravelTo(committed, 1)).toEqual(initialSnapshot)
    expect(timeTravelTo(committed, 1)?.columns).not.toContain('device_type')
    expect(timeTravelTo(committed, 2)?.columns).toContain('device_type')
  })

  it('为性能章节暴露存储、计算、布局、workload 和数据量状态', () => {
    expect(getArchitectureState('lakehouse', 'ml', 'large')).toEqual({
      architecture: 'lakehouse',
      storageType: '对象存储 + 开放表格式',
      computeSeparation: 'separated',
      partitionFileLayoutHint: '开放表管理分区与文件布局；仍需治理小文件、压缩和元数据成本。',
      workload: 'ml',
      dataVolumeCategory: 'large',
    })
  })
})
