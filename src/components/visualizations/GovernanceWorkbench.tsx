import { useMemo, useState } from 'react'
import type {
  GovernanceAsset,
  GovernanceField,
  GovernancePurpose,
  GovernanceResponsibilityItem,
  GovernanceVisualization,
} from '../../types'
import {
  DEFAULT_GOVERNANCE_FILTERS,
  filterGovernanceAssets,
  getGovernanceEvidenceDecision,
  getGovernanceFieldAccess,
  getGovernancePurposeLabel,
  getReplacementAsset,
  GOVERNANCE_LIFECYCLE_LABELS,
  GOVERNANCE_PURPOSE_OPTIONS,
  maskGovernanceValue,
} from '../../utils/governance'

interface GovernanceWorkbenchProps {
  visualization: GovernanceVisualization
}

function PanelHeading({
  eyebrow,
  title,
  description,
  id,
}: {
  eyebrow: string
  title: string
  description: string
  id?: string
}) {
  return (
    <div className="governance-heading">
      <div>
        <span className="governance-overline">{eyebrow}</span>
        <h3 id={id}>{title}</h3>
      </div>
      <p>{description}</p>
    </div>
  )
}

function LifecycleBadge({ asset }: { asset: GovernanceAsset }) {
  return (
    <span className={`governance-badge governance-badge--${asset.lifecycle}`}>
      {GOVERNANCE_LIFECYCLE_LABELS[asset.lifecycle]}
    </span>
  )
}

function AssetResultCard({
  asset,
  selected,
  onSelect,
}: {
  asset: GovernanceAsset
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      className={`governance-result-card${selected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={selected}
      data-asset-id={asset.id}
      onClick={onSelect}
    >
      <span className="governance-card-kicker">{asset.assetType}</span>
      <strong>{asset.businessName}</strong>
      <code>{asset.technicalName}</code>
      <span className="governance-card-description">{asset.description}</span>
      <span className="governance-card-meta">
        <span>{asset.businessDefinition.grain}</span>
        <LifecycleBadge asset={asset} />
      </span>
    </button>
  )
}

function DefinitionPanel({ asset }: { asset: GovernanceAsset }) {
  return (
    <div className="governance-definition-card">
      <div className="governance-definition-card__topline">
        <div>
          <span className="governance-overline">资产定义</span>
          <h4>{asset.businessName}</h4>
          <code>{asset.technicalName}</code>
        </div>
        <LifecycleBadge asset={asset} />
      </div>
      <p>{asset.businessDefinition.summary}</p>
      <dl className="governance-definition-grid">
        <div>
          <dt>一行是什么</dt>
          <dd>{asset.businessDefinition.grain}</dd>
        </div>
        <div>
          <dt>包含什么</dt>
          <dd>{asset.businessDefinition.scope}</dd>
        </div>
        <div>
          <dt>不包含什么</dt>
          <dd>{asset.businessDefinition.exclusions ?? '未说明'}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{asset.owner ?? '未登记'}</dd>
        </div>
      </dl>
    </div>
  )
}

function AssetSelectionLab({ visualization }: { visualization: GovernanceVisualization }) {
  const [query, setQuery] = useState('存款余额')
  const [selectedAssetId, setSelectedAssetId] = useState('dws-deposit-balance-daily')
  const [confirmedAssetId, setConfirmedAssetId] = useState('')
  const filteredAssets = useMemo(
    () =>
      filterGovernanceAssets(visualization.assets, {
        ...DEFAULT_GOVERNANCE_FILTERS,
        query,
      }),
    [query, visualization.assets],
  )
  const selectedAsset =
    visualization.assets.find((asset) => asset.id === selectedAssetId) ?? filteredAssets[0]

  return (
    <div className="governance-workbench" data-governance-focus="asset-selection">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">08-1 · 资产搜索结果</span>
          <p aria-live="polite">搜索“存款余额”，比较每一行实际代表什么。</p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => {
            setQuery('存款余额')
            setSelectedAssetId('dws-deposit-balance-daily')
            setConfirmedAssetId('')
          }}
        >
          重置选择
        </button>
      </div>

      <section className="governance-panel" aria-labelledby="governance-asset-selection-title">
        <PanelHeading
          id="governance-asset-selection-title"
          eyebrow="Search → compare → choose"
          title="先看定义，再决定哪份资产回答当前问题"
          description="DWD、DWS、ADS 只是技术位置；当前业务问题决定选择。"
        />
        <label className="governance-search-field">
          <span>业务关键词</span>
          <input
            type="search"
            value={query}
            aria-label="搜索资产"
            placeholder="例如：存款余额"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="governance-selection-layout">
          <div className="governance-result-list" aria-label="资产搜索结果">
            {filteredAssets.length > 0 ? (
              filteredAssets.map((asset) => (
                <AssetResultCard
                  key={asset.id}
                  asset={asset}
                  selected={asset.id === selectedAsset?.id}
                  onSelect={() => setSelectedAssetId(asset.id)}
                />
              ))
            ) : (
              <p className="governance-empty">没有匹配资产。换一个业务关键词。</p>
            )}
          </div>
          {selectedAsset ? (
            <div className="governance-detail-column">
              <DefinitionPanel asset={selectedAsset} />
              <div className="governance-decision-card">
                <div>
                  <span className="governance-overline">当前问题</span>
                  <strong>按机构查看某业务日的存款余额</strong>
                  <p>需要 Branch × Product × business_date 的日汇总。</p>
                </div>
                <button
                  className="button button--primary button--small"
                  type="button"
                  onClick={() => setConfirmedAssetId(selectedAsset.id)}
                >
                  选择这份资产
                </button>
              </div>
              {confirmedAssetId && (
                <p className="governance-live-message" aria-live="polite">
                  已选择{' '}
                  <code>
                    {
                      visualization.assets.find((asset) => asset.id === confirmedAssetId)
                        ?.technicalName
                    }
                  </code>
                  ： 定义与当前机构分析需求匹配。
                </p>
              )}
            </div>
          ) : (
            <p className="governance-empty">请选择一项资产查看定义。</p>
          )}
        </div>
      </section>
      <p className="visualization-note">
        <span aria-hidden="true">↳</span>
        选择依据是业务定义、已有 Grain、范围和排除项，不是层级高低。
      </p>
    </div>
  )
}

function EvidenceStatusBadge({ status }: { status: 'recommended' | 'not-recommended' }) {
  return (
    <span className={`governance-badge governance-badge--${status}`}>
      {status === 'recommended' ? '当前建议使用' : '暂不建议使用'}
    </span>
  )
}

function EvidenceCheckLab({ visualization }: { visualization: GovernanceVisualization }) {
  const cases = visualization.qualityCases ?? []
  const [selectedCaseId, setSelectedCaseId] = useState(cases[0]?.id ?? '')
  const selectedCase = cases.find((qualityCase) => qualityCase.id === selectedCaseId) ?? cases[0]
  const decision = selectedCase ? getGovernanceEvidenceDecision(selectedCase) : undefined

  return (
    <div className="governance-workbench" data-governance-focus="evidence-check">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">08-2 · Quality + Freshness</span>
          <p aria-live="polite">当前需求：今天查看昨天业务日的机构存款余额。</p>
        </div>
        <span className="governance-toolbar-hint">只消费第 06 章已提供的证据</span>
      </div>
      <section className="governance-panel" aria-labelledby="governance-evidence-title">
        <PanelHeading
          id="governance-evidence-title"
          eyebrow="Evidence → decision"
          title="语义匹配以后，还要看今天能不能用"
          description="Quality PASS 和 Freshness 都要放回当前业务日期判断。"
        />
        <div
          className="governance-evidence-choices"
          role="list"
          aria-label="Quality 与 Freshness 候选"
        >
          {cases.map((qualityCase) => {
            const caseDecision = getGovernanceEvidenceDecision(qualityCase)
            return (
              <button
                className={`governance-evidence-choice${qualityCase.id === selectedCase?.id ? ' is-selected' : ''}`}
                type="button"
                aria-pressed={qualityCase.id === selectedCase?.id}
                key={qualityCase.id}
                onClick={() => setSelectedCaseId(qualityCase.id)}
              >
                <span className="governance-card-kicker">{qualityCase.label}</span>
                <strong>{caseDecision.headline}</strong>
                <span>Quality：{qualityCase.qualityStatus.toUpperCase()}</span>
                <span>Freshness：{qualityCase.freshnessLabel}</span>
              </button>
            )
          })}
        </div>
        {selectedCase && decision && (
          <div className={`governance-evidence-result is-${decision.status}`} aria-live="polite">
            <div className="governance-evidence-result__header">
              <div>
                <span className="governance-overline">判断结果</span>
                <h4>{decision.headline}</h4>
              </div>
              <EvidenceStatusBadge status={decision.status} />
            </div>
            <p className="governance-evidence-reason">{decision.reason}</p>
            <div className="governance-evidence-columns">
              <div>
                <h5>证据</h5>
                <ul>
                  {decision.evidence.map((evidence) => (
                    <li key={evidence}>{evidence}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h5>当前需求</h5>
                <p>按机构查看昨天业务日的存款余额。</p>
                <p>定义与 Grain 已匹配，变化点在 Quality 和 Freshness。</p>
              </div>
            </div>
          </div>
        )}
      </section>
      <p className="visualization-note">
        <span aria-hidden="true">↳</span>
        这里没有综合分数：决定来自结论、证据和原因。
      </p>
    </div>
  )
}

function FieldAccessResult({
  field,
  purpose,
}: {
  field: GovernanceField
  purpose: GovernancePurpose
}) {
  const access = getGovernanceFieldAccess({ field, purpose })
  return (
    <div className={`governance-access-result is-${access.outcome}`} aria-live="polite">
      <div className="governance-access-result__header">
        <div>
          <span className="governance-overline">字段使用结论</span>
          <h4>{access.label}</h4>
        </div>
        <code>{field.name}</code>
      </div>
      <p>{access.reason}</p>
      {access.value && (
        <div className="governance-masked-sample">
          <span>教学展示值</span>
          <code>{access.value}</code>
        </div>
      )}
      <ul className="governance-evidence-list">
        {access.evidence.map((evidence) => (
          <li key={evidence}>{evidence}</li>
        ))}
      </ul>
    </div>
  )
}

function FieldAccessLab({ visualization }: { visualization: GovernanceVisualization }) {
  const asset = visualization.assets.find(
    (candidate) => candidate.id === 'dwd-account-balance-detail',
  )
  const fields = asset?.fields ?? []
  const requiredFieldNames = ['business_date', 'branch_id', 'product_type', 'deposit_balance']
  const [selectedFields, setSelectedFields] = useState<string[]>(requiredFieldNames)
  const [activeFieldName, setActiveFieldName] = useState('deposit_balance')
  const [purpose, setPurpose] = useState<GovernancePurpose>('business-analysis')
  const activeField = fields.find((field) => field.name === activeFieldName) ?? fields[0]

  function toggleField(fieldName: string) {
    setSelectedFields((current) =>
      current.includes(fieldName)
        ? current.filter((name) => name !== fieldName)
        : [...current, fieldName],
    )
    setActiveFieldName(fieldName)
  }

  return (
    <div className="governance-workbench" data-governance-focus="field-access">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">08-3 · 字段级使用</span>
          <p aria-live="polite">当前角色：经营分析人员；只选择真正需要的字段。</p>
        </div>
        <span className="governance-toolbar-hint">资产可用 ≠ 所有字段都可直接用</span>
      </div>
      <section className="governance-panel" aria-labelledby="governance-field-access-title">
        <PanelHeading
          id="governance-field-access-title"
          eyebrow="Role + purpose + field"
          title="勾选字段，再换一个业务用途"
          description="同一位使用者切换用途后，字段的必要性和处理方式也会变化。"
        />
        <div className="governance-purpose-controls">
          <label>
            <span>使用角色</span>
            <select aria-label="使用角色" value="analyst" disabled>
              <option value="analyst">经营分析人员</option>
            </select>
          </label>
          <label>
            <span>使用用途</span>
            <select
              aria-label="使用用途"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value as GovernancePurpose)}
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
        </div>
        <div className="governance-field-layout">
          <div className="governance-field-picker">
            <div className="governance-subheading">
              <span className="governance-overline">AccountBalanceSnapshot fields</span>
              <h4>勾选真正需要的字段</h4>
            </div>
            <div className="governance-field-options">
              {fields.map((field) => (
                <label
                  className={selectedFields.includes(field.name) ? 'is-selected' : ''}
                  key={field.name}
                >
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(field.name)}
                    onChange={() => toggleField(field.name)}
                  />
                  <span>
                    <code>{field.name}</code>
                    <strong>{field.label}</strong>
                    {field.sensitivity !== 'public' && field.sensitivity !== 'internal' && (
                      <small>敏感字段 · {field.sensitivity}</small>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <div className="governance-selected-fields">
              <span>当前字段集合</span>
              {selectedFields.length > 0 ? (
                selectedFields.map((fieldName) => <code key={fieldName}>{fieldName}</code>)
              ) : (
                <small>还没有选择字段</small>
              )}
            </div>
          </div>
          {activeField ? (
            <FieldAccessResult field={activeField} purpose={purpose} />
          ) : (
            <p className="governance-empty">先选择一个字段。</p>
          )}
        </div>
      </section>
      <p className="visualization-note">
        <span aria-hidden="true">↳</span>
        {maskGovernanceValue('6222 1234 5678 9012')} 是一次脱敏展示；这里只观察字段处理后的结果。
      </p>
    </div>
  )
}

function LifecycleLab({ visualization }: { visualization: GovernanceVisualization }) {
  const [query, setQuery] = useState('旧')
  const [selectedAssetId, setSelectedAssetId] = useState('ads-deposit-balance-old')
  const [migrationMessage, setMigrationMessage] = useState('')
  const filteredAssets = useMemo(
    () =>
      filterGovernanceAssets(visualization.assets, {
        ...DEFAULT_GOVERNANCE_FILTERS,
        query,
      }),
    [query, visualization.assets],
  )
  const selectedAsset =
    visualization.assets.find((asset) => asset.id === selectedAssetId) ?? filteredAssets[0]
  const replacement = selectedAsset
    ? getReplacementAsset(selectedAsset, visualization.assets)
    : undefined

  function switchToReplacement() {
    if (!replacement) {
      return
    }

    setSelectedAssetId(replacement.id)
    /*
     * #144 Pattern 1: the search follows the migrated asset instead of widening
     * back to a generic keyword. The result list keeps the same single hit, so the
     * detail column no longer jumps ~1 screen down and the migration conclusion /
     * the new asset definition stay where the learner tapped.
     */
    setQuery(replacement.businessName)
    setMigrationMessage(`已切换到 ${replacement.technicalName}；新的依赖不再指向 deprecated 资产。`)
  }

  return (
    <div className="governance-workbench" data-governance-focus="lifecycle">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">08-4 · 生命周期</span>
          <p aria-live="polite">搜索仍可访问的旧资产，判断是否继续建立新的依赖。</p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => {
            setQuery('旧')
            setSelectedAssetId('ads-deposit-balance-old')
            setMigrationMessage('')
          }}
        >
          重置迁移判断
        </button>
      </div>
      <section className="governance-panel" aria-labelledby="governance-lifecycle-title">
        <PanelHeading
          id="governance-lifecycle-title"
          eyebrow="Search → lifecycle → migrate"
          title="能查到，不代表仍然推荐使用"
          description="生命周期状态改变的是新依赖的推荐结论。"
        />
        <label className="governance-search-field">
          <span>搜索资产</span>
          <input
            type="search"
            value={query}
            aria-label="搜索旧资产"
            placeholder="例如：旧、deprecated"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="governance-lifecycle-layout">
          <div className="governance-result-list" aria-label="生命周期搜索结果">
            {filteredAssets.length > 0 ? (
              filteredAssets.map((asset) => (
                <AssetResultCard
                  key={asset.id}
                  asset={asset}
                  selected={asset.id === selectedAsset?.id}
                  onSelect={() => setSelectedAssetId(asset.id)}
                />
              ))
            ) : (
              <p className="governance-empty">没有匹配资产。搜索“旧”或“deprecated”。</p>
            )}
          </div>
          {selectedAsset ? (
            <div className="governance-detail-column">
              {/*
                #144 Pattern 1 (F1): the status block owns the switch action, so it
                is rendered *before* the definition it replaces. The updated asset
                detail then stays below the control the learner just tapped.
              */}
              <div className={`governance-lifecycle-callout is-${selectedAsset.lifecycle}`}>
                <div>
                  <span className="governance-overline">当前状态</span>
                  <strong>{GOVERNANCE_LIFECYCLE_LABELS[selectedAsset.lifecycle]}</strong>
                  <p>
                    {selectedAsset.lifecycle === 'deprecated'
                      ? '仍可读取，但不应再建立新的生产依赖。'
                      : '当前可以作为新的分析来源，仍需核对用途和证据。'}
                  </p>
                </div>
                {replacement && (
                  <button
                    className="button button--primary button--small"
                    type="button"
                    onClick={switchToReplacement}
                  >
                    切换到替代资产
                  </button>
                )}
                {/*
                  #144 Pattern 1: the migration conclusion lives inside the same
                  block as the switch action, so the result of 切换到替代资产 appears
                  where the learner tapped instead of one section further down.
                */}
                {migrationMessage && (
                  <p
                    className="governance-live-message"
                    data-governance-migration-conclusion
                    aria-live="polite"
                  >
                    {migrationMessage}
                  </p>
                )}
              </div>
              <DefinitionPanel asset={selectedAsset} />
            </div>
          ) : (
            <p className="governance-empty">请选择一项资产查看生命周期。</p>
          )}
        </div>
      </section>
      <p className="visualization-note">
        <span aria-hidden="true">↳</span>
        本节核心只保留 active 与 deprecated；retiring 只作为现实系统中的扩展说明。
      </p>
    </div>
  )
}

function ResponsibilityCard({
  item,
  expanded,
  onToggle,
}: {
  item: GovernanceResponsibilityItem
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      className={`governance-responsibility-card${expanded ? ' is-expanded' : ''}`}
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <span className="governance-card-kicker">
        {item.kind === 'source' ? '变更字段' : item.kind === 'asset' ? '受影响资产' : '下游消费者'}
      </span>
      <strong>{item.label}</strong>
      <span>Owner：{item.owner}</span>
      {expanded && <small>{item.action}</small>}
    </button>
  )
}

function ChangeResponsibilityLab({ visualization }: { visualization: GovernanceVisualization }) {
  const impact = visualization.changeImpact
  const responsibilities = impact?.responsibilities ?? []
  const [expandedId, setExpandedId] = useState(responsibilities[0]?.id ?? '')
  const [showChecklist, setShowChecklist] = useState(false)

  if (!impact) {
    return <p className="governance-empty">没有可用的前置影响分析结果。</p>
  }

  return (
    <div className="governance-workbench" data-governance-focus="change-responsibility">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">08-5 · Owner responsibility</span>
          <p aria-live="polite">{impact.evidenceLabel}；本节不重新计算血缘。</p>
        </div>
        <button
          className="button button--quiet button--small"
          type="button"
          onClick={() => {
            setExpandedId(responsibilities[0]?.id ?? '')
            setShowChecklist(false)
          }}
        >
          重置责任清单
        </button>
      </div>
      <section className="governance-panel" aria-labelledby="governance-change-title">
        <PanelHeading
          id="governance-change-title"
          eyebrow="Read impact → map Owner → act"
          title="字段变了以后，谁需要处理？"
          description="影响路径已经存在；现在把每个确认动作交给对应 Owner。"
        />
        <div className="governance-change-field">
          <span className="governance-overline">变更字段</span>
          <strong>{impact.changedField}</strong>
          <span>不重新遍历血缘，直接读取下面这条影响路径。</span>
        </div>
        <ol className="governance-impact-path" aria-label="已有影响路径">
          {impact.path.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
        <div className="governance-responsibility-grid" aria-label="受影响对象与 Owner">
          {responsibilities.map((item) => (
            <ResponsibilityCard
              key={item.id}
              item={item}
              expanded={item.id === expandedId}
              onToggle={() => setExpandedId(item.id)}
            />
          ))}
        </div>
        <div className="governance-checklist-action">
          <div>
            <span className="governance-overline">输出</span>
            <strong>变更责任清单</strong>
            <p>字段、受影响资产、Owner 和需要确认的动作都已对齐。</p>
          </div>
          <button
            className="button button--primary button--small"
            type="button"
            onClick={() => setShowChecklist((current) => !current)}
          >
            {showChecklist ? '收起责任清单' : '展开责任清单'}
          </button>
        </div>
        {showChecklist && (
          <div className="governance-checklist" aria-live="polite">
            {responsibilities.map((item) => (
              <div className="governance-checklist-row" key={item.id}>
                <span>{item.label}</span>
                <strong>{item.owner}</strong>
                <p>{item.action}</p>
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="visualization-note">
        <span aria-hidden="true">↳</span>
        这里结束于责任清单，实际组织流程由真实工作环境承接。
      </p>
    </div>
  )
}

export function GovernanceWorkbench({ visualization }: GovernanceWorkbenchProps) {
  switch (visualization.focus) {
    case 'asset-selection':
      return <AssetSelectionLab visualization={visualization} />
    case 'evidence-check':
      return <EvidenceCheckLab visualization={visualization} />
    case 'field-access':
      return <FieldAccessLab visualization={visualization} />
    case 'lifecycle':
      return <LifecycleLab visualization={visualization} />
    case 'change-responsibility':
      return <ChangeResponsibilityLab visualization={visualization} />
  }
}
