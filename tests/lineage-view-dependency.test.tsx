import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LineageTeachingLab } from '../src/components/visualizations/LineageTeachingLab'
import { dataLineageContent } from '../src/content/lessons/data-lineage'

function getViewDependencyTeaching() {
  const section = dataLineageContent.sections.find(
    (candidate) =>
      candidate.kind === 'visualization' &&
      candidate.visualization.kind === 'lineage' &&
      candidate.visualization.teaching.mode === 'view-dependency',
  )

  if (section?.kind !== 'visualization' || section.visualization.kind !== 'lineage') {
    throw new Error('7-1 页面缺少 View dependency 教学实验')
  }

  return section.visualization
}

describe('7-1 View SQL lineage 与 scheduler dependency', () => {
  it('在现有 overview 后增加独立 View 案例，不替换表级血缘教学', () => {
    const visualizations = dataLineageContent.sections.filter(
      (section) => section.kind === 'visualization',
    )

    expect(
      visualizations.map((section) =>
        section.kind === 'visualization' && section.visualization.kind === 'lineage'
          ? section.visualization.teaching.mode
          : undefined,
      ),
    ).toEqual(['overview', 'view-dependency'])
    expect(dataLineageContent.pitfalls?.join(' ')).toContain('数据库 View 是正常能力')
    expect(dataLineageContent.pitfalls?.join(' ')).toContain('所有 SQL 上游都必须成为调度依赖')
  })

  it('首屏分开呈现显式任务等待与被折叠的 SQL 来源', () => {
    const visualization = getViewDependencyTeaching()
    const markup = renderToStaticMarkup(
      <LineageTeachingLab
        nodes={visualization.nodes}
        edges={visualization.edges}
        teaching={visualization.teaching}
      />,
    )

    expect(markup).toContain('Scheduler Dependency ≠ SQL Lineage')
    expect(markup).toContain('JOB_A')
    expect(markup).toContain('REPORT_JOB')
    expect(markup).toContain('depends_on')
    expect(markup).toContain('Customer')
    expect(markup).toContain('Account')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('展开真实依赖')
    expect(markup).toMatch(/<li[^>]*data-view-sql-upstream="true"[^>]*hidden="">/)
    const hiddenSqlSources = markup.match(
      /<li[^>]*data-view-sql-upstream="true"[^>]*>.*?<\/li>/,
    )?.[0]
    expect(hiddenSqlSources?.match(/data-node-type="表"/g)).toHaveLength(2)
    expect(hiddenSqlSources).toContain('Customer')
    expect(hiddenSqlSources).toContain('Account')
    expect(markup).toContain('SQL lineage 回答“查询读取了什么”')
    expect(markup).toContain('不对 View 性能作结论')
  })
})
