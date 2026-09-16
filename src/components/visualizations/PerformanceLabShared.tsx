import type { ReactNode } from 'react'
import type { PerformanceLayer, PerformanceLayerDefinition } from '../../features/performance/types'

export const PERFORMANCE_LAYER_DEFINITIONS: readonly PerformanceLayerDefinition[] = [
  {
    id: 'storage-execution',
    label: '存储与执行层',
    description: '数据怎样被分区、文件怎样被读取，以及阶段如何被执行。',
  },
  {
    id: 'calculation-plan',
    label: '计算方案层',
    description: '同一批输入怎样过滤、聚合、分发，是否还在重复做相同工作。',
  },
  {
    id: 'business-semantics',
    label: '业务语义层',
    description: '业务真正要回答什么，是否可以用状态和预计算改变计算方案。',
  },
]

const layerById = Object.fromEntries(
  PERFORMANCE_LAYER_DEFINITIONS.map((layer) => [layer.id, layer]),
) as Record<PerformanceLayer, PerformanceLayerDefinition>

export function LayerMarker({ layer }: { layer: PerformanceLayer }) {
  const definition = layerById[layer]

  return (
    <div className={`performance-layer performance-layer--${layer}`}>
      <span>{definition.label}</span>
      <small>{definition.description}</small>
    </div>
  )
}

export function SimulationNote({ text }: { text: string }) {
  return (
    <p className="performance-lab__note" role="note">
      <strong>教学边界：</strong> {text}
    </p>
  )
}

export function PerformancePanelHeading({
  eyebrow,
  title,
  description,
  id,
}: {
  eyebrow: string
  title: string
  description?: string
  id?: string
}) {
  return (
    <div className="performance-panel-heading">
      <div>
        <span className="eyebrow eyebrow--small">{eyebrow}</span>
        <h3 id={id}>{title}</h3>
      </div>
      {description && <p>{description}</p>}
    </div>
  )
}

export function PerformanceMetric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="performance-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  )
}

export function PerformanceMetricGrid({ children }: { children: ReactNode }) {
  return <div className="performance-metric-grid">{children}</div>
}

export function PerformanceChoiceButton({
  selected,
  label,
  detail,
  onClick,
}: {
  selected: boolean
  label: string
  detail: string
  onClick: () => void
}) {
  return (
    <button
      className={`performance-choice${selected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={selected}
      onClick={onClick}
    >
      <strong>{label}</strong>
      <small>{detail}</small>
    </button>
  )
}

export function PerformanceBar({
  value,
  maximum,
  tone = 'blue',
}: {
  value: number
  maximum: number
  tone?: string
}) {
  const width = maximum > 0 ? Math.max(3, Math.min(100, (value / maximum) * 100)) : 0

  return (
    <div className="performance-bar" aria-hidden="true">
      <i className={`is-${tone}`} style={{ width: `${width}%` }} />
    </div>
  )
}

export function ArrowSeparator() {
  return (
    <span className="performance-arrow" aria-hidden="true">
      →
    </span>
  )
}
