import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DependencyReprocessingLab } from '../src/components/visualizations/DependencyReprocessingLab'
import { getLessonContent } from '../src/content/lessons'
import { getLessonBySlug, lessons } from '../src/data/course'
import {
  REPROCESSING_INCIDENT_BUSINESS_DATE,
  REPROCESSING_TASK_IDS,
  createReprocessingFixture,
} from '../src/features/dependency-reprocessing/fixture'
import {
  buildImpactScopeViewModel,
  buildIncidentTimelineSteps,
  createIncidentTimelineKernel,
} from '../src/features/dependency-reprocessing/steps'
import type { DependencyReprocessingVisualization } from '../src/features/dependency-reprocessing/types'
import { getAdjacentLessons } from '../src/utils/lesson'
import { getLessonStyleSheets } from '../src/utils/lesson-styles'
import {
  applyVisualizationPlayerAction,
  createVisualizationPlayer,
  getCurrentVisualizationStep,
  isVisualizationPlayerAtEnd,
  isVisualizationPlayerAtStart,
} from '../src/utils/visualization-steps'

const INCIDENT_VISUALIZATION: DependencyReprocessingVisualization = {
  kind: 'dependency-reprocessing',
  lessonFocus: 'incident-timeline',
}

const IMPACT_VISUALIZATION: DependencyReprocessingVisualization = {
  kind: 'dependency-reprocessing',
  lessonFocus: 'impact-scope',
}

function incidentInstance(taskId: string): string {
  return `${taskId}@${REPROCESSING_INCIDENT_BUSINESS_DATE}`
}

describe('依赖链重做 · E1 事故时间线与污染传播（Phase 2-A）', () => {
  it('时间线固定为 7 步且完全确定', () => {
    const steps = buildIncidentTimelineSteps()

    expect(steps.map((step) => step.id)).toEqual([
      'arrival',
      'validation-gap',
      'detail-propagation',
      'branch-fanout',
      'merge-propagation',
      'consumer-delivery',
      'conclusion',
    ])
    expect(steps).toHaveLength(7)
    expect(buildIncidentTimelineSteps()).toEqual(steps)
    expect(steps.every((step) => step.highlight !== undefined)).toBe(true)
  })

  it('每步携带完整快照，污染节点沿依赖顺序逐步揭示', () => {
    const steps = buildIncidentTimelineSteps()
    const revealedCounts = steps.map((step) => step.state.revealedCount)

    expect(revealedCounts).toEqual([1, 2, 3, 5, 6, 8, 8])
    for (const step of steps) {
      expect(step.state.nodes).toHaveLength(8)
      expect(step.state.totalCount).toBe(8)
    }

    const conclusion = steps[6]!
    expect(conclusion.state.nodes.every((node) => node.revealed)).toBe(true)
    expect(conclusion.state.nodes.every((node) => node.contaminated)).toBe(true)
    expect(new Set(conclusion.state.nodes.map((node) => node.instanceId)).size).toBe(8)
    // completed 快照下每个节点都是 SUCCESS：任务状态全绿，数据仍可能错误。
    expect(conclusion.state.nodes.every((node) => node.state === 'success')).toBe(true)
  })

  it('播放器只推进 index：边界不越界，reset 回到第一步', () => {
    const kernel = createIncidentTimelineKernel()
    let player = createVisualizationPlayer(kernel.size)

    expect(kernel.size).toBe(7)
    expect(isVisualizationPlayerAtStart(player)).toBe(true)
    expect(getCurrentVisualizationStep(player, kernel).id).toBe('arrival')

    player = applyVisualizationPlayerAction(player, 'prev')
    expect(player.currentIndex).toBe(0)

    for (let index = 0; index < kernel.size - 1; index += 1) {
      player = applyVisualizationPlayerAction(player, 'next')
    }
    expect(isVisualizationPlayerAtEnd(player)).toBe(true)
    expect(getCurrentVisualizationStep(player, kernel).id).toBe('conclusion')

    player = applyVisualizationPlayerAction(player, 'next')
    expect(player.currentIndex).toBe(kernel.size - 1)

    player = applyVisualizationPlayerAction(player, 'reset')
    expect(player.currentIndex).toBe(0)
    expect(isVisualizationPlayerAtStart(player)).toBe(true)
  })

  it('静态渲染包含时间线、分步控制、本步证据与本步小结', () => {
    const html = renderToStaticMarkup(
      <DependencyReprocessingLab visualization={INCIDENT_VISUALIZATION} />,
    )

    expect(html).toContain('data-reprocessing-mode="incident-timeline"')
    expect(html).toContain('data-step-id="arrival"')
    expect(html).toContain('data-step-kind="arrival"')
    expect(html).toContain('data-reprocessing-chain')
    expect(html.match(/data-node=/g)).toHaveLength(8)
    expect(html).toContain('data-revealed="true"')
    expect(html).toContain('data-revealed="false"')
    expect(html).toContain('data-contaminated="true"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('本步证据')
    expect(html).toContain('本步小结')
    expect(html).toContain('分步控制')
    expect(html).toContain('role="progressbar"')
  })

  it('未接入的 focus 明确占位，不伪造交互', () => {
    const html = renderToStaticMarkup(
      <DependencyReprocessingLab
        visualization={{ kind: 'dependency-reprocessing', lessonFocus: 'version-boundary' }}
      />,
    )

    expect(html).toContain('后续课程中开放')
    expect(html).not.toContain('data-reprocessing-chain')
  })

  it('第 14 章 14-1 课程接线完整：metadata、内容、样式与相邻导航', () => {
    const lesson = getLessonBySlug('reprocessing-incident-timeline')

    expect(lesson).toMatchObject({
      id: 'lesson-14-1',
      slug: 'reprocessing-incident-timeline',
      chapter: '14',
      order: 100,
      difficulty: 'advanced',
      estimatedMinutes: 18,
      demo: 'dependency-reprocessing',
      title: '为什么数仓任务成功了，数据仍然是错的？',
    })

    const content = getLessonContent(lesson!)
    const visualizationSection = content.sections.find(
      (section) => section.kind === 'visualization',
    )
    expect(visualizationSection?.visualization).toEqual(INCIDENT_VISUALIZATION)
    expect(getLessonStyleSheets(content)).toEqual(['dependency-reprocessing.css'])

    expect(getAdjacentLessons(lessons, 'delivery-completion-signal').next?.slug).toBe(
      'reprocessing-incident-timeline',
    )
    expect(getAdjacentLessons(lessons, 'reprocessing-incident-timeline').previous?.slug).toBe(
      'delivery-completion-signal',
    )
    expect(getAdjacentLessons(lessons, 'reprocessing-incident-timeline').next?.slug).toBe(
      'reprocessing-impact-scope',
    )
  })

  it('文案遵守专题边界：使用重做语义，不引入轮次 / generation', () => {
    const content = getLessonContent(getLessonBySlug('reprocessing-incident-timeline')!)
    const text = JSON.stringify(content)

    expect(text).toContain('依赖链重做（Reprocessing）')
    expect(text).toContain('SUCCESS')
    expect(text).not.toMatch(/generation|Replay|第 \d+ 轮/i)
  })

  it('E2 影响范围：四类集合并集去重、调度型任务与 LEFT JOIN 证据', () => {
    const model = createReprocessingFixture()
    const viewModel = buildImpactScopeViewModel(
      model,
      incidentInstance(REPROCESSING_TASK_IDS.ingestTransaction),
    )
    const sets = new Map(viewModel.sets.map((set) => [set.id, set]))

    expect(sets.get('stop')?.instanceIds).toEqual([
      incidentInstance(REPROCESSING_TASK_IDS.dwsMerchantTransaction),
    ])
    expect(sets.get('redo')?.instanceIds).toEqual([
      incidentInstance(REPROCESSING_TASK_IDS.ingestTransaction),
      incidentInstance(REPROCESSING_TASK_IDS.checkTransactionCompleteness),
      incidentInstance(REPROCESSING_TASK_IDS.dwdTransactionDetail),
      incidentInstance(REPROCESSING_TASK_IDS.dwsChannelTransaction),
    ])
    expect(sets.get('waiting')?.instanceIds).toEqual([
      incidentInstance(REPROCESSING_TASK_IDS.adsTransactionReport),
      incidentInstance(REPROCESSING_TASK_IDS.consumeTransactionReport),
      incidentInstance(REPROCESSING_TASK_IDS.deliverTransactionFile),
    ])
    expect(sets.get('notify')?.instanceIds).toEqual([
      incidentInstance(REPROCESSING_TASK_IDS.consumeTransactionReport),
      incidentInstance(REPROCESSING_TASK_IDS.deliverTransactionFile),
    ])

    expect(viewModel.affectedInstanceIds).toHaveLength(8)
    expect(viewModel.deduplicatedTaskIds).toEqual([
      REPROCESSING_TASK_IDS.ingestTransaction,
      REPROCESSING_TASK_IDS.checkTransactionCompleteness,
      REPROCESSING_TASK_IDS.dwdTransactionDetail,
      REPROCESSING_TASK_IDS.dwsMerchantTransaction,
      REPROCESSING_TASK_IDS.dwsChannelTransaction,
      REPROCESSING_TASK_IDS.adsTransactionReport,
      REPROCESSING_TASK_IDS.consumeTransactionReport,
      REPROCESSING_TASK_IDS.deliverTransactionFile,
    ])
    expect(new Set(viewModel.deduplicatedTaskIds).size).toBe(8)
    // 没有 SQL 血缘、仅由调度依赖进入范围的任务。
    expect(viewModel.schedulerOnlyTaskIds).toEqual([
      REPROCESSING_TASK_IDS.checkTransactionCompleteness,
    ])

    // 多支汇合：两条血缘证据都指向 ADS，但去重清单只出现一次。
    const adsInstanceId = incidentInstance(REPROCESSING_TASK_IDS.adsTransactionReport)
    expect(
      viewModel.evidenceRows.filter(
        (row) =>
          row.toTaskId === REPROCESSING_TASK_IDS.adsTransactionReport && row.kind === 'lineage',
      ),
    ).toHaveLength(2)
    expect(
      viewModel.affectedInstanceIds.filter((instanceId) => instanceId === adsInstanceId),
    ).toHaveLength(1)
  })

  it('E2 LEFT JOIN：输入被污染时左连接读取仍构成传播边', () => {
    const model = createReprocessingFixture({ variant: 'completed' })
    const viewModel = buildImpactScopeViewModel(
      model,
      incidentInstance(REPROCESSING_TASK_IDS.ingestMerchant),
    )
    const merchantDwsInstanceId = incidentInstance(REPROCESSING_TASK_IDS.dwsMerchantTransaction)

    expect(viewModel.sets.find((set) => set.id === 'redo')?.instanceIds).toContain(
      merchantDwsInstanceId,
    )
    expect(
      viewModel.evidenceRows.some(
        (row) =>
          row.toTaskId === REPROCESSING_TASK_IDS.dwsMerchantTransaction &&
          row.detail.includes('left-join'),
      ),
    ).toBe(true)
  })

  it('E2 静态渲染：源选择与结果面板结构完整', () => {
    const html = renderToStaticMarkup(
      <DependencyReprocessingLab visualization={IMPACT_VISUALIZATION} />,
    )

    expect(html).toContain('data-reprocessing-mode="impact-scope"')
    expect(html).toContain('data-scope-chain')
    expect(html.match(/data-node=/g)).toHaveLength(8)
    expect(html).toContain('以事故源圈定范围')
    expect(html).toContain('尚未选择源实例')
    expect(html).toContain('LEFT JOIN 的纳入规则')
    expect(html).toContain('aria-live="polite"')
  })

  it('第 14 章 14-2 课程接线完整：metadata、内容、样式与相邻导航', () => {
    const lesson = getLessonBySlug('reprocessing-impact-scope')

    expect(lesson).toMatchObject({
      id: 'lesson-14-2',
      slug: 'reprocessing-impact-scope',
      chapter: '14',
      order: 200,
      difficulty: 'advanced',
      estimatedMinutes: 20,
      demo: 'dependency-reprocessing',
      title: 'SQL 血缘与调度依赖：如何圈定依赖链重做范围？',
    })

    const content = getLessonContent(lesson!)
    const visualizationSection = content.sections.find(
      (section) => section.kind === 'visualization',
    )
    expect(visualizationSection?.visualization).toEqual(IMPACT_VISUALIZATION)
    expect(getLessonStyleSheets(content)).toEqual(['dependency-reprocessing.css'])

    expect(getAdjacentLessons(lessons, 'reprocessing-impact-scope').previous?.slug).toBe(
      'reprocessing-incident-timeline',
    )
    expect(getAdjacentLessons(lessons, 'reprocessing-impact-scope').next?.slug).toBe(
      'reprocessing-auto-stop-wait',
    )

    const text = JSON.stringify(content)
    expect(text).toContain('SQL 血缘')
    expect(text).toContain('LEFT JOIN')
    expect(text).not.toMatch(/generation|Replay|第 \d+ 轮/i)
  })

  it('E3 静态渲染：恢复流程控制、计划与执行日志结构完整（初始阶段）', () => {
    const html = renderToStaticMarkup(
      <DependencyReprocessingLab
        visualization={{ kind: 'dependency-reprocessing', lessonFocus: 'stop-wait-redo' }}
      />,
    )

    expect(html).toContain('data-reprocessing-mode="stop-wait-redo"')
    expect(html).toContain('data-phase="detected"')
    expect(html).toContain('data-swr-chain')
    expect(html.match(/data-node=/g)).toHaveLength(8)
    expect(html).toContain('停止受影响任务')
    expect(html).toContain('ODS 验证通过')
    expect(html).toContain('让 DWD 重做失败一次')
    expect(html).toContain('执行日志')
    expect(html).toContain('aria-live="polite"')
    // 初始阶段：还没有计划与门禁面板。
    expect(html).not.toContain('data-panel="redo-schedule"')
    expect(html).not.toContain('data-panel="gate-blocked"')
  })

  it('第 14 章 14-3 课程接线完整：metadata、内容、样式与相邻导航', () => {
    const lesson = getLessonBySlug('reprocessing-auto-stop-wait')

    expect(lesson).toMatchObject({
      id: 'lesson-14-3',
      slug: 'reprocessing-auto-stop-wait',
      chapter: '14',
      order: 300,
      difficulty: 'advanced',
      estimatedMinutes: 22,
      demo: 'dependency-reprocessing',
      title: '依赖链如何自动停止、等待和重新调用？',
    })

    const content = getLessonContent(lesson!)
    const visualizationSection = content.sections.find(
      (section) => section.kind === 'visualization',
    )
    expect(visualizationSection?.visualization).toEqual({
      kind: 'dependency-reprocessing',
      lessonFocus: 'stop-wait-redo',
    })
    expect(getLessonStyleSheets(content)).toEqual(['dependency-reprocessing.css'])

    expect(getAdjacentLessons(lessons, 'reprocessing-auto-stop-wait').previous?.slug).toBe(
      'reprocessing-impact-scope',
    )
    expect(getAdjacentLessons(lessons, 'reprocessing-auto-stop-wait').next?.slug).toBe(
      'reprocessing-historical-parallel',
    )

    const text = JSON.stringify(content)
    expect(text).toContain('依赖串行')
    expect(text).toContain('全局并发数 1')
    // 文案明确禁止轮次机制；「generation」只允许出现在禁止性说明里。
    expect(text).toContain('不引入轮次')
    expect(text).not.toMatch(/Replay|第 \d+ 轮/i)
  })

  it('E4 静态渲染：历史模式默认展示日切门禁与平行计划控制', () => {
    const html = renderToStaticMarkup(
      <DependencyReprocessingLab
        visualization={{ kind: 'dependency-reprocessing', lessonFocus: 'current-vs-historical' }}
      />,
    )

    expect(html).toContain('data-reprocessing-mode="historical-parallel"')
    expect(html).toContain('data-panel="current-batch-gate"')
    expect(html).toContain('data-gate-status="blocked"')
    expect(html).toContain('尚未全部结束')
    expect(html).toContain('模拟当日跑批完成')
    expect(html).toContain('data-role="target-date"')
    expect(html.match(/<option/g)).toHaveLength(2)
    expect(html).toContain('2026-10-10')
    expect(html).toContain('2026-10-15')
    expect(html).toContain('最新程序 v3')
    expect(html).toContain('生成平行 Job / Plan')
    expect(html).toContain('14-5')
    // 初始尚未请求计划。
    expect(html).not.toContain('data-panel="parallel-plan"')
  })

  it('第 14 章 14-4 课程接线完整：metadata、内容、样式与相邻导航', () => {
    const lesson = getLessonBySlug('reprocessing-historical-parallel')

    expect(lesson).toMatchObject({
      id: 'lesson-14-4',
      slug: 'reprocessing-historical-parallel',
      chapter: '14',
      order: 400,
      difficulty: 'advanced',
      estimatedMinutes: 20,
      demo: 'dependency-reprocessing',
      title: '历史数据如何重做而不影响当天日切？',
    })

    const content = getLessonContent(lesson!)
    const visualizationSection = content.sections.find(
      (section) => section.kind === 'visualization',
    )
    expect(visualizationSection?.visualization).toEqual({
      kind: 'dependency-reprocessing',
      lessonFocus: 'current-vs-historical',
    })
    expect(getLessonStyleSheets(content)).toEqual(['dependency-reprocessing.css'])

    expect(getAdjacentLessons(lessons, 'reprocessing-historical-parallel').previous?.slug).toBe(
      'reprocessing-auto-stop-wait',
    )
    expect(getAdjacentLessons(lessons, 'reprocessing-historical-parallel').next).toBeUndefined()

    const text = JSON.stringify(content)
    expect(text).toContain('日切')
    expect(text).toContain('平行 Job / Plan')
    expect(text).toContain('business_date')
    expect(text).toContain('最新程序')
    expect(text).not.toMatch(/Replay|第 \d+ 轮/i)
  })
})
