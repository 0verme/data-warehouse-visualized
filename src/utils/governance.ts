import type {
  GovernanceAsset,
  GovernanceCatalogFilters,
  GovernanceDecisionRecord,
  GovernanceEvidenceDecision,
  GovernanceField,
  GovernanceFieldAccessResult,
  GovernanceFreshnessStatus,
  GovernanceImpactObject,
  GovernanceLifecycleEvent,
  GovernanceLifecycleResult,
  GovernanceLineageImpact,
  GovernancePolicyDecision,
  GovernancePolicyDecisionResult,
  GovernancePurpose,
  GovernanceRecommendationFactor,
  GovernanceRecommendationResult,
  GovernanceRole,
  GovernanceSensitivity,
  GovernanceQualityStatus,
  LineageEdge,
  LineageNode,
} from '../types'
import {
  getImpactAnalysis,
  getLineageEdgeConfidence,
  getLineageEdgeEvidence,
  getLineageEntityType,
} from './lineage'

export const GOVERNANCE_ROLE_OPTIONS = [
  { value: 'analyst', label: '经营分析人员', detail: '同一使用者在不同业务用途下选择必要字段' },
] as const satisfies readonly { value: GovernanceRole; label: string; detail: string }[]

export const GOVERNANCE_PURPOSE_OPTIONS = [
  { value: 'business-analysis', label: '经营分析', detail: '按机构和产品分析存款余额' },
  { value: 'customer-service', label: '客户服务', detail: '处理单个客户的账户问题' },
] as const satisfies readonly { value: GovernancePurpose; label: string; detail: string }[]

export const GOVERNANCE_SENSITIVITY_LABELS: Record<GovernanceSensitivity, string> = {
  public: 'public · 公开',
  internal: 'internal · 内部',
  sensitive: 'sensitive · 敏感',
  restricted: 'restricted · 受限',
}

export const GOVERNANCE_LIFECYCLE_LABELS = {
  active: 'active · 使用中',
  deprecated: 'deprecated · 已弃用',
  retiring: 'retiring · 下线中（扩展说明）',
} as const

export const GOVERNANCE_DECISION_LABELS: Record<GovernancePolicyDecision, string> = {
  allow: 'allow · 可以直接使用',
  masked: 'masked · 处理后使用',
  'approval-required': 'approval-required · 需要额外确认',
  deny: 'deny · 当前不能直接使用',
}

export const DEFAULT_GOVERNANCE_FILTERS: GovernanceCatalogFilters = {
  query: '',
  tag: 'all',
  lifecycle: 'all',
  sensitivity: 'all',
  ownerStatus: 'all',
}

export function getGovernanceRoleLabel(role: GovernanceRole): string {
  return GOVERNANCE_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role
}

export function getGovernancePurposeLabel(purpose: GovernancePurpose): string {
  return GOVERNANCE_PURPOSE_OPTIONS.find((option) => option.value === purpose)?.label ?? purpose
}

export function getGovernanceOwnerStatus(asset: GovernanceAsset): 'assigned' | 'missing' {
  return asset.owner?.trim() ? 'assigned' : 'missing'
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN')
}

function getAssetSearchText(asset: GovernanceAsset): string {
  return [
    asset.technicalName,
    asset.businessName,
    asset.description,
    asset.tags.join(' '),
    asset.businessDefinition.summary,
    asset.businessDefinition.grain,
    asset.businessDefinition.scope,
    asset.businessDefinition.exclusions ?? '',
    asset.owner ?? '',
    ...asset.fields.flatMap((field) => [field.name, field.label, field.description]),
  ]
    .join(' ')
    .toLocaleLowerCase('zh-CN')
}

export function filterGovernanceAssets(
  assets: readonly GovernanceAsset[],
  filters: GovernanceCatalogFilters,
): GovernanceAsset[] {
  const normalizedQuery = normalizeSearchValue(filters.query)
  const normalizedTag = normalizeSearchValue(filters.tag === 'all' ? '' : filters.tag)

  return assets.filter((asset) => {
    const matchesQuery = !normalizedQuery || getAssetSearchText(asset).includes(normalizedQuery)
    const matchesTag =
      !normalizedTag || asset.tags.some((tag) => normalizeSearchValue(tag) === normalizedTag)
    const matchesLifecycle = filters.lifecycle === 'all' || asset.lifecycle === filters.lifecycle
    const matchesSensitivity =
      filters.sensitivity === 'all' || asset.sensitivity === filters.sensitivity
    const matchesOwner =
      filters.ownerStatus === 'all' || getGovernanceOwnerStatus(asset) === filters.ownerStatus

    return matchesQuery && matchesTag && matchesLifecycle && matchesSensitivity && matchesOwner
  })
}

export interface GovernanceRecommendationOptions {
  lineageImpact?: GovernanceLineageImpact
}

function getAssetQualityStatus(asset: GovernanceAsset): GovernanceQualityStatus {
  if (asset.qualityStatus) {
    return asset.qualityStatus
  }

  return asset.qualityEvidence?.status === 'pass' ? 'pass' : 'unknown'
}

function getQualityRecommendationFactor(asset: GovernanceAsset): GovernanceRecommendationFactor {
  const status = getAssetQualityStatus(asset)
  return {
    label: 'Quality status',
    tone: status === 'pass' ? 'positive' : 'caution',
    detail:
      status === 'pass'
        ? (asset.qualityNote ?? '第 06 章已确认当前质量状态。')
        : (asset.qualityNote ?? '第 06 章没有可消费的通过证据，不能把 UNKNOWN 当作 PASS。'),
  }
}

export function getGovernanceRecommendation(
  asset: GovernanceAsset,
  options: GovernanceRecommendationOptions = {},
): GovernanceRecommendationResult {
  void options
  const factors: GovernanceRecommendationFactor[] = [
    {
      label: '定义与 Grain',
      tone: asset.definitionCompleteness === 'complete' ? 'positive' : 'blocking',
      detail:
        asset.definitionCompleteness === 'complete'
          ? `已说明一行含义、范围和排除项：${asset.businessDefinition.grain}。`
          : '定义或 Grain 不完整，暂时不能确认资产是否回答当前问题。',
    },
    {
      label: 'Owner',
      tone: getGovernanceOwnerStatus(asset) === 'assigned' ? 'positive' : 'blocking',
      detail: asset.owner ? `当前 Owner：${asset.owner}。` : 'Owner 缺失，不能把责任交给匿名系统。',
    },
    {
      label: '生命周期',
      tone: asset.lifecycle === 'active' ? 'positive' : 'blocking',
      detail:
        asset.lifecycle === 'active'
          ? '资产当前仍可进入使用判断。'
          : `${GOVERNANCE_LIFECYCLE_LABELS[asset.lifecycle]}，应先寻找替代资产。`,
    },
    {
      label: 'Freshness',
      tone: asset.freshnessMetadata?.status === 'current' ? 'positive' : 'caution',
      detail: asset.freshnessMetadata
        ? `最近更新 ${asset.freshnessMetadata.lastUpdatedAt}，当前标记为 ${asset.freshnessMetadata.status}。`
        : '没有 Freshness 证据，无法判断是否满足当前日期。',
    },
    getQualityRecommendationFactor(asset),
  ]

  const hasBlockingFactor = factors.some((factor) => factor.tone === 'blocking')
  const hasCautionFactor = factors.some((factor) => factor.tone === 'caution')

  return {
    status: hasBlockingFactor
      ? 'not-recommended'
      : hasCautionFactor
        ? 'usable-with-caution'
        : 'recommended',
    reasons: factors.map((factor) => `${factor.label}：${factor.detail}`),
    factors,
  }
}

export function getGovernanceEvidenceDecision(qualityCase: {
  semanticMatch: boolean
  grainMatch: boolean
  qualityStatus: GovernanceQualityStatus
  freshnessStatus: GovernanceFreshnessStatus
  freshnessLabel: string
  evidence: string[]
}): GovernanceEvidenceDecision {
  const evidence = [
    qualityCase.semanticMatch ? '✓ 定义匹配' : '× 定义不匹配',
    qualityCase.grainMatch ? '✓ Grain 满足需求' : '× Grain 不满足需求',
    qualityCase.qualityStatus === 'pass' ? '✓ Quality 已确认' : '× Quality 状态 UNKNOWN',
    qualityCase.freshnessStatus === 'current'
      ? '✓ Freshness 满足昨天业务日分析'
      : `× 数据只更新到 ${qualityCase.freshnessLabel}`,
    ...qualityCase.evidence,
  ]
  const failedReason =
    qualityCase.qualityStatus !== 'pass'
      ? 'Quality 状态 UNKNOWN，当前没有足够证据确认这份数据。'
      : qualityCase.freshnessStatus !== 'current'
        ? `数据只更新到 ${qualityCase.freshnessLabel}，不满足昨天业务日分析。`
        : !qualityCase.semanticMatch || !qualityCase.grainMatch
          ? '定义或 Grain 与当前需求不匹配。'
          : '定义、Grain、Quality 和 Freshness 都满足当前需求。'

  const isRecommended =
    qualityCase.semanticMatch &&
    qualityCase.grainMatch &&
    qualityCase.qualityStatus === 'pass' &&
    qualityCase.freshnessStatus === 'current'

  return {
    status: isRecommended ? 'recommended' : 'not-recommended',
    headline: isRecommended ? '建议使用' : '暂不建议使用',
    evidence,
    reason: failedReason,
  }
}

function getMaskingValue(field: GovernanceField): string {
  const sample = field.maskingSample ?? ''
  if (!sample) {
    return '处理后的教学值'
  }

  return maskGovernanceValue(sample)
}

export function maskGovernanceValue(value: string): string {
  const normalized = value.replace(/\s+/g, '')
  if (normalized.length === 11) {
    return `${normalized.slice(0, 3)} **** ${normalized.slice(-4)}`
  }

  if (normalized.length < 8) {
    return `${normalized.slice(0, 2)}****${normalized.slice(-2)}`
  }

  return `${normalized.slice(0, 4)} **** **** ${normalized.slice(-4)}`
}

export function getGovernanceFieldAccess({
  field,
  purpose,
}: {
  field: GovernanceField
  role?: GovernanceRole
  purpose: GovernancePurpose
}): GovernanceFieldAccessResult {
  const purposeLabel = getGovernancePurposeLabel(purpose)

  if (field.name === 'account_no') {
    return {
      outcome: 'masked',
      label: '处理后可以使用',
      reason: `${purposeLabel}不需要暴露完整账户号，保留首尾信息即可定位教学样本。`,
      value: getMaskingValue(field),
      evidence: ['字段级敏感信息', '最小必要数据', '保留首尾用于核对'],
    }
  }

  if (field.name === 'customer_name' && purpose === 'customer-service') {
    return {
      outcome: 'direct',
      label: '可以直接使用',
      reason: '客户服务需要确认当前客户，且当前用途与字段含义匹配。',
      evidence: ['用途需要', '字段范围明确', '当前资产仍在使用中'],
    }
  }

  if (field.name === 'mobile') {
    return {
      outcome: purpose === 'customer-service' ? 'masked' : 'unavailable',
      label: purpose === 'customer-service' ? '处理后可以使用' : '当前不能直接使用',
      reason:
        purpose === 'customer-service'
          ? '客户服务需要联系客户，但页面只展示脱敏手机号。'
          : '经营分析只需要机构、产品和余额，不需要读取联系方式。',
      ...(purpose === 'customer-service' ? { value: getMaskingValue(field) } : {}),
      evidence:
        purpose === 'customer-service'
          ? ['用途需要', '字段级脱敏', '不暴露完整联系方式']
          : ['最小必要数据', '当前用途不需要联系方式'],
    }
  }

  if (field.sensitivity === 'public' || field.sensitivity === 'internal') {
    return {
      outcome: 'direct',
      label: '可以直接使用',
      reason: `${purposeLabel}需要该字段，且它属于当前资产定义的非敏感分析字段。`,
      evidence: ['用途需要', '字段定义清楚', '不包含个体联系方式'],
    }
  }

  return {
    outcome: 'unavailable',
    label: '当前不能直接使用',
    reason: `${purposeLabel}当前没有足够理由读取该敏感字段。`,
    evidence: ['字段敏感', '用途不匹配', '应改用更小字段集合'],
  }
}

export function getReplacementAsset(
  asset: GovernanceAsset,
  assets: readonly GovernanceAsset[],
): GovernanceAsset | undefined {
  return asset.replacementAssetId
    ? assets.find((candidate) => candidate.id === asset.replacementAssetId)
    : undefined
}

export function evaluateGovernancePolicy({
  asset,
  fieldName,
  role = 'analyst',
  purpose,
}: {
  asset: GovernanceAsset
  fieldName: string
  role?: GovernanceRole
  purpose: GovernancePurpose
}): GovernancePolicyDecisionResult {
  const field = asset.fields.find((candidate) => candidate.name === fieldName)
  if (!field) {
    throw new Error(`找不到治理字段：${asset.id}.${fieldName}`)
  }

  const access = getGovernanceFieldAccess({ field, role, purpose })
  const decision: GovernancePolicyDecision =
    access.outcome === 'direct' ? 'allow' : access.outcome === 'masked' ? 'masked' : 'deny'

  return {
    assetId: asset.id,
    fieldName,
    role,
    purpose,
    decision,
    reason: access.reason,
    evidence: access.evidence,
    policyFactors: [
      {
        label: '字段范围',
        value: field.label,
        implication: access.reason,
        tone: access.outcome === 'direct' ? 'positive' : 'caution',
      },
      {
        label: '当前用途',
        value: getGovernancePurposeLabel(purpose),
        implication: '同一使用者换用途后，需要重新判断字段是否必要。',
        tone: 'positive',
      },
    ],
    remainingRisk:
      access.outcome === 'direct'
        ? '仍应保持最小字段范围。'
        : '治理判断不等于真实系统权限控制；教学结果只说明当前使用边界。',
  }
}

function toImpactObject(
  node: LineageNode | undefined,
  edges: readonly LineageEdge[],
): GovernanceImpactObject | undefined {
  if (!node) {
    return undefined
  }

  const evidence = edges
    .filter((edge) => edge.source === node.id || edge.target === node.id)
    .map((edge) => getLineageEdgeEvidence(edge))
  const confidence = edges.find((edge) => edge.source === node.id || edge.target === node.id)

  return {
    id: node.id,
    label: node.label,
    entityType: getLineageEntityType(node),
    role: node.role,
    evidence: evidence.length > 0 ? evidence : undefined,
    confidence: confidence ? getLineageEdgeConfidence(confidence) : undefined,
  }
}

function mapImpactObjects(
  ids: readonly string[],
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
): GovernanceImpactObject[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  return ids.flatMap((id) => {
    const object = toImpactObject(nodeById.get(id), edges)
    return object ? [object] : []
  })
}

export function getGovernanceLineageImpact(
  assets: readonly GovernanceAsset[],
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  event: Pick<GovernanceLifecycleEvent, 'sourceEntityId'>,
): GovernanceLineageImpact {
  const source = toImpactObject(
    nodes.find((node) => node.id === event.sourceEntityId),
    edges,
  )
  if (!source) {
    return {
      upstreamImpacts: [],
      directImpacts: [],
      transitiveImpacts: [],
      consumers: [],
      notificationTargets: [],
      suggestedOrder: [],
      riskLevel: 'standard',
      riskReason: '没有找到第 07 章提供的影响分析源节点。',
    }
  }

  const analysis = getImpactAnalysis(nodes, edges, source.id, { includeCrossEntity: true })
  const sourceAsset = assets.find((asset) => asset.lineageEvidence.nodeId === source.id)
  const allDownstream = mapImpactObjects(analysis.finalImpact, nodes, edges)
  const consumers = allDownstream.filter(
    (object) => object.entityType === 'table' || object.entityType === 'metric',
  )
  const directImpacts = mapImpactObjects(analysis.directDownstream, nodes, edges)
  const notificationTargets = consumers.map((consumer, index) => {
    const asset = assets.find((candidate) => candidate.lineageEvidence.nodeId === consumer.id)
    return {
      id: consumer.id,
      label: consumer.label,
      recipient: asset?.owner ?? 'Owner 待确认',
      reason: asset ? `由 ${asset.owner} 确认影响` : '影响分析没有登记对应 Owner',
      priority: index === 0 ? ('first' as const) : ('next' as const),
    }
  })

  return {
    source,
    upstreamImpacts: mapImpactObjects(analysis.upstream, nodes, edges),
    directImpacts,
    transitiveImpacts: allDownstream.filter(
      (object) => !directImpacts.some((direct) => direct.id === object.id),
    ),
    consumers,
    notificationTargets,
    suggestedOrder: consumers,
    riskLevel: sourceAsset?.qualityStatus === 'unknown' ? 'elevated' : 'standard',
    riskReason: '这里消费第 07 章已经完成的影响结果；本节不重新遍历血缘。',
  }
}

export function getAssetLineageImpact(
  asset: GovernanceAsset,
  assets: readonly GovernanceAsset[],
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
): GovernanceLineageImpact {
  return getGovernanceLineageImpact(assets, nodes, edges, {
    sourceEntityId: asset.lineageEvidence.nodeId ?? asset.id,
  })
}

export function applyGovernanceEvent(
  asset: GovernanceAsset,
  event: GovernanceLifecycleEvent,
): GovernanceLifecycleResult {
  if (event.eventType === 'asset-deprecated' && asset.lifecycle === 'active') {
    return {
      asset: { ...asset, lifecycle: 'deprecated' },
      changed: true,
      message: `${asset.businessName} 已标记为 deprecated；请改用替代资产。`,
    }
  }

  if (event.eventType === 'field-change' && event.fieldName) {
    const fields = asset.fields.map((field) =>
      field.name === event.fieldName
        ? {
            ...field,
            name: event.newFieldName ?? field.name,
            semanticStatus: 'review-needed' as const,
            description: `${field.description} 语义变更待确认。`,
          }
        : field,
    )
    return {
      asset: { ...asset, fields, definitionCompleteness: 'partial' },
      changed: true,
      message: `${asset.businessName} 的字段语义已标记为待确认。`,
    }
  }

  return {
    asset,
    changed: false,
    message: '当前资产状态不支持这次变更，保留原状态。',
  }
}

export function createGovernanceDecisionRecord({
  asset,
  field,
  recommendation,
  policyDecision,
  impact,
  event,
}: {
  asset: GovernanceAsset
  field: GovernanceField
  recommendation: GovernanceRecommendationResult
  policyDecision: GovernancePolicyDecisionResult
  impact?: GovernanceLineageImpact
  event?: GovernanceLifecycleEvent
}): GovernanceDecisionRecord {
  return {
    id: `governance-decision-${asset.id}-${field.name}-${policyDecision.role}-${policyDecision.purpose}`,
    recordedAt: '教学记录',
    selectedAssetId: asset.id,
    selectedAssetName: asset.businessName,
    fieldName: field.name,
    role: policyDecision.role,
    purpose: policyDecision.purpose,
    recommendation: recommendation.status,
    accessDecision: policyDecision.decision,
    decisionReason: policyDecision.reason,
    lifecycle: asset.lifecycle,
    owner: asset.owner,
    sensitivity: field.sensitivity,
    qualityEvidenceUsed: asset.qualityStatus
      ? [`Quality ${asset.qualityStatus}`]
      : ['Quality UNKNOWN'],
    lineageEvidenceUsed: asset.lineageEvidence.nodeId
      ? [`第 07 章影响结果：${asset.lineageEvidence.nodeId}`]
      : [],
    impactEventId: event?.id,
    directImpact: impact?.directImpacts.map((object) => object.label) ?? [],
    transitiveImpact: impact?.transitiveImpacts.map((object) => object.label) ?? [],
    consumers: impact?.consumers.map((object) => object.label) ?? [],
    notifications: impact?.notificationTargets.map((target) => target.recipient) ?? [],
    remainingRisks: [policyDecision.remainingRisk],
  }
}

export function getFreshnessLabel(status: GovernanceFreshnessStatus): string {
  if (status === 'current') {
    return '昨天'
  }

  if (status === 'delayed') {
    return '7 天前'
  }

  return '未知'
}
