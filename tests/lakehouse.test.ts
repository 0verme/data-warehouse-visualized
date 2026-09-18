import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  LakehouseArchitectureLab,
  getFileStatus,
  LAKEHOUSE_RELATION_LABELS,
} from '../src/components/visualizations/LakehouseArchitectureLab'
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

describe('Pilot C lakehouse 视觉语法：Zone / Connector / Focus / State / Detail', () => {
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

  it('Connector relation 映射稳定，不做成另一种虚线关系', () => {
    expect(LAKEHOUSE_RELATION_LABELS).toMatchObject({
      'data-transform': '数据 / 加工',
      'sync-copy': '复制 / 同步',
      'shared-foundation': '共享基础',
      'version-causality': '版本 / 因果',
    })
  })

  it('lake-first：Zone / Node / Decision / Detail 语义齐全且不混用成功色', () => {
    expect(lakeFirstMarkup).toContain('data-zone="source"')
    expect(lakeFirstMarkup).toContain('data-zone="lake"')
    expect(lakeFirstMarkup).toContain('data-node-role="source"')
    expect(lakeFirstMarkup).toContain('data-node-role="lake"')
    expect(lakeFirstMarkup).toContain('data-relation="data-transform"')
    expect(lakeFirstMarkup).toContain('data-detail-role="placement-decision"')
    expect(lakeFirstMarkup).toContain('data-detail-role="demand-facts"')
    // 默认 high-frequency-bi 时 transactions 进入 Warehouse 服务层，是决策结果而非 success
    expect(lakeFirstMarkup).toContain('data-decision-result="lake-and-warehouse"')
    // 图例让连接关系不依赖颜色
    expect(lakeFirstMarkup).toContain('lakehouse-legend')
  })

  it('replication：sync-copy 关系与 pending 初始状态稳定，不把“副本就绪”当成成功', () => {
    expect(replicationMarkup).toContain('data-zone="source"')
    expect(replicationMarkup).toContain('data-zone="lake"')
    expect(replicationMarkup).toContain('data-zone="warehouse"')
    expect(replicationMarkup).toContain('data-node-role="transform"')
    expect(replicationMarkup).toContain('data-relation="data-transform"')
    expect(replicationMarkup).toContain('data-relation="sync-copy"')
    expect(replicationMarkup).toContain('data-state="pending"')
    expect(replicationMarkup).toContain('等待同步')
    expect(replicationMarkup).toContain('还没有数据')
    expect(replicationMarkup).toContain('data-detail-role="replica-summary"')
    expect(replicationMarkup).toContain('data-detail-role="responsibility"')
    // 初始渲染没有成功色表达“副本”，state 由文字承担
    expect(replicationMarkup).not.toContain('已同步')
  })

  it('table-layer：version causality、文件状态、快照时间轴语义齐全', () => {
    expect(tableLayerMarkup).toContain('data-relation="version-causality"')
    expect(tableLayerMarkup).toContain('data-detail-role="file-batch"')
    expect(tableLayerMarkup).toContain('data-detail-role="snapshot-timeline"')
    expect(tableLayerMarkup).toContain('data-detail-role="snapshot-table"')
    // 初始 idle：所有文件 pending
    expect(tableLayerMarkup).toContain('data-state="pending"')
    // 初始读取最新版本
    expect(tableLayerMarkup).toContain('data-state="current"')
    // 默认选中 v1 是 Focus，不是状态
    expect(tableLayerMarkup).toContain('data-focus="primary"')
  })

  it('unity：heterogeneous 与 shared-table 的 zone / relation / focus 互不误标', () => {
    expect(unityMarkup).toContain('data-zone="warehouse"')
    expect(unityMarkup).toContain('data-node-role="transform"')
    expect(unityMarkup).toContain('data-relation="sync-copy"')
    expect(unityMarkup).toContain('data-focus="primary"')
    expect(unityMarkup).toContain('data-detail-role="comparison"')
    expect(unityMarkup).toContain('data-detail-role="responsibility"')
    // 共享基础能力区在异构模式下不出现（切换后由 state 呈现）
    expect(unityMarkup).not.toContain('data-zone="shared-storage"')
    expect(unityMarkup).not.toContain('data-zone="compute"')
  })

  it('selected Focus 不等于业务 State：选中按钮没有 success / danger 语义数据', () => {
    const selectedFocusPattern = /data-focus="primary"[^>]*>/g
    expect(lakeFirstMarkup.match(selectedFocusPattern)).toBeTruthy()
    expect(tableLayerMarkup.match(selectedFocusPattern)).toBeTruthy()
    // 选中只是 aria-pressed + data-focus，不携带 data-state 或推荐分
    expect(lakeFirstMarkup).not.toContain('得分')
    expect(unityMarkup).not.toContain('得分')
  })

  it('getFileStatus 按批次状态映射 failed / held / committed / pending', () => {
    expect(getFileStatus('failed', 6, 6)).toBe('failed')
    expect(getFileStatus('failed', 3, 6)).toBe('held')
    expect(getFileStatus('committed', 4, 6)).toBe('committed')
    expect(getFileStatus('idle', 4, 6)).toBe('pending')
  })
})
