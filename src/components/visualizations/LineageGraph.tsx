import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type {
  LineageInvestigationEventDefinition,
  LineageTeachingConfig,
} from '../../features/lineage/types'
import { LineageTeachingLab } from './LineageTeachingLab'
import type {
  LineageEdge,
  LineageEntityType,
  LineageEventType,
  LineageInvestigationEvent,
  LineageNode,
  LineageVerificationStatus,
} from '../../types'
import {
  analyzeLineageInvestigation,
  getBlastRadius,
  getDownstreamNodes,
  getImpactAnalysis,
  getLineageEdgeEvidence,
  getLineageEdgeEvidenceSource,
  getLineageEdgeId,
  getLineageEdgeVerificationStatus,
  getLineageEdgeRelation,
  getLineageEdgeGeometry,
  getLineageEntityType,
  getLineageRelationVisual,
  getLineageView,
  LINEAGE_CANVAS_HEIGHT,
  LINEAGE_CANVAS_WIDTH,
  LINEAGE_ENTITY_TYPES,
} from '../../utils/lineage'

interface LineageGraphProps {
  nodes: LineageNode[]
  edges: LineageEdge[]
  investigationEvent?: LineageInvestigationEvent
  investigationEvents?: readonly LineageInvestigationEventDefinition[]
  teaching?: LineageTeachingConfig
}

type ImpactMode = 'direct' | 'transitive'

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

const EVIDENCE_LABELS = {
  sql_transformation: 'SQL 加工',
  task_dependency: '任务依赖',
  manual_metadata: '人工登记',
  metric_definition: '指标定义',
  quality_event: 'Quality Event · 质量异常',
} as const

const CONFIDENCE_LABELS = {
  confirmed: 'confirmed · 已确认',
  inferred: 'inferred · 推断',
  manual: 'manual · 人工补充',
} as const

const VERIFICATION_STATUS_LABELS: Record<LineageVerificationStatus, string> = {
  confirmed: '已确认',
  pending: '待确认',
}

const EVENT_LABELS: Record<LineageEventType, string> = {
  field_change: '字段含义变化',
  quality_alert: '质量告警',
  task_failure: '任务失败',
  sql_transformation: 'SQL 加工',
}

const EVENT_ENTRY_POINT_LABELS: Record<LineageInvestigationEventDefinition['entryPoint'], string> =
  {
    'field-semantic-change': '字段语义变化',
    'schema-change': 'schema / field change',
    'task-failure': 'task failure',
    'quality-event': '质量异常事件',
  }

function getNode(nodes: readonly LineageNode[], nodeId: string): LineageNode | undefined {
  return nodes.find((node) => node.id === nodeId)
}

function getDefaultNodeId(nodes: readonly LineageNode[], entityType: LineageEntityType): string {
  return (
    nodes.find(
      (node) =>
        getLineageEntityType(node) === entityType && entityType === 'table' && node.layer === 'DWD',
    )?.id ??
    nodes.find((node) => getLineageEntityType(node) === entityType)?.id ??
    ''
  )
}

function getNodeTypeLabel(node: LineageNode | undefined): string {
  return node ? ENTITY_TYPE_LABELS[getLineageEntityType(node)] : '对象'
}

function getLegacyInvestigationEvent(
  event: LineageInvestigationEvent,
): LineageInvestigationEventDefinition {
  return {
    ...event,
    entryPoint:
      event.eventType === 'task_failure'
        ? 'task-failure'
        : event.eventType === 'quality_alert'
          ? 'quality-event'
          : 'field-semantic-change',
    label: EVENT_LABELS[event.eventType],
    summary: '从当前事件起点沿依赖图检查上游、下游和最终影响。',
  }
}

function LegacyLineageGraph({
  nodes,
  edges,
  investigationEvent,
  investigationEvents,
}: LineageGraphProps) {
  const instanceId = useId().replace(/:/g, '')
  const markerIds = {
    transform: `${instanceId}-marker-transform`,
    derives: `${instanceId}-marker-derives`,
    depends_on: `${instanceId}-marker-depends-on`,
    consumes: `${instanceId}-marker-consumes`,
  }
  const [activeView, setActiveView] = useState<LineageEntityType>('table')
  const [selectedNodeId, setSelectedNodeId] = useState(() => getDefaultNodeId(nodes, 'table'))
  const [impactMode, setImpactMode] = useState<ImpactMode>('direct')
  const [impactStep, setImpactStep] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [isInvestigationActive, setIsInvestigationActive] = useState(false)
  const [selectedInvestigationEventId, setSelectedInvestigationEventId] = useState(
    () => investigationEvents?.[0]?.id ?? investigationEvent?.id ?? '',
  )
  const timerIds = useRef<number[]>([])

  const eventOptions = useMemo(() => {
    if (investigationEvents && investigationEvents.length > 0) {
      return investigationEvents
    }

    return investigationEvent ? [getLegacyInvestigationEvent(investigationEvent)] : []
  }, [investigationEvent, investigationEvents])
  const activeInvestigationEvent =
    eventOptions.find((event) => event.id === selectedInvestigationEventId) ?? eventOptions[0]

  const visibleGraph = useMemo(
    () => getLineageView(nodes, edges, activeView),
    [activeView, edges, nodes],
  )
  const selectedNode = getNode(visibleGraph.nodes, selectedNodeId) ?? visibleGraph.nodes[0]
  const activeSelectedNodeId = selectedNode?.id ?? ''
  const analysis = useMemo(
    () => getImpactAnalysis(visibleGraph.nodes, visibleGraph.edges, activeSelectedNodeId),
    [activeSelectedNodeId, visibleGraph.edges, visibleGraph.nodes],
  )
  const viewDownstreamOrder = useMemo(
    () => getDownstreamNodes(visibleGraph.nodes, visibleGraph.edges, activeSelectedNodeId),
    [activeSelectedNodeId, visibleGraph.edges, visibleGraph.nodes],
  )
  const investigationResult = useMemo(
    () =>
      activeInvestigationEvent
        ? analyzeLineageInvestigation(nodes, edges, activeInvestigationEvent)
        : undefined,
    [activeInvestigationEvent, edges, nodes],
  )
  const investigationDownstreamOrder = useMemo(
    () =>
      activeInvestigationEvent
        ? getDownstreamNodes(nodes, edges, activeInvestigationEvent.sourceEntityId, {
            includeCrossEntity: true,
          })
        : [],
    [activeInvestigationEvent, edges, nodes],
  )
  const propagationOrder = isInvestigationActive
    ? investigationDownstreamOrder
    : viewDownstreamOrder
  const blastRadius = useMemo(
    () => getBlastRadius(visibleGraph.nodes, visibleGraph.edges, activeSelectedNodeId),
    [activeSelectedNodeId, visibleGraph.edges, visibleGraph.nodes],
  )
  const investigationSource = activeInvestigationEvent
    ? getNode(nodes, activeInvestigationEvent.sourceEntityId)
    : undefined
  const investigationTarget = activeInvestigationEvent
    ? getNode(nodes, activeInvestigationEvent.affectedEntityId)
    : undefined
  const rootCauseCandidate = investigationResult?.rootCauseCandidate
  const rootCauseCandidateNode = rootCauseCandidate
    ? getNode(nodes, rootCauseCandidate.entityId)
    : undefined
  const displayedImpact =
    isInvestigationActive && investigationResult ? investigationResult.impact : analysis
  const displayedBlastRadius =
    isInvestigationActive && investigationResult ? investigationResult.blastRadius : blastRadius
  const searchResults = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return []
    }

    return visibleGraph.nodes.filter((node) => node.label.toLowerCase().includes(normalizedQuery))
  }, [searchQuery, visibleGraph.nodes])
  const highlightedImpactIds = useMemo(
    () =>
      impactMode === 'direct' ? displayedImpact.directDownstream : displayedImpact.finalImpact,
    [displayedImpact.directDownstream, displayedImpact.finalImpact, impactMode],
  )
  const selectedRelatedIds = useMemo(
    () => new Set([activeSelectedNodeId, ...displayedImpact.upstream, ...highlightedImpactIds]),
    [activeSelectedNodeId, displayedImpact.upstream, highlightedImpactIds],
  )
  const relatedEdges = useMemo(
    () =>
      visibleGraph.edges.filter(
        (edge) => selectedRelatedIds.has(edge.source) && selectedRelatedIds.has(edge.target),
      ),
    [selectedRelatedIds, visibleGraph.edges],
  )
  const evidenceEdges = useMemo(() => {
    const uniqueEdges = new Map<string, LineageEdge>()

    for (const edge of relatedEdges) {
      uniqueEdges.set(getLineageEdgeId(edge), edge)
    }
    if (isInvestigationActive && investigationResult?.path) {
      for (const edge of investigationResult.path.edges) {
        uniqueEdges.set(getLineageEdgeId(edge), edge)
      }
    }

    return [...uniqueEdges.values()]
  }, [investigationResult, isInvestigationActive, relatedEdges])
  const selectedEdge = selectedEdgeId
    ? edges.find((edge) => getLineageEdgeId(edge) === selectedEdgeId)
    : undefined
  const impactNodeIds = useMemo(
    () => new Set([activeSelectedNodeId, ...highlightedImpactIds]),
    [activeSelectedNodeId, highlightedImpactIds],
  )
  const contextNodeIds = new Set(displayedImpact.upstream)
  const activeEdgeLabelId = useMemo(() => {
    const activeEdge = visibleGraph.edges.find((edge) => {
      const isDirect =
        edge.source === activeSelectedNodeId &&
        displayedImpact.directDownstream.includes(edge.target)
      const isTransitive =
        impactMode === 'transitive' &&
        impactNodeIds.has(edge.source) &&
        impactNodeIds.has(edge.target)
      return isDirect || isTransitive
    })

    return activeEdge ? getLineageEdgeId(activeEdge) : null
  }, [
    activeSelectedNodeId,
    displayedImpact.directDownstream,
    impactMode,
    impactNodeIds,
    visibleGraph.edges,
  ])
  const selectedNodeDownstreamIndex = propagationOrder.indexOf(activeSelectedNodeId)
  const selectedNodeState =
    impactStep >= 1
      ? '已删除'
      : selectedNodeDownstreamIndex >= 0 && impactStep >= selectedNodeDownstreamIndex + 2
        ? '受影响'
        : '未变更'
  const isSimulationFinished = impactStep >= propagationOrder.length + 1 && impactStep > 0

  function clearTimers() {
    timerIds.current.forEach((timerId) => window.clearTimeout(timerId))
    timerIds.current = []
  }

  function resetSimulation() {
    clearTimers()
    setImpactStep(0)
  }

  function selectNode(nodeId: string) {
    resetSimulation()
    setIsInvestigationActive(false)
    setSelectedEdgeId(null)
    setSelectedNodeId(nodeId)
  }

  function selectInvestigationEvent(eventId: string) {
    clearTimers()
    setSelectedInvestigationEventId(eventId)
    setImpactStep(0)
    setIsInvestigationActive(false)
    setSelectedEdgeId(null)
  }

  function changeView(entityType: LineageEntityType) {
    clearTimers()
    setImpactStep(0)
    setIsInvestigationActive(false)
    setSelectedEdgeId(null)
    setActiveView(entityType)

    const currentNode = getNode(nodes, selectedNodeId)
    if (!currentNode || getLineageEntityType(currentNode) !== entityType) {
      setSelectedNodeId(getDefaultNodeId(nodes, entityType))
    }
  }

  function scheduleImpact(step: number) {
    const timerId = window.setTimeout(() => {
      setImpactStep(step)
      if (step < propagationOrder.length + 1) {
        scheduleImpact(step + 1)
      }
    }, 700)
    timerIds.current.push(timerId)
  }

  function simulateImpact() {
    clearTimers()

    if (!selectedNode) {
      return
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setImpactStep(propagationOrder.length + 1)
      return
    }

    setImpactStep(1)
    if (propagationOrder.length > 0) {
      scheduleImpact(2)
    }
  }

  function startInvestigation() {
    if (!investigationSource || !activeInvestigationEvent) {
      return
    }

    clearTimers()
    setActiveView(getLineageEntityType(investigationSource))
    setSelectedNodeId(investigationSource.id)
    setSelectedEdgeId(null)
    setImpactMode('direct')
    setImpactStep(0)
    setIsInvestigationActive(true)
  }

  function handleInvestigationAction() {
    if (!isInvestigationActive || isSimulationFinished) {
      startInvestigation()
      return
    }

    simulateImpact()
  }

  useEffect(() => {
    return () => {
      timerIds.current.forEach((timerId) => window.clearTimeout(timerId))
    }
  }, [])

  return (
    <div className="lineage-graph" data-diagram-type="dependency">
      <div className="visualization-toolbar">
        <div>
          <span className="visualization-toolbar__label">Lineage Graph · 分层影响分析</span>
          <p aria-live="polite">
            {selectedNode
              ? `当前选中 ${selectedNode.label}（${getNodeTypeLabel(selectedNode)}）：${ENTITY_TYPE_LABELS[activeView]}视图`
              : '点击节点，查看它的上下游关系'}
          </p>
        </div>
        <div className="visualization-toolbar__actions">
          <button
            className="button button--primary button--small"
            type="button"
            onClick={simulateImpact}
          >
            {isSimulationFinished ? '重新模拟删除' : '模拟删除'}
          </button>
          <button
            className="button button--quiet button--small"
            type="button"
            onClick={resetSimulation}
          >
            重置
          </button>
        </div>
      </div>

      <div className="lineage-explorer-controls">
        <div className="lineage-control-block">
          <span className="lineage-control-label">切换实体视图</span>
          <div className="lineage-view-tabs" role="tablist" aria-label="血缘实体视图">
            {LINEAGE_ENTITY_TYPES.map((entityType) => (
              <button
                aria-selected={activeView === entityType}
                className={`button button--small${activeView === entityType ? ' is-selected' : ''}`}
                key={entityType}
                role="tab"
                type="button"
                onClick={() => changeView(entityType)}
              >
                {ENTITY_TYPE_LABELS[entityType]}
              </button>
            ))}
          </div>
        </div>
        <label className="lineage-search">
          <span className="lineage-control-label">搜索 / 定位</span>
          <input
            aria-label="搜索当前血缘视图"
            type="search"
            value={searchQuery}
            placeholder={`搜索${ENTITY_TYPE_LABELS[activeView]}`}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      </div>

      {searchQuery.trim() && (
        <div className="lineage-search-results" aria-live="polite">
          <span>定位结果</span>
          {searchResults.length > 0 ? (
            searchResults.map((node) => (
              <button
                className="lineage-search-result"
                key={node.id}
                type="button"
                onClick={() => selectNode(node.id)}
              >
                {node.label}
              </button>
            ))
          ) : (
            <small>当前视图没有匹配对象</small>
          )}
        </div>
      )}

      {eventOptions.length > 0 && activeInvestigationEvent && investigationResult && (
        <section className="lineage-investigation" aria-labelledby="lineage-investigation-title">
          <div className="lineage-investigation__copy">
            <span className="eyebrow eyebrow--small">
              Investigation entry · {EVENT_ENTRY_POINT_LABELS[activeInvestigationEvent.entryPoint]}
            </span>
            <h3 id="lineage-investigation-title">
              {activeInvestigationEvent.label}：从 {investigationSource?.label ?? '事件对象'} 开始
            </h3>
            <p>
              {activeInvestigationEvent.summary} 预测影响范围后，执行路径回放，确认它是否会触及{' '}
              {investigationTarget?.label ?? '下游对象'}。
            </p>
            <small>
              事件证据：{EVIDENCE_LABELS[activeInvestigationEvent.evidence.source]} ·{' '}
              {activeInvestigationEvent.evidence.detail}
            </small>
            {activeInvestigationEvent.context && (
              <div className="lineage-investigation__context" aria-label="事件运行上下文">
                {activeInvestigationEvent.context.taskId && (
                  <span>
                    任务 <code>{activeInvestigationEvent.context.taskId}</code>
                  </span>
                )}
                {activeInvestigationEvent.context.runId && (
                  <span>
                    运行实例 <code>{activeInvestigationEvent.context.runId}</code>
                  </span>
                )}
                {activeInvestigationEvent.context.partition && (
                  <span>
                    partition{' '}
                    <code>
                      {activeInvestigationEvent.context.partition.column} ={' '}
                      {activeInvestigationEvent.context.partition.value}
                    </code>
                  </span>
                )}
                {activeInvestigationEvent.context.attempt !== undefined && (
                  <span>重试次数 {activeInvestigationEvent.context.attempt}</span>
                )}
              </div>
            )}
            {activeInvestigationEvent.qualityEvent && (
              <div className="lineage-investigation__quality" aria-label="质量事件详情">
                <div className="lineage-investigation__quality-heading">
                  <span>Quality Event · 质量异常</span>
                  <code>{activeInvestigationEvent.qualityEvent.eventId}</code>
                </div>
                <div className="lineage-investigation__quality-facts">
                  <span>
                    规则 <code>{activeInvestigationEvent.qualityEvent.ruleId}</code>
                  </span>
                  <span>
                    target{' '}
                    <code>
                      {activeInvestigationEvent.qualityEvent.target.table} ·{' '}
                      {activeInvestigationEvent.qualityEvent.target.field ?? 'table-level'}
                    </code>
                  </span>
                  <span>
                    partition{' '}
                    <code>
                      {activeInvestigationEvent.qualityEvent.target.partition.column} ={' '}
                      {activeInvestigationEvent.qualityEvent.target.partition.value}
                    </code>
                  </span>
                  <span>
                    状态 <code>{activeInvestigationEvent.qualityEvent.status}</code>
                    {activeInvestigationEvent.qualityEvent.severity && (
                      <>
                        {' · '}严重级别{' '}
                        <code>{activeInvestigationEvent.qualityEvent.severity}</code>
                      </>
                    )}
                  </span>
                  <span>
                    expected / observed{' '}
                    <code>
                      {String(activeInvestigationEvent.qualityEvent.expected)} /{' '}
                      {String(activeInvestigationEvent.qualityEvent.observed)}
                    </code>
                  </span>
                  <span>
                    failed_rows{' '}
                    <code>{activeInvestigationEvent.qualityEvent.failedRows ?? '—'}</code>
                  </span>
                </div>
                <ul className="lineage-investigation__quality-evidence">
                  {activeInvestigationEvent.qualityEvent.evidence.map((evidence) => (
                    <li key={evidence.evidenceId}>
                      <code>{evidence.evidenceId}</code> · {evidence.detail} ·{' '}
                      {evidence.sample ? 1 : 0} 条样本
                    </li>
                  ))}
                </ul>
                <div className="lineage-investigation__quality-context">
                  <span>调查摘要</span>
                  <p>
                    Quality Event 保留质量事实；当前 task：
                    {activeInvestigationEvent.qualityEvent.schedulerContext.taskId}，run：
                    {activeInvestigationEvent.qualityEvent.schedulerContext.runId}。
                  </p>
                  <p>下游影响和可能根因由当前血缘图根据表、字段与任务关系计算。</p>
                </div>
              </div>
            )}
            {rootCauseCandidate && (
              <div className="lineage-investigation__candidate" aria-label="可能根因候选">
                <span>root cause candidate · 可能根因</span>
                <strong>{rootCauseCandidateNode?.label ?? rootCauseCandidate.entityId}</strong>
                <p>{rootCauseCandidate.rationale}</p>
                <small>
                  {EVIDENCE_LABELS[rootCauseCandidate.evidence.source]} ·{' '}
                  {CONFIDENCE_LABELS[rootCauseCandidate.confidence ?? 'inferred']} ·{' '}
                  {rootCauseCandidate.evidence.detail}
                </small>
              </div>
            )}
            <div className="lineage-investigation__event-picker">
              <span className="lineage-control-label">选择调查事件</span>
              <div role="tablist" aria-label="选择血缘调查事件">
                {eventOptions.map((event) => (
                  <button
                    className={`lineage-investigation__event${event.id === activeInvestigationEvent.id ? ' is-selected' : ''}`}
                    type="button"
                    role="tab"
                    aria-selected={event.id === activeInvestigationEvent.id}
                    onClick={() => selectInvestigationEvent(event.id)}
                    key={event.id}
                  >
                    <strong>{event.label}</strong>
                    <small>{EVENT_ENTRY_POINT_LABELS[event.entryPoint]}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="lineage-investigation__summary" aria-label="调查影响预测结果">
            <div className="lineage-investigation__summary-grid">
              <div>
                <strong>{investigationResult.impact.upstream.length}</strong>
                <span>上游</span>
              </div>
              <div>
                <strong>{investigationResult.impact.directDownstream.length}</strong>
                <span>直接下游</span>
              </div>
              <div>
                <strong>{investigationResult.impact.finalImpact.length}</strong>
                <span>传递下游</span>
              </div>
              <div>
                <strong>{investigationResult.blastRadius.total}</strong>
                <span>最终 blast radius</span>
              </div>
            </div>
            <p>
              {LINEAGE_ENTITY_TYPES.map(
                (entityType) =>
                  `${ENTITY_TYPE_LABELS[entityType]} ${investigationResult.blastRadius.byType[entityType]}`,
              ).join(' · ')}
            </p>
          </div>
          <button
            className="button button--primary button--small"
            type="button"
            onClick={handleInvestigationAction}
          >
            {!isInvestigationActive
              ? '定位事件并预测'
              : isSimulationFinished
                ? '重新回放调查路径'
                : impactStep > 0
                  ? '影响传播中…'
                  : '执行影响分析'}
          </button>
        </section>
      )}

      <div className="lineage-impact-controls" aria-label="影响范围显示方式">
        <span className="lineage-control-label">突出显示</span>
        <div className="lineage-view-tabs">
          <button
            className={`button button--small${impactMode === 'direct' ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={impactMode === 'direct'}
            onClick={() => setImpactMode('direct')}
          >
            直接下游
          </button>
          <button
            className={`button button--small${impactMode === 'transitive' ? ' is-selected' : ''}`}
            type="button"
            aria-pressed={impactMode === 'transitive'}
            onClick={() => setImpactMode('transitive')}
          >
            传递影响
          </button>
        </div>
      </div>

      <div className="lineage-grammar" aria-label="血缘关系视觉图例">
        <div className="lineage-grammar__group">
          <span className="lineage-control-label">关系图例</span>
          <span className="lineage-grammar__item" data-relation="transform">
            <span
              className="lineage-grammar__sample lineage-grammar__sample--data"
              aria-hidden="true"
            />
            数据加工 / transform
          </span>
          <span className="lineage-grammar__item" data-relation="derives">
            <span
              className="lineage-grammar__sample lineage-grammar__sample--derives"
              aria-hidden="true"
            />
            字段派生 / derives
          </span>
          <span className="lineage-grammar__item" data-relation="depends_on">
            <span
              className="lineage-grammar__sample lineage-grammar__sample--dependency"
              aria-hidden="true"
            />
            控制依赖 / depends_on
          </span>
          <span className="lineage-grammar__item" data-relation="consumes">
            <span
              className="lineage-grammar__sample lineage-grammar__sample--consume"
              aria-hidden="true"
            />
            发布 / 消费 / consumes
          </span>
        </div>
        <div className="lineage-grammar__group">
          <span className="lineage-control-label">焦点与状态</span>
          <span className="lineage-grammar__item">
            <b className="lineage-grammar__marker lineage-grammar__marker--primary">当前选中</b>
          </span>
          <span className="lineage-grammar__item">
            <b className="lineage-grammar__marker lineage-grammar__marker--direct">直接路径</b>
          </span>
          <span className="lineage-grammar__item">
            <b className="lineage-grammar__marker lineage-grammar__marker--transitive">传递路径</b>
          </span>
          <span className="lineage-grammar__item">
            <b className="lineage-grammar__marker lineage-grammar__marker--pending">○ 待确认</b>
          </span>
        </div>
        <div className="lineage-grammar__group">
          <span className="lineage-control-label">Node 类型</span>
          {LINEAGE_ENTITY_TYPES.map((entityType) => (
            <span className="lineage-grammar__item" data-node-type={entityType} key={entityType}>
              <b className="lineage-node__type-marker" aria-hidden="true">
                {ENTITY_TYPE_MARKERS[entityType]}
              </b>
              {ENTITY_TYPE_LABELS[entityType]}
            </span>
          ))}
        </div>
        <p className="lineage-grammar__note">
          线型表达真实关系；焦点只增加权重。○ 待确认不会把关系变成可选关系。
        </p>
      </div>

      <div className="lineage-canvas-shell">
        <div
          className="lineage-canvas"
          aria-label={`${ENTITY_TYPE_LABELS[activeView]}数据血缘关系图，图面可局部横向滚动`}
        >
          <svg
            className="lineage-canvas__svg"
            viewBox={`0 0 ${LINEAGE_CANVAS_WIDTH} ${LINEAGE_CANVAS_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-labelledby={`${instanceId}-lineage-title`}
          >
            <title
              id={`${instanceId}-lineage-title`}
            >{`${ENTITY_TYPE_LABELS[activeView]}之间的上游和下游依赖关系`}</title>
            <defs>
              <marker
                id={markerIds.transform}
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="5"
                markerUnits="userSpaceOnUse"
                orient="auto"
              >
                <path d="M0 0 L10 5 L0 10 Z" fill="context-stroke" />
              </marker>
              <marker
                id={markerIds.derives}
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="5"
                markerUnits="userSpaceOnUse"
                orient="auto"
              >
                <path d="M1 1 L8 5 L1 9" fill="none" stroke="context-stroke" strokeWidth="1.5" />
              </marker>
              <marker
                id={markerIds.depends_on}
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="5"
                markerUnits="userSpaceOnUse"
                orient="auto"
              >
                <path d="M1 1 L8 5 L1 9" fill="none" stroke="context-stroke" strokeWidth="1.5" />
              </marker>
              <marker
                id={markerIds.consumes}
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="5"
                markerUnits="userSpaceOnUse"
                orient="auto"
              >
                <path d="M1 5 L5 1 L9 5 L5 9 Z" fill="context-stroke" />
              </marker>
            </defs>
            {visibleGraph.edges.map((edge) => {
              const source = getNode(visibleGraph.nodes, edge.source)
              const target = getNode(visibleGraph.nodes, edge.target)
              if (!source || !target) {
                return null
              }

              const relation = getLineageEdgeRelation(edge)
              const relationVisual = getLineageRelationVisual(relation)
              const geometry = getLineageEdgeGeometry(source, target)
              const edgeIsDirect =
                edge.source === activeSelectedNodeId &&
                displayedImpact.directDownstream.includes(edge.target)
              const edgeIsTransitive =
                impactMode === 'transitive' &&
                !edgeIsDirect &&
                impactNodeIds.has(edge.source) &&
                impactNodeIds.has(edge.target)
              const edgeIsActive = edgeIsDirect || edgeIsTransitive
              const edgeIsContext =
                !edgeIsActive &&
                (contextNodeIds.has(edge.source) || contextNodeIds.has(edge.target))
              const verificationStatus = getLineageEdgeVerificationStatus(edge)
              const edgeId = getLineageEdgeId(edge)
              const impactFocus = edgeIsDirect ? 'direct' : edgeIsTransitive ? 'transitive' : 'none'
              const impactLabel = edgeIsDirect
                ? ' · 直接路径'
                : edgeIsTransitive
                  ? ' · 传递路径'
                  : ''
              const edgeLabel = `${relationVisual.shortLabel}${impactLabel}${
                verificationStatus === 'pending' ? ' · 待确认' : ''
              }`
              const showLabel = edgeId === selectedEdgeId || edgeId === activeEdgeLabelId
              const labelOffsetX = Math.abs(target.x - source.x) < 12 ? 48 : 0
              const labelWidth = Math.max(62, edgeLabel.length * 8 + 14)

              return (
                <g
                  className={`lineage-edge-group lineage-edge-group--${relationVisual.kind}${
                    edgeIsActive ? ' is-active' : ''
                  }${edgeIsContext ? ' is-context' : ''}`}
                  data-relation={relation}
                  data-impact-focus={impactFocus}
                  data-verification-status={verificationStatus}
                  key={edgeId}
                >
                  <path
                    aria-label={`${source.label} 到 ${target.label}，${relationVisual.label}关系（${relationVisual.direction}）${
                      edgeIsDirect ? '，直接影响路径' : edgeIsTransitive ? '，传递影响路径' : ''
                    }${
                      verificationStatus === 'pending' ? '，证据待确认，关系仍保留' : ''
                    }，点击查看证据`}
                    className={`lineage-edge lineage-edge--${relationVisual.kind}${
                      edgeIsActive ? ' is-active' : ''
                    }${edgeIsDirect ? ' is-direct' : ''}${
                      edgeIsTransitive ? ' is-transitive' : ''
                    }${edgeIsContext ? ' is-context' : ''}${
                      verificationStatus === 'pending' ? ' is-pending' : ''
                    }`}
                    d={geometry.path}
                    data-relation={relation}
                    data-relation-kind={relationVisual.kind}
                    data-impact-focus={impactFocus}
                    data-verification-status={verificationStatus}
                    fill="none"
                    key={`${edgeId}-path`}
                    markerEnd={`url(#${markerIds[relation]})`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedEdgeId(edgeId)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedEdgeId(edgeId)
                      }
                    }}
                  />
                  {verificationStatus === 'pending' && (
                    <circle
                      className="lineage-edge__verification-marker"
                      cx={geometry.midpoint.x}
                      cy={geometry.midpoint.y}
                      r="4"
                      aria-hidden="true"
                    />
                  )}
                  {showLabel && (
                    <g
                      className="lineage-edge__label"
                      aria-hidden="true"
                      transform={`translate(${geometry.midpoint.x + labelOffsetX} ${geometry.midpoint.y})`}
                    >
                      <rect x={-labelWidth / 2} y="-10" width={labelWidth} height="18" rx="4" />
                      <text y="3" textAnchor="middle">
                        {edgeLabel}
                      </text>
                    </g>
                  )}
                </g>
              )
            })}
          </svg>

          <div className="lineage-canvas__nodes">
            {visibleGraph.nodes.map((node) => {
              const isSelected = node.id === activeSelectedNodeId
              const isRelated = selectedRelatedIds.has(node.id)
              const downstreamIndex = propagationOrder.indexOf(node.id)
              const isDeleted = isSelected && impactStep >= 1
              const isAffected = downstreamIndex >= 0 && impactStep >= downstreamIndex + 2
              const entityType = getLineageEntityType(node)
              const focus = isSelected
                ? 'primary'
                : highlightedImpactIds.includes(node.id)
                  ? 'path'
                  : contextNodeIds.has(node.id)
                    ? 'context'
                    : 'none'
              const state = isDeleted ? 'deleted' : isAffected ? 'affected' : 'normal'
              const stateLabel = isDeleted ? '已删除' : isAffected ? '受影响' : '未变更'

              return (
                <button
                  className={`lineage-node lineage-node--${entityType} lineage-node--${node.layer.toLowerCase()}${
                    isSelected ? ' is-selected' : ''
                  }${isRelated ? ' is-related' : ''}${focus === 'path' ? ' is-path' : ''}${
                    focus === 'context' ? ' is-context' : ''
                  }${isDeleted ? ' is-deleted' : ''}${isAffected ? ' is-affected' : ''}`}
                  data-focus={focus}
                  data-node-type={entityType}
                  data-state={state}
                  key={node.id}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${node.label}，${ENTITY_TYPE_LABELS[entityType]}，${focus === 'primary' ? '当前选中，' : ''}${stateLabel}`}
                  style={{
                    left: `${(node.x / LINEAGE_CANVAS_WIDTH) * 100}%`,
                    top: `${(node.y / LINEAGE_CANVAS_HEIGHT) * 100}%`,
                  }}
                  onClick={() => selectNode(node.id)}
                >
                  <span className="lineage-node__layer">
                    <span className="lineage-node__type-marker" aria-hidden="true">
                      {ENTITY_TYPE_MARKERS[entityType]}
                    </span>
                    {ENTITY_TYPE_LABELS[entityType]} · {node.layer}
                  </span>
                  <strong>{node.label}</strong>
                  <small className="lineage-node__role">{node.role}</small>
                  <span className={`lineage-node__state lineage-node__state--${state}`}>
                    {stateLabel}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <section className="lineage-selection" aria-live="polite" aria-label="当前选中对象详情">
        <div>
          <span className="eyebrow eyebrow--small">Primary Focus · 当前节点</span>
          <strong>{selectedNode?.label ?? '未选择节点'}</strong>
        </div>
        <dl className="lineage-selection__facts">
          <div>
            <dt>Node 类型</dt>
            <dd>
              {selectedNode ? ENTITY_TYPE_LABELS[getLineageEntityType(selectedNode)] : '对象'}
            </dd>
          </div>
          <div>
            <dt>Focus</dt>
            <dd>当前选中</dd>
          </div>
          <div>
            <dt>业务 State</dt>
            <dd>{selectedNodeState}</dd>
          </div>
        </dl>
        <p>{selectedNode?.role ?? `请选择一张${ENTITY_TYPE_LABELS[activeView]}`}</p>
      </section>

      <div className="impact-stats" aria-label="影响分析统计">
        <div>
          <strong>{displayedImpact.upstream.length}</strong>
          <span>上游</span>
        </div>
        <div>
          <strong>{displayedImpact.directDownstream.length}</strong>
          <span>直接下游</span>
        </div>
        <div>
          <strong>{displayedImpact.finalImpact.length}</strong>
          <span>传递下游</span>
        </div>
        <div>
          <strong>{displayedBlastRadius.total}</strong>
          <span>最终影响</span>
        </div>
      </div>

      <div
        className="lineage-blast-radius"
        aria-label={isInvestigationActive ? '调查事件最终爆炸半径' : '当前视图爆炸半径'}
      >
        <span className="lineage-control-label">
          {isInvestigationActive ? '调查事件最终 blast radius' : '当前视图爆炸半径'}
        </span>
        <p>
          {LINEAGE_ENTITY_TYPES.map(
            (entityType) =>
              `${ENTITY_TYPE_LABELS[entityType]} ${displayedBlastRadius.byType[entityType]}`,
          ).join(' · ')}
        </p>
      </div>

      <ol className="impact-timeline" aria-label="影响传播过程">
        <li className={impactStep >= 1 ? 'is-visible' : ''}>
          <span>1</span>
          <div>
            <strong>{selectedNode?.label ?? '当前节点'}</strong>
            <small>{impactStep >= 1 ? '变更起点' : '等待分析'}</small>
          </div>
        </li>
        {propagationOrder.map((nodeId, index) => {
          const node = getNode(nodes, nodeId)
          const isVisible = impactStep >= index + 2
          return (
            <li className={isVisible ? 'is-visible' : ''} key={nodeId}>
              <span>{index + 2}</span>
              <div>
                <strong>{node?.label ?? nodeId}</strong>
                <small>{isVisible ? `受影响 · ${getNodeTypeLabel(node)}` : '等待传播'}</small>
              </div>
            </li>
          )
        })}
      </ol>

      <section className="lineage-evidence" aria-labelledby="lineage-evidence-title">
        <div className="lineage-evidence__heading">
          <div>
            <span className="eyebrow eyebrow--small">Evidence drawer</span>
            <h3 id="lineage-evidence-title">当前调查路径的证据</h3>
          </div>
          <p>箭头表达依赖关系，不自动代表业务因果。</p>
        </div>
        <div className="lineage-evidence__edges">
          {evidenceEdges.length > 0 ? (
            evidenceEdges.map((edge) => {
              const source = getNode(nodes, edge.source)
              const target = getNode(nodes, edge.target)
              const edgeId = getLineageEdgeId(edge)
              return (
                <button
                  className={`lineage-evidence__edge${selectedEdgeId === edgeId ? ' is-selected' : ''}`}
                  data-relation={getLineageEdgeRelation(edge)}
                  data-verification-status={getLineageEdgeVerificationStatus(edge)}
                  key={edgeId}
                  type="button"
                  onClick={() => setSelectedEdgeId(edgeId)}
                >
                  <strong>
                    {source?.label ?? edge.source} → {target?.label ?? edge.target}
                  </strong>
                  <small>
                    {getLineageRelationVisual(getLineageEdgeRelation(edge)).shortLabel} ·{' '}
                    {EVIDENCE_LABELS[getLineageEdgeEvidenceSource(edge)]} ·{' '}
                    {VERIFICATION_STATUS_LABELS[getLineageEdgeVerificationStatus(edge)]}
                  </small>
                </button>
              )
            })
          ) : (
            <p className="lineage-evidence__empty">选择节点后，这里会列出相关依赖边。</p>
          )}
        </div>
        {selectedEdge && (
          <aside className="lineage-evidence__detail" aria-live="polite">
            <div>
              <span className="lineage-control-label">关系详情</span>
              <strong>
                {getNode(nodes, selectedEdge.source)?.label ?? selectedEdge.source} →{' '}
                {getNode(nodes, selectedEdge.target)?.label ?? selectedEdge.target}
              </strong>
            </div>
            <p>{getLineageEdgeEvidence(selectedEdge).detail}</p>
            <small data-verification-status={getLineageEdgeVerificationStatus(selectedEdge)}>
              关系：{getLineageRelationVisual(getLineageEdgeRelation(selectedEdge)).label} ·
              证据来源：
              {EVIDENCE_LABELS[getLineageEdgeEvidenceSource(selectedEdge)]} · 确认状态：
              {VERIFICATION_STATUS_LABELS[getLineageEdgeVerificationStatus(selectedEdge)]}
            </small>
            <button
              className="button button--quiet button--small"
              type="button"
              onClick={() => setSelectedEdgeId(null)}
            >
              收起证据
            </button>
          </aside>
        )}
      </section>

      {isInvestigationActive && investigationResult?.path && (
        <section className="lineage-path" aria-labelledby="lineage-path-title">
          <div className="lineage-evidence__heading">
            <div>
              <span className="eyebrow eyebrow--small">路径回放</span>
              <h3 id="lineage-path-title">{activeInvestigationEvent?.label ?? '调查路径'}</h3>
            </div>
            <p>{activeInvestigationEvent?.summary ?? '从事件起点逐边核对上游、下游和证据。'}</p>
          </div>
          <ol>
            {investigationResult.path.nodeIds.map((nodeId, index) => {
              const node = getNode(nodes, nodeId)
              const edge = investigationResult.path?.edges[index]
              const evidence = edge ? getLineageEdgeEvidence(edge) : undefined
              return (
                <li key={nodeId}>
                  <strong>{node?.label ?? nodeId}</strong>
                  {edge && evidence && (
                    <small>
                      {getLineageRelationVisual(getLineageEdgeRelation(edge)).shortLabel} ·{' '}
                      {EVIDENCE_LABELS[getLineageEdgeEvidenceSource(edge)]} ·{' '}
                      {VERIFICATION_STATUS_LABELS[getLineageEdgeVerificationStatus(edge)]}
                    </small>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <p className="visualization-note">
        <span aria-hidden="true">↳</span>
        沿路径逐条核对质量异常、SQL 加工、任务依赖和指标定义，确认影响范围与后续验证对象。
      </p>
    </div>
  )
}

export function LineageGraph(props: LineageGraphProps) {
  if (props.teaching) {
    return <LineageTeachingLab nodes={props.nodes} edges={props.edges} teaching={props.teaching} />
  }

  return <LegacyLineageGraph {...props} />
}
