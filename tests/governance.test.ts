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

describe('数据治理决策台', () => {
  it('QualityEvent 会被投影成可解释的治理质量证据，而不是复制质量领域模型', () => {
    const evaluation = evaluateDataQuality(dataQualityVisualization, {
      injection: 'missing-balance-snapshot',
      action: 'block',
    })
    const event = evaluation.events.find(
      (candidate) => candidate.ruleId === QUALITY_RULE_IDS.completeness,
    )
    if (!event) {
      throw new Error('测试需要真实 QualityEvent')
    }

    const evidence = qualityEventToGovernanceEvidence(event, 'DWD 账户余额完整性')

    expect(evidence).toMatchObject({
      source: 'chapter-07',
      status: 'fail',
      severity: 'high',
      eventId: event.eventId,
      ruleName: 'DWD 账户余额完整性',
      ruleId: QUALITY_RULE_IDS.completeness,
      target: event.target,
      expectedValue: 0,
      releaseDecision: {
        action: 'block',
        status: 'blocked',
        isBlocked: true,
        affectedOutputs: ['dws_deposit_balance_daily_staging', 'ads_deposit_balance_daily'],
      },
    })
    expect(evidence.evidence[0]).toMatchObject({
      evidenceId: 'evidence.dq.dwd.deposit-balance.completeness.v1',
      detail: '期望 4 行 DWD 账户日明细，实际只有 3 行。',
      samples: [{ rowKey: '2026-09-30 / A002 / 200000' }],
    })
    expect(evidence.failedSampleCount).toBe(1)
    expect(evidence.remainingRisk).toContain('Release Decision')
  })

  it('课程入口注册治理工作台，并保留质量未知状态', () => {
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
    expect(getAsset('dwd-deposit-balance').qualityEvidence).toMatchObject({
      source: 'chapter-07',
      status: 'fail',
      ruleId: QUALITY_RULE_IDS.completeness,
      eventId: 'event.quality.dq.dwd.deposit-balance.completeness.v1',
      releaseDecision: { action: 'block', status: 'blocked', isBlocked: true },
    })
    expect(getAsset('dws-deposit-balance').qualityEvidence).toMatchObject({
      source: 'chapter-07',
      status: 'pass',
      ruleId: QUALITY_RULE_IDS.reconciliation,
      releaseDecision: { action: 'block', status: 'released', isBlocked: false },
    })
  })

  it('按业务关键词、技术名、tag 和治理筛选目录', () => {
    const balanceAssets = filterGovernanceAssets(assets, {
      ...DEFAULT_GOVERNANCE_FILTERS,
      query: '余额',
    })
    expect(balanceAssets.map((asset) => asset.id)).toEqual([
      'ods-account-balance',
      'dwd-deposit-balance',
      'dws-deposit-balance',
      'ads-deposit-balance',
      'ads-deposit-balance-v1',
    ])

    expect(
      filterGovernanceAssets(assets, {
        ...DEFAULT_GOVERNANCE_FILTERS,
        query: 'DWS.DEPOSIT_BALANCE',
      }),
    ).toEqual([getAsset('dws-deposit-balance')])
    expect(
      filterGovernanceAssets(assets, { ...DEFAULT_GOVERNANCE_FILTERS, tag: 'deprecated' }).map(
        (asset) => asset.id,
      ),
    ).toEqual(['ads-deposit-balance-v1'])
    expect(
      filterGovernanceAssets(assets, {
        ...DEFAULT_GOVERNANCE_FILTERS,
        lifecycle: 'deprecated',
      }).map((asset) => asset.id),
    ).toEqual(['ads-deposit-balance-v1'])
    expect(
      filterGovernanceAssets(assets, {
        ...DEFAULT_GOVERNANCE_FILTERS,
        sensitivity: 'restricted',
      }).map((asset) => asset.id),
    ).toEqual(['dws-account-profile'])
    expect(
      filterGovernanceAssets(assets, {
        ...DEFAULT_GOVERNANCE_FILTERS,
        ownerStatus: 'missing',
      }).map((asset) => asset.id),
    ).toEqual(['dws-account-profile'])
  })

  it('用可解释因素判断推荐程度，而不是返回黑盒分数', () => {
    const recommended = getGovernanceRecommendation(getAsset('dws-deposit-balance'))
    const cautious = getGovernanceRecommendation(getAsset('ads-deposit-balance'))
    const ambiguous = getGovernanceRecommendation(getAsset('dws-account-profile'))
    const deprecated = getGovernanceRecommendation(getAsset('ads-deposit-balance-v1'))

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
    const pass = getGovernanceRecommendation(getAsset('dws-deposit-balance'))
    const warn = getGovernanceRecommendation({
      ...getAsset('dws-deposit-balance'),
      qualityEvidence: getProjectedQualityEvidence(
        'late-partition',
        QUALITY_RULE_IDS.freshness,
        'continue-with-risk',
      ),
    })
    const block = getGovernanceRecommendation(getAsset('dwd-deposit-balance'))

    expect(pass.status).toBe('recommended')
    expect(warn.status).toBe('usable-with-caution')
    expect(warn.reasons.join(' ')).toContain('warn')
    expect(block.status).toBe('not-recommended')
    expect(block.reasons.join(' ')).toContain('期望 4 行 DWD 账户日明细')
  })

  it('Owner 缺失、定义含糊和 deprecated / retiring 仍会降低推荐程度', () => {
    const ownerMissing = getGovernanceRecommendation({
      ...getAsset('dws-deposit-balance'),
      owner: undefined,
    })
    const ambiguous = getGovernanceRecommendation(getAsset('dws-account-profile'))
    const deprecated = getGovernanceRecommendation(getAsset('ads-deposit-balance-v1'))
    const retiring = getGovernanceRecommendation({
      ...getAsset('dws-deposit-balance'),
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
      ...getAsset('dws-deposit-balance'),
      freshnessMetadata: {
        lastUpdatedAt: '2026-09-30 00:00',
        expectedRefresh: '每天 06:30',
        observedDelayMinutes: 180,
        status: 'delayed',
      },
    })

    expect(recommendation.status).toBe('not-recommended')
    expect(recommendation.reasons.join(' ')).toContain('严重 freshness 风险')
  })

  it('同一敏感字段会随角色和用途得到不同的 policy decision', () => {
    const asset = getAsset('dwd-deposit-balance')
    const analyst = evaluateGovernancePolicy({
      asset,
      fieldName: 'customer_id',
      role: 'analyst',
      purpose: 'business-analysis',
    })
    const analystExport = evaluateGovernancePolicy({
      asset,
      fieldName: 'customer_id',
      role: 'analyst',
      purpose: 'data-export',
    })
    const marketing = evaluateGovernancePolicy({
      asset,
      fieldName: 'customer_id',
      role: 'marketing',
      purpose: 'user-outreach',
    })
    const external = evaluateGovernancePolicy({
      asset,
      fieldName: 'customer_id',
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
      asset: { ...asset, qualityEvidence: getAsset('dws-deposit-balance').qualityEvidence },
      fieldName: 'customer_id',
      role: 'analyst',
      purpose: 'business-analysis',
    })
    expect(qualityPassPolicy.decision).toBe(analyst.decision)
    expect(qualityPassPolicy.policyFactors.map((factor) => factor.label)).not.toContain(
      'quality evidence',
    )
  })

  it('对 restricted 字段和可直接读取的内部字段分别处理 allow、masked、approval、deny', () => {
    const asset = getAsset('dws-account-profile')
    expect(
      evaluateGovernancePolicy({
        asset,
        fieldName: 'customer_id',
        role: 'analyst',
        purpose: 'business-analysis',
      }).decision,
    ).toBe('masked')
    expect(
      evaluateGovernancePolicy({
        asset,
        fieldName: 'customer_id',
        role: 'marketing',
        purpose: 'user-outreach',
      }).decision,
    ).toBe('approval-required')
    expect(
      evaluateGovernancePolicy({
        asset,
        fieldName: 'customer_id',
        role: 'external-collaborator',
        purpose: 'business-analysis',
      }).decision,
    ).toBe('deny')

    const allow = evaluateGovernancePolicy({
      asset: getAsset('dws-deposit-balance'),
      fieldName: 'balance',
      role: 'analyst',
      purpose: 'business-analysis',
    })
    expect(allow.decision).toBe('allow')
  })

  it('支持 active → deprecated、deprecated → retiring 和字段 semantic change', () => {
    const deprecateEvent = getEvent('governance-ads-deposit-balance-deprecated')
    const deprecated = applyGovernanceEvent(getAsset('ads-deposit-balance'), deprecateEvent)
    expect(deprecated.changed).toBe(true)
    expect(deprecated.asset.lifecycle).toBe('deprecated')

    const retireEvent = getEvent('governance-legacy-deposit-balance-retiring')
    const retiring = applyGovernanceEvent(getAsset('ads-deposit-balance-v1'), retireEvent)
    expect(retiring.changed).toBe(true)
    expect(retiring.asset.lifecycle).toBe('retiring')

    const fieldChange = applyGovernanceEvent(
      getAsset('dwd-deposit-balance'),
      getEvent('governance-balance-semantic-change'),
    )
    const changedField = fieldChange.asset.fields.find(
      (field) => field.name === 'available_balance',
    )
    expect(fieldChange.changed).toBe(true)
    expect(fieldChange.asset.definitionCompleteness).toBe('partial')
    expect(changedField).toMatchObject({ semanticStatus: 'review-needed' })
    expect(changedField?.description).toContain('语义变更待确认')

    const invalidTransition = applyGovernanceEvent(getAsset('ads-deposit-balance'), retireEvent)
    expect(invalidTransition.changed).toBe(false)
    expect(invalidTransition.asset.lifecycle).toBe('active')
  })

  it('消费同一套 LineageGraph，区分直接影响、传递影响、消费者和通知顺序', () => {
    const fieldEvent = getEvent('governance-balance-semantic-change')
    const impact = getGovernanceLineageImpact(assets, lineageNodes, lineageEdges, fieldEvent)

    expect(impact.source?.id).toBe('field-dwd-balance')
    expect(impact.directImpacts.map((node) => node.id)).toContain('task-build-deposit-detail')
    expect(impact.transitiveImpacts.map((node) => node.id)).toContain('dws-deposit-balance')
    expect(impact.consumers.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        'dwd-deposit-balance',
        'dws-deposit-balance',
        'dws-account-profile',
        'metric-deposit-balance',
      ]),
    )
    expect(impact.notificationTargets.length).toBe(impact.suggestedOrder.length)
    expect(impact.notificationTargets[0]?.priority).toBe('first')
    expect(
      impact.notificationTargets.some((target) => target.recipient.includes('Owner 待补齐')),
    ).toBe(true)

    const assetImpact = getAssetLineageImpact(
      getAsset('dwd-deposit-balance'),
      assets,
      lineageNodes,
      lineageEdges,
    )
    expect(assetImpact.directImpacts.map((node) => node.id)).toEqual([
      'dws-deposit-balance',
      'dws-account-profile',
    ])
    expect(assetImpact.transitiveImpacts.map((node) => node.id)).toContain('ads-deposit-balance')
    expect(assetImpact.upstreamImpacts.map((node) => node.id)).toContain('ods-account-balance')
    expect(assetImpact.directImpacts[0]).toMatchObject({
      confidence: expect.any(String),
      evidence: expect.arrayContaining([expect.objectContaining({ source: expect.any(String) })]),
    })
  })

  it('质量 block 会结合真实 Lineage consumer 暴露升级为 critical，并提升通知优先级', () => {
    const asset = getAsset('dwd-deposit-balance')
    const impact = getAssetLineageImpact(asset, assets, lineageNodes, lineageEdges, {
      includeCrossEntity: true,
      qualityEvidence: asset.qualityEvidence,
    })

    expect(impact.riskLevel).toBe('critical')
    expect(impact.consumers.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        'dws-deposit-balance',
        'dws-account-profile',
        'ads-deposit-balance',
        'metric-deposit-report',
      ]),
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
    const event = getEvent('governance-ads-deposit-balance-deprecated')
    const impact = getGovernanceLineageImpact(assets, lineageNodes, lineageEdges, event)
    const deprecated = applyGovernanceEvent(getAsset('ads-deposit-balance'), event)

    expect(deprecated.asset.lifecycle).toBe('deprecated')
    expect(impact.source?.id).toBe('field-ads-balance')
    expect(impact.consumers.map((node) => node.id)).toContain('metric-deposit-report')
    expect(impact.notificationTargets.map((target) => target.label)).toContain(
      'metric.deposit_report',
    )
    expect(impact.suggestedOrder.map((node) => node.id)).toContain('metric-deposit-report')
  })

  it('同样的目录、事件和请求始终得到相同结果，并能生成决策记录', () => {
    const asset = getAsset('dwd-deposit-balance')
    const field = asset.fields.find((candidate) => candidate.name === 'customer_id')
    if (!field) {
      throw new Error('governance test needs customer_id')
    }

    const recommendation = getGovernanceRecommendation(asset)
    const policyDecision = evaluateGovernancePolicy({
      asset,
      fieldName: field.name,
      role: 'analyst',
      purpose: 'business-analysis',
    })
    const event = getEvent('governance-balance-semantic-change')
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
      id: 'governance-decision-dwd-deposit-balance-customer_id-analyst-business-analysis',
      selectedAssetName: 'DWD 账户日余额',
      accessDecision: 'masked',
      lifecycle: 'active',
      owner: '存款数据组',
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
