import type {
  LineageConfidence,
  LineageEdge,
  LineageEntityType,
  LineageEvidence,
  LineageEvidenceSource,
  LineageInvestigationEvent,
  LineageNode,
  LineageRelationType,
  LineageVerificationStatus,
} from '../types'
import type {
  LineageInvestigationEventDefinition,
  LineageRootCauseCandidate,
} from '../features/lineage/types'

export const LINEAGE_ENTITY_TYPES: LineageEntityType[] = ['table', 'field', 'task', 'metric']

export type LineageRelationVisualKind =
  'data-transform' | 'field-derivation' | 'control-dependency' | 'delivery-consume'

export interface LineageRelationVisual {
  kind: LineageRelationVisualKind
  label: string
  shortLabel: string
  direction: string
  marker: 'filled-arrow' | 'open-arrow' | 'diamond'
  linePattern: 'solid' | 'long-dash'
}

/**
 * Relation grammar for the lineage fixture. Focus and verification are deliberately not part of
 * this mapping: an overlay must not rewrite the business relationship it is highlighting.
 */
export const LINEAGE_RELATION_VISUALS: Record<LineageRelationType, LineageRelationVisual> = {
  transform: {
    kind: 'data-transform',
    label: '数据加工',
    shortLabel: '加工',
    direction: '生产者 → 派生数据',
    marker: 'filled-arrow',
    linePattern: 'solid',
  },
  derives: {
    kind: 'field-derivation',
    label: '字段派生',
    shortLabel: '派生',
    direction: '输入字段 → 输出字段',
    marker: 'open-arrow',
    linePattern: 'solid',
  },
  depends_on: {
    kind: 'control-dependency',
    label: '控制依赖',
    shortLabel: '依赖',
    direction: '前置条件 → 被放行任务',
    marker: 'open-arrow',
    linePattern: 'long-dash',
  },
  consumes: {
    kind: 'delivery-consume',
    label: '发布 / 消费',
    shortLabel: '消费',
    direction: '已发布资产 → 受控消费者',
    marker: 'diamond',
    linePattern: 'solid',
  },
}

export function getLineageRelationVisual(
  relation: LineageRelationType | undefined,
): LineageRelationVisual {
  return LINEAGE_RELATION_VISUALS[relation ?? 'transform']
}

const DEFAULT_LINEAGE_EVIDENCE: LineageEvidence = {
  source: 'manual_metadata',
  detail: '这条关系来自静态教学数据，暂未绑定 SQL 或任务运行记录。',
}

export interface LineageViewData {
  nodes: LineageNode[]
  edges: LineageEdge[]
}

export interface ImpactAnalysis {
  upstream: string[]
  directDownstream: string[]
  finalImpact: string[]
}

/** Explicit names for the four scopes used by an investigation. */
export interface LineageImpactSummary {
  upstream: string[]
  directDownstream: string[]
  transitiveDownstream: string[]
  finalBlastRadius: BlastRadius
}

export interface LineageTraversalOptions {
  /** Legacy traversal stays within the selected entity type unless this is enabled. */
  includeCrossEntity?: boolean
  entityType?: LineageEntityType
}

export type LineageInvestigationDecision = 'inspect-current-transform' | 'expand-upstream'

/** Decide whether the next check stays on the current hop or moves farther upstream. */
export function getInvestigationDecision(
  directUpstreamStatus: 'normal' | 'abnormal',
): LineageInvestigationDecision {
  return directUpstreamStatus === 'normal' ? 'inspect-current-transform' : 'expand-upstream'
}

export interface BlastRadius {
  nodeIds: string[]
  total: number
  byType: Record<LineageEntityType, number>
}

export interface LineagePath {
  nodeIds: string[]
  edges: LineageEdge[]
}

export const LINEAGE_CANVAS_WIDTH = 760
export const LINEAGE_CANVAS_HEIGHT = 500
export const LINEAGE_NODE_WIDTH = 138
export const LINEAGE_NODE_HEIGHT = 67

export interface LineagePoint {
  x: number
  y: number
}

export interface LineageEdgeGeometry {
  sourcePoint: LineagePoint
  targetPoint: LineagePoint
  midpoint: LineagePoint
  path: string
}

function getNodeBoundaryPoint(
  center: LineagePoint,
  direction: LineagePoint,
  nodeWidth: number,
  nodeHeight: number,
): LineagePoint {
  const halfWidth = nodeWidth / 2
  const halfHeight = nodeHeight / 2
  const scaleX = Math.abs(direction.x) > 0 ? halfWidth / Math.abs(direction.x) : Infinity
  const scaleY = Math.abs(direction.y) > 0 ? halfHeight / Math.abs(direction.y) : Infinity
  const scale = Math.min(scaleX, scaleY)

  return {
    x: center.x + direction.x * scale,
    y: center.y + direction.y * scale,
  }
}

/** Keep fixed-fixture SVG connectors outside node rectangles without introducing auto-layout. */
export function getLineageEdgeGeometry(
  source: Pick<LineageNode, 'x' | 'y'>,
  target: Pick<LineageNode, 'x' | 'y'>,
  nodeWidth = LINEAGE_NODE_WIDTH,
  nodeHeight = LINEAGE_NODE_HEIGHT,
): LineageEdgeGeometry {
  const sourceCenter = { x: source.x, y: source.y }
  const targetCenter = { x: target.x, y: target.y }
  const delta = { x: target.x - source.x, y: target.y - source.y }
  const length = Math.hypot(delta.x, delta.y)

  if (length === 0) {
    const path = `M ${source.x} ${source.y} L ${target.x} ${target.y}`
    return {
      sourcePoint: sourceCenter,
      targetPoint: targetCenter,
      midpoint: sourceCenter,
      path,
    }
  }

  const direction = { x: delta.x / length, y: delta.y / length }
  const sourcePoint = getNodeBoundaryPoint(sourceCenter, direction, nodeWidth, nodeHeight)
  const targetPoint = getNodeBoundaryPoint(
    targetCenter,
    { x: -direction.x, y: -direction.y },
    nodeWidth,
    nodeHeight,
  )
  const midpoint = {
    x: (sourcePoint.x + targetPoint.x) / 2,
    y: (sourcePoint.y + targetPoint.y) / 2,
  }

  return {
    sourcePoint,
    targetPoint,
    midpoint,
    path: `M ${sourcePoint.x} ${sourcePoint.y} L ${targetPoint.x} ${targetPoint.y}`,
  }
}

export interface LineageInvestigationResult {
  event: LineageInvestigationEvent
  impact: ImpactAnalysis
  blastRadius: BlastRadius
  path: LineagePath | null
  rootCauseCandidate: LineageRootCauseCandidate | null
  rootCauseCandidates: LineageRootCauseCandidate[]
}

export function getLineageEntityType(node: LineageNode): LineageEntityType {
  return node.entityType ?? 'table'
}

export function filterLineageNodes(
  nodes: readonly LineageNode[],
  entityType: LineageEntityType,
): LineageNode[] {
  return nodes.filter((node) => getLineageEntityType(node) === entityType)
}

export function filterLineageEdges(
  edges: readonly LineageEdge[],
  nodes: readonly LineageNode[],
): LineageEdge[] {
  const nodeIds = new Set(nodes.map((node) => node.id))
  return edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
}

export function getLineageView(
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  entityType: LineageEntityType,
): LineageViewData {
  const visibleNodes = filterLineageNodes(nodes, entityType)

  return {
    nodes: visibleNodes,
    edges: filterLineageEdges(edges, visibleNodes),
  }
}

function buildReverseAdjacency(edges: readonly LineageEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>()

  for (const edge of edges) {
    const upstream = adjacency.get(edge.target) ?? []
    upstream.push(edge.source)
    adjacency.set(edge.target, upstream)
  }

  return adjacency
}

function buildAdjacency(edges: readonly LineageEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>()

  for (const edge of edges) {
    const downstream = adjacency.get(edge.source) ?? []
    downstream.push(edge.target)
    adjacency.set(edge.source, downstream)
  }

  return adjacency
}

function walkGraph(startId: string, adjacency: Map<string, string[]>): string[] {
  const visited = new Set<string>()
  const queue = [...(adjacency.get(startId) ?? [])]
  const result: string[] = []
  let queueIndex = 0

  while (queueIndex < queue.length) {
    const currentId = queue[queueIndex]
    queueIndex += 1

    if (!currentId || visited.has(currentId)) {
      continue
    }

    visited.add(currentId)
    result.push(currentId)
    queue.push(...(adjacency.get(currentId) ?? []))
  }

  return result
}

function getScopedGraph(
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  nodeId: string,
  options?: LineageTraversalOptions,
): LineageViewData {
  if (options?.includeCrossEntity) {
    return { nodes: [...nodes], edges: filterLineageEdges(edges, nodes) }
  }

  const selectedNode = getNode(nodes, nodeId)
  const entityType =
    options?.entityType ?? (selectedNode ? getLineageEntityType(selectedNode) : undefined)
  if (!entityType) {
    return { nodes: [...nodes], edges: filterLineageEdges(edges, nodes) }
  }

  return getLineageView(nodes, edges, entityType)
}

function getNode(nodes: readonly LineageNode[], nodeId: string): LineageNode | undefined {
  return nodes.find((node) => node.id === nodeId)
}

export function getUpstreamNodes(
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  nodeId: string,
  options?: LineageTraversalOptions,
): string[] {
  const scopedGraph = getScopedGraph(nodes, edges, nodeId, options)
  return walkGraph(nodeId, buildReverseAdjacency(scopedGraph.edges))
}

export function getDownstreamNodes(
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  nodeId: string,
  options?: LineageTraversalOptions,
): string[] {
  const scopedGraph = getScopedGraph(nodes, edges, nodeId, options)
  return walkGraph(nodeId, buildAdjacency(scopedGraph.edges))
}

/** Return only the first upstream layer for a node. */
export function getDirectUpstreamNodes(edges: readonly LineageEdge[], nodeId: string): string[] {
  const sources = new Set<string>()

  for (const edge of edges) {
    if (edge.target === nodeId) {
      sources.add(edge.source)
    }
  }

  return [...sources]
}

/** Explicit name for all upstream layers; kept separate from the direct helper for teaching. */
export function getTransitiveUpstreamNodes(
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  nodeId: string,
  options?: LineageTraversalOptions,
): string[] {
  return getUpstreamNodes(nodes, edges, nodeId, options)
}

export function getTransitiveDownstreamNodes(
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  nodeId: string,
  options?: LineageTraversalOptions,
): string[] {
  return getDownstreamNodes(nodes, edges, nodeId, options)
}

export function getDirectDownstreamNodes(edges: readonly LineageEdge[], nodeId: string): string[] {
  const targets = new Set<string>()

  for (const edge of edges) {
    if (edge.source === nodeId) {
      targets.add(edge.target)
    }
  }

  return [...targets]
}

export function getImpactAnalysis(
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  nodeId: string,
  options?: LineageTraversalOptions,
): ImpactAnalysis {
  const view = getScopedGraph(nodes, edges, nodeId, options)

  return {
    upstream: getUpstreamNodes(view.nodes, view.edges, nodeId, { includeCrossEntity: true }),
    directDownstream: getDirectDownstreamNodes(view.edges, nodeId),
    finalImpact: getDownstreamNodes(view.nodes, view.edges, nodeId, {
      includeCrossEntity: true,
    }),
  }
}

function createEmptyTypeCounts(): Record<LineageEntityType, number> {
  return {
    table: 0,
    field: 0,
    task: 0,
    metric: 0,
  }
}

export function getBlastRadius(
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  nodeId: string,
  options?: LineageTraversalOptions,
): BlastRadius {
  const scopedGraph = getScopedGraph(nodes, edges, nodeId, options)
  const nodeById = new Map(scopedGraph.nodes.map((node) => [node.id, node]))
  const nodeIds = getDownstreamNodes(scopedGraph.nodes, scopedGraph.edges, nodeId, {
    includeCrossEntity: true,
  })
  const byType = createEmptyTypeCounts()

  for (const downstreamId of nodeIds) {
    const node = nodeById.get(downstreamId)
    if (node) {
      byType[getLineageEntityType(node)] += 1
    }
  }

  return {
    nodeIds,
    total: nodeIds.length,
    byType,
  }
}

export function getLineageImpactSummary(
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  nodeId: string,
  options?: LineageTraversalOptions,
): LineageImpactSummary {
  const impact = getImpactAnalysis(nodes, edges, nodeId, options)

  return {
    upstream: impact.upstream,
    directDownstream: impact.directDownstream,
    transitiveDownstream: impact.finalImpact,
    finalBlastRadius: getBlastRadius(nodes, edges, nodeId, options),
  }
}

export function getLineagePath(
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  sourceId: string,
  targetId: string,
): LineagePath | null {
  if (sourceId === targetId) {
    return { nodeIds: [sourceId], edges: [] }
  }

  const nodeIds = new Set(nodes.map((node) => node.id))
  const adjacency = new Map<string, LineageEdge[]>()

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue
    }

    const outgoing = adjacency.get(edge.source) ?? []
    outgoing.push(edge)
    adjacency.set(edge.source, outgoing)
  }

  const visited = new Set([sourceId])
  const queue: Array<LineagePath> = [{ nodeIds: [sourceId], edges: [] }]
  let queueIndex = 0

  while (queueIndex < queue.length) {
    const currentPath = queue[queueIndex]
    queueIndex += 1
    const currentNodeId = currentPath.nodeIds[currentPath.nodeIds.length - 1]

    for (const edge of adjacency.get(currentNodeId) ?? []) {
      if (visited.has(edge.target)) {
        continue
      }

      const nextPath: LineagePath = {
        nodeIds: [...currentPath.nodeIds, edge.target],
        edges: [...currentPath.edges, edge],
      }

      if (edge.target === targetId) {
        return nextPath
      }

      visited.add(edge.target)
      queue.push(nextPath)
    }
  }

  return null
}

export function analyzeLineageInvestigation(
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  event: LineageInvestigationEvent | LineageInvestigationEventDefinition,
): LineageInvestigationResult {
  const impactSummary = getLineageImpactSummary(nodes, edges, event.sourceEntityId, {
    includeCrossEntity: true,
  })

  const rootCauseCandidates =
    'rootCauseCandidates' in event ? [...(event.rootCauseCandidates ?? [])] : []
  const legacyCandidate = 'rootCauseCandidate' in event ? event.rootCauseCandidate : undefined
  if (rootCauseCandidates.length === 0 && legacyCandidate) {
    rootCauseCandidates.push(legacyCandidate)
  }

  return {
    event,
    impact: {
      upstream: impactSummary.upstream,
      directDownstream: impactSummary.directDownstream,
      finalImpact: impactSummary.transitiveDownstream,
    },
    blastRadius: impactSummary.finalBlastRadius,
    path: getLineagePath(nodes, edges, event.sourceEntityId, event.affectedEntityId),
    rootCauseCandidate: rootCauseCandidates[0] ?? null,
    rootCauseCandidates,
  }
}

export function getLineageEdgeId(edge: LineageEdge): string {
  return `${edge.source}->${edge.target}:${edge.relation ?? 'transform'}`
}

export function getLineageEdgeRelation(edge: LineageEdge): LineageRelationType {
  return edge.relation ?? 'transform'
}

export function getLineageEdgeEvidence(edge: LineageEdge): LineageEvidence {
  return edge.evidence ?? DEFAULT_LINEAGE_EVIDENCE
}

/** Return the relationship's provenance source, independent of whether it is verified. */
export function getLineageEdgeEvidenceSource(edge: LineageEdge): LineageEvidenceSource {
  return edge.evidenceSource ?? edge.evidence?.source ?? DEFAULT_LINEAGE_EVIDENCE.source
}

/** Map legacy inferred/manual values to the new two-state verification model. */
export function getLineageEdgeVerificationStatus(edge: LineageEdge): LineageVerificationStatus {
  if (edge.verificationStatus) {
    return edge.verificationStatus
  }

  return edge.confidence === 'confirmed' ? 'confirmed' : 'pending'
}

/** @deprecated Use getLineageEdgeVerificationStatus. */
export function getLineageEdgeConfidence(edge: LineageEdge): LineageConfidence {
  return edge.confidence ?? 'manual'
}
