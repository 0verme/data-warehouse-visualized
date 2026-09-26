export type NetworkEvolutionStage = 'accumulated' | 'governance'

type NetworkNodeId =
  | 'raw'
  | 'detail'
  | 'summary'
  | 'ratio-report'
  | 'dashboard'
  | 'branch-api'
  | 'temporary-result'
  | 'partner-api'
  | 'risk-api'

type NetworkEdgeKind = 'backbone' | 'cross-layer' | 'temporary' | 'converged'

interface NetworkNode {
  label: string
  layer: string
}

interface NetworkEdge {
  id: string
  from: NetworkNodeId
  to: NetworkNodeId
  kind: NetworkEdgeKind
  relation: string
  note: string
}

const nodes: Record<NetworkNodeId, NetworkNode> = {
  raw: { label: '原始余额记录', layer: '接入职责' },
  detail: { label: '账户余额明细', layer: '统一明细' },
  summary: { label: '分行余额汇总', layer: '共享加工' },
  'ratio-report': { label: '存贷比日报', layer: '指标产品' },
  dashboard: { label: '经营看板', layer: '消费出口' },
  'branch-api': { label: '分行数据 API', layer: '服务出口' },
  'temporary-result': { label: '临时分行口径', layer: '临时加工' },
  'partner-api': { label: '对外核对接口', layer: '服务出口' },
  'risk-api': { label: '风险分析接口', layer: '服务出口' },
}

const stages: Record<NetworkEvolutionStage, { edges: NetworkEdge[]; note: string }> = {
  accumulated: {
    edges: [
      {
        id: 'raw-detail',
        from: 'raw',
        to: 'detail',
        kind: 'backbone',
        relation: '分层主干',
        note: '保留可追溯的输入，再整理成可复用明细。',
      },
      {
        id: 'detail-summary',
        from: 'detail',
        to: 'summary',
        kind: 'backbone',
        relation: '公共加工',
        note: '多个报表反复使用分行余额口径后，沉淀了共享汇总。',
      },
      {
        id: 'summary-ratio',
        from: 'summary',
        to: 'ratio-report',
        kind: 'backbone',
        relation: '产品消费',
        note: '日报从共享结果计算自己的指标。',
      },
      {
        id: 'summary-dashboard',
        from: 'summary',
        to: 'dashboard',
        kind: 'backbone',
        relation: '多出口',
        note: '新看板复用已有口径，但消费方式不同。',
      },
      {
        id: 'detail-branch-api',
        from: 'detail',
        to: 'branch-api',
        kind: 'cross-layer',
        relation: '跨层读取',
        note: '迁移窗口先复用明细；链路形成后没有及时回看。',
      },
      {
        id: 'detail-temporary',
        from: 'detail',
        to: 'temporary-result',
        kind: 'temporary',
        relation: '临时链路',
        note: '为新接口赶进度，复制了一份分行汇总逻辑。',
      },
      {
        id: 'temporary-partner-api',
        from: 'temporary-result',
        to: 'partner-api',
        kind: 'temporary',
        relation: '临时链路',
        note: '临时结果后来被另一个出口依赖，移除它需要评估影响。',
      },
      {
        id: 'detail-risk-api',
        from: 'detail',
        to: 'risk-api',
        kind: 'cross-layer',
        relation: '独立出口',
        note: '不同消费目标可能有合理的明细需求，不自动等同于错误。',
      },
    ],
    note: '多年需求、系统迁移和临时交付会逐步增加读取路径与消费出口。网状关系说明需要盘点，不等于每条跨层边都要立刻删除。',
  },
  governance: {
    edges: [
      {
        id: 'raw-detail',
        from: 'raw',
        to: 'detail',
        kind: 'backbone',
        relation: '稳定主干',
        note: '继续保留有明确职责的基础加工。',
      },
      {
        id: 'detail-summary',
        from: 'detail',
        to: 'summary',
        kind: 'backbone',
        relation: '共享口径',
        note: '此汇总被多个消费者复用，因此当前有保留价值。',
      },
      {
        id: 'summary-ratio',
        from: 'summary',
        to: 'ratio-report',
        kind: 'backbone',
        relation: '产品消费',
        note: '存贷比日报继续消费共享结果。',
      },
      {
        id: 'summary-dashboard',
        from: 'summary',
        to: 'dashboard',
        kind: 'backbone',
        relation: '多出口',
        note: '经营看板继续复用同一分行口径。',
      },
      {
        id: 'detail-branch-api',
        from: 'detail',
        to: 'branch-api',
        kind: 'cross-layer',
        relation: '受控例外',
        note: '先登记负责人、用途、时效和依赖；确认有收益前暂不强制改链路。',
      },
      {
        id: 'summary-partner-api',
        from: 'summary',
        to: 'partner-api',
        kind: 'converged',
        relation: '触碰时治理',
        note: '本次调整时复用已有共享口径，替代一份重复的临时汇总。',
      },
      {
        id: 'detail-risk-api',
        from: 'detail',
        to: 'risk-api',
        kind: 'cross-layer',
        relation: '保留直读',
        note: '这条消费有独立用途；记录责任和时效后继续观察。',
      },
    ],
    note: '本例只在触碰时收敛一条有重复加工的路径，其他有解释的直读保留为受控例外。存量按影响范围、重复口径与运行风险排序，不做全量重构。',
  },
}

const edgeKindLabels: Record<NetworkEdgeKind, string> = {
  backbone: '主干关系',
  'cross-layer': '跨层关系',
  temporary: '历史临时关系',
  converged: '治理后复用',
}

function Endpoint({ nodeId }: { nodeId: NetworkNodeId }) {
  const node = nodes[nodeId]

  return (
    <span className="layer-network__endpoint">
      <small>{node.layer}</small>
      <strong>{node.label}</strong>
    </span>
  )
}

export function LayerNetworkEvolution({ stage }: { stage: NetworkEvolutionStage }) {
  const currentStage = stages[stage]

  return (
    <div className="layer-network" data-layer-network-stage={stage}>
      <ol className="layer-network__edges" aria-label="当前阶段的数据依赖关系">
        {currentStage.edges.map((edge) => (
          <li
            className={`layer-network__edge layer-network__edge--${edge.kind}`}
            data-edge-id={edge.id}
            data-edge-kind={edge.kind}
            key={edge.id}
          >
            <Endpoint nodeId={edge.from} />
            <span className="layer-network__relation" aria-label={edgeKindLabels[edge.kind]}>
              <span aria-hidden="true">→</span>
              <strong>{edge.relation}</strong>
            </span>
            <Endpoint nodeId={edge.to} />
            <p>{edge.note}</p>
          </li>
        ))}
      </ol>
      <aside className="layer-network__governance-note">
        <strong>{stage === 'accumulated' ? '观察到网状依赖' : '渐进治理，不做全量推倒'}</strong>
        <p>{currentStage.note}</p>
      </aside>
      {stage === 'governance' && (
        <>
          <section className="layer-network__new-link" aria-label="新增链路约定示意">
            <strong>新增链路：先把关系说清楚</strong>
            <ol>
              <li>写明生产者、消费者和用途。</li>
              <li>记录负责人、数据时效和运行依赖。</li>
              <li>按团队约定评估接入、暂缓或受控例外。</li>
            </ol>
            <p>是否采用强制评审是组织治理选择；这些信息有助于比较影响和维护成本。</p>
          </section>
          <ul className="layer-network__principles" aria-label="治理建议的适用层次">
            <li>
              <strong>工程原理</strong>
              <span>依赖与消费面决定变更评估范围，箭头关系需要可解释。</span>
            </li>
            <li>
              <strong>常见实践</strong>
              <span>盘点消费者、负责人、数据时效和运行依赖，按风险排序。</span>
            </li>
            <li>
              <strong>团队选择</strong>
              <span>哪些新增关系需要评审、例外由谁维护，可结合组织风险与交付节奏约定。</span>
            </li>
          </ul>
        </>
      )}
    </div>
  )
}
