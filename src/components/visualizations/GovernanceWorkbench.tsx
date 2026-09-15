import { useMemo, useState } from 'react'
import '../../styles/lessons/governance.css'
import type {
  GovernanceAsset,
  GovernanceCatalogFilters,
  GovernanceDecisionRecord,
  GovernanceField,
  GovernanceImpactObject,
  GovernanceLifecycleEvent,
  GovernanceLineageImpact,
  GovernancePolicyDecisionResult,
  GovernanceQualityEvidence,
  GovernancePurpose,
  GovernanceRecommendationResult,
  GovernanceRole,
  GovernanceSensitivity,
  GovernanceVisualization,
} from '../../types'
import {
  applyGovernanceEvent,
  createGovernanceDecisionRecord,
  DEFAULT_GOVERNANCE_FILTERS,
  evaluateGovernancePolicy,
  filterGovernanceAssets,
  getAssetLineageImpact,
  getGovernanceLineageImpact,
  getGovernancePurposeLabel,
  getGovernanceRecommendation,
  GOVERNANCE_DECISION_LABELS,
  GOVERNANCE_ENTITY_TYPE_LABELS,
  GOVERNANCE_LIFECYCLE_LABELS,
  GOVERNANCE_PURPOSE_OPTIONS,
  GOVERNANCE_ROLE_OPTIONS,
  GOVERNANCE_SENSITIVITY_LABELS,
} from '../../utils/governance'

interface GovernanceWorkbenchProps {
  visualization: GovernanceVisualization
}

const SENSITIVITY_OPTIONS: Array<{ value: 'all' | GovernanceSensitivity; label: string }> = [
  { value: 'all', label: '全部敏感等级' },
  { value: 'public', label: GOVERNANCE_SENSITIVITY_LABELS.public },
  { value: 'internal', label: GOVERNANCE_SENSITIVITY_LABELS.internal },
  { value: 'sensitive', label: GOVERNANCE_SENSITIVITY_LABELS.sensitive },
  { value: 'restricted', label: GOVERNANCE_SENSITIVITY_LABELS.restricted },
]

const LIFECYCLE_OPTIONS = [
  { value: 'all', label: '全部生命周期' },
  { value: 'active', label: GOVERNANCE_LIFECYCLE_LABELS.active },
  { value: 'deprecated', label: GOVERNANCE_LIFECYCLE_LABELS.deprecated },
  { value: 'retiring', label: GOVERNANCE_LIFECYCLE_LABELS.retiring },
] as const

const OWNER_OPTIONS = [
  { value: 'all', label: 'Owner 状态' },
  { value: 'assigned', label: 'Owner 已分配' },
  { value: 'missing', label: 'Owner 缺失' },
] as const

const EVENT_TYPE_LABELS = {
  'owner-missing': '责任缺口',
  'field-change': '字段变更',
  'asset-deprecated': '资产弃用',
  'asset-retiring': '资产下线',
  'sensitivity-change': '敏感等级变化',
} as const

const PRIORITY_LABELS = {
  urgent: '立即通知',
  first: '先通知',
  next: '随后通知',
  review: '待人工确认',
} as const

const QUALITY_STATUS_LABELS = {
  pass: 'pass · 通过',
  warn: 'warn · 告警',
  fail: 'fail · 失败',
} as const

function RecommendationPill({ result }: { result: GovernanceRecommendationResult }) {
  const label =
    result.status === 'recommended'
      ? 'recommended · 推荐使用'
      : result.status === 'usable-with-caution'
        ? 'usable-with-caution · 谨慎使用'
        : 'not-recommended · 不推荐'

  return <span className={`governance-pill governance-pill--${result.status}`}>{label}</span>
}

function SensitivityPill({ sensitivity }: { sensitivity: GovernanceSensitivity }) {
  return (
    <span className={`governance-pill governance-pill--sensitivity-${sensitivity}`}>
      {GOVERNANCE_SENSITIVITY_LABELS[sensitivity]}
    </span>
  )
}

function LifecyclePill({ lifecycle }: { lifecycle: GovernanceAsset['lifecycle'] }) {
  return (
    <span className={`governance-pill governance-pill--lifecycle-${lifecycle}`}>
      {GOVERNANCE_LIFECYCLE_LABELS[lifecycle]}
    </span>
  )
}

function AssetCard({
  asset,
  isSelected,
  onSelect,
}: {
  asset: GovernanceAsset
  isSelected: boolean
  onSelect: () => void
}) {
  const recommendation = getGovernanceRecommendation(asset)

  return (
    <button
      className={`governance-asset-card${isSelected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={isSelected}
      onClick={onSelect}
    >
      <span className="governance-asset-card__type">
        {asset.assetType} · {asset.technicalName.split('.')[0]}
      </span>
      <strong>{asset.businessName}</strong>
      <code>{asset.technicalName}</code>
      <span className="governance-asset-card__badges">
        <RecommendationPill result={recommendation} />
        <LifecyclePill lifecycle={asset.lifecycle} />
        <SensitivityPill sensitivity={asset.sensitivity} />
      </span>
      <span className="governance-asset-card__description">{asset.description}</span>
      <span className="governance-asset-card__facts">
        <span>
          <span className="governance-asset-card__fact-label">Owner</span>
          <strong className={!asset.owner ? 'is-missing' : ''}>{asset.owner ?? '缺失'}</strong>
        </span>
        <span>
          <span className="governance-asset-card__fact-label">Freshness</span>
          <strong>
            {asset.freshnessMetadata?.status === 'current'
              ? 'current'
              : asset.freshnessMetadata?.status === 'delayed'
                ? 'delayed'
                : 'unknown'}
          </strong>
        </span>
        <span>
          <span className="governance-asset-card__fact-label">Quality</span>
          <strong>{asset.qualityEvidence?.status ?? 'unknown'}</strong>
        </span>
      </span>
    </button>
  )
}

function SearchFilters({
  assets,
  filters,
  onChange,
}: {
  assets: readonly GovernanceAsset[]
  filters: GovernanceCatalogFilters
  onChange: <Key extends keyof GovernanceCatalogFilters>(
    key: Key,
    value: GovernanceCatalogFilters[Key],
  ) => void
}) {
  const tags = useMemo(() => [...new Set(assets.flatMap((asset) => asset.tags))], [assets])

  return (
    <div className="governance-catalog__filters">
      <label className="governance-search">
        <span>业务关键词 / 技术名</span>
        <input
          type="search"
          value={filters.query}
          placeholder="例如：销售、DWS.SALES、手机号"
          onChange={(event) => onChange('query', event.target.value)}
        />
      </label>
      <label>
        <span>tag</span>
        <select value={filters.tag} onChange={(event) => onChange('tag', event.target.value)}>
          <option value="all">全部标签</option>
          {tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>lifecycle</span>
        <select
          value={filters.lifecycle}
          onChange={(event) =>
            onChange('lifecycle', event.target.value as GovernanceCatalogFilters['lifecycle'])
          }
        >
          {LIFECYCLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>sensitivity</span>
        <select
          value={filters.sensitivity}
          onChange={(event) =>
            onChange('sensitivity', event.target.value as GovernanceCatalogFilters['sensitivity'])
          }
        >
          {SENSITIVITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>责任人</span>
        <select
          value={filters.ownerStatus}
          onChange={(event) =>
            onChange('ownerStatus', event.target.value as GovernanceCatalogFilters['ownerStatus'])
          }
        >
          {OWNER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function DefinitionEvidence({ asset }: { asset: GovernanceAsset }) {
  return (
    <div className="governance-definition-evidence">
      <div>
        <span className="governance-overline">业务定义</span>
        <p>{asset.businessDefinition.summary}</p>
      </div>
      <dl>
        <div>
          <dt>粒度</dt>
          <dd>{asset.businessDefinition.grain}</dd>
        </div>
        <div>
          <dt>适用范围</dt>
          <dd>{asset.businessDefinition.scope}</dd>
        </div>
        {asset.businessDefinition.exclusions && (
          <div>
            <dt>不适用</dt>
            <dd>{asset.businessDefinition.exclusions}</dd>
          </div>
        )}
      </dl>
      <div
        className={`governance-definition-status governance-definition-status--${asset.definitionCompleteness}`}
      >
        <span>definition completeness</span>
        <strong>{asset.definitionCompleteness}</strong>
      </div>
    </div>
  )
}

function FieldTable({
  fields,
  selectedFieldName,
  onSelectField,
}: {
  fields: readonly GovernanceField[]
  selectedFieldName: string
  onSelectField: (fieldName: string) => void
}) {
  return (
    <div className="governance-table-wrap">
      <table className="governance-fields-table">
        <caption>字段目录与敏感等级</caption>
        <thead>
          <tr>
            <th scope="col">字段</th>
            <th scope="col">业务含义</th>
            <th scope="col">敏感等级</th>
            <th scope="col">使用提示</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => {
            const isSelected = field.name === selectedFieldName
            return (
              <tr className={isSelected ? 'is-selected' : ''} key={field.name}>
                <th scope="row">
                  <button
                    className="governance-field-button"
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelectField(field.name)}
                  >
                    <code>{field.name}</code>
                    {field.semanticStatus === 'review-needed' && <small>semantic change</small>}
                  </button>
                </th>
                <td>
                  <strong>{field.label}</strong>
                  <span>{field.description}</span>
                </td>
                <td>
                  <SensitivityPill sensitivity={field.sensitivity} />
                </td>
                <td>
                  {field.maskingStrategy ? (
                    <span className="governance-field-hint">脱敏：{field.maskingStrategy}</span>
                  ) : (
                    <span className="governance-field-hint">按用途最小化使用</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MetricEvidence({ asset }: { asset: GovernanceAsset }) {
  if (!asset.metricDefinition) {
    return (
      <div className="governance-evidence-empty">
        <span className="governance-overline">Metric definition</span>
        <p>当前资产没有指标关联；不要从表名猜测业务口径。</p>
      </div>
    )
  }

  const { definition } = asset.metricDefinition
  return (
    <div className="governance-metric-evidence">
      <div>
        <span className="governance-overline">Metric definition · 第 04 章</span>
        <strong>{asset.metricDefinition.name}</strong>
        <p>{asset.metricDefinition.note}</p>
      </div>
      <dl>
        <div>
          <dt>业务过程</dt>
          <dd>{definition.businessProcess}</dd>
        </div>
        <div>
          <dt>统计对象</dt>
          <dd>{definition.subject}</dd>
        </div>
        <div>
          <dt>时间字段</dt>
          <dd>{definition.timeField}</dd>
        </div>
        <div>
          <dt>度量 / 退款</dt>
          <dd>
            {definition.measure} · {definition.refundRule}
          </dd>
        </div>
        <div>
          <dt>粒度</dt>
          <dd>{definition.grain}</dd>
        </div>
      </dl>
    </div>
  )
}

function formatQualitySampleValues(
  values: GovernanceQualityEvidence['evidence'][number]['samples'][number]['values'],
): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}=${value ?? 'null'}`)
    .join(' · ')
}

function QualityEvidencePanel({ evidence }: { evidence?: GovernanceQualityEvidence }) {
  if (!evidence) {
    return (
      <div className="governance-quality-evidence governance-quality-evidence--unknown">
        <div>
          <span className="governance-overline">Quality evidence · 第 07 章</span>
          <strong>unknown · 当前没有覆盖这项资产</strong>
        </div>
        <p>没有可关联的 Quality Check；质量未知，不把未知显示为 pass。</p>
      </div>
    )
  }

  const target = `${evidence.target.table}.${evidence.target.field ?? 'table-level'}`
  const partition = `${evidence.target.partition.column} = ${evidence.target.partition.value}`

  return (
    <div className={`governance-quality-evidence governance-quality-evidence--${evidence.status}`}>
      <div className="governance-quality-evidence__header">
        <div>
          <span className="governance-overline">Quality evidence · 第 07 章</span>
          <strong>
            {QUALITY_STATUS_LABELS[evidence.status]} · {evidence.severity ?? 'severity 未提供'}
          </strong>
          <p>
            {evidence.ruleName ?? evidence.ruleId} · {evidence.ruleId}
            {evidence.eventId ? ` · ${evidence.eventId}` : ' · Quality Check projection'}
          </p>
        </div>
        <span className="governance-quality-release">
          Release Decision: {evidence.releaseDecision.action} / {evidence.releaseDecision.status}
        </span>
      </div>

      <dl className="governance-quality-evidence__facts">
        <div>
          <dt>target</dt>
          <dd>{target}</dd>
        </div>
        <div>
          <dt>partition</dt>
          <dd>{partition}</dd>
        </div>
        <div>
          <dt>observed / expected</dt>
          <dd>
            {evidence.observedValue} / {evidence.expectedLabel}
          </dd>
        </div>
        <div>
          <dt>failed sample count</dt>
          <dd>{evidence.failedSampleCount}</dd>
        </div>
        <div>
          <dt>last checked</dt>
          <dd>{evidence.lastCheckedAt}</dd>
        </div>
        <div>
          <dt>Scheduler context</dt>
          <dd>
            {evidence.schedulerTaskId} · {evidence.schedulerRunId} · {evidence.taskStatus}
          </dd>
        </div>
        <div>
          <dt>affected outputs</dt>
          <dd>{evidence.releaseDecision.affectedOutputs.join('、') || '无'}</dd>
        </div>
      </dl>

      <div className="governance-quality-evidence__items">
        <h4>Evidence detail</h4>
        {evidence.evidence.map((item) => (
          <article key={item.evidenceId}>
            <strong>
              {item.kind} · {item.evidenceId}
            </strong>
            <p>{item.detail}</p>
            <span>
              observed {item.observedValue} · expected {item.expectedLabel} · samples{' '}
              {item.samples.length}
            </span>
            {item.samples.length > 0 && (
              <ul>
                {item.samples.map((sample) => (
                  <li key={sample.sampleId}>
                    <code>{sample.rowKey}</code>
                    <span>{sample.reason}</span>
                    <small>{formatQualitySampleValues(sample.values)}</small>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>

      <div className="governance-quality-evidence__risk">
        <span>remaining risk</span>
        <p>{evidence.remainingRisk}</p>
      </div>
    </div>
  )
}

function ImpactObjectList({
  title,
  objects,
  emptyText,
}: {
  title: string
  objects: readonly GovernanceImpactObject[]
  emptyText: string
}) {
  return (
    <div className="governance-impact-list">
      <h4>{title}</h4>
      {objects.length > 0 ? (
        <ul>
          {objects.map((object) => (
            <li key={object.id}>
              <strong>{object.label}</strong>
              <span>
                {GOVERNANCE_ENTITY_TYPE_LABELS[object.entityType]} · {object.role}
                {object.confidence ? ` · confidence ${object.confidence}` : ''}
              </span>
              {object.evidence?.[0] && (
                <small>
                  evidence · {object.evidence[0].source}: {object.evidence[0].detail}
                </small>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="governance-empty-text">{emptyText}</p>
      )}
    </div>
  )
}

function AssetInspector({
  asset,
  selectedFieldName,
  onSelectField,
  assetImpact,
  governanceImpact,
}: {
  asset: GovernanceAsset
  selectedFieldName: string
  onSelectField: (fieldName: string) => void
  assetImpact: GovernanceLineageImpact
  governanceImpact: GovernanceLineageImpact
}) {
  const recommendation = getGovernanceRecommendation(asset, { lineageImpact: governanceImpact })

  return (
    <div className="governance-inspector">
      <div className="governance-inspector__header">
        <div>
          <span className="governance-overline">Evidence inspector</span>
          <h3 id="governance-inspector-title">{asset.businessName}</h3>
          <code>{asset.technicalName}</code>
        </div>
        <RecommendationPill result={recommendation} />
      </div>

      <p className="governance-inspector__description">{asset.description}</p>

      <div className="governance-asset-facts">
        <div>
          <span>Asset type</span>
          <strong>{asset.assetType}</strong>
        </div>
        <div>
          <span>Owner</span>
          <strong className={!asset.owner ? 'is-missing' : ''}>{asset.owner ?? '缺失'}</strong>
        </div>
        <div>
          <span>Steward</span>
          <strong>{asset.steward ?? '未填写'}</strong>
        </div>
        <div>
          <span>Lifecycle</span>
          <LifecyclePill lifecycle={asset.lifecycle} />
        </div>
        <div>
          <span>Asset sensitivity</span>
          <SensitivityPill sensitivity={asset.sensitivity} />
        </div>
      </div>

      <DefinitionEvidence asset={asset} />

      <section className="governance-inspector__section" aria-labelledby="governance-fields-title">
        <div className="governance-section-heading">
          <div>
            <span className="governance-overline">Field catalog</span>
            <h4 id="governance-fields-title">字段不是默认可见的附属信息</h4>
          </div>
          <p>选中一个字段，下一步在 policy simulation 中判断它能否被使用。</p>
        </div>
        <FieldTable
          fields={asset.fields}
          selectedFieldName={selectedFieldName}
          onSelectField={onSelectField}
        />
      </section>

      <section className="governance-inspector__section" aria-labelledby="governance-metric-title">
        <div className="governance-section-heading">
          <div>
            <span className="governance-overline">Metric evidence</span>
            <h4 id="governance-metric-title">指标关联</h4>
          </div>
          <p>目录引用第 04 章口径，不在这里复制一套指标计算。</p>
        </div>
        <MetricEvidence asset={asset} />
      </section>

      <section className="governance-inspector__section" aria-labelledby="governance-lineage-title">
        <div className="governance-section-heading">
          <div>
            <span className="governance-overline">Lineage evidence</span>
            <h4 id="governance-lineage-title">下游消费者与影响</h4>
          </div>
          <p>直接下游适合安排修改；传递影响和 consumers 用于通知与验证。</p>
        </div>
        <div className="governance-lineage-source">
          <strong>{asset.lineageEvidence.status}</strong>
          <span>{asset.lineageEvidence.note}</span>
        </div>
        <div className="governance-lineage-risk">
          <span>Quality × Lineage risk</span>
          <strong>{governanceImpact.riskLevel}</strong>
          <p>{governanceImpact.riskReason}</p>
        </div>
        <div className="governance-impact-grid">
          <ImpactObjectList
            title="上游"
            objects={assetImpact.upstreamImpacts}
            emptyText="没有可用的上游血缘证据。"
          />
          <ImpactObjectList
            title="直接下游"
            objects={assetImpact.directImpacts}
            emptyText="没有可用的直接下游血缘证据。"
          />
          <ImpactObjectList
            title="传递影响"
            objects={assetImpact.transitiveImpacts}
            emptyText="没有可用的传递影响血缘证据。"
          />
          <ImpactObjectList
            title="消费者"
            objects={assetImpact.consumers}
            emptyText="当前节点没有识别出的表或指标消费者。"
          />
        </div>
      </section>

      <section className="governance-inspector__section" aria-labelledby="governance-quality-title">
        <div className="governance-section-heading">
          <div>
            <span className="governance-overline">Quality evidence</span>
            <h4 id="governance-quality-title">质量证据会改变是否推荐使用</h4>
          </div>
          <p>只消费第 07 章的 Quality Contract projection，不在治理层重算规则。</p>
        </div>
        <QualityEvidencePanel evidence={asset.qualityEvidence} />
      </section>

      <div className="governance-inspector__footer">
        <span>tags</span>
        <div>
          {asset.tags.map((tag) => (
            <span className="governance-tag" key={tag}>
              #{tag}
            </span>
          ))}
        </div>
        <span className="governance-freshness">
          Freshness metadata：
          {asset.freshnessMetadata
            ? `${asset.freshnessMetadata.lastUpdatedAt} · ${asset.freshnessMetadata.status}`
            : 'unknown · 未提供'}
        </span>
      </div>
    </div>
  )
}

function PolicySimulation({
  fields,
  selectedFieldName,
  role,
  purpose,
  policyDecision,
  onFieldChange,
  onRoleChange,
  onPurposeChange,
}: {
  fields: readonly GovernanceField[]
  selectedFieldName: string
  role: GovernanceRole
  purpose: GovernancePurpose
  policyDecision?: GovernancePolicyDecisionResult
  onFieldChange: (fieldName: string) => void
  onRoleChange: (role: GovernanceRole) => void
  onPurposeChange: (purpose: GovernancePurpose) => void
}) {
  return (
    <section className="governance-policy" aria-labelledby="governance-policy-title">
      <div className="governance-section-heading">
        <div>
          <span className="governance-overline">Policy simulation</span>
          <h3 id="governance-policy-title">同一个字段，换角色和用途再判断一次</h3>
        </div>
        <p>这是本地确定性教学策略，不是真实 IAM / RBAC 或审批系统。</p>
      </div>
      <div className="governance-policy__controls">
        <label>
          <span>角色</span>
          <select
            value={role}
            onChange={(event) => onRoleChange(event.target.value as GovernanceRole)}
          >
            {GOVERNANCE_ROLE_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <small>{GOVERNANCE_ROLE_OPTIONS.find((option) => option.value === role)?.detail}</small>
        </label>
        <label>
          <span>用途</span>
          <select
            value={purpose}
            onChange={(event) => onPurposeChange(event.target.value as GovernancePurpose)}
          >
            {GOVERNANCE_PURPOSE_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <small>
            {getGovernancePurposeLabel(purpose)}：
            {GOVERNANCE_PURPOSE_OPTIONS.find((option) => option.value === purpose)?.detail}
          </small>
        </label>
        <label>
          <span>字段</span>
          <select value={selectedFieldName} onChange={(event) => onFieldChange(event.target.value)}>
            {fields.map((field) => (
              <option value={field.name} key={field.name}>
                {field.name} · {field.sensitivity}
              </option>
            ))}
          </select>
          <small>字段敏感等级决定默认边界</small>
        </label>
      </div>

      {policyDecision && (
        <div
          className={`governance-policy-result governance-policy-result--${policyDecision.decision}`}
          aria-live="polite"
        >
          <div className="governance-policy-result__header">
            <div>
              <span className="governance-overline">decision</span>
              <strong>{GOVERNANCE_DECISION_LABELS[policyDecision.decision]}</strong>
            </div>
            <span>
              {GOVERNANCE_ROLE_OPTIONS.find((option) => option.value === role)?.label} ·{' '}
              {GOVERNANCE_PURPOSE_OPTIONS.find((option) => option.value === purpose)?.label}
            </span>
          </div>
          <p className="governance-policy-result__reason">{policyDecision.reason}</p>
          <div className="governance-policy-result__body">
            <div>
              <h4>Policy factors</h4>
              <ul className="governance-factor-list">
                {policyDecision.policyFactors.map((factor) => (
                  <li className={`is-${factor.tone}`} key={factor.label}>
                    <span>{factor.label}</span>
                    <strong>{factor.value}</strong>
                    <small>{factor.implication}</small>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Evidence</h4>
              <ul className="governance-evidence-list">
                {policyDecision.evidence.map((evidence) => (
                  <li key={evidence}>{evidence}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="governance-risk-callout">
            <span>remaining risk</span>
            <p>{policyDecision.remainingRisk}</p>
          </div>
        </div>
      )}
    </section>
  )
}

function ChangeImpactPanel({
  event,
  impact,
  onApply,
  eventMessage,
}: {
  event?: GovernanceLifecycleEvent
  impact?: ReturnType<typeof getGovernanceLineageImpact>
  onApply: () => void
  eventMessage: string
}) {
  if (!event) {
    return null
  }

  return (
    <section className="governance-change" aria-labelledby="governance-change-title">
      <div className="governance-section-heading">
        <div>
          <span className="governance-overline">Lifecycle & impact</span>
          <h3 id="governance-change-title">处理变更，再决定通知范围</h3>
        </div>
        <p>事件模型属于本章教学场景；影响对象来自第 08 章的已有血缘遍历。</p>
      </div>
      <div className="governance-event-tabs" role="list" aria-label="治理事件">
        <span className="governance-event-tabs__hint">选择事件：</span>
        <span className="governance-event-tabs__selected">
          {EVENT_TYPE_LABELS[event.eventType]} · {event.label}
        </span>
      </div>
      <div className="governance-event-detail">
        <div>
          <strong>{event.label}</strong>
          <p>{event.description}</p>
          <small>
            evidence · {event.evidence.source}：{event.evidence.detail}
          </small>
        </div>
        <button className="button button--primary button--small" type="button" onClick={onApply}>
          应用事件
        </button>
      </div>
      {eventMessage && (
        <p className="governance-event-message" aria-live="polite">
          {eventMessage}
        </p>
      )}

      <div className="governance-change-summary">
        <div>
          <strong>{impact?.directImpacts.length ?? 0}</strong>
          <span>直接受影响</span>
        </div>
        <div>
          <strong>{impact?.transitiveImpacts.length ?? 0}</strong>
          <span>传递影响</span>
        </div>
        <div>
          <strong>{impact?.consumers.length ?? 0}</strong>
          <span>消费者</span>
        </div>
        <div>
          <strong>{impact?.notificationTargets.length ?? 0}</strong>
          <span>通知对象</span>
        </div>
      </div>

      <div className="governance-lineage-risk governance-lineage-risk--change">
        <span>Lineage risk</span>
        <strong>{impact?.riskLevel ?? 'standard'}</strong>
        <p>{impact?.riskReason ?? '没有可计算的影响范围。'}</p>
      </div>
      <div className="governance-impact-grid governance-impact-grid--change">
        <ImpactObjectList
          title="上游证据"
          objects={impact?.upstreamImpacts ?? []}
          emptyText="该事件没有可用的上游血缘对象。"
        />
        <ImpactObjectList
          title="直接受影响对象"
          objects={impact?.directImpacts ?? []}
          emptyText="该事件没有可用的直接血缘对象。"
        />
        <ImpactObjectList
          title="传递影响对象"
          objects={impact?.transitiveImpacts ?? []}
          emptyText="该事件没有可用的传递血缘对象。"
        />
        <ImpactObjectList
          title="下游 consumers"
          objects={impact?.consumers ?? []}
          emptyText="没有识别出的表或指标消费者。"
        />
      </div>

      <div className="governance-notification-order">
        <div className="governance-section-heading">
          <div>
            <span className="governance-overline">Notification plan</span>
            <h4>建议处理顺序</h4>
          </div>
          <p>先处理直接依赖，再通知传递影响；Owner 缺失的对象会明确标注待确认。</p>
        </div>
        {impact && impact.notificationTargets.length > 0 ? (
          <ol>
            {impact.notificationTargets.map((target) => (
              <li key={target.id}>
                <span>{PRIORITY_LABELS[target.priority]}</span>
                <div>
                  <strong>{target.recipient}</strong>
                  <p>
                    {target.label} · {target.reason}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="governance-empty-text">没有 lineage evidence，无法负责任地生成通知范围。</p>
        )}
      </div>
    </section>
  )
}

function DecisionRecordPanel({
  record,
  onCreate,
  disabled,
}: {
  record: GovernanceDecisionRecord | null
  onCreate: () => void
  disabled: boolean
}) {
  return (
    <section className="governance-record" aria-labelledby="governance-record-title">
      <div className="governance-section-heading">
        <div>
          <span className="governance-overline">Decision record</span>
          <h3 id="governance-record-title">留下这次治理决定</h3>
        </div>
        <button
          className="button button--primary button--small"
          type="button"
          disabled={disabled}
          onClick={onCreate}
        >
          生成治理记录
        </button>
      </div>
      {!record ? (
        <p className="governance-empty-text">
          记录会保存当前资产、字段、角色 / 用途、访问决定、血缘影响、通知对象和剩余风险。
        </p>
      ) : (
        <div className="governance-record__body" aria-live="polite">
          <div className="governance-record__headline">
            <span>recordedAt · {record.recordedAt}</span>
            <strong>{record.selectedAssetName}</strong>
            <code>{record.fieldName}</code>
          </div>
          <dl className="governance-record__facts">
            <div>
              <dt>推荐</dt>
              <dd>{record.recommendation}</dd>
            </div>
            <div>
              <dt>访问决定</dt>
              <dd>{record.accessDecision}</dd>
            </div>
            <div>
              <dt>角色 / 用途</dt>
              <dd>
                {record.role} · {record.purpose}
              </dd>
            </div>
            <div>
              <dt>生命周期</dt>
              <dd>{record.lifecycle}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{record.owner ?? '缺失'}</dd>
            </div>
            <div>
              <dt>敏感等级</dt>
              <dd>{record.sensitivity}</dd>
            </div>
            <div>
              <dt>影响事件</dt>
              <dd>{record.impactEventId ?? '未选择'}</dd>
            </div>
          </dl>
          <p className="governance-record__reason">{record.decisionReason}</p>
          <div className="governance-record__lists">
            <div>
              <h4>Quality evidence used</h4>
              <ul>
                {record.qualityEvidenceUsed.map((evidence) => (
                  <li key={evidence}>{evidence}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Lineage evidence used</h4>
              <ul>
                {record.lineageEvidenceUsed.map((evidence) => (
                  <li key={evidence}>{evidence}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Direct impact</h4>
              <ul>
                {record.directImpact.map((impact) => (
                  <li key={impact}>{impact}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Transitive impact</h4>
              <ul>
                {record.transitiveImpact.map((impact) => (
                  <li key={impact}>{impact}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Consumers</h4>
              <ul>
                {record.consumers.map((consumer) => (
                  <li key={consumer}>{consumer}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Notifications</h4>
              <ul>
                {record.notifications.map((notification) => (
                  <li key={notification}>{notification}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Remaining risks</h4>
              <ul>
                {record.remainingRisks.map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export function GovernanceWorkbench({ visualization }: GovernanceWorkbenchProps) {
  const defaultAsset =
    visualization.assets.find((asset) => asset.id === 'dws-sales') ?? visualization.assets[0]
  const [filters, setFilters] = useState<GovernanceCatalogFilters>(DEFAULT_GOVERNANCE_FILTERS)
  const [selectedAssetId, setSelectedAssetId] = useState(defaultAsset?.id ?? '')
  const [selectedFieldName, setSelectedFieldName] = useState(defaultAsset?.fields[0]?.name ?? '')
  const [role, setRole] = useState<GovernanceRole>('analyst')
  const [purpose, setPurpose] = useState<GovernancePurpose>('business-analysis')
  const [selectedEventId, setSelectedEventId] = useState(visualization.events[0]?.id ?? '')
  const [assetOverrides, setAssetOverrides] = useState<Record<string, GovernanceAsset>>({})
  const [eventMessage, setEventMessage] = useState('')
  const [decisionRecord, setDecisionRecord] = useState<GovernanceDecisionRecord | null>(null)

  const catalogAssets = useMemo(
    () => visualization.assets.map((asset) => assetOverrides[asset.id] ?? asset),
    [assetOverrides, visualization.assets],
  )
  const filteredAssets = useMemo(
    () => filterGovernanceAssets(catalogAssets, filters),
    [catalogAssets, filters],
  )
  const selectedAsset =
    catalogAssets.find((asset) => asset.id === selectedAssetId) ??
    filteredAssets[0] ??
    catalogAssets[0]
  const selectedField = selectedAsset?.fields.find((field) => field.name === selectedFieldName)
  const activeField = selectedField ?? selectedAsset?.fields[0]
  const assetImpact = selectedAsset
    ? getAssetLineageImpact(
        selectedAsset,
        catalogAssets,
        visualization.lineageNodes,
        visualization.lineageEdges,
      )
    : undefined
  const governanceImpact = selectedAsset
    ? getAssetLineageImpact(
        selectedAsset,
        catalogAssets,
        visualization.lineageNodes,
        visualization.lineageEdges,
        {
          includeCrossEntity: true,
          qualityEvidence: selectedAsset.qualityEvidence,
        },
      )
    : undefined
  const recommendation = selectedAsset
    ? getGovernanceRecommendation(selectedAsset, { lineageImpact: governanceImpact })
    : undefined
  const selectedEvent = visualization.events.find((event) => event.id === selectedEventId)
  const eventImpact = selectedEvent
    ? getGovernanceLineageImpact(
        catalogAssets,
        visualization.lineageNodes,
        visualization.lineageEdges,
        selectedEvent,
      )
    : undefined
  const decisionImpact =
    selectedEvent?.assetId === selectedAsset?.id ? eventImpact : governanceImpact
  const policyDecision =
    selectedAsset && activeField
      ? evaluateGovernancePolicy({
          asset: selectedAsset,
          fieldName: activeField.name,
          role,
          purpose,
        })
      : undefined

  function updateFilters<Key extends keyof GovernanceCatalogFilters>(
    key: Key,
    value: GovernanceCatalogFilters[Key],
  ) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function selectAsset(assetId: string) {
    const asset = catalogAssets.find((candidate) => candidate.id === assetId)
    setSelectedAssetId(assetId)
    setSelectedFieldName(asset?.fields[0]?.name ?? '')
    setDecisionRecord(null)
  }

  function selectEvent(eventId: string) {
    const event = visualization.events.find((candidate) => candidate.id === eventId)
    setSelectedEventId(eventId)
    if (event) {
      setSelectedAssetId(event.assetId)
      setSelectedFieldName(event.fieldName ?? '')
    }
    setEventMessage('')
    setDecisionRecord(null)
  }

  function applySelectedEvent() {
    if (!selectedEvent || !selectedAsset) {
      return
    }

    const result = applyGovernanceEvent(selectedAsset, selectedEvent)
    if (result.changed) {
      setAssetOverrides((current) => ({ ...current, [result.asset.id]: result.asset }))
      const nextFieldName = selectedEvent.newFieldName ?? selectedEvent.fieldName
      setSelectedFieldName(
        result.asset.fields.find((field) => field.name === nextFieldName)?.name ??
          result.asset.fields[0]?.name ??
          '',
      )
    }
    setEventMessage(result.message)
    setDecisionRecord(null)
  }

  function createRecord() {
    if (!selectedAsset || !activeField || !recommendation || !policyDecision) {
      return
    }

    setDecisionRecord(
      createGovernanceDecisionRecord({
        asset: selectedAsset,
        field: activeField,
        recommendation,
        policyDecision,
        impact: decisionImpact,
        event: selectedEvent?.assetId === selectedAsset.id ? selectedEvent : undefined,
      }),
    )
  }

  function resetWorkbench() {
    setFilters({ ...DEFAULT_GOVERNANCE_FILTERS })
    setAssetOverrides({})
    setSelectedAssetId(defaultAsset?.id ?? '')
    setSelectedFieldName(defaultAsset?.fields[0]?.name ?? '')
    setRole('analyst')
    setPurpose('business-analysis')
    setSelectedEventId(visualization.events[0]?.id ?? '')
    setEventMessage('')
    setDecisionRecord(null)
  }

  return (
    <div className="governance-workbench">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">
            Asset Catalog · Governance Decision Workbench
          </span>
          <p aria-live="polite">
            {filteredAssets.length} / {catalogAssets.length}{' '}
            个资产匹配当前搜索；先发现，再核验证据。
          </p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={resetWorkbench}
        >
          重置工作台
        </button>
      </div>

      <section className="governance-catalog" aria-labelledby="governance-catalog-title">
        <div className="governance-section-heading">
          <div>
            <span className="governance-overline">01 · Discover assets</span>
            <h3 id="governance-catalog-title">先用业务语义搜索订单域资产</h3>
          </div>
          <p>结果卡片直接暴露 definition、Owner、lifecycle、sensitivity 和 freshness 差异。</p>
        </div>
        <SearchFilters assets={catalogAssets} filters={filters} onChange={updateFilters} />
        <div className="governance-catalog__body">
          <div className="governance-catalog__results" aria-label="资产搜索结果">
            {filteredAssets.length > 0 ? (
              filteredAssets.map((asset) => (
                <AssetCard
                  asset={asset}
                  isSelected={asset.id === selectedAsset?.id}
                  key={asset.id}
                  onSelect={() => selectAsset(asset.id)}
                />
              ))
            ) : (
              <p className="governance-empty-text">没有匹配资产；换一个业务关键词或清除筛选。</p>
            )}
          </div>
          {selectedAsset && assetImpact && governanceImpact ? (
            <AssetInspector
              asset={selectedAsset}
              selectedFieldName={activeField?.name ?? ''}
              onSelectField={setSelectedFieldName}
              assetImpact={assetImpact}
              governanceImpact={governanceImpact}
            />
          ) : (
            <p className="governance-empty-text">请选择一项资产查看证据。</p>
          )}
        </div>
      </section>

      {selectedAsset && (
        <PolicySimulation
          fields={selectedAsset.fields}
          selectedFieldName={activeField?.name ?? ''}
          role={role}
          purpose={purpose}
          policyDecision={policyDecision}
          onFieldChange={setSelectedFieldName}
          onRoleChange={setRole}
          onPurposeChange={setPurpose}
        />
      )}

      <section className="governance-event-picker" aria-labelledby="governance-event-picker-title">
        <div className="governance-section-heading">
          <div>
            <span className="governance-overline">02 · Change governance</span>
            <h3 id="governance-event-picker-title">从确定性事件开始做影响消费</h3>
          </div>
          <p>事件来自本章；Lineage Impact 只消费第 08 章已有节点和边。</p>
        </div>
        <div className="governance-event-picker__options" role="list" aria-label="治理事件选择">
          {visualization.events.map((event) => (
            <button
              className={`governance-event-option${event.id === selectedEvent?.id ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={event.id === selectedEvent?.id}
              key={event.id}
              onClick={() => selectEvent(event.id)}
            >
              <span>{EVENT_TYPE_LABELS[event.eventType]}</span>
              <strong>{event.label}</strong>
              <small>
                {catalogAssets.find((asset) => asset.id === event.assetId)?.technicalName}
              </small>
            </button>
          ))}
        </div>
      </section>

      <ChangeImpactPanel
        event={selectedEvent}
        impact={eventImpact}
        onApply={applySelectedEvent}
        eventMessage={eventMessage}
      />

      <DecisionRecordPanel
        record={decisionRecord}
        onCreate={createRecord}
        disabled={!selectedAsset || !activeField || !recommendation || !policyDecision}
      />

      <p className="visualization-note">
        <span aria-hidden="true">↳</span>
        教学边界：本工作台是 local + deterministic simulation；质量只消费第 07
        章证据投影，未覆盖的资产保持 unknown，不把未知显示成 pass。
      </p>
    </div>
  )
}
