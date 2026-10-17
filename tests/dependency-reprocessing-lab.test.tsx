import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DependencyReprocessingLab } from '../src/components/visualizations/DependencyReprocessingLab'
import { getLessonContent } from '../src/content/lessons'
import { getLessonBySlug, lessons } from '../src/data/course'
import {
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
        visualization={{ kind: 'dependency-reprocessing', lessonFocus: 'impact-scope' }}
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
    expect(getAdjacentLessons(lessons, 'reprocessing-incident-timeline').next).toBeUndefined()
  })

  it('文案遵守专题边界：使用重做语义，不引入轮次 / generation', () => {
    const content = getLessonContent(getLessonBySlug('reprocessing-incident-timeline')!)
    const text = JSON.stringify(content)

    expect(text).toContain('依赖链重做（Reprocessing）')
    expect(text).toContain('SUCCESS')
    expect(text).not.toMatch(/generation|Replay|第 \d+ 轮/i)
  })
})
