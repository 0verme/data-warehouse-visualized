import { useId, useMemo, useState } from 'react'
import type {
  LineageEdge,
  LineageEntityType,
  LineageEvidenceSource,
  LineageNode,
  LineageVerificationStatus,
} from '../../types'
import type {
  LineageEvidenceRecord,
  LineageFieldDependency,
  LineageImpactTeachingConfig,
  LineageInvestigationTeachingConfig,
  LineageRootCauseCandidate,
  LineageTeachingConfig,
} from '../../features/lineage/types'
import {
  getDirectDownstreamNodes,
  getDirectUpstreamNodes,
  getInvestigationDecision,
  getLineageEntityType,
  getLineageImpactSummary,
  getLineageRelationVisual,
  getTransitiveDownstreamNodes,
  getTransitiveUpstreamNodes,
} from '../../utils/lineage'
import '../../styles/lessons/lineage-teaching.css'

interface LineageTeachingLabProps {
  nodes: LineageNode[]
  edges: LineageEdge[]
  teaching: LineageTeachingConfig
}

const ENTITY_TYPE_LABELS: Record<LineageEntityType, string> = {
  table: '表',
  field: '字段',
  task: '任务',
  metric: '指标',
}

const ENTITY_TYPE_MARKERS: Record<LineageEntityType, string> = {
  table: '▣',
  field: '◇',
  task: '▶',
  metric: '●',
}

const EVIDENCE_SOURCE_LABELS: Record<LineageEvidenceSource, string> = {
  sql_transformation: 'SQL',
  task_dependency: '任务配置',
  manual_metadata: '人工登记',
  metric_definition: '指标定义',
  quality_event: 'Quality Event',
}

const VERIFICATION_STATUS_LABELS: Record<LineageVerificationStatus, string> = {
  confirmed: '已确认',
  pending: '待确认',
}

function getNode(nodes: readonly LineageNode[], nodeId: string): LineageNode | undefined {
  return nodes.find((node) => node.id === nodeId)
}

function getNodeLabel(nodes: readonly LineageNode[], nodeId: string): string {
  return getNode(nodes, nodeId)?.label ?? nodeId
}

function getTableGraph(
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  tableNodeIds: readonly string[],
) {
  const nodeIds = new Set(tableNodeIds)
  const tableNodes = nodes.filter((node) => nodeIds.has(node.id))
  const tableEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))

  return { tableNodes, tableEdges }
}

function StatusBadge({ status }: { status: LineageVerificationStatus }) {
  return (
    <span
      className={`lineage-teaching-badge lineage-teaching-badge--status lineage-teaching-badge--${status}`}
    >
      {VERIFICATION_STATUS_LABELS[status]}
    </span>
  )
}

function EvidenceBadge({ source }: { source: LineageEvidenceSource }) {
  return (
    <span className="lineage-teaching-badge lineage-teaching-badge--source">
      来源：{EVIDENCE_SOURCE_LABELS[source]}
    </span>
  )
}

function NodeFlow({
  nodeIds,
  nodes,
  activeNodeId,
  onSelect,
  label,
}: {
  nodeIds: readonly string[]
  nodes: readonly LineageNode[]
  activeNodeId?: string
  onSelect?: (nodeId: string) => void
  label: string
}) {
  return (
    <ol className="lineage-teaching-flow" aria-label={label}>
      {nodeIds.map((nodeId, index) => {
        const node = getNode(nodes, nodeId)
        const entityType = node ? getLineageEntityType(node) : 'table'
        const content = (
          <>
            <span className="lineage-teaching-flow__layer" data-node-type={entityType}>
              <span className="lineage-node__type-marker" aria-hidden="true">
                {ENTITY_TYPE_MARKERS[entityType]}
              </span>{' '}
              {ENTITY_TYPE_LABELS[entityType]} · {node?.layer ?? '对象'}
            </span>
            <strong>{node?.label ?? nodeId}</strong>
            <small>{node?.role ?? '教学对象'}</small>
          </>
        )

        return (
          <li data-node-type={entityType} key={nodeId}>
            {onSelect ? (
              <button
                className={`lineage-teaching-flow__node${activeNodeId === nodeId ? ' is-selected' : ''}`}
                data-focus={activeNodeId === nodeId ? 'primary' : 'context'}
                data-node-type={entityType}
                type="button"
                aria-pressed={activeNodeId === nodeId}
                onClick={() => onSelect(nodeId)}
              >
                {content}
              </button>
            ) : (
              <div
                className="lineage-teaching-flow__node"
                data-focus="context"
                data-node-type={entityType}
              >
                {content}
              </div>
            )}
            {index < nodeIds.length - 1 && (
              <span className="lineage-teaching-flow__arrow" aria-hidden="true">
                ↓
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function OverviewQuestion({
  question,
  answer,
  onAnswer,
}: {
  question: {
    id: string
    prompt: string
    options: readonly { id: string; label: string }[]
    correctAnswer: string
    explanation: string
  }
  answer?: string
  onAnswer: (answer: string) => void
}) {
  const isAnswered = answer !== undefined
  const isCorrect = answer === question.correctAnswer

  return (
    <fieldset className="lineage-teaching-question">
      <legend>{question.prompt}</legend>
      <div className="lineage-teaching-choice-list" role="radiogroup" aria-label={question.prompt}>
        {question.options.map((option) => {
          const isSelected = answer === option.id
          const isCorrectSelection = isSelected && isCorrect
          const isIncorrectSelection = isSelected && !isCorrect
          return (
            <button
              className={`lineage-teaching-choice${isSelected ? ' is-selected' : ''}${
                isCorrectSelection ? ' is-correct' : ''
              }${isIncorrectSelection ? ' is-incorrect' : ''}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              key={option.id}
              onClick={() => onAnswer(option.id)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      <p
        className={`lineage-teaching-feedback${
          isAnswered ? (isCorrect ? ' is-success' : ' is-error') : ''
        }`}
        aria-live="polite"
      >
        {isAnswered
          ? isCorrect
            ? '判断正确。'
            : '还差一步，看看标出的关系。'
          : '请选择一个判断。'}{' '}
        {isAnswered && question.explanation}
      </p>
    </fieldset>
  )
}

function TaskDependencyContrast({
  example,
}: {
  example: NonNullable<LineageTeachingConfig['taskDependency']>
}) {
  const headingId = useId().replace(/:/g, '')

  return (
    <section className="lineage-teaching-contrast" aria-labelledby={`${headingId}-title`}>
      <div className="lineage-teaching-panel-heading">
        <span className="lineage-teaching-overline">运行依赖 / 数据依赖</span>
        <h3 id={`${headingId}-title`}>Task dependency ≠ Data lineage</h3>
      </div>
      <p>
        “谁先跑”描述运行依赖；“数据从哪里来”描述数据依赖。两个关系可能方向相同，但回答的不是同一个问题。
      </p>
      <div className="lineage-teaching-contrast-grid">
        <div data-relation="depends_on">
          <span>任务关系：谁先跑 · control / dependency · depends_on</span>
          <div
            className="lineage-teaching-mini-flow"
            aria-label="控制依赖方向：前置任务到被放行任务"
          >
            <code>{example.upstreamLabel}</code>
            <span
              className="lineage-teaching-mini-flow__arrow lineage-teaching-mini-flow__arrow--dependency"
              aria-hidden="true"
            >
              ↓
            </span>
            <code>{example.downstreamLabel}</code>
          </div>
          <small>{example.evidence.detail}</small>
        </div>
        <div data-relation="transform">
          <span>数据关系：数据从哪里来 · data / transform</span>
          <div className="lineage-teaching-mini-flow" aria-label="数据加工方向：上游表到下游表">
            <code>dwd_account_balance_detail</code>
            <span
              className="lineage-teaching-mini-flow__arrow lineage-teaching-mini-flow__arrow--data"
              aria-hidden="true"
            >
              ↓
            </span>
            <code>dws_deposit_balance_daily</code>
          </div>
          <small>这条关系回答 DWS 的数据来源，不说明任务何时获得运行 slot。</small>
        </div>
      </div>
    </section>
  )
}

function OverviewPanel({
  nodes,
  edges,
  teaching,
}: {
  nodes: readonly LineageNode[]
  edges: readonly LineageEdge[]
  teaching: LineageTeachingConfig
}) {
  const headingId = useId().replace(/:/g, '')
  const nodeIds = teaching.overviewNodeIds ?? teaching.tableNodeIds
  const initialNodeId = teaching.initialNodeId ?? nodeIds[0] ?? ''
  const [selectedNodeId, setSelectedNodeId] = useState(initialNodeId)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const node = getNode(nodes, selectedNodeId)
  const directUpstream = getDirectUpstreamNodes(edges, selectedNodeId)
  const transitiveUpstream = getTransitiveUpstreamNodes(nodes, edges, selectedNodeId, {
    includeCrossEntity: true,
  })
  const directDownstream = getDirectDownstreamNodes(edges, selectedNodeId)
  const transitiveDownstream = getTransitiveDownstreamNodes(nodes, edges, selectedNodeId, {
    includeCrossEntity: true,
  })

  const questions = [
    {
      id: 'dws-direct-upstream',
      prompt: 'DWS 的直接上游是谁？',
      options: [
        { id: 'dwd', label: 'dwd_account_balance_detail' },
        { id: 'snapshot', label: 'AccountBalanceSnapshot' },
        { id: 'ads', label: 'ads_deposit_balance' },
      ],
      correctAnswer: 'dwd',
      explanation: 'DWD 紧挨着 DWS；AccountBalanceSnapshot 还隔着一层，是传递上游。',
    },
    {
      id: 'snapshot-distance',
      prompt: 'AccountBalanceSnapshot 对 DWS 是哪种上游？',
      options: [
        { id: 'direct', label: '直接上游' },
        { id: 'transitive', label: '传递上游' },
        { id: 'none', label: '没有上游关系' },
      ],
      correctAnswer: 'transitive',
      explanation: '它经过 dwd_account_balance_detail 才到达 DWS。',
    },
    {
      id: 'dwd-impact',
      prompt: 'DWD 变化以后，DWS 是否可能受到影响？',
      options: [
        { id: 'yes', label: '可能会' },
        { id: 'no', label: '不会' },
      ],
      correctAnswer: 'yes',
      explanation: 'DWD 是 DWS 的直接上游，变化会沿数据依赖向下传递。',
    },
  ] as const

  return (
    <div className="lineage-teaching-panel lineage-teaching-panel--overview">
      <div className="lineage-teaching-panel-heading">
        <span className="lineage-teaching-overline">最小表级链路</span>
        <h3>先读懂一条数据依赖</h3>
        <p>先只看五个对象。点击节点，比较它的直接关系和隔着中间层的传递关系。</p>
      </div>
      <NodeFlow
        nodeIds={nodeIds}
        nodes={nodes}
        activeNodeId={selectedNodeId}
        onSelect={setSelectedNodeId}
        label="存款余额最小表级血缘链路"
      />
      <div className="lineage-teaching-selection" aria-live="polite">
        <div>
          <span>当前节点</span>
          <strong>{node?.label ?? '未选择对象'}</strong>
        </div>
        <div>
          <span>直接上游</span>
          <strong>{directUpstream.map((id) => getNodeLabel(nodes, id)).join('、') || '无'}</strong>
        </div>
        <div>
          <span>传递上游</span>
          <strong>
            {transitiveUpstream.map((id) => getNodeLabel(nodes, id)).join('、') || '无'}
          </strong>
        </div>
        <div>
          <span>直接下游</span>
          <strong>
            {directDownstream.map((id) => getNodeLabel(nodes, id)).join('、') || '无'}
          </strong>
        </div>
        <div>
          <span>传递下游</span>
          <strong>
            {transitiveDownstream.map((id) => getNodeLabel(nodes, id)).join('、') || '无'}
          </strong>
        </div>
      </div>
      <section
        className="lineage-teaching-questions"
        aria-labelledby={`${headingId}-questions-title`}
      >
        <div className="lineage-teaching-panel-heading">
          <span className="lineage-teaching-overline">读图判断</span>
          <h3 id={`${headingId}-questions-title`}>不要只记箭头方向</h3>
        </div>
        {questions.map((question) => (
          <OverviewQuestion
            answer={answers[question.id]}
            key={question.id}
            question={question}
            onAnswer={(answer) => setAnswers((current) => ({ ...current, [question.id]: answer }))}
          />
        ))}
      </section>
      {teaching.taskDependency && <TaskDependencyContrast example={teaching.taskDependency} />}
    </div>
  )
}

function FieldPath({ dependency }: { dependency: LineageFieldDependency }) {
  return (
    <ol className="lineage-teaching-field-path" aria-label={`${dependency.label}依赖路径`}>
      {dependency.path.map((step, index) => (
        <li key={`${dependency.id}-${step}-${index}`}>
          <code className={step === dependency.operation ? 'is-operation' : undefined}>{step}</code>
          {index < dependency.path.length - 1 && (
            <span aria-hidden="true">{step === dependency.operation ? '↓' : '→'}</span>
          )}
        </li>
      ))}
    </ol>
  )
}

function FieldDependencyPanel({ teaching }: { teaching: LineageTeachingConfig }) {
  const dependencies = teaching.fieldDependencies ?? []
  const [selectedId, setSelectedId] = useState(dependencies[0]?.id ?? '')
  const selected =
    dependencies.find((dependency) => dependency.id === selectedId) ?? dependencies[0]

  return (
    <div className="lineage-teaching-panel lineage-teaching-panel--fields">
      <div className="lineage-teaching-panel-heading">
        <span className="lineage-teaching-overline">字段级下钻</span>
        <h3>知道 DWS 来自 DWD，还不够</h3>
        <p>表级关系告诉你去哪里找；下面的字段路径告诉你在那一跳里具体检查什么。</p>
      </div>
      <div className="lineage-teaching-table-hop" aria-label="表级调查入口">
        <code>dwd_account_balance_detail</code>
        <span aria-hidden="true">→</span>
        <code>dws_deposit_balance_daily</code>
        <span>现在检查这条转换中的字段依赖</span>
      </div>
      <div className="lineage-teaching-field-tabs" role="tablist" aria-label="字段依赖类型">
        {dependencies.map((dependency) => (
          <button
            className={`lineage-teaching-field-tab${selected?.id === dependency.id ? ' is-selected' : ''}`}
            type="button"
            role="tab"
            aria-selected={selected?.id === dependency.id}
            key={dependency.id}
            onClick={() => setSelectedId(dependency.id)}
          >
            <strong>{dependency.operation}</strong>
            <span>{dependency.label}</span>
          </button>
        ))}
      </div>
      {selected && (
        <article className="lineage-teaching-field-detail" aria-live="polite">
          <div className="lineage-teaching-field-detail__heading">
            <div>
              <span className="lineage-teaching-overline">当前依赖</span>
              <h4>{selected.label}</h4>
              <span className="lineage-teaching-relation" data-relation="derives">
                {getLineageRelationVisual('derives').label}
              </span>
            </div>
            <div className="lineage-teaching-badge-row">
              <EvidenceBadge source={selected.evidenceSource} />
              <StatusBadge status={selected.verificationStatus} />
            </div>
          </div>
          <FieldPath dependency={selected} />
          <p>{selected.detail}</p>
          <small className="lineage-teaching-evidence-text">证据：{selected.evidence.detail}</small>
        </article>
      )}
      <p className="lineage-teaching-boundary">
        这里不重新讲 GROUP BY、JOIN 语法或 SQL Parser；SUM、rename、FILTER、JOIN
        只用来标出数据依赖的证据。
      </p>
    </div>
  )
}

function QualityEventCard({ config }: { config: LineageInvestigationTeachingConfig }) {
  const headingId = useId().replace(/:/g, '')
  const event = config.qualityEvent
  const evidence = event.evidence[0]

  return (
    <section className="lineage-teaching-quality-event" aria-labelledby={`${headingId}-title`}>
      <div className="lineage-teaching-quality-status">
        <strong>Quality FAILED</strong>
        <strong>Release BLOCKED</strong>
      </div>
      <h4 id={`${headingId}-title`}>第 06 章留下的 Quality Event</h4>
      <dl className="lineage-teaching-event-facts">
        <div>
          <dt>business_date</dt>
          <dd>{event.schedulerContext.businessDate}</dd>
        </div>
        <div>
          <dt>table</dt>
          <dd>{event.target.table}</dd>
        </div>
        <div>
          <dt>rule</dt>
          <dd>{event.ruleId}</dd>
        </div>
        <div>
          <dt>expected</dt>
          <dd>expected = {String(evidence?.expected ?? 0)}</dd>
        </div>
        <div>
          <dt>observed</dt>
          <dd>delta = {event.observedValue}</dd>
        </div>
      </dl>
      <p>{evidence?.detail ?? 'DWD 与 DWS 的对账结果不一致。'}</p>
      <small>质量事件只告诉我们哪里出现了异常和发布被阻断；接下来要用血缘决定调查顺序。</small>
    </section>
  )
}

function InvestigationSteps({ stage }: { stage: 'event' | 'direct' | 'branch' }) {
  const steps = [
    ['event', '质量事件'],
    ['direct', '检查直接上游'],
    ['branch', '决定向近处还是远处查'],
  ] as const
  const stageIndex = steps.findIndex(([id]) => id === stage)

  return (
    <ol className="lineage-teaching-investigation-steps" aria-label="调查顺序">
      {steps.map(([id, label], index) => (
        <li className={index <= stageIndex ? 'is-active' : ''} key={id}>
          <span>{index + 1}</span>
          <strong>{label}</strong>
        </li>
      ))}
    </ol>
  )
}

function CandidateList({
  candidates,
  nodes,
}: {
  candidates: readonly LineageRootCauseCandidate[]
  nodes: readonly LineageNode[]
}) {
  const headingId = useId().replace(/:/g, '')
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? '')
  const selected = candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0]

  if (candidates.length === 0) {
    return null
  }

  return (
    <section className="lineage-teaching-candidates" aria-labelledby={`${headingId}-title`}>
      <div className="lineage-teaching-panel-heading">
        <span className="lineage-teaching-overline">调查收束</span>
        <h4 id={`${headingId}-title`}>高优先根因候选</h4>
        <p>候选来自前面已经看到的字段关系；它们帮助缩小范围，不宣布真正根因。</p>
      </div>
      <div className="lineage-teaching-candidate-grid">
        {candidates.map((candidate) => (
          <button
            className={`lineage-teaching-candidate${selected?.id === candidate.id ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={selected?.id === candidate.id}
            key={candidate.id ?? candidate.entityId}
            onClick={() => setSelectedId(candidate.id ?? candidate.entityId)}
          >
            <span>
              {candidate.kind === 'value-source'
                ? '值来源'
                : candidate.kind === 'join-dependency'
                  ? 'JOIN'
                  : 'FILTER'}
            </span>
            <strong>{candidate.label ?? getNodeLabel(nodes, candidate.entityId)}</strong>
            <small>
              <EvidenceBadge source={candidate.evidenceSource} />{' '}
              <StatusBadge status={candidate.verificationStatus} />
            </small>
          </button>
        ))}
      </div>
      {selected && (
        <article className="lineage-teaching-candidate-detail" aria-live="polite">
          <strong>{selected.label ?? getNodeLabel(nodes, selected.entityId)}</strong>
          <p>{selected.rationale}</p>
          {selected.evidencePath && (
            <ol className="lineage-teaching-candidate-path" aria-label="根因候选证据路径">
              {selected.evidencePath.map((step, index) => (
                <li key={`${selected.id ?? selected.entityId}-${step}-${index}`}>
                  <code>{step}</code>
                </li>
              ))}
            </ol>
          )}
          <small>
            这里仍需要数据 Diff、执行参数、SQL
            版本、任务日志、源系统到数情况或业务变更记录来证明根因。
          </small>
        </article>
      )}
    </section>
  )
}

function InvestigationPanel({
  nodes,
  edges,
  teaching,
}: {
  nodes: readonly LineageNode[]
  edges: readonly LineageEdge[]
  teaching: LineageTeachingConfig
}) {
  const directHeadingId = useId().replace(/:/g, '')
  const branchHeadingId = useId().replace(/:/g, '')
  const config = teaching.investigation
  const [stage, setStage] = useState<'event' | 'direct' | 'branch'>('event')
  const [dwdStatus, setDwdStatus] = useState<'normal' | 'abnormal' | null>(null)
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [checkedChecks, setCheckedChecks] = useState<Set<string>>(new Set())

  if (!config) {
    return <p className="lineage-teaching-empty">当前课程没有调查事件。</p>
  }

  const directUpstream = getDirectUpstreamNodes(edges, config.anomalyNodeId)
  const decision = dwdStatus ? getInvestigationDecision(dwdStatus) : undefined
  const selectedSource = getNode(nodes, selectedSourceId)

  function chooseDwdStatus(status: 'normal' | 'abnormal') {
    setDwdStatus(status)
    setStage('branch')
    setSelectedSourceId('')
    setCheckedChecks(new Set())
  }

  return (
    <div className="lineage-teaching-panel lineage-teaching-panel--investigation">
      <div className="lineage-teaching-panel-heading">
        <span className="lineage-teaching-overline">Quality Event investigation</span>
        <h3>质量告警以后，先查哪一层？</h3>
        <p>调查顺序是近 → 远：先判断直接上游是否已经异常，再决定是否继续向源头展开。</p>
      </div>
      <InvestigationSteps stage={stage} />
      <QualityEventCard config={config} />
      {stage === 'event' && (
        <div className="lineage-teaching-action-block">
          <p>异常节点是 {getNodeLabel(nodes, config.anomalyNodeId)}。先把问题落到这个结果对象。</p>
          <button
            className="button button--primary button--small"
            type="button"
            onClick={() => setStage('direct')}
          >
            确定异常节点
          </button>
        </div>
      )}
      {stage !== 'event' && (
        <section
          className="lineage-teaching-direct-check"
          aria-labelledby={`${directHeadingId}-title`}
        >
          <div className="lineage-teaching-panel-heading">
            <span className="lineage-teaching-overline">第 1 个检查点</span>
            <h4 id={`${directHeadingId}-title`}>先看直接上游</h4>
          </div>
          <NodeFlow
            nodeIds={[config.anomalyNodeId, ...directUpstream]}
            nodes={nodes}
            label="质量异常节点与直接上游"
          />
          <p>
            当前结果是 {getNodeLabel(nodes, config.anomalyNodeId)}；它的直接上游是{' '}
            {directUpstream.map((id) => getNodeLabel(nodes, id)).join('、')}。
          </p>
          <div
            className="lineage-teaching-status-choice"
            role="group"
            aria-label="判断 DWD 是否异常"
          >
            <span>检查 dwd_account_balance_detail 后，你得到什么结论？</span>
            <button
              className={`lineage-teaching-choice${dwdStatus === 'normal' ? ' is-selected is-correct' : ''}`}
              type="button"
              aria-pressed={dwdStatus === 'normal'}
              onClick={() => chooseDwdStatus('normal')}
            >
              DWD 正常
            </button>
            <button
              className={`lineage-teaching-choice${dwdStatus === 'abnormal' ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={dwdStatus === 'abnormal'}
              onClick={() => chooseDwdStatus('abnormal')}
            >
              DWD 已异常
            </button>
          </div>
        </section>
      )}
      {stage === 'branch' && dwdStatus && decision && (
        <section
          className="lineage-teaching-investigation-branch"
          aria-labelledby={`${branchHeadingId}-title`}
        >
          <div className="lineage-teaching-panel-heading">
            <span className="lineage-teaching-overline">第 2 个检查点</span>
            <h4 id={`${branchHeadingId}-title`}>
              {decision === 'inspect-current-transform'
                ? 'DWD 正常，调查停在当前这一跳'
                : 'DWD 已异常，继续向上一层'}
            </h4>
          </div>
          {decision === 'inspect-current-transform' ? (
            <>
              <p className="lineage-teaching-decision is-stop">
                DWD 正常、DWS 异常时，不要直接跳到最源头。优先检查 dwd_account_balance_detail →
                dws_deposit_balance_daily 这一跳。
              </p>
              <div className="lineage-teaching-check-list">
                {config.transformationChecks.map((check) => (
                  <label key={check}>
                    <input
                      type="checkbox"
                      checked={checkedChecks.has(check)}
                      onChange={(event) => {
                        setCheckedChecks((current) => {
                          const next = new Set(current)
                          if (event.target.checked) next.add(check)
                          else next.delete(check)
                          return next
                        })
                      }}
                    />
                    <span>{check}</span>
                  </label>
                ))}
              </div>
              <small>
                这些检查项来自当前转换的证据：SUM、JOIN、FILTER、business_date 和执行参数。
              </small>
            </>
          ) : (
            <>
              <p className="lineage-teaching-decision is-expand">
                DWD
                已异常，问题在当前结果之前已经出现。继续检查与余额结果相关的上游对象，不把同层对象机械地全部扫一遍。
              </p>
              <div className="lineage-teaching-source-grid">
                {config.upstreamExpansionNodeIds.map((nodeId) => (
                  <button
                    className={`lineage-teaching-source-card${selectedSourceId === nodeId ? ' is-selected' : ''}`}
                    type="button"
                    aria-pressed={selectedSourceId === nodeId}
                    key={nodeId}
                    onClick={() => setSelectedSourceId(nodeId)}
                  >
                    <strong>{getNodeLabel(nodes, nodeId)}</strong>
                    <small>{getNode(nodes, nodeId)?.role ?? '上游输入对象'}</small>
                  </button>
                ))}
              </div>
              {selectedSource && (
                <p className="lineage-teaching-selected-source">
                  当前继续查看：{selectedSource.label}。是否异常仍需回到输入样本验证。
                </p>
              )}
            </>
          )}
          <CandidateList candidates={config.candidates} nodes={nodes} />
        </section>
      )}
      <p className="lineage-teaching-boundary">
        血缘是调查地图，不是事故侦探。Root-cause candidate ≠ Root cause proof。
      </p>
    </div>
  )
}

function ImpactPredictionChoices({
  nodeIds,
  nodes,
  selectedIds,
  onToggle,
  disabled,
}: {
  nodeIds: readonly string[]
  nodes: readonly LineageNode[]
  selectedIds: ReadonlySet<string>
  onToggle: (nodeId: string) => void
  disabled: boolean
}) {
  return (
    <div className="lineage-teaching-impact-choices" role="group" aria-label="直接下游预测选项">
      {nodeIds.map((nodeId) => {
        const node = getNode(nodes, nodeId)
        const entityType = node ? getLineageEntityType(node) : 'table'
        const selected = selectedIds.has(nodeId)
        return (
          <button
            className={`lineage-teaching-impact-choice${selected ? ' is-selected' : ''}`}
            data-focus={selected ? 'primary' : 'context'}
            data-node-type={entityType}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            key={nodeId}
            onClick={() => onToggle(nodeId)}
          >
            <strong>
              <span className="lineage-node__type-marker" aria-hidden="true">
                {ENTITY_TYPE_MARKERS[entityType]}
              </span>{' '}
              {node?.label ?? nodeId}
            </strong>
            <small>
              {ENTITY_TYPE_LABELS[entityType]} · {node?.role ?? '教学对象'}
            </small>
          </button>
        )
      })}
    </div>
  )
}

function ImpactChain({
  sourceNodeId,
  revealedIds,
  nodes,
  directIds,
}: {
  sourceNodeId: string
  revealedIds: readonly string[]
  nodes: readonly LineageNode[]
  directIds: ReadonlySet<string>
}) {
  return (
    <ol className="lineage-teaching-impact-chain" aria-label="影响传播链">
      <li className="is-source" data-focus="primary" data-impact-level="source">
        <span>变更起点 · Primary Focus</span>
        <strong>{getNodeLabel(nodes, sourceNodeId)}</strong>
      </li>
      {revealedIds.map((nodeId) => (
        <li
          className={directIds.has(nodeId) ? 'is-direct' : 'is-transitive'}
          data-focus="path"
          data-impact-level={directIds.has(nodeId) ? 'direct' : 'transitive'}
          key={nodeId}
        >
          <span>{directIds.has(nodeId) ? '直接下游' : '传递影响'}</span>
          <strong>{getNodeLabel(nodes, nodeId)}</strong>
        </li>
      ))}
    </ol>
  )
}

function ImpactPanel({
  nodes,
  edges,
  config,
}: {
  nodes: readonly LineageNode[]
  edges: readonly LineageEdge[]
  config: LineageImpactTeachingConfig
}) {
  const predictionHeadingId = useId().replace(/:/g, '')
  const blastHeadingId = useId().replace(/:/g, '')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [revealStep, setRevealStep] = useState(0)
  const summary = useMemo(
    () => getLineageImpactSummary(nodes, edges, config.sourceNodeId, { includeCrossEntity: true }),
    [config.sourceNodeId, edges, nodes],
  )
  const expectedDirectIds = new Set(config.expectedDirectNodeIds)
  const expectedTransitiveIds = config.expectedTransitiveNodeIds
  const finalMetricLabel = config.finalMetricNodeId
    ? (config.affectedMetricLabel ?? getNodeLabel(nodes, config.finalMetricNodeId))
    : (config.affectedMetricLabel ?? '最终指标消费者')
  const predictionCorrect =
    selectedIds.size === expectedDirectIds.size &&
    [...selectedIds].every((nodeId) => expectedDirectIds.has(nodeId))
  const revealedIds = expectedTransitiveIds.slice(0, revealStep)

  function togglePrediction(nodeId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
    setSubmitted(false)
    setRevealStep(0)
  }

  function submitPrediction() {
    setSubmitted(true)
    setRevealStep(0)
  }

  return (
    <div className="lineage-teaching-panel lineage-teaching-panel--impact">
      <div className="lineage-teaching-panel-heading">
        <span className="lineage-teaching-overline">变更前影响评估</span>
        <h3>如果这里出问题，会影响哪些下游？</h3>
        <p>
          准备修改 dwd_account_balance_detail.balance。先预测直接下游，答案提交后再展开传递影响。
        </p>
      </div>
      <section
        className="lineage-teaching-prediction"
        aria-labelledby={`${predictionHeadingId}-title`}
      >
        <h4 id={`${predictionHeadingId}-title`}>直接影响谁？</h4>
        <ImpactPredictionChoices
          nodeIds={config.choiceNodeIds}
          nodes={nodes}
          selectedIds={selectedIds}
          disabled={submitted}
          onToggle={togglePrediction}
        />
        <button
          className="button button--primary button--small"
          type="button"
          disabled={selectedIds.size === 0}
          onClick={submitPrediction}
        >
          提交直接下游预测
        </button>
        {submitted && (
          <p
            className={`lineage-teaching-feedback${predictionCorrect ? ' is-success' : ''}`}
            aria-live="polite"
          >
            {predictionCorrect
              ? '判断正确：dws_deposit_balance_daily 是直接下游。'
              : `直接下游应为：${summary.directDownstream.map((id) => getNodeLabel(nodes, id)).join('、') || '无'}。`}
          </p>
        )}
      </section>
      {submitted && (
        <section
          className="lineage-teaching-blast-radius"
          aria-labelledby={`${blastHeadingId}-title`}
        >
          <div className="lineage-teaching-panel-heading">
            <span className="lineage-teaching-overline">影响范围（Blast Radius）</span>
            <h4 id={`${blastHeadingId}-title`}>向下逐层展开</h4>
          </div>
          <div className="lineage-teaching-impact-stats">
            <div>
              <strong>{summary.directDownstream.length}</strong>
              <span>直接下游</span>
            </div>
            <div>
              <strong>{summary.transitiveDownstream.length}</strong>
              <span>传递影响</span>
            </div>
            <div>
              <strong>{summary.finalBlastRadius.total}</strong>
              <span>总影响对象</span>
            </div>
          </div>
          <ImpactChain
            sourceNodeId={config.sourceNodeId}
            revealedIds={revealedIds}
            nodes={nodes}
            directIds={new Set(summary.directDownstream)}
          />
          {revealStep < expectedTransitiveIds.length ? (
            <button
              className="button button--quiet button--small"
              type="button"
              onClick={() =>
                setRevealStep((current) => Math.min(current + 1, expectedTransitiveIds.length))
              }
            >
              展开下一层影响
            </button>
          ) : (
            <p className="lineage-teaching-final-impact" aria-live="polite">
              影响已经传到 <strong>{finalMetricLabel}</strong>。数据问题最终可能改变业务看到的数字。
            </p>
          )}
        </section>
      )}
      <p className="lineage-teaching-boundary">
        直接下游适合安排第一轮验证；传递影响用于确认完整影响范围。不要把所有结果在预测前自动点亮。
      </p>
    </div>
  )
}

function EvidenceRecordCard({
  record,
  selected,
  onSelect,
}: {
  record: LineageEvidenceRecord
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      className={`lineage-teaching-evidence-record${selected ? ' is-selected' : ''}`}
      data-focus={selected ? 'primary' : 'context'}
      data-relation={record.relation}
      data-verification-status={record.verificationStatus}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <strong>
        {record.sourceLabel} <span aria-hidden="true">→</span> {record.targetLabel}
      </strong>
      <small>
        {getLineageRelationVisual(record.relation).label} ·{' '}
        {EVIDENCE_SOURCE_LABELS[record.evidenceSource]} ·{' '}
        {VERIFICATION_STATUS_LABELS[record.verificationStatus]}
      </small>
    </button>
  )
}

function EvidencePanel({ teaching }: { teaching: LineageTeachingConfig }) {
  const boundaryHeadingId = useId().replace(/:/g, '')
  const records = teaching.evidenceRecords ?? []
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? '')
  const selected = records.find((record) => record.id === selectedId) ?? records[0]

  return (
    <div className="lineage-teaching-panel lineage-teaching-panel--evidence">
      <div className="lineage-teaching-panel-heading">
        <span className="lineage-teaching-overline">Edge evidence</span>
        <h3>图上的这条箭头，凭什么相信？</h3>
        <p>回看前面用过的关系。证据来源和确认状态要分开记录，人工登记不等于已经确认。</p>
      </div>
      <div className="lineage-teaching-evidence-layout">
        <div className="lineage-teaching-evidence-list" aria-label="血缘关系证据列表">
          {records.map((record) => (
            <EvidenceRecordCard
              record={record}
              selected={selected?.id === record.id}
              key={record.id}
              onSelect={() => setSelectedId(record.id)}
            />
          ))}
        </div>
        {selected && (
          <article className="lineage-teaching-evidence-detail" aria-live="polite">
            <div className="lineage-teaching-badge-row">
              <EvidenceBadge source={selected.evidenceSource} />
              <StatusBadge status={selected.verificationStatus} />
            </div>
            <h4>
              {selected.sourceLabel} <span aria-hidden="true">→</span> {selected.targetLabel}
            </h4>
            <p>{selected.evidence.detail}</p>
            <dl>
              <div>
                <dt>证据来源</dt>
                <dd>{EVIDENCE_SOURCE_LABELS[selected.evidenceSource]}</dd>
              </div>
              <div>
                <dt>确认状态</dt>
                <dd>{VERIFICATION_STATUS_LABELS[selected.verificationStatus]}</dd>
              </div>
            </dl>
            {selected.verificationStatus === 'pending' && (
              <p className="lineage-teaching-pending-note">
                这条关系可以保留在调查地图里，但变更前仍要补充可核对的来源。
              </p>
            )}
          </article>
        )}
      </div>
      <section
        className="lineage-teaching-evidence-boundary"
        aria-labelledby={`${boundaryHeadingId}-title`}
      >
        <h4 id={`${boundaryHeadingId}-title`}>血缘证据和根因证据不是一回事</h4>
        <p>
          <code>SUM(dwd_account_balance_detail.balance)</code> 可以证明 DWD.balance 参与形成
          DWS.deposit_balance，说明数据依赖存在；它不能证明 2026-09-30 的 DWD.balance 就是错的。
        </p>
        <small>
          后一个判断还需要数据 Diff、执行参数、SQL
          版本、任务日志、源系统到数情况或业务变更记录。本章停在关系证据和调查候选。
        </small>
      </section>
    </div>
  )
}

export function LineageTeachingLab({ nodes, edges, teaching }: LineageTeachingLabProps) {
  const instanceId = useId().replace(/:/g, '')
  const { tableNodes, tableEdges } = useMemo(
    () => getTableGraph(nodes, edges, teaching.tableNodeIds),
    [edges, nodes, teaching.tableNodeIds],
  )

  return (
    <div
      className={`lineage-teaching-lab lineage-teaching-lab--${teaching.mode}`}
      data-diagram-type="dependency"
      data-focus={teaching.mode === 'impact' ? 'path' : 'context'}
      data-lineage-lesson-mode={teaching.mode}
      aria-labelledby={`lineage-teaching-${instanceId}-title`}
    >
      <h2 className="lineage-teaching-sr-only" id={`lineage-teaching-${instanceId}-title`}>
        数据血缘教学实验
      </h2>
      {teaching.mode === 'overview' && (
        <OverviewPanel nodes={tableNodes} edges={tableEdges} teaching={teaching} />
      )}
      {teaching.mode === 'field-dependencies' && <FieldDependencyPanel teaching={teaching} />}
      {teaching.mode === 'investigation' && (
        <InvestigationPanel nodes={tableNodes} edges={tableEdges} teaching={teaching} />
      )}
      {teaching.mode === 'impact' && teaching.impact && (
        <ImpactPanel nodes={tableNodes} edges={tableEdges} config={teaching.impact} />
      )}
      {teaching.mode === 'evidence' && <EvidencePanel teaching={teaching} />}
    </div>
  )
}
