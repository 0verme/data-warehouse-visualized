import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LessonSectionRenderer } from '../src/components/lesson/LessonSectionRenderer'
import { getLessonContent } from '../src/content/lessons'
import { getLessonBySlug } from '../src/data/course'

function renderLesson(slug: string): string {
  const lesson = getLessonBySlug(slug)

  if (!lesson) {
    throw new Error(`Unknown lesson: ${slug}`)
  }

  const content = getLessonContent(lesson)
  return renderToStaticMarkup(<LessonSectionRenderer lesson={lesson} sections={content.sections} />)
}

describe('认识数据仓库第一章交互', () => {
  it('把核心系统和信贷系统的存贷比案例交给跨系统可视化', () => {
    const markup = renderLesson('why-data-warehouse')

    expect(markup).toContain('跨系统汇聚实验')
    expect(markup).toContain('核心系统')
    expect(markup).toContain('信贷系统')
    expect(markup).toContain('存款余额 · 120 亿')
    expect(markup).toContain('贷款余额 · 90 亿')
    expect(markup).toContain('90 亿 ÷ 120 亿 = 75%')
  })

  it('渲染分层职责演变和报表数字链路两个新实验', () => {
    const layersMarkup = renderLesson('warehouse-layers')
    const journeyMarkup = renderLesson('report-metric-journey')

    expect(layersMarkup).toContain('分层职责演变图')
    expect(layersMarkup).toContain('公共加工')
    expect(layersMarkup).toContain('同一套规则，被复制 1 次')

    expect(journeyMarkup).toContain('报表数字的数据旅程')
    expect(journeyMarkup).toContain('贷款余额 ÷ 存款余额')
    expect(journeyMarkup).toContain('杭州分行：75%')
    expect(journeyMarkup).toContain('aria-label="杭州分行存贷比的产生步骤"')
  })

  it('按解决问题、中文含义、英文全称的顺序呈现术语卡', () => {
    const markup = renderLesson('warehouse-terms')

    expect(markup).toContain('术语翻译台')
    expect(markup).toContain('解决什么问题')
    expect(markup).toContain('中文含义')
    expect(markup).toContain('英文全称')
    expect(markup).toContain('Online Transaction Processing')
    const cardStart = markup.indexOf('warehouse-terms__term-card')
    const firstTermCard = markup.slice(cardStart, markup.indexOf('</article>', cardStart))
    expect(firstTermCard.indexOf('解决什么问题')).toBeLessThan(firstTermCard.indexOf('中文含义'))
    expect(firstTermCard.indexOf('中文含义')).toBeLessThan(firstTermCard.indexOf('英文全称'))
  })
})
