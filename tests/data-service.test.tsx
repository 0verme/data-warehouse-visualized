import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DataServiceWorkbench } from '../src/components/visualizations/DataServiceWorkbench'
import { lessons } from '../src/data/course'
import { normalizeProgress } from '../src/utils/progress'
import {
  createDataServiceVisualization,
  dataServiceDecisionScenarios,
  dataServicePublishedBalances,
  getDataServiceApiResponse,
  getDataServiceChoiceResult,
  getDataServiceConsumerLabel,
  getDataServiceFileState,
} from '../src/features/data-service/banking'

function renderMode(mode: Parameters<typeof createDataServiceVisualization>[0]): string {
  return renderToStaticMarkup(
    <DataServiceWorkbench visualization={createDataServiceVisualization(mode)} />,
  )
}

describe('数据服务交付逻辑', () => {
  it('复用已发布的 2026-09-30 存款余额并按机构提供 API 响应', () => {
    const targetRows = dataServicePublishedBalances.filter(
      (row) => row.businessDate === '2026-09-30',
    )

    expect(dataServicePublishedBalances).toHaveLength(6)
    expect(targetRows).toHaveLength(3)
    expect(targetRows.every((row) => row.businessDate === '2026-09-30')).toBe(true)

    expect(getDataServiceApiResponse(dataServicePublishedBalances, 'HZ01', '2026-09-30')).toEqual({
      branch_id: 'HZ01',
      business_date: '2026-09-30',
      deposit_balance: 12_000_000_000,
      currency: 'CNY',
    })
    expect(getDataServiceApiResponse(dataServicePublishedBalances, 'UNKNOWN', '2026-09-30')).toBe(
      undefined,
    )
  })

  it('只有同批 FLAG 出现后才允许下游消费', () => {
    expect(getDataServiceFileState('txt')).toEqual({
      dataFileVisible: true,
      flagFileVisible: false,
      canConsume: false,
      status: 'in-progress',
      statusLabel: 'TXT 已出现，但文件仍可能在写入，暂时不能消费。',
    })
    expect(getDataServiceFileState('complete')).toEqual({
      dataFileVisible: true,
      flagFileVisible: true,
      canConsume: true,
      status: 'ready',
      statusLabel: 'FLAG 已出现，这批数据可以消费。',
    })
  })

  it('保留原 data-service lesson id 的学习进度', () => {
    const normalized = normalizeProgress(
      {
        completedLessonIds: ['lesson-data-service', 'lesson-data-service-report', 'unknown'],
        currentLessonId: 'lesson-data-service',
      },
      lessons.map((lesson) => lesson.id),
      'lesson-data-service',
      true,
    )

    expect(normalized).toEqual({
      completedLessonIds: ['lesson-data-service', 'lesson-data-service-report'],
      currentLessonId: 'lesson-data-service',
    })
  })

  it('为三种消费需求返回匹配的交付方式和解释', () => {
    expect(dataServiceDecisionScenarios).toHaveLength(3)

    for (const scenario of dataServiceDecisionScenarios) {
      const correct = getDataServiceChoiceResult(scenario, scenario.recommendedConsumer)
      const incorrectConsumer = scenario.recommendedConsumer === 'report' ? 'api' : 'report'
      const incorrect = getDataServiceChoiceResult(scenario, incorrectConsumer)

      expect(correct).toEqual({
        isCorrect: true,
        label: getDataServiceConsumerLabel(scenario.recommendedConsumer),
        explanation: scenario.reason,
      })
      expect(incorrect.isCorrect).toBe(false)
      expect(incorrect.label).toBe(getDataServiceConsumerLabel(scenario.recommendedConsumer))
      expect(incorrect.explanation).toContain(scenario.reason)
    }
  })
})

describe('数据服务交互工作台 SSR', () => {
  it.each([
    ['overview', '普通业务系统不直接连接数仓'],
    ['report', '固定报表'],
    ['file', 'deposit_balance_20260930.flag'],
    ['api', 'API ≠ 实时数据'],
    ['decision', '典型模式对照'],
  ] as const)('渲染 %s 模式的教学入口', (mode, expectedText) => {
    const markup = renderMode(mode)

    expect(markup).toContain(`data-service-workbench--${mode}`)
    expect(markup).toContain('ads_deposit_balance_daily')
    expect(markup).toContain(expectedText)
  })
})
