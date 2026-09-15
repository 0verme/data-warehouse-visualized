import type {
  GovernanceAsset,
  GovernanceCatalogFilters,
  GovernanceDecisionRecord,
  GovernanceDefinitionCompleteness,
  GovernanceField,
  GovernanceFreshnessStatus,
  GovernanceImpactObject,
  GovernanceLifecycle,
  GovernanceLifecycleEvent,
  GovernanceLifecycleResult,
  GovernanceLineageImpact,
  GovernanceQualityEvidence,
  GovernanceNotificationTarget,
  GovernanceRiskLevel,
  GovernancePolicyDecision,
  GovernancePolicyDecisionResult,
  GovernancePolicyFactor,
  GovernancePurpose,
  GovernanceRecommendationFactor,
  GovernanceRecommendationResult,
  GovernanceRole,
  GovernanceSensitivity,
  LineageConfidence,
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
  { value: 'analyst', label: '分析师', detail: '经营分析与指标复核' },
  { value: 'marketing', label: '营销人员', detail: '用户触达与活动运营' },
  { value: 'external-collaborator', label: '外部协作者', detail: '受控的外部协作' },
] as const satisfies readonly { value: GovernanceRole; label: string; detail: string }[]

export const GOVERNANCE_PURPOSE_OPTIONS = [
  { value: 'business-analysis', label: '经营分析', detail: '查看趋势、指标和聚合结果' },
  { value: 'user-outreach', label: '用户触达', detail: '联系或圈选用户' },
  { value: 'data-export', label: '数据导出', detail: '把数据带出当前平台' },
  { value: 'external-sharing', label: '外部共享', detail: '交给组织外部的协作者' },
] as const satisfies readonly { value: GovernancePurpose; label: string; detail: string }[]

export const GOVERNANCE_SENSITIVITY_LABELS: Record<GovernanceSensitivity, string> = {
  public: 'public · 公开',
  internal: 'internal · 内部',
  sensitive: 'sensitive · 敏感',
  restricted: 'restricted · 受限',
}

export const GOVERNANCE_LIFECYCLE_LABELS: Record<GovernanceLifecycle, string> = {
  active: 'active · 使用中',
  deprecated: 'deprecated · 已弃用',
  retiring: 'retiring · 下线中',
}

export const GOVERNANCE_DECISION_LABELS: Record<GovernancePolicyDecision, string> = {
  allow: 'allow · 允许',
  masked: 'masked · 脱敏',
  'approval-required': 'approval-required · 需审批',
  deny: 'deny · 拒绝',
}

export const GOVERNANCE_ENTITY_TYPE_LABELS = {
  table: '表',
  field: '字段',
  task: '任务',
  metric: '指标',
} as const

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
    asset.owner ?? '',
    asset.steward ?? '',
    asset.metricDefinition?.name ?? '',
    asset.metricDefinition?.definition.name ?? '',
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

function getQualityRecommendationFactor(asset: GovernanceAsset): GovernanceRecommendationFactor {
  const qualityEvidence = asset.qualityEvidence
  if (!qualityEvidence) {
    return {
      label: 'quality evidence',
      tone: 'caution',
      detail: '第 07 章当前没有覆盖这项资产；质量状态未知，不能把未知显示为通过。',
    }
  }

  const qualityStatusLabel =
    qualityEvidence.status === 'pass'
      ? 'pass · 通过'
      : qualityEvidence.status === 'warn'
        ? 'warn · 告警'
        : 'fail · 失败'
  const qualityTone =
    qualityEvidence.status === 'fail' || qualityEvidence.releaseDecision.isBlocked
      ? 'blocking'
      : qualityEvidence.status === 'warn' || qualityEvidence.releaseDecision.status !== 'released'
        ? 'caution'
        : 'positive'
  const target = `${qualityEvidence.target.table}.${qualityEvidence.target.field ?? 'table-level'}`
  const partition = `${qualityEvidence.target.partition.column} = ${qualityEvidence.target.partition.value}`
  const ruleLabel = qualityEvidence.ruleName
    ? `${qualityEvidence.ruleName} (${qualityEvidence.ruleId})`
    : qualityEvidence.ruleId
  const evidenceDetail = qualityEvidence.evidence[0]?.detail ?? '未提供可展开的质量证据。'

  return {
    label: 'quality evidence',
    tone: qualityTone,
    detail: `${qualityStatusLabel} · ${ruleLabel} · ${target} · ${partition}；${evidenceDetail}；Release Decision: ${qualityEvidence.releaseDecision.action} / ${qualityEvidence.releaseDecision.status}。`,
  }
}

function getQualityLineageFactor(
  asset: GovernanceAsset,
  lineageImpact: GovernanceLineageImpact | undefined,
): GovernanceRecommendationFactor | undefined {
  const qualityEvidence = asset.qualityEvidence
  if (
    !qualityEvidence ||
    !lineageImpact ||
    (qualityEvidence.status === 'pass' && !qualityEvidence.releaseDecision.isBlocked) ||
    lineageImpact.consumers.length === 0
  ) {
    return undefined
  }

  const isCritical = qualityEvidence.status === 'fail' || qualityEvidence.releaseDecision.isBlocked
  return {
    label: 'quality × lineage exposure',
    tone: isCritical ? 'blocking' : 'caution',
    detail: `质量 ${qualityEvidence.status} 已沿真实 Lineage 暴露给 ${lineageImpact.consumers.length} 个表 / 指标消费者（直接 ${lineageImpact.directImpacts.length}，传递 ${lineageImpact.transitiveImpacts.length}）；${lineageImpact.riskReason}`,
  }
}

export function getGovernanceRecommendation(
  asset: GovernanceAsset,
  options: GovernanceRecommendationOptions = {},
): GovernanceRecommendationResult {
  const factors: GovernanceRecommendationFactor[] = []

  const definitionDetails: Record<GovernanceDefinitionCompleteness, string> = {
    complete: '业务定义、粒度和使用边界均已给出。',
    partial: '业务定义只覆盖部分边界，复用前还需要补充说明。',
    ambiguous: '业务定义或粒度含糊，暂时不能确认这张资产代表什么。',
  }
  const definitionTone =
    asset.definitionCompleteness === 'complete'
      ? 'positive'
      : asset.definitionCompleteness === 'partial'
        ? 'caution'
        : 'blocking'
  factors.push({
    label: 'definition completeness',
    tone: definitionTone,
    detail: definitionDetails[asset.definitionCompleteness],
  })

  const hasOwner = getGovernanceOwnerStatus(asset) === 'assigned'
  factors.push({
    label: 'owner availability',
    tone: hasOwner ? 'positive' : 'caution',
    detail: hasOwner
      ? `Owner 为 ${asset.owner}，Steward 为 ${asset.steward ?? '未填写'}。`
      : `Owner 缺失${asset.steward ? `，当前只能找到 Steward ${asset.steward}` : ''}。`,
  })

  const lifecycleTone = asset.lifecycle === 'active' ? 'positive' : 'blocking'
  factors.push({
    label: 'lifecycle',
    tone: lifecycleTone,
    detail:
      asset.lifecycle === 'active'
        ? '资产仍在使用中，可以进入后续证据核验。'
        : `${GOVERNANCE_LIFECYCLE_LABELS[asset.lifecycle]}，不应把它作为新的默认来源。`,
  })

  const sensitivityTone =
    asset.sensitivity === 'public' || asset.sensitivity === 'internal' ? 'positive' : 'caution'
  factors.push({
    label: 'sensitivity',
    tone: sensitivityTone,
    detail:
      asset.sensitivity === 'public' || asset.sensitivity === 'internal'
        ? `资产最高敏感等级为 ${GOVERNANCE_SENSITIVITY_LABELS[asset.sensitivity]}。`
        : `资产最高敏感等级为 ${GOVERNANCE_SENSITIVITY_LABELS[asset.sensitivity]}，使用时必须缩小字段范围并核对用途。`,
  })

  const hasLinkedLineage =
    asset.lineageEvidence.status === 'linked' && Boolean(asset.lineageEvidence.nodeId)
  factors.push({
    label: 'lineage evidence',
    tone: hasLinkedLineage
      ? 'positive'
      : asset.lineageEvidence.status === 'partial'
        ? 'caution'
        : 'blocking',
    detail: hasLinkedLineage
      ? `已连接第 08 章血缘节点：${asset.lineageEvidence.note}`
      : `血缘证据${asset.lineageEvidence.status === 'partial' ? '不完整' : '不可用'}：${asset.lineageEvidence.note}`,
  })

  const freshnessStatus: GovernanceFreshnessStatus = asset.freshnessMetadata?.status ?? 'unknown'
  const freshnessIsSevere =
    freshnessStatus === 'delayed' && (asset.freshnessMetadata?.observedDelayMinutes ?? 0) >= 120
  const freshnessTone =
    freshnessStatus === 'current' ? 'positive' : freshnessIsSevere ? 'blocking' : 'caution'
  factors.push({
    label: 'freshness metadata',
    tone: freshnessTone,
    detail: asset.freshnessMetadata
      ? freshnessIsSevere
        ? `最近更新 ${asset.freshnessMetadata.lastUpdatedAt}，已延迟 ${asset.freshnessMetadata.observedDelayMinutes ?? '未知'} 分钟；严重 freshness 风险会阻止默认复用。`
        : `最近更新 ${asset.freshnessMetadata.lastUpdatedAt}，预期${asset.freshnessMetadata.expectedRefresh}，当前标记为 ${freshnessStatus}。`
      : '没有 freshness metadata，无法判断数据是否足够新。',
  })

  factors.push(getQualityRecommendationFactor(asset))
  const qualityLineageFactor = getQualityLineageFactor(asset, options.lineageImpact)
  if (qualityLineageFactor) {
    factors.push(qualityLineageFactor)
  }

  const blockingFactors = factors.filter((factor) => factor.tone === 'blocking')
  const cautionFactors = factors.filter((factor) => factor.tone === 'caution')
  const status =
    blockingFactors.length > 0
      ? 'not-recommended'
      : cautionFactors.length > 0
        ? 'usable-with-caution'
        : 'recommended'

  return {
    status,
    reasons: factors.map((factor) => `${factor.label}：${factor.detail}`),
    factors,
  }
}

function getPolicyFactors(
  asset: GovernanceAsset,
  field: GovernanceField,
  role: GovernanceRole,
  purpose: GovernancePurpose,
): GovernancePolicyFactor[] {
  const sensitivityTone =
    field.sensitivity === 'restricted'
      ? 'blocking'
      : field.sensitivity === 'sensitive'
        ? 'caution'
        : 'positive'

  return [
    {
      label: '字段敏感等级',
      value: GOVERNANCE_SENSITIVITY_LABELS[field.sensitivity],
      implication:
        field.sensitivity === 'public'
          ? '字段可以在目录定义的范围内公开使用。'
          : field.sensitivity === 'internal'
            ? '字段只应留在组织内部。'
            : field.sensitivity === 'sensitive'
              ? '字段默认不直接暴露，需要脱敏或人工确认。'
              : '字段属于受限信息，不能仅凭岗位名称放行。',
      tone: sensitivityTone,
    },
    {
      label: '当前角色',
      value: getGovernanceRoleLabel(role),
      implication:
        role === 'external-collaborator'
          ? '外部协作不能自动继承内部数据访问范围。'
          : '角色只能提供业务上下文，不替代字段级策略判断。',
      tone: role === 'external-collaborator' ? 'caution' : 'positive',
    },
    {
      label: '使用用途',
      value: getGovernancePurposeLabel(purpose),
      implication:
        purpose === 'business-analysis'
          ? '经营分析优先使用聚合结果和最小字段集合。'
          : purpose === 'user-outreach'
            ? '用户触达会扩大对个体的暴露范围。'
            : purpose === 'data-export'
              ? '数据离开平台后，原有控制边界会变弱。'
              : '外部共享需要额外的责任和接收方确认。',
      tone: purpose === 'business-analysis' ? 'positive' : 'caution',
    },
    {
      label: '资产生命周期',
      value: GOVERNANCE_LIFECYCLE_LABELS[asset.lifecycle],
      implication:
        asset.lifecycle === 'active'
          ? '资产仍处于使用中。'
          : '生命周期信号要求停止新增依赖或先完成迁移确认。',
      tone: asset.lifecycle === 'active' ? 'positive' : 'blocking',
    },
    {
      label: '责任人',
      value: asset.owner ?? 'Owner 缺失',
      implication: asset.owner
        ? `Steward：${asset.steward ?? '未填写'}。`
        : '缺少 Owner 时不能把责任交给一个匿名系统。',
      tone: asset.owner ? 'positive' : 'caution',
    },
  ]
}

function getDecisionRisk(asset: GovernanceAsset, decision: GovernancePolicyDecision): string {
  const qualityRisk = asset.qualityEvidence
    ? `Quality ${asset.qualityEvidence.status} · rule ${asset.qualityEvidence.ruleId} · Release Decision ${asset.qualityEvidence.releaseDecision.action} / ${asset.qualityEvidence.releaseDecision.status}`
    : '第 07 章没有覆盖这项资产；质量状态未知，不能把未知显示为通过。'
  const separatedQualityRisk = `质量风险单独记录，不改变字段访问策略：${qualityRisk}`

  switch (decision) {
    case 'allow':
      return `仍需遵守最小字段范围；${separatedQualityRisk}`
    case 'masked':
      return `脱敏结果仍可能保留关联性；${separatedQualityRisk}`
    case 'approval-required':
      return `等待 Owner / Steward 确认用途和接收范围；${separatedQualityRisk}`
    case 'deny':
      return `如确有业务需要，应改用聚合或脱敏资产并重新评审；${separatedQualityRisk}`
  }
}

function getPolicyDecisionReason(
  decision: GovernancePolicyDecision,
  asset: GovernanceAsset,
  field: GovernanceField,
  role: GovernanceRole,
  purpose: GovernancePurpose,
): string {
  const context = `${getGovernanceRoleLabel(role)}在${getGovernancePurposeLabel(purpose)}场景下`

  switch (decision) {
    case 'allow':
      return `${context}可以直接读取 ${field.label}：字段等级为 ${field.sensitivity}，且资产仍在使用中、责任人已明确。`
    case 'masked':
      return `${context}不能直接看到 ${field.label} 的原值；它的敏感等级为 ${field.sensitivity}，当前只返回脱敏视图。`
    case 'approval-required':
      return `${context}需要 Owner / Steward 先确认：${field.label} 会扩大暴露范围，或资产责任与生命周期证据不足。`
    case 'deny':
      return `${context}被拒绝读取 ${field.label}：当前角色、用途或生命周期与 ${asset.businessName} 的字段边界冲突。`
  }
}

function resolvePolicyDecision(
  asset: GovernanceAsset,
  field: GovernanceField,
  role: GovernanceRole,
  purpose: GovernancePurpose,
): GovernancePolicyDecision {
  const isExternalRole = role === 'external-collaborator'
  const isExternalPurpose = purpose === 'external-sharing'
  let decision: GovernancePolicyDecision

  if (asset.lifecycle === 'retiring') {
    return 'deny'
  }

  if (isExternalPurpose) {
    return field.sensitivity === 'public' ? 'allow' : 'deny'
  }

  if (isExternalRole) {
    if (field.sensitivity === 'public' && purpose === 'business-analysis') {
      return 'allow'
    }

    if (field.sensitivity === 'sensitive' || field.sensitivity === 'restricted') {
      return 'deny'
    }

    decision = 'masked'
  } else if (field.sensitivity === 'restricted') {
    decision =
      purpose === 'business-analysis' && role === 'analyst' ? 'masked' : 'approval-required'
  } else if (field.sensitivity === 'sensitive') {
    if (role === 'analyst' && purpose === 'business-analysis') {
      decision = 'masked'
    } else if (purpose === 'data-export' || purpose === 'user-outreach') {
      decision = 'approval-required'
    } else {
      decision = 'masked'
    }
  } else if (field.sensitivity === 'internal') {
    decision =
      purpose === 'data-export' || purpose === 'user-outreach' ? 'approval-required' : 'allow'
  } else {
    decision = 'allow'
  }

  if (asset.lifecycle === 'deprecated') {
    return 'approval-required'
  }

  if (getGovernanceOwnerStatus(asset) === 'missing' && decision === 'allow') {
    return 'approval-required'
  }

  return decision
}

export function evaluateGovernancePolicy({
  asset,
  fieldName,
  role,
  purpose,
}: {
  asset: GovernanceAsset
  fieldName: string
  role: GovernanceRole
  purpose: GovernancePurpose
}): GovernancePolicyDecisionResult {
  const field = asset.fields.find((candidate) => candidate.name === fieldName)

  if (!field) {
    return {
      assetId: asset.id,
      fieldName,
      role,
      purpose,
      decision: 'deny',
      reason: `目录中找不到字段 ${fieldName}，不能对未知字段放行。`,
      evidence: [`资产 ${asset.technicalName} 的字段目录没有 ${fieldName}。`],
      policyFactors: [
        {
          label: '字段目录',
          value: 'unknown',
          implication: '先补齐字段证据，再重新提出访问请求。',
          tone: 'blocking',
        },
      ],
      remainingRisk: '字段定义缺失；第 07 章没有覆盖这项资产，质量状态未知。',
    }
  }

  const decision = resolvePolicyDecision(asset, field, role, purpose)
  const freshnessEvidence = asset.freshnessMetadata
    ? `freshness metadata：最近更新 ${asset.freshnessMetadata.lastUpdatedAt}，状态 ${asset.freshnessMetadata.status}。`
    : 'freshness metadata：未提供。'

  return {
    assetId: asset.id,
    fieldName: field.name,
    role,
    purpose,
    decision,
    reason: getPolicyDecisionReason(decision, asset, field, role, purpose),
    evidence: [
      `字段定义：${field.name} · ${field.label} · ${field.description}`,
      `资产定义：${asset.businessDefinition.summary}；粒度：${asset.businessDefinition.grain}。`,
      `职责证据：Owner ${asset.owner ?? '缺失'}；Steward ${asset.steward ?? '未填写'}。`,
      `生命周期证据：${GOVERNANCE_LIFECYCLE_LABELS[asset.lifecycle]}；${freshnessEvidence}`,
      `血缘证据：${asset.lineageEvidence.note}`,
    ],
    policyFactors: getPolicyFactors(asset, field, role, purpose),
    remainingRisk: getDecisionRisk(asset, decision),
  }
}

function getNode(nodes: readonly LineageNode[], nodeId: string): LineageNode | undefined {
  return nodes.find((node) => node.id === nodeId)
}

const LINEAGE_CONFIDENCE_RANK: Record<LineageConfidence, number> = {
  manual: 0,
  inferred: 1,
  confirmed: 2,
}

function toImpactObject(
  node: LineageNode | undefined,
  edges: readonly LineageEdge[] = [],
): GovernanceImpactObject | undefined {
  if (!node) {
    return undefined
  }

  const supportingEdges = edges.filter((edge) => edge.source === node.id || edge.target === node.id)
  const evidence = [
    ...new Map(
      supportingEdges.map((edge) => {
        const item = getLineageEdgeEvidence(edge)
        return [`${item.source}:${item.detail}`, item]
      }),
    ).values(),
  ]
  const confidence = supportingEdges.reduce<LineageConfidence | undefined>((lowest, edge) => {
    const current = getLineageEdgeConfidence(edge)
    if (!lowest || LINEAGE_CONFIDENCE_RANK[current] < LINEAGE_CONFIDENCE_RANK[lowest]) {
      return current
    }
    return lowest
  }, undefined)

  return {
    id: node.id,
    label: node.label,
    entityType: getLineageEntityType(node),
    role: node.role,
    ...(evidence.length > 0 ? { evidence } : {}),
    ...(confidence ? { confidence } : {}),
  }
}

function findAssetForLineageNode(
  assets: readonly GovernanceAsset[],
  node: LineageNode,
): GovernanceAsset | undefined {
  return assets.find(
    (asset) =>
      asset.lineageEvidence.nodeId === node.id ||
      asset.fields.some((field) => field.lineageNodeId === node.id),
  )
}

function getNotificationTarget(
  node: LineageNode,
  assets: readonly GovernanceAsset[],
  directIds: ReadonlySet<string>,
  riskLevel: GovernanceRiskLevel,
): GovernanceNotificationTarget {
  const linkedAsset = findAssetForLineageNode(assets, node)
  const recipient = linkedAsset?.owner
    ? linkedAsset.owner
    : linkedAsset?.steward
      ? `${linkedAsset.steward}（Owner 待补齐）`
      : getLineageEntityType(node) === 'task'
        ? '生产任务负责人待确认'
        : getLineageEntityType(node) === 'metric'
          ? '指标负责人待确认'
          : '责任人待确认'
  const isDirect = directIds.has(node.id)
  const entityTypeLabel = GOVERNANCE_ENTITY_TYPE_LABELS[getLineageEntityType(node)]

  const priority =
    riskLevel === 'critical' && isDirect
      ? 'urgent'
      : isDirect
        ? 'first'
        : linkedAsset
          ? 'next'
          : 'review'

  return {
    id: node.id,
    label: node.label,
    recipient,
    reason: isDirect
      ? `${riskLevel === 'critical' ? '质量阻断下的直接下游，立即通知' : '直接下游，先通知'}${linkedAsset ? ` ${linkedAsset.businessName} 的责任人` : ''}。`
      : `传递影响中的${entityTypeLabel}，在直接下游确认后通知。`,
    priority,
  }
}

function getGovernanceRisk(
  qualityEvidence: GovernanceQualityEvidence | undefined,
  consumers: readonly GovernanceImpactObject[],
): { level: GovernanceRiskLevel; reason: string } {
  if (!qualityEvidence) {
    return {
      level: 'standard',
      reason: '当前只按 Lineage 依赖排列对象，尚未叠加质量事件风险。',
    }
  }

  const isBlocked = qualityEvidence.status === 'fail' || qualityEvidence.releaseDecision.isBlocked
  if (isBlocked && consumers.length > 0) {
    return {
      level: 'critical',
      reason: `Quality ${qualityEvidence.status} / ${qualityEvidence.releaseDecision.status} 已暴露给真实消费者；必须先停止复用并按通知顺序处理。`,
    }
  }

  if (isBlocked) {
    return {
      level: 'elevated',
      reason: `Quality ${qualityEvidence.status} 仍未解除；当前没有识别到表或指标消费者，但仍需处理失败证据。`,
    }
  }

  if (qualityEvidence.status === 'warn' && consumers.length > 0) {
    return {
      level: 'elevated',
      reason: `Quality warn 已传递给真实消费者；继续使用前需要保留告警和证据。`,
    }
  }

  return {
    level: 'standard',
    reason: `Quality ${qualityEvidence.status} 当前未触发需要升级的消费者暴露。`,
  }
}

function emptyGovernanceImpact(): GovernanceLineageImpact {
  return {
    upstreamImpacts: [],
    directImpacts: [],
    transitiveImpacts: [],
    consumers: [],
    notificationTargets: [],
    suggestedOrder: [],
    riskLevel: 'standard',
    riskReason: '没有可计算的 Lineage source。',
  }
}

export function getGovernanceLineageImpact(
  assets: readonly GovernanceAsset[],
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  event: Pick<GovernanceLifecycleEvent, 'sourceEntityId'>,
  options: {
    includeCrossEntity?: boolean
    qualityEvidence?: GovernanceQualityEvidence
  } = { includeCrossEntity: true },
): GovernanceLineageImpact {
  if (!event.sourceEntityId) {
    return emptyGovernanceImpact()
  }

  const source = toImpactObject(getNode(nodes, event.sourceEntityId), edges)
  const includeCrossEntity = options.includeCrossEntity ?? true
  const analysis = getImpactAnalysis(
    nodes,
    edges,
    event.sourceEntityId,
    includeCrossEntity ? { includeCrossEntity: true } : undefined,
  )
  const directIds = new Set(analysis.directDownstream)
  const finalIds = analysis.finalImpact
  const upstreamImpacts = [...new Set(analysis.upstream)]
    .map((nodeId) => toImpactObject(getNode(nodes, nodeId), edges))
    .filter((node): node is GovernanceImpactObject => Boolean(node))
  const directImpacts = [...new Set(analysis.directDownstream)]
    .map((nodeId) => toImpactObject(getNode(nodes, nodeId), edges))
    .filter((node): node is GovernanceImpactObject => Boolean(node))
  const transitiveImpacts = [...new Set(finalIds)]
    .filter((nodeId) => !directIds.has(nodeId))
    .map((nodeId) => toImpactObject(getNode(nodes, nodeId), edges))
    .filter((node): node is GovernanceImpactObject => Boolean(node))
  const suggestedOrder = [...directImpacts, ...transitiveImpacts]
  const consumers = suggestedOrder.filter(
    (node) => node.entityType === 'table' || node.entityType === 'metric',
  )
  const risk = getGovernanceRisk(options.qualityEvidence, consumers)
  const notificationTargets = suggestedOrder.map((node) =>
    getNotificationTarget(getNode(nodes, node.id)!, assets, directIds, risk.level),
  )

  return {
    ...(source ? { source } : {}),
    upstreamImpacts,
    directImpacts,
    transitiveImpacts,
    consumers,
    notificationTargets,
    suggestedOrder,
    riskLevel: risk.level,
    riskReason: risk.reason,
  }
}

export function getAssetLineageImpact(
  asset: GovernanceAsset,
  assets: readonly GovernanceAsset[],
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  options: {
    includeCrossEntity?: boolean
    qualityEvidence?: GovernanceQualityEvidence
  } = { includeCrossEntity: false },
): GovernanceLineageImpact {
  return getGovernanceLineageImpact(
    assets,
    nodes,
    edges,
    { sourceEntityId: asset.lineageEvidence.nodeId },
    options,
  )
}

export function applyGovernanceEvent(
  asset: GovernanceAsset,
  event: GovernanceLifecycleEvent,
): GovernanceLifecycleResult {
  if (asset.id !== event.assetId) {
    return { asset, changed: false, message: '事件目标与当前资产不一致，未应用变更。' }
  }

  if (event.eventType === 'owner-missing') {
    return {
      asset,
      changed: false,
      message: '检测到 Owner 缺失；请先补齐责任人，再把资产交给新的使用方。',
    }
  }

  if (event.eventType === 'asset-deprecated') {
    if (asset.lifecycle !== 'active') {
      return {
        asset,
        changed: false,
        message: `当前资产已经是 ${GOVERNANCE_LIFECYCLE_LABELS[asset.lifecycle]}，没有重复应用 deprecation。`,
      }
    }

    return {
      asset: { ...asset, lifecycle: 'deprecated' },
      changed: true,
      message: '资产已标记为 deprecated；停止新增依赖，并通知下游消费者开始迁移评估。',
    }
  }

  if (event.eventType === 'asset-retiring') {
    if (asset.lifecycle !== 'deprecated') {
      return {
        asset,
        changed: false,
        message: '只有 deprecated 资产才能进入 retiring；先完成 deprecation 评审。',
      }
    }

    return {
      asset: { ...asset, lifecycle: 'retiring' },
      changed: true,
      message: '资产已进入 retiring；按照通知顺序停止消费并完成替代资产切换。',
    }
  }

  const field = event.fieldName
    ? asset.fields.find((candidate) => candidate.name === event.fieldName)
    : undefined

  if (event.eventType === 'field-change') {
    if (!field || !event.fieldName) {
      return { asset, changed: false, message: '字段变更事件缺少可定位的字段证据。' }
    }

    const updatedFields = asset.fields.map((candidate) =>
      candidate.name === event.fieldName
        ? {
            ...candidate,
            ...(event.newFieldName ? { name: event.newFieldName } : {}),
            ...(event.semanticChange
              ? { description: `${candidate.description}；语义变更待确认：${event.semanticChange}` }
              : {}),
            semanticStatus: 'review-needed' as const,
          }
        : candidate,
    )

    return {
      asset: {
        ...asset,
        fields: updatedFields,
        definitionCompleteness:
          asset.definitionCompleteness === 'complete' ? 'partial' : asset.definitionCompleteness,
      },
      changed: true,
      message: `字段 ${event.fieldName} 已标记为 semantic change；先复核定义，再按血缘通知下游消费者。`,
    }
  }

  if (event.eventType === 'sensitivity-change') {
    const newSensitivity = event.newSensitivity
    if (!field || !event.fieldName || !newSensitivity) {
      return { asset, changed: false, message: '敏感等级变更事件缺少字段或新等级证据。' }
    }

    return {
      asset: {
        ...asset,
        fields: asset.fields.map((candidate) =>
          candidate.name === event.fieldName
            ? { ...candidate, sensitivity: newSensitivity }
            : candidate,
        ),
      },
      changed: true,
      message: `字段 ${event.fieldName} 已调整为 ${GOVERNANCE_SENSITIVITY_LABELS[newSensitivity]}；重新运行最小权限判断。`,
    }
  }

  return { asset, changed: false, message: '未识别的治理事件，未应用变更。' }
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function getQualityEvidenceUsed(asset: GovernanceAsset): string[] {
  const evidence = asset.qualityEvidence
  if (!evidence) {
    return ['Quality evidence：第 07 章没有覆盖这项资产；质量状态未知，未将未知视为通过。']
  }

  const target = `${evidence.target.table}.${evidence.target.field ?? 'table-level'}`
  const partition = `${evidence.target.partition.column} = ${evidence.target.partition.value}`
  return [
    `chapter-07 Quality ${evidence.status} · rule ${evidence.ruleName ?? evidence.ruleId} (${evidence.ruleId})`,
    `target：${target} · ${partition} · observed ${evidence.observedValue} / expected ${evidence.expectedLabel}`,
    `failed sample count：${evidence.failedSampleCount}`,
    ...evidence.evidence.map((item) => `evidence ${item.evidenceId}：${item.detail}`),
    `Release Decision：${evidence.releaseDecision.action} / ${evidence.releaseDecision.status}；${evidence.remainingRisk}`,
  ]
}

function getLineageEvidenceUsed(impact?: GovernanceLineageImpact): string[] {
  if (!impact) {
    return ['Lineage evidence：本次记录没有选择影响分析结果。']
  }

  const objects = [...impact.upstreamImpacts, ...impact.directImpacts, ...impact.transitiveImpacts]
  const edgeEvidence = uniqueStrings(
    objects.flatMap((object) =>
      (object.evidence ?? []).map(
        (evidence) => `${object.label} · ${evidence.source}：${evidence.detail}`,
      ),
    ),
  )

  return [
    `Lineage risk：${impact.riskLevel} · ${impact.riskReason}`,
    `direct ${impact.directImpacts.length} · transitive ${impact.transitiveImpacts.length} · consumers ${impact.consumers.length}`,
    ...objects
      .filter((object) => object.confidence)
      .map((object) => `${object.label} · confidence ${object.confidence}`),
    ...edgeEvidence,
  ]
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
  const riskReasons = recommendation.factors
    .filter((factor) => factor.tone !== 'positive')
    .map((factor) => factor.detail)
  const qualityEvidenceUsed = getQualityEvidenceUsed(asset)
  const lineageEvidenceUsed = getLineageEvidenceUsed(impact)

  return {
    id: `governance-decision-${asset.id}-${field.name}-${policyDecision.role}-${policyDecision.purpose}`,
    recordedAt: '2026-09-14 10:00',
    selectedAssetId: asset.id,
    selectedAssetName: asset.businessName,
    fieldName: field.name,
    role: policyDecision.role,
    purpose: policyDecision.purpose,
    recommendation: recommendation.status,
    accessDecision: policyDecision.decision,
    decisionReason: `${policyDecision.reason} 推荐依据：${recommendation.reasons.join('；')}`,
    lifecycle: asset.lifecycle,
    ...(asset.owner ? { owner: asset.owner } : {}),
    sensitivity: asset.sensitivity,
    qualityEvidenceUsed,
    lineageEvidenceUsed,
    ...(event ? { impactEventId: event.id } : {}),
    directImpact: impact?.directImpacts.map((node) => node.label) ?? [],
    transitiveImpact: impact?.transitiveImpacts.map((node) => node.label) ?? [],
    consumers: impact?.consumers.map((node) => node.label) ?? [],
    notifications:
      impact?.notificationTargets.map((target) => `${target.recipient} ← ${target.label}`) ?? [],
    remainingRisks: uniqueStrings([policyDecision.remainingRisk, ...riskReasons]),
  }
}

export type { GovernanceCatalogFilters, GovernanceDefinitionCompleteness }
