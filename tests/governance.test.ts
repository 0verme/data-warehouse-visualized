import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  dataGovernanceContent,
  governanceChangeResponsibilityContent,
  governanceChangeResponsibilityVisualization,
  governanceEvidenceContent,
  governanceEvidenceVisualization,
  governanceFieldAccessContent,
  governanceFieldAccessVisualization,
  governanceLifecycleContent,
  governanceLifecycleVisualization,
  governanceVisualization,
} from '../src/content/lessons/data-governance'
import { getLessonBySlug, lessons } from '../src/data/course'
import type { GovernanceAsset } from '../src/types'
import { GovernanceWorkbench } from '../src/components/visualizations/GovernanceWorkbench'
import {
  applyGovernanceEvent,
  DEFAULT_GOVERNANCE_FILTERS,
  filterGovernanceAssets,
  getGovernanceEvidenceDecision,
  getGovernanceFieldAccess,
  getGovernanceLineageImpact,
  getGovernanceRecommendation,
  getReplacementAsset,
  maskGovernanceValue,
} from '../src/utils/governance'

const { assets, events, lineageEdges, lineageNodes } = governanceVisualization

function getAsset(id: string): GovernanceAsset {
  const asset = assets.find((candidate) => candidate.id === id)
  if (!asset) {
    throw new Error(`Unknown governance asset: ${id}`)
  }

  return asset
}

describe('第 09 章数据治理判断链', () => {
  it('课程注册为五节连续的 Banking Teaching Domain 课程', () => {
    const chapterLessons = lessons.filter((lesson) => lesson.chapter === '09')

    expect(chapterLessons.map((lesson) => lesson.slug)).toEqual([
      'data-governance',
      'data-governance-evidence',
      'data-governance-field-access',
      'data-governance-lifecycle',
      'data-governance-change-responsibility',
    ])
    expect(chapterLessons.map((lesson) => lesson.title)).toEqual([
      '搜到三张“存款余额”，我到底该用哪张？',
      '找对了资产，今天这份数据真的能用吗？',
      '这张表能用，里面的字段都能直接用吗？',
      '旧表还能查到，为什么不应该继续用了？',
      '字段变了以后，谁需要处理？',
    ])
    expect(chapterLessons.every((lesson) => lesson.demo === 'governance')).toBe(true)
    expect(getLessonBySlug('data-governance-change-responsibility')?.order).toBe(500)
  })

  it('五节课程各自绑定不同的治理教学动作', () => {
    expect(
      [
        dataGovernanceContent,
        governanceEvidenceContent,
        governanceFieldAccessContent,
        governanceLifecycleContent,
        governanceChangeResponsibilityContent,
      ].map(
        (content) =>
          content.sections.find((section) => section.kind === 'visualization')?.visualization,
      ),
    ).toEqual([
      expect.objectContaining({ kind: 'governance', focus: 'asset-selection' }),
      expect.objectContaining({ kind: 'governance', focus: 'evidence-check' }),
      expect.objectContaining({ kind: 'governance', focus: 'field-access' }),
      expect.objectContaining({ kind: 'governance', focus: 'lifecycle' }),
      expect.objectContaining({ kind: 'governance', focus: 'change-responsibility' }),
    ])
  })

  it('资产目录统一使用存款余额和 Banking Teaching Domain 对象', () => {
    expect(assets.map((asset) => asset.id)).toEqual([
      'dwd-account-balance-detail',
      'dws-deposit-balance-daily',
      'ads-deposit-balance',
      'ads-deposit-balance-old',
    ])
    expect(
      filterGovernanceAssets(assets, { ...DEFAULT_GOVERNANCE_FILTERS, query: '存款余额' }).map(
        (asset) => asset.id,
      ),
    ).toEqual([
      'dwd-account-balance-detail',
      'dws-deposit-balance-daily',
      'ads-deposit-balance',
      'ads-deposit-balance-old',
    ])
    expect(
      filterGovernanceAssets(assets, {
        ...DEFAULT_GOVERNANCE_FILTERS,
        query: 'dws_deposit_balance_daily',
      }),
    ).toEqual([getAsset('dws-deposit-balance-daily')])
    expect(getAsset('dws-deposit-balance-daily').businessDefinition).toMatchObject({
      grain: 'Branch × Product × business_date',
    })
    expect(getAsset('dwd-account-balance-detail').fields.map((field) => field.name)).toEqual([
      'business_date',
      'branch_id',
      'product_type',
      'deposit_balance',
      'customer_name',
      'mobile',
      'account_no',
    ])
  })

  it('用定义和 Grain 选择当前经营分析真正需要的资产', () => {
    const dwd = getAsset('dwd-account-balance-detail')
    const dws = getAsset('dws-deposit-balance-daily')
    const ads = getAsset('ads-deposit-balance')

    expect(dwd.businessDefinition.exclusions).toContain('机构汇总')
    expect(dws.businessDefinition.grain).toBe('Branch × Product × business_date')
    expect(ads.businessDefinition.exclusions).toContain('通用明细来源')
    expect(getGovernanceRecommendation(dws).status).toBe('recommended')
  })

  it('Quality 和 Freshness 输出结论、证据和原因，不使用综合分数', () => {
    const cases = governanceEvidenceVisualization.qualityCases ?? []
    const decisions = cases.map(getGovernanceEvidenceDecision)

    expect(decisions.map((decision) => decision.headline)).toEqual([
      '建议使用',
      '暂不建议使用',
      '暂不建议使用',
    ])
    expect(decisions[0]).toMatchObject({
      status: 'recommended',
      evidence: expect.arrayContaining(['✓ Quality 已确认', '✓ Freshness 满足昨天业务日分析']),
    })
    expect(decisions[1]?.reason).toContain('7 天前')
    expect(decisions[2]?.reason).toContain('UNKNOWN')
    expect(JSON.stringify(governanceEvidenceContent)).not.toContain('治理评分')
    expect(JSON.stringify(governanceEvidenceContent)).not.toContain('可信度 91%')
  })

  it('角色与用途只决定字段级三类使用结果', () => {
    const asset = getAsset('dwd-account-balance-detail')
    const fields = new Map(asset.fields.map((field) => [field.name, field]))
    const direct = getGovernanceFieldAccess({
      field: fields.get('deposit_balance')!,
      purpose: 'business-analysis',
    })
    const masked = getGovernanceFieldAccess({
      field: fields.get('account_no')!,
      purpose: 'business-analysis',
    })
    const unavailable = getGovernanceFieldAccess({
      field: fields.get('customer_name')!,
      purpose: 'business-analysis',
    })
    const customerService = getGovernanceFieldAccess({
      field: fields.get('customer_name')!,
      purpose: 'customer-service',
    })

    expect(direct.outcome).toBe('direct')
    expect(masked).toMatchObject({
      outcome: 'masked',
      label: '处理后可以使用',
      value: '6222 **** **** 9012',
    })
    expect(unavailable.outcome).toBe('unavailable')
    expect(customerService.outcome).toBe('direct')
    expect(maskGovernanceValue('6222 1234 5678 9012')).toBe('6222 **** **** 9012')
    expect(JSON.stringify(governanceFieldAccessContent)).not.toContain(
      'Role × Purpose × Sensitivity',
    )
  })

  it('deprecated 资产保留可访问性，但必须指向替代资产', () => {
    const oldAsset = getAsset('ads-deposit-balance-old')
    const replacement = getReplacementAsset(oldAsset, assets)

    expect(oldAsset.lifecycle).toBe('deprecated')
    expect(replacement?.id).toBe('ads-deposit-balance')
    expect(getGovernanceRecommendation(oldAsset).status).toBe('not-recommended')

    const event = {
      ...events[0],
      id: 'deprecate-old-deposit-balance',
      assetId: oldAsset.id,
      eventType: 'asset-deprecated' as const,
    }
    expect(applyGovernanceEvent(getAsset('ads-deposit-balance'), event).asset.lifecycle).toBe(
      'deprecated',
    )
    expect(JSON.stringify(governanceLifecycleContent)).not.toContain('draft')
    expect(JSON.stringify(governanceLifecycleContent)).not.toContain('archived')
  })

  it('8-5 直接消费 Account.product_type 的已有影响结果并映射 Owner', () => {
    const impact = governanceChangeResponsibilityVisualization.changeImpact!
    const responsibilityLabels = impact.responsibilities.map((item) => item.label)

    expect(impact.evidenceLabel).toContain('第 07 章')
    expect(impact.changedField).toBe('Account.product_type')
    expect(impact.path).toEqual([
      'Account.product_type',
      'dwd_account_balance_detail',
      'dws_deposit_balance_daily',
      'ads_deposit_balance',
      '存款产品结构分析',
    ])
    expect(responsibilityLabels).toEqual([
      'Account.product_type',
      'dwd_account_balance_detail',
      'dws_deposit_balance_daily',
      'ads_deposit_balance',
      '存款产品结构分析',
    ])
    expect(impact.responsibilities.every((item) => item.owner && item.action)).toBe(true)
    expect(
      governanceChangeResponsibilityContent.sections.map((section) => section.kind ?? 'narrative'),
    ).toContain('visualization')
    expect(JSON.stringify(governanceChangeResponsibilityContent)).not.toContain('Workflow Engine')
  })

  it('五种可视化分别呈现选择、证据、字段、生命周期和责任动作', () => {
    const views = [
      governanceVisualization,
      governanceEvidenceVisualization,
      governanceFieldAccessVisualization,
      governanceLifecycleVisualization,
      governanceChangeResponsibilityVisualization,
    ].map((visualization) =>
      renderToStaticMarkup(createElement(GovernanceWorkbench, { visualization })),
    )

    expect(views[0]).toContain('dws_deposit_balance_daily')
    expect(views[1]).toContain('Quality + Freshness')
    expect(views[1]).toContain('资产 A')
    expect(views[2]).toContain('AccountMedium.account_no')
    expect(views[3]).toContain('deprecated')
    expect(views[3]).toContain('切换到替代资产')
    expect(views[4]).toContain('变更责任清单')
    expect(views[4]).toContain('Owner：存款指标组')
  })

  it('通用血缘工具可以读取前置影响图，但第 09 章使用静态影响结果', () => {
    const event = events[0]
    const impact = getGovernanceLineageImpact(assets, lineageNodes, lineageEdges, event)

    expect(impact.source?.id).toBe('field-account-product-type')
    expect(impact.directImpacts.map((object) => object.id)).toEqual(['dwd-account-balance-detail'])
    expect(impact.consumers.map((object) => object.id)).toEqual([
      'dwd-account-balance-detail',
      'dws-deposit-balance-daily',
      'ads-deposit-balance',
      'metric-deposit-product-mix',
    ])
    expect(impact.riskReason).toContain('不重新遍历血缘')
  })
})
