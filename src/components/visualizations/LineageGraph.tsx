import { useEffect, useMemo, useRef, useState } from 'react'
import './LineageGraph.css'
import type {
  LineageEdge,
  LineageEntityType,
  LineageEventType,
  LineageInvestigationEvent,
  LineageNode,
} from '../../types'
import {
  analyzeLineageInvestigation,
  getBlastRadius,
  getDownstreamNodes,
  getImpactAnalysis,
  getLineageEdgeConfidence,
  getLineageEdgeEvidence,
  getLineageEdgeId,
  getLineageEdgeRelation,
  getLineageEntityType,
  getLineageView,
  LINEAGE_ENTITY_TYPES,
} from '../../utils/lineage'

interface LineageGraphProps {
  nodes: LineageNode[]
  edges: LineageEdge[]
  investigationEvent?: LineageInvestigationEvent
}

type ImpactMode = 'direct' | 'transitive'

const ENTITY_TYPE_LABELS: Record<LineageEntityType, string> = {
  table: '表',
  field: '字段',
  task: '任务',
  metric: '指标',
}

const RELATION_LABELS = {
  transform: '加工',
  depends_on: '依赖',
  derives: '派生',
  consumes: '消费',
} as const

const EVIDENCE_LABELS = {
  sql_transformation: 'SQL transformation',
  task_dependency: 'task dependency',
  manual_metadata: 'manual metadata',
  metric_definition: 'metric definition',
} as const

const CONFIDENCE_LABELS = {
  confirmed: 'confirmed · 已确认',
  inferred: 'inferred · 推断',
  manual: 'manual · 人工补充',
} as const

const EVENT_LABELS: Record<LineageEventType, string> = {
  field_change: '字段含义变化',
  quality_alert: '质量告警',
  task_failure: '任务失败',
  sql_transformation: 'SQL transformation',
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

export function LineageGraph({ nodes, edges, investigationEvent }: LineageGraphProps) {
  const [activeView, setActiveView] = useState<LineageEntityType>('table')
  const [selectedNodeId, setSelectedNodeId] = useState(() => getDefaultNodeId(nodes, 'table'))
  const [impactMode, setImpactMode] = useState<ImpactMode>('direct')
  const [impactStep, setImpactStep] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [isInvestigationActive, setIsInvestigationActive] = useState(false)
  const timerIds = useRef<number[]>([])

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
      investigationEvent
        ? analyzeLineageInvestigation(nodes, edges, investigationEvent)
        : undefined,
    [edges, investigationEvent, nodes],
  )
  const investigationDownstreamOrder = useMemo(
    () =>
      investigationEvent
        ? getDownstreamNodes(nodes, edges, investigationEvent.sourceEntityId, {
            includeCrossEntity: true,
          })
        : [],
    [edges, investigationEvent, nodes],
  )
  const propagationOrder = isInvestigationActive
    ? investigationDownstreamOrder
    : viewDownstreamOrder
  const blastRadius = useMemo(
    () => getBlastRadius(visibleGraph.nodes, visibleGraph.edges, activeSelectedNodeId),
    [activeSelectedNodeId, visibleGraph.edges, visibleGraph.nodes],
  )
  const investigationSource = investigationEvent
    ? getNode(nodes, investigationEvent.sourceEntityId)
    : undefined
  const investigationTarget = investigationEvent
    ? getNode(nodes, investigationEvent.affectedEntityId)
    : undefined
  const searchResults = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return []
    }

    return visibleGraph.nodes.filter((node) => node.label.toLowerCase().includes(normalizedQuery))
  }, [searchQuery, visibleGraph.nodes])
  const selectedRelatedIds = useMemo(() => {
    const highlightedDownstream =
      impactMode === 'direct' ? analysis.directDownstream : analysis.finalImpact

    return new Set([activeSelectedNodeId, ...analysis.upstream, ...highlightedDownstream])
  }, [
    activeSelectedNodeId,
    analysis.directDownstream,
    analysis.finalImpact,
    analysis.upstream,
    impactMode,
  ])
  const relatedEdges = useMemo(
    () =>
      visibleGraph.edges.filter(
        (edge) => selectedRelatedIds.has(edge.source) && selectedRelatedIds.has(edge.target),
      ),
    [selectedRelatedIds, visibleGraph.edges],
  )
  const selectedEdge = selectedEdgeId
    ? visibleGraph.edges.find((edge) => getLineageEdgeId(edge) === selectedEdgeId)
    : undefined
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
    if (!investigationSource || !investigationEvent) {
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
    <div className="lineage-graph">
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

      {investigationEvent && investigationSource && investigationResult && (
        <section className="lineage-investigation" aria-labelledby="lineage-investigation-title">
          <div className="lineage-investigation__copy">
            <span className="eyebrow eyebrow--small">
              字段变更调查 · {EVENT_LABELS[investigationEvent.eventType]}
            </span>
            <h3 id="lineage-investigation-title">
              如果 {investigationSource.label} 的含义发生变化
            </h3>
            <p>
              先预测影响范围，再执行路径回放，验证它是否会触及{' '}
              {investigationTarget?.label ?? '下游对象'}。
            </p>
            <small>
              事件证据：{EVIDENCE_LABELS[investigationEvent.evidence.source]} ·{' '}
              {investigationEvent.evidence.detail}
            </small>
          </div>
          <div className="lineage-investigation__summary" aria-label="字段变更预测结果">
            <div>
              <strong>{investigationResult.blastRadius.total}</strong>
              <span>预测最终影响</span>
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
              ? '定位字段并预测'
              : isSimulationFinished
                ? '重新回放字段路径'
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

      <div
        className="lineage-canvas"
        aria-label={`${ENTITY_TYPE_LABELS[activeView]}数据血缘关系图`}
      >
        <svg
          className="lineage-canvas__svg"
          viewBox="0 0 760 450"
          preserveAspectRatio="none"
          role="img"
          aria-labelledby="lineage-title"
        >
          <title id="lineage-title">{ENTITY_TYPE_LABELS[activeView]}之间的上游和下游依赖关系</title>
          <defs>
            <marker
              id="lineage-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
            </marker>
          </defs>
          {visibleGraph.edges.map((edge) => {
            const source = getNode(visibleGraph.nodes, edge.source)
            const target = getNode(visibleGraph.nodes, edge.target)
            if (!source || !target) {
              return null
            }

            const edgeIsDirect =
              edge.source === activeSelectedNodeId &&
              analysis.directDownstream.includes(edge.target)
            const edgeIsInImpact =
              selectedRelatedIds.has(edge.source) && selectedRelatedIds.has(edge.target)
            const edgeIsActive = impactMode === 'direct' ? edgeIsDirect : edgeIsInImpact
            const edgeIsTransitive = edgeIsActive && impactMode === 'transitive'
            const edgeId = getLineageEdgeId(edge)
            const relationLabel = RELATION_LABELS[getLineageEdgeRelation(edge)]

            return (
              <line
                aria-label={`${source.label} 到 ${target.label}，${relationLabel}关系，点击查看证据`}
                className={`lineage-edge${edgeIsActive ? ' is-active' : ''}${
                  edgeIsDirect ? ' is-direct' : ''
                }${edgeIsTransitive ? ' is-transitive' : ''}`}
                key={edgeId}
                role="button"
                tabIndex={0}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                markerEnd="url(#lineage-arrow)"
                onClick={() => setSelectedEdgeId(edgeId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedEdgeId(edgeId)
                  }
                }}
              />
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
            const nodeState = isDeleted ? '已删除' : isAffected ? '受影响' : node.role
            const entityType = getLineageEntityType(node)

            return (
              <button
                className={`lineage-node lineage-node--${entityType} lineage-node--${node.layer.toLowerCase()}${
                  isSelected ? ' is-selected' : ''
                }${isRelated ? ' is-related' : ''}${isDeleted ? ' is-deleted' : ''}${
                  isAffected ? ' is-affected' : ''
                }`}
                key={node.id}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${node.label}，${ENTITY_TYPE_LABELS[entityType]}，${nodeState}`}
                style={{ left: `${(node.x / 760) * 100}%`, top: `${(node.y / 450) * 100}%` }}
                onClick={() => selectNode(node.id)}
              >
                <span className="lineage-node__layer">{ENTITY_TYPE_LABELS[entityType]}</span>
                <strong>{node.label}</strong>
                <small>{nodeState}</small>
              </button>
            )
          })}
        </div>
      </div>

      <div className="lineage-selection" aria-live="polite">
        <div>
          <span className="eyebrow eyebrow--small">
            当前节点 · {getNodeTypeLabel(selectedNode)}
          </span>
          <strong>{selectedNode?.label ?? '未选择节点'}</strong>
        </div>
        <p>{selectedNode?.role ?? `请选择一张${ENTITY_TYPE_LABELS[activeView]}`}</p>
      </div>

      <div className="impact-stats" aria-label="影响分析统计">
        <div>
          <strong>{analysis.upstream.length}</strong>
          <span>上游</span>
        </div>
        <div>
          <strong>{analysis.directDownstream.length}</strong>
          <span>直接下游</span>
        </div>
        <div>
          <strong>{analysis.finalImpact.length}</strong>
          <span>传递下游</span>
        </div>
        <div>
          <strong>{blastRadius.total}</strong>
          <span>最终影响</span>
        </div>
      </div>

      <div className="lineage-blast-radius" aria-label="当前视图爆炸半径">
        <span className="lineage-control-label">当前视图爆炸半径</span>
        <p>
          {LINEAGE_ENTITY_TYPES.map(
            (entityType) => `${ENTITY_TYPE_LABELS[entityType]} ${blastRadius.byType[entityType]}`,
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
          {relatedEdges.length > 0 ? (
            relatedEdges.map((edge) => {
              const source = getNode(nodes, edge.source)
              const target = getNode(nodes, edge.target)
              const evidence = getLineageEdgeEvidence(edge)
              const edgeId = getLineageEdgeId(edge)
              return (
                <button
                  className={`lineage-evidence__edge${selectedEdgeId === edgeId ? ' is-selected' : ''}`}
                  key={edgeId}
                  type="button"
                  onClick={() => setSelectedEdgeId(edgeId)}
                >
                  <strong>
                    {source?.label ?? edge.source} → {target?.label ?? edge.target}
                  </strong>
                  <small>
                    {RELATION_LABELS[getLineageEdgeRelation(edge)]} ·{' '}
                    {EVIDENCE_LABELS[evidence.source]}
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
            <small>
              关系：{RELATION_LABELS[getLineageEdgeRelation(selectedEdge)]} · 置信度：
              {CONFIDENCE_LABELS[getLineageEdgeConfidence(selectedEdge)]}
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
              <span className="eyebrow eyebrow--small">Path replay</span>
              <h3 id="lineage-path-title">字段变更路径</h3>
            </div>
            <p>从字段变更起点走到目标指标，逐边核对证据。</p>
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
                      {RELATION_LABELS[getLineageEdgeRelation(edge)]} ·{' '}
                      {EVIDENCE_LABELS[evidence.source]}
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
        这是教学模拟：真实项目中的血缘通常来自任务配置、SQL
        解析和元数据采集；本图不替代质量或调度系统。
      </p>
    </div>
  )
}
