import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LessonSectionRenderer } from '../src/components/lesson/LessonSectionRenderer'
import {
  BusinessSystemFlow,
  getConnectorState,
  getOutputState,
  getPhaseState,
  getWarehouseState,
} from '../src/components/visualizations/BusinessSystemFlow'
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

describe('BusinessSystemFlow Pilot A 语义', () => {
  it('为 Source、Processing / Warehouse、Consumer / Output 和两类连接保留稳定语义', () => {
    const markup = renderToStaticMarkup(
      <BusinessSystemFlow
        systems={[
          { id: 'core', name: '核心系统', detail: '存款余额', volume: '120 亿' },
          { id: 'credit', name: '信贷系统', detail: '贷款余额', volume: '90 亿' },
        ]}
        warehouseLabel="经营分析仓"
        outputs={[{ name: '经营报表', detail: '存贷比 75%' }]}
      />,
    )

    expect(markup).toContain('data-diagram-type="flow"')
    expect(markup).toContain('data-node-role="source"')
    expect(markup).toContain('data-node-role="processing"')
    expect(markup).toContain('data-node-role="consumer"')
    expect(markup).toContain('data-relation="data-transform"')
    expect(markup).toContain('data-relation="delivery-publish-consume"')
    expect(markup).toContain('data-from="source" data-to="processing"')
    expect(markup).toContain('data-from="processing" data-to="consumer"')
    expect(markup).toContain('aria-label="Source 到 Warehouse 的数据 / 加工关系，尚未开始"')
    expect(markup).toContain('data-state="inactive"')
    expect(markup).toContain('data-focus="primary"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('当前查看')
    expect(markup).toContain('等待汇集')
    expect(markup).toContain('等待数据')
    expect(markup).toContain('等待发布')
  })

  it('把播放阶段映射为独立的节点状态和连接状态', () => {
    expect(getPhaseState(0)).toBe('waiting')
    expect(getPhaseState(1)).toBe('collecting')
    expect(getPhaseState(2)).toBe('processing')
    expect(getPhaseState(3)).toBe('ready')

    expect(getConnectorState('data-transform', 0)).toBe('inactive')
    expect(getConnectorState('data-transform', 1)).toBe('current')
    expect(getConnectorState('data-transform', 2)).toBe('completed')
    expect(getConnectorState('delivery-publish-consume', 1)).toBe('inactive')
    expect(getConnectorState('delivery-publish-consume', 2)).toBe('current')
    expect(getConnectorState('delivery-publish-consume', 3)).toBe('completed')

    expect(getWarehouseState(2)).toBe('processing')
    expect(getWarehouseState(3)).toBe('ready')
    expect(getOutputState(2)).toBe('waiting')
    expect(getOutputState(3)).toBe('ready')
  })
})

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

    expect(layersMarkup).toContain('分层职责与生产演进')
    expect(layersMarkup).toContain('aria-label="架构演进阶段"')
    expect(layersMarkup).toContain('多年叠加')
    expect(layersMarkup).toContain('渐进治理')
    expect(layersMarkup).toContain('公共加工')
    expect(layersMarkup).toContain('多个下游')
    expect(layersMarkup).toContain('管理驾驶舱')
    expect(layersMarkup).toContain('团队治理选择')
    expect(layersMarkup).toContain('固定层数')

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
