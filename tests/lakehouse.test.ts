import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LakehouseArchitectureLab } from '../src/components/visualizations/LakehouseArchitectureLab'
import {
  lakehouseContent,
  lakehouseReplicationContent,
  lakehouseTableLayerContent,
  lakehouseUnityContent,
  lakehouseVisualizations,
} from '../src/content/lessons/lakehouse'
import { getLessonBySlug, getLessons } from '../src/data/course'
import type { LessonSection, LessonVisualizationSection } from '../src/content/types'
import type { LakehouseVisualization } from '../src/types'
import {
  commitSnapshot,
  evolveSnapshotSchema,
  getAtomicCommitState,
  getLakeFirstAssessment,
  getLakehouseUnityState,
  getReplicationState,
  timeTravelTo,
} from '../src/utils/lakehouse'

const isLakehouseVisualizationSection = (
  section: LessonSection,
): section is LessonVisualizationSection & { visualization: LakehouseVisualization } =>
  section.kind === 'visualization' && section.visualization.kind === 'lakehouse'

function getVisualization(content: typeof lakehouseContent): LakehouseVisualization {
  const visualization = content.sections.find(isLakehouseVisualizationSection)?.visualization
  if (!visualization) {
    throw new Error('湖仓测试需要 lakehouse visualization 数据')
  }

  return visualization
}

const lakeFirstVisualization = getVisualization(lakehouseContent)
const replicationVisualization = getVisualization(lakehouseReplicationContent)
const tableLayerVisualization = getVisualization(lakehouseTableLayerContent)
const unityVisualization = getVisualization(lakehouseUnityContent)
const initialSnapshot = tableLayerVisualization.snapshots[0]

if (!initialSnapshot) {
  throw new Error('湖仓测试需要初始 snapshot')
}

describe('第 09 章湖仓课程注册', () => {
  it('固定注册四节课，并保留 lakehouse slug', () => {
    const chapterLessons = getLessons().filter((lesson) => lesson.chapter === '09')

    expect(chapterLessons.map((lesson) => lesson.slug)).toEqual([
      'lakehouse',
      'lakehouse-replication',
      'lakehouse-table-layer',
      'lakehouse-unity',
    ])
    expect(getLessonBySlug('lakehouse')).toMatchObject({
      title: '为什么所有数据先进湖，却只有一部分进入仓？',
      chapter: '09',
      demo: 'lakehouse',
    })
  })

  it('四节课各自使用明确的教学动作和独立配置', () => {
    expect(lakehouseContent.sections.map((section) => section.kind)).toContain('visualization')
    expect(lakehouseReplicationContent.sections.map((section) => section.kind)).toContain(
      'visualization',
    )
    expect(lakehouseTableLayerContent.sections.map((section) => section.kind)).toContain(
      'visualization',
    )
    expect(lakehouseUnityContent.sections.map((section) => section.kind)).toContain('visualization')
    expect(lakehouseVisualizations.lakeFirst.focus).toBe('lake-first')
    expect(lakehouseVisualizations.replication.focus).toBe('replication')
    expect(lakehouseVisualizations.tableLayer.focus).toBe('table-layer')
    expect(lakehouseVisualizations.unity.focus).toBe('unity')
  })

  it('Architecture Lab 按四种 focus 渲染对应实验，不渲染评分面板', () => {
    const lakeFirstMarkup = renderToStaticMarkup(
      createElement(LakehouseArchitectureLab, { visualization: lakehouseVisualizations.lakeFirst }),
    )
    const replicationMarkup = renderToStaticMarkup(
      createElement(LakehouseArchitectureLab, {
        visualization: lakehouseVisualizations.replication,
      }),
    )
    const tableLayerMarkup = renderToStaticMarkup(
      createElement(LakehouseArchitectureLab, {
        visualization: lakehouseVisualizations.tableLayer,
      }),
    )
    const unityMarkup = renderToStaticMarkup(
      createElement(LakehouseArchitectureLab, { visualization: lakehouseVisualizations.unity }),
    )

    expect(lakeFirstMarkup).toContain('Lake-first 需求观察')
    expect(replicationMarkup).toContain('执行一次 Transform / Sync')
    expect(tableLayerMarkup).toContain('模拟第 6 个文件失败')
    expect(unityMarkup).toContain('共享基础能力的形态')
    expect(unityMarkup).not.toContain('recommendedArchitecture')
    expect(unityMarkup).not.toContain('得分')
  })
})

describe('Lake-first 数据流与需求取舍', () => {
  it('只保留少量代表性输入，并让需求改变 Warehouse 承接范围', () => {
    expect(lakeFirstVisualization.dataSources.map((source) => source.format)).toEqual([
      'table',
      'event-log',
      'json-file',
    ])
    expect(lakeFirstVisualization.dataSources).toHaveLength(3)

    if (lakeFirstVisualization.focus !== 'lake-first') {
      throw new Error('需要 lake-first visualization')
    }

    const highFrequency = getLakeFirstAssessment(
      lakeFirstVisualization.dataSources,
      lakeFirstVisualization.lakeFirst,
      'high-frequency-bi',
    )
    const history = getLakeFirstAssessment(
      lakeFirstVisualization.dataSources,
      lakeFirstVisualization.lakeFirst,
      'low-frequency-history',
    )

    expect(highFrequency.warehouseCount).toBe(1)
    expect(highFrequency.items.find((item) => item.sourceId === 'transactions')?.status).toBe(
      'lake-and-warehouse',
    )
    expect(history.warehouseCount).toBe(0)
    expect(history.items.every((item) => item.status === 'lake-only')).toBe(true)
  })
})

describe('复制、Table Layer 与版本实验', () => {
  it('同步前后明确显示第二份 AccountBalanceSnapshot 的责任', () => {
    if (replicationVisualization.focus !== 'replication') {
      throw new Error('需要 replication visualization')
    }

    const pending = getReplicationState(replicationVisualization.replication, false)
    const synced = getReplicationState(replicationVisualization.replication, true)

    expect(pending.replicaCount).toBe(1)
    expect(pending.warehouseVersion).toBeNull()
    expect(synced.replicaCount).toBe(2)
    expect(synced.warehouseVersion).toBe('business_date=2026-09-30')
    expect(synced.responsibilities).toHaveLength(3)
  })

  it('Atomic Commit 在失败时不发布半批文件，成功后整体可见', () => {
    expect(getAtomicCommitState(10, 6, 'failed')).toMatchObject({
      status: 'failed',
      visibleFileCount: 0,
      message: '第 6 个文件写入失败；前 5 个文件保持待发布，读者继续看到旧 Snapshot。',
    })
    expect(getAtomicCommitState(10, 6, 'committed')).toMatchObject({
      status: 'committed',
      visibleFileCount: 10,
    })
  })

  it('Schema Evolution 会生成 v2，而 Time Travel 保留 v1', () => {
    const committed = commitSnapshot(
      tableLayerVisualization.snapshots,
      tableLayerVisualization.evolutionCommit,
    )
    const nextSnapshot = committed[1]

    expect(committed).toHaveLength(2)
    expect(nextSnapshot).toMatchObject({ version: 2, id: 'snapshot-2' })
    expect(nextSnapshot?.columns).toEqual([
      'event_id',
      'customer_id',
      'event_type',
      'event_time',
      'channel',
    ])
    expect(
      evolveSnapshotSchema(initialSnapshot, [
        { name: 'channel', label: '访问渠道', defaultValue: null },
      ]).rows[0]?.channel,
    ).toBeNull()
    expect(timeTravelTo(committed, 1)).toEqual(initialSnapshot)
    expect(timeTravelTo(committed, 1)?.columns).not.toContain('channel')
    expect(timeTravelTo(committed, 2)?.columns).toContain('channel')
  })
})

describe('湖仓一体的共享基础能力', () => {
  it('逐项对照异构与共享形态，而不是返回架构评分', () => {
    if (unityVisualization.focus !== 'unity') {
      throw new Error('需要 unity visualization')
    }

    const heterogeneous = getLakehouseUnityState(unityVisualization.unity, 'heterogeneous')
    const sharedTable = getLakehouseUnityState(unityVisualization.unity, 'shared-table')

    expect(heterogeneous.replicaCount).toBe(2)
    expect(sharedTable.replicaCount).toBe(1)
    expect(heterogeneous.dimensions).toHaveLength(7)
    expect(sharedTable.dimensions.find((dimension) => dimension.id === 'compute')?.value).toContain(
      '仍可不同',
    )
    expect(sharedTable.responsibilities).toHaveLength(3)
  })
})
