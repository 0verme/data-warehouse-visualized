import { useState } from 'react'
import type {
  PerformanceAcceptanceCheckId,
  PerformanceOptimizationChoice,
  PerformanceTradeoffsVisualization,
} from '../../features/performance/types'
import {
  LayerMarker,
  PerformanceChoiceButton,
  PerformanceMetric,
  PerformanceMetricGrid,
  PerformancePanelHeading,
  SimulationNote,
} from './PerformanceLabShared'

const CHECK_IDS: readonly PerformanceAcceptanceCheckId[] = [
  'correctness',
  'sla-freshness',
  'cost',
  'maintainability',
]

const CHECK_ID_BY_INDEX: readonly PerformanceAcceptanceCheckId[] = CHECK_IDS

function ChoiceCard({ choice }: { choice: PerformanceOptimizationChoice }) {
  return (
    <article className={`performance-choice-card is-${choice.id}`}>
      <span>{choice.label}</span>
      <strong>
        {choice.originalRuntime} → {choice.optimizedRuntime}
      </strong>
      <dl>
        <div>
          <dt>SLA</dt>
          <dd>{choice.sla}</dd>
        </div>
        <div>
          <dt>新增代价</dt>
          <dd>{choice.addedCost}</dd>
        </div>
      </dl>
      <p>{choice.conclusion}</p>
    </article>
  )
}

export function PerformanceTradeoffLab({
  visualization,
}: {
  visualization: PerformanceTradeoffsVisualization
}) {
  const data = visualization.tradeoffs
  const [checked, setChecked] = useState<Record<PerformanceAcceptanceCheckId, boolean>>({
    correctness: false,
    'sla-freshness': false,
    cost: false,
    maintainability: false,
  })
  const [lateDataAction, setLateDataAction] = useState<'unresolved' | 'backfill' | 'rebuild'>(
    'unresolved',
  )
  const allChecked = CHECK_IDS.every((id) => checked[id])
  const lateData = data.lateData

  function toggleCheck(id: PerformanceAcceptanceCheckId) {
    setChecked((current) => ({ ...current, [id]: !current[id] }))
  }

  return (
    <div className="performance-lab performance-lab--tradeoffs">
      <LayerMarker layer="calculation-plan" />
      <SimulationNote text={visualization.simulationNote} />

      <section
        className="performance-tradeoff__comparison"
        aria-labelledby="performance-tradeoff-title"
      >
        <PerformancePanelHeading
          eyebrow="11-5 · Before / After"
          title="跑快了以后，先检查代价转移到了哪里"
          description="68 min → 18 min 是一个值得调查的变化，但最终判断还要回到正确性、SLA / Freshness、资源成本和维护复杂度。"
          id="performance-tradeoff-title"
        />
        <div className="performance-tradeoff__table-wrap">
          <table className="performance-tradeoff__table">
            <caption>反欺诈 T+1 特征加工 · 工程对照</caption>
            <thead>
              <tr>
                <th scope="col">检查项</th>
                <th scope="col">Before · 重复历史计算</th>
                <th scope="col">After · 状态与固定窗口</th>
                <th scope="col">还要问什么</th>
              </tr>
            </thead>
            <tbody>
              {data.beforeAfter.map((metric) => (
                <tr key={metric.id}>
                  <th scope="row">{metric.label}</th>
                  <td>{metric.before}</td>
                  <td className="is-after">{metric.after}</td>
                  <td>{metric.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="performance-tradeoff__checks" aria-labelledby="performance-checks-title">
        <PerformancePanelHeading
          eyebrow="验收顺序"
          title="把“优化成功”写成一组可检查的判断"
          description="下面四项按固定顺序完成；Runtime 降低只能作为输入，不能跳过前面的正确性检查。"
          id="performance-checks-title"
        />
        <ol className="performance-check-list">
          {data.acceptanceChecks.map((check, index) => {
            const id = CHECK_ID_BY_INDEX[index]!
            return (
              <li className={checked[id] ? 'is-checked' : undefined} key={check.value}>
                <label>
                  <input type="checkbox" checked={checked[id]} onChange={() => toggleCheck(id)} />
                  <span className="performance-check-list__number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <strong>{check.value}</strong>
                    <small>{check.detail}</small>
                  </span>
                </label>
              </li>
            )
          })}
        </ol>
        <p
          className={`performance-tradeoff__decision${allChecked ? ' is-ready' : ''}`}
          role="status"
        >
          {allChecked
            ? '四项都已检查：这份优化方案可以进入工程评审。'
            : '还不能只凭 Runtime 下结论：请按顺序检查四项。'}
        </p>
      </section>

      <section className="performance-tradeoff__late" aria-labelledby="performance-late-data-title">
        <PerformancePanelHeading
          eyebrow="迟到数据 · 状态的代价"
          title="2026-09-16 收到一笔 2026-09-10 的交易"
          description="到达日期和业务日期不同。如果这笔交易改变 first_seen_date，增量状态就必须提供修正和重建路径。"
          id="performance-late-data-title"
        />
        <div className="performance-late-data__event">
          <div>
            <span>收到</span>
            <strong>{lateData.receivedAt}</strong>
            <small>arrived_at</small>
          </div>
          <div>
            <span>属于</span>
            <strong>{lateData.businessDate}</strong>
            <small>business_date</small>
          </div>
          <div>
            <span>关系</span>
            <strong>
              {lateData.customerId} → {lateData.counterpartyId}
            </strong>
            <small>Transaction</small>
          </div>
          <div>
            <span>first_seen_date</span>
            <strong>
              {lateData.currentFirstSeenDate} → {lateData.correctedFirstSeenDate}
            </strong>
            <small>需要修正</small>
          </div>
        </div>
        <div className="performance-choice-grid performance-choice-grid--three">
          <PerformanceChoiceButton
            selected={lateDataAction === 'unresolved'}
            label="暂不修正"
            detail="状态仍然错误，不能发布受影响特征。"
            onClick={() => setLateDataAction('unresolved')}
          />
          <PerformanceChoiceButton
            selected={lateDataAction === 'backfill'}
            label="按业务日期回补"
            detail="修正 9 月 10 日状态，并回补受影响结果。"
            onClick={() => setLateDataAction('backfill')}
          />
          <PerformanceChoiceButton
            selected={lateDataAction === 'rebuild'}
            label="重建状态"
            detail="在状态损坏或规则变化时重建并对账。"
            onClick={() => setLateDataAction('rebuild')}
          />
        </div>
        <div className="performance-late-data__result" aria-live="polite">
          {lateDataAction === 'unresolved' ? (
            <p>
              <strong>当前不能发布：</strong> {lateData.affectedFeatureRange} 的 first_seen
              和客户日特征还没有被修正。
            </p>
          ) : (
            <>
              <p>
                <strong>{lateDataAction === 'backfill' ? '回补计划' : '重建计划'}：</strong>{' '}
                先修正业务状态，再重新生成受影响的固定结果。
              </p>
              <ul>
                {lateData.repairActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      <section className="performance-tradeoff__choice" aria-labelledby="performance-worth-title">
        <PerformancePanelHeading
          eyebrow="什么时候不该优化"
          title="把收益、SLA 和维护能力放在同一张表"
          description="同样是减少几分钟，业务约束不同，结论可能完全不同。"
          id="performance-worth-title"
        />
        <div className="performance-choice-card-grid">
          {data.choices.map((choice) => (
            <ChoiceCard choice={choice} key={choice.id} />
          ))}
        </div>
      </section>

      <section
        className="performance-tradeoff__reflection"
        aria-labelledby="performance-reflection-title"
      >
        <PerformancePanelHeading
          eyebrow="章节末思考题"
          title="预计算换来了什么，也放弃了什么？"
          description="这里不实现任意日期区间 DISTINCT，只保留问题和提示。"
          id="performance-reflection-title"
        />
        <blockquote>{data.reflectionQuestion}</blockquote>
        <ul>
          {data.reflectionHints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      </section>

      <PerformanceMetricGrid>
        <PerformanceMetric
          label="最终判断顺序"
          value="正确 → SLA / Freshness → 成本 → 可维护"
          detail="四项都成立，才值得保留优化"
        />
        <PerformanceMetric
          label="状态新增责任"
          value="Backfill · Rerun · 重建"
          detail="增量状态提高性能，但不是免费的捷径"
        />
      </PerformanceMetricGrid>
    </div>
  )
}
