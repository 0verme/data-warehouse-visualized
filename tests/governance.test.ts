import { describe, expect, it } from 'vitest'
import {
  dataGovernanceContent,
  governanceVisualization,
} from '../src/content/lessons/data-governance'
import { getLessonBySlug } from '../src/data/course'
import type { GovernanceAsset } from '../src/types'
import {
  applyGovernanceEvent,
  createGovernanceDecisionRecord,
  DEFAULT_GOVERNANCE_FILTERS,
  evaluateGovernancePolicy,
  filterGovernanceAssets,
  getAssetLineageImpact,
  getGovernanceLineageImpact,
  getGovernanceRecommendation,
} from '../src/utils/governance'

const { assets, events, lineageEdges, lineageNodes } = governanceVisualization

function getAsset(id: string): GovernanceAsset {
  const asset = assets.find((candidate) => candidate.id === id)
  if (!asset) {
    throw new Error(`Unknown governance asset: ${id}`)
  }

  return asset
}

function getEvent(id: string) {
  const event = events.find((candidate) => candidate.id === id)
  if (!event) {
    throw new Error(`Unknown governance event: ${id}`)
  }

  return event
}

describe('数据治理 Phase 1', () => {
  it('课程入口注册治理工作台，并明确质量证据仍在等待接入', () => {
    expect(getLessonBySlug('data-governance')).toMatchObject({
      title: '数据治理：当数据平台开始失控',
      chapter: '09',
      demo: 'governance',
    })
    expect(dataGovernanceContent.sections.some((section) => section.kind === 'visualization')).toBe(
      true,
    )
    expect(assets).toHaveLength(6)
    expect(assets.every((asset) => asset.qualityEvidence?.status === 'pending-integration')).toBe(
      true,
    )
    expect(assets.some((asset) => asset.qualityEvidence?.note.includes('不把未知显示为通过'))).toBe(
      true,
    )
  })

  it('按业务关键词、技术名、tag 和治理筛选目录', () => {
    const salesAssets = filterGovernanceAssets(assets, {
      ...DEFAULT_GOVERNANCE_FILTERS,
      query: '销售',
    })
    expect(salesAssets.map((asset) => asset.id)).toEqual([
      'dwd-order-detail',
      'dws-sales',
      'ads-report',
      'dws-user',
      'ads-sales-report-v1',
    ])

    expect(
      filterGovernanceAssets(assets, { ...DEFAULT_GOVERNANCE_FILTERS, query: 'DWS.SALES' }),
    ).toEqual([getAsset('dws-sales')])
    expect(
      filterGovernanceAssets(assets, { ...DEFAULT_GOVERNANCE_FILTERS, tag: 'deprecated' }).map(
        (asset) => asset.id,
      ),
    ).toEqual(['ads-sales-report-v1'])
    expect(
      filterGovernanceAssets(assets, {
        ...DEFAULT_GOVERNANCE_FILTERS,
        lifecycle: 'deprecated',
      }).map((asset) => asset.id),
    ).toEqual(['ads-sales-report-v1'])
    expect(
      filterGovernanceAssets(assets, {
        ...DEFAULT_GOVERNANCE_FILTERS,
        sensitivity: 'restricted',
      }).map((asset) => asset.id),
    ).toEqual(['dws-user'])
    expect(
      filterGovernanceAssets(assets, {
        ...DEFAULT_GOVERNANCE_FILTERS,
        ownerStatus: 'missing',
      }).map((asset) => asset.id),
    ).toEqual(['dws-user'])
  })

  it('用可解释因素判断推荐程度，而不是返回黑盒分数', () => {
    const recommended = getGovernanceRecommendation(getAsset('dws-sales'))
    const cautious = getGovernanceRecommendation(getAsset('ads-report'))
    const ambiguous = getGovernanceRecommendation(getAsset('dws-user'))
    const deprecated = getGovernanceRecommendation(getAsset('ads-sales-report-v1'))

    expect(recommended.status).toBe('recommended')
    expect(recommended.factors.map((factor) => factor.label)).toEqual([
      'definition completeness',
      'owner availability',
      'lifecycle',
      'sensitivity',
      'lineage evidence',
      'freshness metadata',
    ])
    expect(cautious.status).toBe('usable-with-caution')
    expect(ambiguous.status).toBe('not-recommended')
    expect(ambiguous.reasons.join(' ')).toContain('Owner 缺失')
    expect(ambiguous.reasons.join(' ')).toContain('含糊')
    expect(deprecated.status).toBe('not-recommended')
    expect(deprecated.reasons.join(' ')).toContain('deprecated')
  })

  it('同一敏感字段会随角色和用途得到不同的 policy decision', () => {
    const asset = getAsset('dwd-order-detail')
    const analyst = evaluateGovernancePolicy({
      asset,
      fieldName: 'user_email',
      role: 'analyst',
      purpose: 'business-analysis',
    })
    const analystExport = evaluateGovernancePolicy({
      asset,
      fieldName: 'user_email',
      role: 'analyst',
      purpose: 'data-export',
    })
    const marketing = evaluateGovernancePolicy({
      asset,
      fieldName: 'user_email',
      role: 'marketing',
      purpose: 'user-outreach',
    })
    const external = evaluateGovernancePolicy({
      asset,
      fieldName: 'user_email',
      role: 'external-collaborator',
      purpose: 'external-sharing',
    })

    expect(analyst.decision).toBe('masked')
    expect(analystExport.decision).toBe('approval-required')
    expect(marketing.decision).toBe('approval-required')
    expect(external.decision).toBe('deny')
    expect(
      new Set([analyst.decision, analystExport.decision, marketing.decision, external.decision]),
    ).toHaveLength(3)
    expect(analyst.reason).toContain('脱敏')
    expect(analyst.evidence).toEqual(expect.arrayContaining([expect.stringContaining('字段定义')]))
    expect(analyst.policyFactors).toHaveLength(5)
    expect(analyst.remainingRisk).toContain('质量证据尚未接入')
  })

  it('对 restricted 字段和可直接读取的内部字段分别处理 allow、masked、approval、deny', () => {
    const asset = getAsset('dws-user')
    expect(
      evaluateGovernancePolicy({
        asset,
        fieldName: 'user_phone',
        role: 'analyst',
        purpose: 'business-analysis',
      }).decision,
    ).toBe('masked')
    expect(
      evaluateGovernancePolicy({
        asset,
        fieldName: 'user_phone',
        role: 'marketing',
        purpose: 'user-outreach',
      }).decision,
    ).toBe('approval-required')
    expect(
      evaluateGovernancePolicy({
        asset,
        fieldName: 'user_phone',
        role: 'external-collaborator',
        purpose: 'business-analysis',
      }).decision,
    ).toBe('deny')

    const allow = evaluateGovernancePolicy({
      asset: getAsset('dws-sales'),
      fieldName: 'pay_gmv',
      role: 'analyst',
      purpose: 'business-analysis',
    })
    expect(allow.decision).toBe('allow')
  })

  it('支持 active → deprecated、deprecated → retiring 和字段 semantic change', () => {
    const deprecateEvent = getEvent('governance-ads-report-deprecated')
    const deprecated = applyGovernanceEvent(getAsset('ads-report'), deprecateEvent)
    expect(deprecated.changed).toBe(true)
    expect(deprecated.asset.lifecycle).toBe('deprecated')

    const retireEvent = getEvent('governance-legacy-retiring')
    const retiring = applyGovernanceEvent(getAsset('ads-sales-report-v1'), retireEvent)
    expect(retiring.changed).toBe(true)
    expect(retiring.asset.lifecycle).toBe('retiring')

    const fieldChange = applyGovernanceEvent(
      getAsset('dwd-order-detail'),
      getEvent('governance-order-status-semantic-change'),
    )
    const changedField = fieldChange.asset.fields.find((field) => field.name === 'order_state')
    expect(fieldChange.changed).toBe(true)
    expect(fieldChange.asset.definitionCompleteness).toBe('partial')
    expect(changedField).toMatchObject({ semanticStatus: 'review-needed' })
    expect(changedField?.description).toContain('语义变更待确认')

    const invalidTransition = applyGovernanceEvent(getAsset('ads-report'), retireEvent)
    expect(invalidTransition.changed).toBe(false)
    expect(invalidTransition.asset.lifecycle).toBe('active')
  })

  it('消费同一套 LineageGraph，区分直接影响、传递影响、消费者和通知顺序', () => {
    const fieldEvent = getEvent('governance-order-status-semantic-change')
    const impact = getGovernanceLineageImpact(assets, lineageNodes, lineageEdges, fieldEvent)

    expect(impact.source?.id).toBe('field-dwd-order-status')
    expect(impact.directImpacts.map((node) => node.id)).toContain('task-build-order-detail')
    expect(impact.transitiveImpacts.map((node) => node.id)).toContain('dws-sales')
    expect(impact.consumers.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        'dwd-order-detail',
        'dws-sales',
        'dws-user',
        'metric-sales-status-rate',
      ]),
    )
    expect(impact.notificationTargets.length).toBe(impact.suggestedOrder.length)
    expect(impact.notificationTargets[0]?.priority).toBe('first')
    expect(
      impact.notificationTargets.some((target) => target.recipient.includes('Owner 待补齐')),
    ).toBe(true)

    const assetImpact = getAssetLineageImpact(
      getAsset('dwd-order-detail'),
      assets,
      lineageNodes,
      lineageEdges,
    )
    expect(assetImpact.directImpacts.map((node) => node.id)).toEqual(['dws-sales', 'dws-user'])
    expect(assetImpact.transitiveImpacts.map((node) => node.id)).toContain('ads-report')
  })

  it('同样的目录、事件和请求始终得到相同结果，并能生成决策记录', () => {
    const asset = getAsset('dwd-order-detail')
    const field = asset.fields.find((candidate) => candidate.name === 'user_email')
    if (!field) {
      throw new Error('governance test needs user_email')
    }

    const recommendation = getGovernanceRecommendation(asset)
    const policyDecision = evaluateGovernancePolicy({
      asset,
      fieldName: field.name,
      role: 'analyst',
      purpose: 'business-analysis',
    })
    const event = getEvent('governance-order-status-semantic-change')
    const impact = getGovernanceLineageImpact(assets, lineageNodes, lineageEdges, event)
    const record = createGovernanceDecisionRecord({
      asset,
      field,
      recommendation,
      policyDecision,
      impact,
      event,
    })

    expect(
      evaluateGovernancePolicy({
        asset,
        fieldName: field.name,
        role: 'analyst',
        purpose: 'business-analysis',
      }),
    ).toEqual(policyDecision)
    expect(getGovernanceLineageImpact(assets, lineageNodes, lineageEdges, event)).toEqual(impact)
    expect(record).toMatchObject({
      id: 'governance-decision-dwd-order-detail-user_email-analyst-business-analysis',
      selectedAssetName: 'DWD 订单明细',
      accessDecision: 'masked',
      impactEventId: event.id,
    })
    expect(record.notifications.length).toBeGreaterThan(0)
    expect(record.remainingRisks.join(' ')).toContain('质量证据尚未接入')
  })
})
