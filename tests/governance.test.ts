import { describe, expect, it } from 'vitest'
import {
  dataGovernanceContent,
  governanceVisualization,
} from '../src/content/lessons/data-governance'
import { getLessonBySlug } from '../src/data/course'
import {
  qualityEventToGovernanceEvidence,
  qualityEvaluationToGovernanceEvidence,
} from '../src/features/governance/quality-adapter'
import { dataQualityVisualization } from '../src/content/lessons/data-quality'
import type { GovernanceAsset } from '../src/types'
import type { QualityInjection } from '../src/features/data-quality/types'
import { QUALITY_RULE_IDS, evaluateDataQuality } from '../src/utils/data-quality'
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

function getProjectedQualityEvidence(
  injection: QualityInjection,
  ruleId: string,
  action: 'block' | 'continue-with-risk' = 'block',
) {
  const evaluation = evaluateDataQuality(dataQualityVisualization, { injection, action })
  const rule = dataQualityVisualization.rules.find((candidate) => candidate.ruleId === ruleId)
  if (!rule) {
    throw new Error(`Unknown quality rule: ${ruleId}`)
  }

  return qualityEvaluationToGovernanceEvidence(evaluation, rule)
}

describe('数据治理 Phase 2', () => {
  it('QualityEvent 会被投影成可解释的治理质量证据，而不是复制质量领域模型', () => {
    const evaluation = evaluateDataQuality(dataQualityVisualization, {
      injection: 'missing-order-item',
      action: 'block',
    })
    const event = evaluation.events.find(
      (candidate) => candidate.ruleId === QUALITY_RULE_IDS.completeness,
    )
    if (!event) {
      throw new Error('测试需要真实 QualityEvent')
    }

    const evidence = qualityEventToGovernanceEvidence(event, 'DWD 明细完整性')

    expect(evidence).toMatchObject({
      source: 'chapter-07',
      status: 'fail',
      severity: 'high',
      eventId: event.eventId,
      ruleName: 'DWD 明细完整性',
      ruleId: QUALITY_RULE_IDS.completeness,
      target: event.target,
      expectedValue: 0,
      releaseDecision: {
        action: 'block',
        status: 'blocked',
        isBlocked: true,
        affectedOutputs: ['dws_sales_daily', 'ads_yesterday_sales'],
      },
    })
    expect(evidence.evidence[0]).toMatchObject({
      evidenceId: 'evidence.dq.dwd.order-item.completeness.v1',
      detail: '期望 5 行 DWD 明细，实际只有 4 行。',
      samples: [{ rowKey: 'O1002 / I1002-2 / 200' }],
    })
    expect(evidence.failedSampleCount).toBe(1)
    expect(evidence.remainingRisk).toContain('Release Decision')
  })

  it('课程入口注册治理工作台，并删除 Phase 1 的质量占位状态', () => {
    expect(getLessonBySlug('data-governance')).toMatchObject({
      title: '数据治理：当数据平台开始失控',
      chapter: '09',
      demo: 'governance',
    })
    expect(dataGovernanceContent.sections.some((section) => section.kind === 'visualization')).toBe(
      true,
    )
    expect(assets).toHaveLength(6)
    expect(
      assets.every(
        (asset) =>
          !asset.qualityEvidence || ['pass', 'warn', 'fail'].includes(asset.qualityEvidence.status),
      ),
    ).toBe(true)
    expect(getAsset('dwd-order-detail').qualityEvidence).toMatchObject({
      source: 'chapter-07',
      status: 'fail',
      ruleId: QUALITY_RULE_IDS.completeness,
      eventId: 'event.quality.dq.dwd.order-item.completeness.v1',
      releaseDecision: { action: 'block', status: 'blocked', isBlocked: true },
    })
    expect(getAsset('dws-sales').qualityEvidence).toMatchObject({
      source: 'chapter-07',
      status: 'pass',
      ruleId: QUALITY_RULE_IDS.reconciliation,
      releaseDecision: { action: 'block', status: 'released', isBlocked: false },
    })
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
      'quality evidence',
    ])
    expect(cautious.status).toBe('usable-with-caution')
    expect(ambiguous.status).toBe('not-recommended')
    expect(ambiguous.reasons.join(' ')).toContain('Owner 缺失')
    expect(ambiguous.reasons.join(' ')).toContain('含糊')
    expect(deprecated.status).toBe('not-recommended')
    expect(deprecated.reasons.join(' ')).toContain('deprecated')
  })

  it('Quality pass、warn、block 分别产生 recommended、usable-with-caution、not-recommended', () => {
    const pass = getGovernanceRecommendation(getAsset('dws-sales'))
    const warn = getGovernanceRecommendation({
      ...getAsset('dws-sales'),
      qualityEvidence: getProjectedQualityEvidence(
        'late-partition',
        QUALITY_RULE_IDS.freshness,
        'continue-with-risk',
      ),
    })
    const block = getGovernanceRecommendation(getAsset('dwd-order-detail'))

    expect(pass.status).toBe('recommended')
    expect(warn.status).toBe('usable-with-caution')
    expect(warn.reasons.join(' ')).toContain('warn')
    expect(block.status).toBe('not-recommended')
    expect(block.reasons.join(' ')).toContain('期望 5 行 DWD 明细')
  })

  it('Owner 缺失、定义含糊和 deprecated / retiring 仍会降低推荐程度', () => {
    const ownerMissing = getGovernanceRecommendation({
      ...getAsset('dws-sales'),
      owner: undefined,
    })
    const ambiguous = getGovernanceRecommendation(getAsset('dws-user'))
    const deprecated = getGovernanceRecommendation(getAsset('ads-sales-report-v1'))
    const retiring = getGovernanceRecommendation({
      ...getAsset('dws-sales'),
      lifecycle: 'retiring',
    })

    expect(ownerMissing.status).toBe('usable-with-caution')
    expect(ownerMissing.reasons.join(' ')).toContain('Owner 缺失')
    expect(ambiguous.status).toBe('not-recommended')
    expect(ambiguous.reasons.join(' ')).toContain('含糊')
    expect(deprecated.status).toBe('not-recommended')
    expect(deprecated.reasons.join(' ')).toContain('deprecated')
    expect(retiring.status).toBe('not-recommended')
  })

  it('严重 freshness 延迟也会阻止默认复用', () => {
    const recommendation = getGovernanceRecommendation({
      ...getAsset('dws-sales'),
      freshnessMetadata: {
        lastUpdatedAt: '2026-09-14 00:00',
        expectedRefresh: '每 15 分钟',
        observedDelayMinutes: 180,
        status: 'delayed',
      },
    })

    expect(recommendation.status).toBe('not-recommended')
    expect(recommendation.reasons.join(' ')).toContain('严重 freshness 风险')
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
    expect(analyst.remainingRisk).toContain('质量风险单独记录')

    const qualityPassPolicy = evaluateGovernancePolicy({
      asset: { ...asset, qualityEvidence: getAsset('dws-sales').qualityEvidence },
      fieldName: 'user_email',
      role: 'analyst',
      purpose: 'business-analysis',
    })
    expect(qualityPassPolicy.decision).toBe(analyst.decision)
    expect(qualityPassPolicy.policyFactors.map((factor) => factor.label)).not.toContain(
      'quality evidence',
    )
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
    expect(assetImpact.upstreamImpacts.map((node) => node.id)).toContain('ods-order')
    expect(assetImpact.directImpacts[0]).toMatchObject({
      confidence: expect.any(String),
      evidence: expect.arrayContaining([expect.objectContaining({ source: expect.any(String) })]),
    })
  })

  it('质量 block 会结合真实 Lineage consumer 暴露升级为 critical，并提升通知优先级', () => {
    const asset = getAsset('dwd-order-detail')
    const impact = getAssetLineageImpact(asset, assets, lineageNodes, lineageEdges, {
      includeCrossEntity: true,
      qualityEvidence: asset.qualityEvidence,
    })

    expect(impact.riskLevel).toBe('critical')
    expect(impact.consumers.map((node) => node.id)).toEqual(
      expect.arrayContaining(['dws-sales', 'dws-user', 'ads-report', 'metric-report-status']),
    )
    expect(impact.notificationTargets[0]?.priority).toBe('urgent')
    expect(impact.riskReason).toContain('真实消费者')
    expect(
      getGovernanceRecommendation(asset, { lineageImpact: impact }).factors.map(
        (factor) => factor.label,
      ),
    ).toContain('quality × lineage exposure')
  })

  it('资产 deprecation 使用真实字段血缘找到消费者和通知顺序', () => {
    const event = getEvent('governance-ads-report-deprecated')
    const impact = getGovernanceLineageImpact(assets, lineageNodes, lineageEdges, event)
    const deprecated = applyGovernanceEvent(getAsset('ads-report'), event)

    expect(deprecated.asset.lifecycle).toBe('deprecated')
    expect(impact.source?.id).toBe('field-ads-report-status')
    expect(impact.consumers.map((node) => node.id)).toContain('metric-report-status')
    expect(impact.notificationTargets.map((target) => target.label)).toContain(
      'metric.report_status_summary',
    )
    expect(impact.suggestedOrder.map((node) => node.id)).toContain('metric-report-status')
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
      lifecycle: 'active',
      owner: '订单数据组',
      sensitivity: 'sensitive',
      impactEventId: event.id,
    })
    expect(record.qualityEvidenceUsed.join(' ')).toContain('chapter-07 Quality')
    expect(record.qualityEvidenceUsed.join(' ')).toContain(QUALITY_RULE_IDS.completeness)
    expect(record.lineageEvidenceUsed.join(' ')).toContain('Lineage risk')
    expect(record.directImpact.length).toBeGreaterThan(0)
    expect(record.transitiveImpact.length).toBeGreaterThan(0)
    expect(record.consumers.length).toBeGreaterThan(0)
    expect(record.notifications.length).toBeGreaterThan(0)
    expect(record.remainingRisks.length).toBeGreaterThan(0)
  })
})
