import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lessonContentBySlug } from '../src/content/lessons'
import { lessons } from '../src/data/course'
import {
  ensureLessonStyles,
  getLessonStyleSheets,
  getVisualizationStyleSheets,
  learnSharedStyleUrls,
  visualizationStyleSheets,
  type LessonVisualizationKind,
} from '../src/utils/lesson-styles'

const stylesDir = join(import.meta.dirname, '../src/styles')
const visualizationsDir = join(import.meta.dirname, '../src/components/visualizations')

function lessonStyleSheets(slug: string): string[] {
  const content = lessonContentBySlug[slug]
  expect(content, `缺少课程内容: ${slug}`).toBeDefined()
  return getLessonStyleSheets(content)
}

describe('课程 CSS ownership', () => {
  it('learn-shared 只包含学习页公共样式', () => {
    expect(learnSharedStyleUrls).toHaveLength(3)
  })

  it('每个现行课程的 visualization kind 都有明确 CSS 归属', () => {
    for (const lesson of lessons) {
      const content = lessonContentBySlug[lesson.slug]
      expect(content, lesson.slug).toBeDefined()
      for (const section of content.sections) {
        if (section.kind === 'visualization') {
          const sheets = getVisualizationStyleSheets(section.visualization.kind)
          expect(sheets, `${lesson.slug} -> ${section.visualization.kind}`).toBeDefined()
        }
      }
    }
  })

  it('代表课程只加载自己需要的 lesson CSS', () => {
    expect(lessonStyleSheets('why-data-warehouse')).toEqual([])
    expect(lessonStyleSheets('sql-transformation-join')).toEqual(['join-fanout.css'])
    expect(lessonStyleSheets('warehouse-terms')).toEqual(['warehouse-intro.css'])
    expect(lessonStyleSheets('scheduling-system')).toEqual(['scheduler.css'])
    expect(lessonStyleSheets('data-quality')).toEqual(['data-quality.css'])
    expect(lessonStyleSheets('data-lineage')).toEqual(['lineage-teaching.css'])
    expect(lessonStyleSheets('lakehouse')).toEqual(['lakehouse.css'])
    expect(lessonStyleSheets('performance-and-practice')).toEqual(['performance.css'])
    expect(lessonStyleSheets('build-a-warehouse')).toEqual(['capstone.css', 'lineage.css'])
  })

  it('普通课程不会带上其它章节 / visualization CSS', () => {
    const unrelated = [
      'scheduler.css',
      'lineage.css',
      'lineage-teaching.css',
      'sql-workbench.css',
      'data-quality.css',
      'governance.css',
      'lakehouse.css',
      'performance.css',
      'capstone.css',
      'banking-modeling.css',
      'banking-metrics.css',
      'star-schema.css',
      'metric.css',
      'warehouse-intro.css',
    ]

    expect(lessonStyleSheets('why-data-warehouse')).toEqual(expect.not.arrayContaining(unrelated))
  })

  it('所有 lesson stylesheet 都有归属，不存在孤儿 CSS', () => {
    const referenced = new Set<string>()
    for (const sheets of Object.values(visualizationStyleSheets)) {
      for (const sheet of sheets) {
        referenced.add(sheet)
      }
    }

    const files = readdirSync(join(stylesDir, 'lessons')).filter((file) => file.endsWith('.css'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(referenced.has(file), `未被任何 visualization kind 引用: ${file}`).toBe(true)
    }
  })

  it('legacy lab kind 仍保留自己的 CSS 归属', () => {
    const legacyKinds: LessonVisualizationKind[] = ['star-schema', 'metric-definition']
    for (const kind of legacyKinds) {
      expect(getVisualizationStyleSheets(kind), kind).toBeDefined()
    }
  })

  it('visualization 组件不再直接 import lesson CSS（避免被 Astro 提升到所有页面）', () => {
    const files = readdirSync(visualizationsDir).filter((file) => file.endsWith('.tsx'))
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const source = readFileSync(join(visualizationsDir, file), 'utf8')
      expect(source, `${file} 不应直接 import CSS`).not.toMatch(/import\s+['"][^'"]*\.css['"]/)
    }
  })

  it('ensureLessonStyles 在服务端渲染时是 no-op', () => {
    expect(() => ensureLessonStyles(lessonContentBySlug['scheduling-system'])).not.toThrow()
  })
})
