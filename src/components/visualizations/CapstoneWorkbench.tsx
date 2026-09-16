import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  getDataServiceApiResponse,
  getDataServiceFileState,
} from '../../features/data-service/banking'
import type {
  CapstoneAction,
  CapstoneCheckpointDefinition,
  CapstoneConsumerChoice,
  CapstoneGrainChoice,
  CapstoneLaunchReview,
  CapstonePerformanceChoice,
  CapstoneProjectState,
  CapstoneReconciliationDecision,
  CapstoneStageId,
  CapstoneVisualization,
} from '../../features/capstone/types'
import { CAPSTONE_STAGE_IDS } from '../../features/capstone/types'
import { analyzeLineageInvestigation } from '../../utils/lineage'
import { LineageGraph } from './LineageGraph'
import {
  createInitialCapstoneState,
  getCapstoneLaunchReview,
  getMissionProgress,
  normalizeCapstoneState,
  transitionCapstoneProject,
} from '../../utils/capstone'

export const CAPSTONE_PROGRESS_STORAGE_KEY = 'data-warehouse-visualized:capstone'

function getInitialCapstoneState(fallbackState: CapstoneProjectState): CapstoneProjectState {
  if (typeof window === 'undefined') return fallbackState
  try {
    const raw = window.localStorage.getItem(CAPSTONE_PROGRESS_STORAGE_KEY)
    return normalizeCapstoneState(raw ? JSON.parse(raw) : null, fallbackState)
  } catch {
    return fallbackState
  }
}

const STAGE_STATUS_LABELS = {
  locked: '待解锁',
  available: '当前可进入',
  completed: '已完成',
  blocked: '已阻断',
} as const

const LAUNCH_STATUS_LABELS = {
  READY: 'READY · 可以发布',
  BLOCKED: 'BLOCKED · 暂不发布',
  'READY WITH RISK': 'READY WITH RISK · 带已知风险评审',
} as const

const GRAIN_OPTIONS: readonly {
  value: CapstoneGrainChoice
  label: string
  detail: string
}[] = [
  {
    value: 'business-date-branch',
    label: 'business_date × branch_id',
    detail: '一行代表某个业务日期、某家分行的一份经营指标快照。',
  },
  {
    value: 'branch-only',
    label: 'branch_id',
    detail: '缺少业务日期，不能区分不同日的余额状态。',
  },
  {
    value: 'account-business-date-branch',
    label: 'account × business_date × branch_id',
    detail: '保留了明细 Grain，不是最终经营产品需要的行含义。',
  },
]

const RECONCILIATION_OPTIONS: readonly {
  value: CapstoneReconciliationDecision
  label: string
  detail: string
}[] = [
  {
    value: 'block-and-investigate',
    label: '阻断发布并调查',
    detail: '接受 Quality FAIL，沿 Quality Event 和 Lineage 找证据。',
  },
  {
    value: 'override-release',
    label: '尝试覆盖发布闸门',
    detail: 'Scheduler SUCCESS 不能覆盖 Quality FAIL，当前结果仍然 BLOCKED。',
  },
]

const CONSUMER_OPTIONS: readonly {
  value: CapstoneConsumerChoice
  label: string
  detail: string
}[] = [
  {
    value: 'report',
    label: '经营报表 / BI',
    detail: '主消费者：给经营人员查看、筛选和比较。',
  },
  {
    value: 'file',
    label: '文件接口',
    detail: '扩展消费者：批量读取 TXT，并等待同批次 FLAG。',
  },
  {
    value: 'api',
    label: 'API',
    detail: '扩展消费者：按机构和业务日期获取离线结果。',
  },
]

const PERFORMANCE_OPTIONS: readonly {
  value: CapstonePerformanceChoice
  label: string
  detail: string
}[] = [
  {
    value: 'partition-pruning',
    label: 'Partition Pruning',
    detail: '让业务日期过滤先缩小 Scan 范围，再复测成本和 SLA。',
  },
  {
    value: 'add-resources',
    label: '直接增加资源',
    detail: '可能缩短 Runtime，但新增成本，且没有验证主要 Scan 瓶颈。',
  },
  {
    value: 'no-change',
    label: '暂不改变',
    detail: '维护复杂度不变，但规模上涨后的 SLA 风险仍在。',
  },
]

function formatAmount(value: number): string {
  return `${value.toLocaleString('zh-CN')} 元`
}

function formatRatio(value: number | null): string {
  return value === null
    ? 'NULL · 不可计算'
    : value.toLocaleString('zh-CN', { maximumFractionDigits: 4 })
}

function getLatestDecision(
  state: CapstoneProjectState,
  checkpointId: CapstoneStageId,
): CapstoneProjectState['decisions'][number] | undefined {
  return [...state.decisions].reverse().find((decision) => decision.checkpointId === checkpointId)
}

function StageTitle({ checkpoint }: { checkpoint: CapstoneCheckpointDefinition }) {
  return (
    <header className="capstone-stage__heading">
      <span className="capstone-eyebrow">Checkpoint · {checkpoint.label}</span>
      <h2>{checkpoint.question}</h2>
      <p>{checkpoint.deliverable}</p>
    </header>
  )
}

function ChoiceButton<T extends string>({
  value,
  label,
  detail,
  selected,
  onSelect,
}: {
  value: T
  label: string
  detail: string
  selected: boolean
  onSelect: (value: T) => void
}) {
  return (
    <button
      className={`capstone-choice${selected ? ' is-selected' : ''}`}
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(value)}
    >
      <span className="capstone-choice__mark" aria-hidden="true">
        {selected ? '✓' : ''}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </button>
  )
}

function DecisionNote({
  decision,
  tone = 'neutral',
}: {
  decision: CapstoneProjectState['decisions'][number] | undefined
  tone?: 'neutral' | 'warning' | 'success'
}) {
  if (!decision) return null

  return (
    <aside className={`capstone-decision-note capstone-decision-note--${tone}`}>
      <span className="capstone-eyebrow">最近的 Decision Record</span>
      <strong>{decision.decision}</strong>
      <p>{decision.consequence}</p>
      <small>恢复路径：{decision.recoveryPath}</small>
    </aside>
  )
}

function ActionBar({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="capstone-action-bar">
      <div>{children}</div>
      {note && <small>{note}</small>}
    </div>
  )
}

function MetricTable({ review }: { review: CapstoneLaunchReview }) {
  return (
    <div className="capstone-table-wrap">
      <table className="capstone-table">
        <caption>branch_business_daily 指标定义</caption>
        <thead>
          <tr>
            <th scope="col">指标</th>
            <th scope="col">公式</th>
            <th scope="col">单位</th>
            <th scope="col">时间语义</th>
          </tr>
        </thead>
        <tbody>
          {review.metrics.map((metric) => (
            <tr key={metric.id}>
              <th scope="row">{metric.label}</th>
              <td>
                <code>{metric.formula}</code>
              </td>
              <td>{metric.unit}</td>
              <td>{metric.timeSemantics}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProductTable({ visualization }: { visualization: CapstoneVisualization }) {
  return (
    <div className="capstone-table-wrap">
      <table className="capstone-table capstone-product-table">
        <caption>branch_business_daily · {visualization.mission.businessDate} 教学样本</caption>
        <thead>
          <tr>
            <th scope="col">business_date</th>
            <th scope="col">branch_id</th>
            <th scope="col">deposit_balance</th>
            <th scope="col">loan_balance</th>
            <th scope="col">loan_deposit_ratio</th>
          </tr>
        </thead>
        <tbody>
          {visualization.facts.productRows.map((row) => (
            <tr key={`${row.business_date}-${row.branch_id}`}>
              <td>{row.business_date}</td>
              <th scope="row">
                <code>{row.branch_id}</code>
              </th>
              <td>{formatAmount(row.deposit_balance)}</td>
              <td>{formatAmount(row.loan_balance)}</td>
              <td>
                <strong>{formatRatio(row.loan_deposit_ratio)}</strong>
                <small className="capstone-table__subtext">
                  {row.loan_deposit_ratio_status === 'calculated' ? 'calculated' : 'not-calculable'}
                </small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MissionBriefStage({ visualization, state, review, dispatch }: StageProps) {
  const decision = getLatestDecision(state, 'mission-brief')
  return (
    <section className="capstone-stage" aria-labelledby="capstone-stage-mission-brief">
      <StageTitle checkpoint={getCheckpoint(visualization, 'mission-brief')} />
      <div className="capstone-brief-grid">
        <div className="capstone-brief-callout">
          <span className="capstone-eyebrow">今天的交付任务</span>
          <h3>{visualization.mission.title}</h3>
          <p>
            业务日期是 <code>{visualization.mission.businessDate}</code>。08:00
            前，经营管理部门需要各分行的存款余额、贷款余额和存贷比。
          </p>
        </div>
        <dl className="capstone-fact-list">
          <div>
            <dt>产品</dt>
            <dd>
              <code>branch_business_daily</code>
            </dd>
          </div>
          <div>
            <dt>Grain</dt>
            <dd>{visualization.mission.grain}</dd>
          </div>
          <div>
            <dt>SLA</dt>
            <dd>{visualization.mission.deliverySlaAt}</dd>
          </div>
          <div>
            <dt>主消费者</dt>
            <dd>{visualization.mission.consumers[0]}</dd>
          </div>
        </dl>
      </div>
      <div className="capstone-source-grid">
        {visualization.mission.sources.map((source) => (
          <article className="capstone-source-card" key={source}>
            <span className="capstone-source-card__index" aria-hidden="true">
              ↗
            </span>
            <strong>{source}</strong>
            <p>
              {source.includes('Loan')
                ? '只保留本项目需要的最小信贷余额事实。'
                : source.includes('Branch')
                  ? '两套事实汇总到分行视角时的公共维度。'
                  : '核心系统提供的日终账户余额状态。'}
            </p>
          </article>
        ))}
      </div>
      <MetricTable review={review} />
      <div className="capstone-loop-note">
        <strong>01 → 12</strong>
        <p>
          第一章问“为什么业务系统不能独立回答跨系统经营问题”，这份 Mission
          要把核心系统和信贷系统的事实放进同一个分析上下文，最终交付可消费的数据产品。
        </p>
      </div>
      <ActionBar note="这一步记录的是项目边界，不是技术方案评分。">
        <button
          className="capstone-primary-button"
          type="button"
          onClick={() => dispatch({ type: 'confirm-mission' })}
        >
          {state.checkpointStates['mission-brief'] === 'completed'
            ? '重新确认 Mission Brief'
            : '确认 Mission Brief'}
        </button>
      </ActionBar>
      <DecisionNote decision={decision} tone="success" />
    </section>
  )
}

function DesignStage({ visualization, state, dispatch }: StageProps) {
  const decision = getLatestDecision(state, 'design')
  return (
    <section className="capstone-stage" aria-labelledby="capstone-stage-design">
      <StageTitle checkpoint={getCheckpoint(visualization, 'design')} />
      <div className="capstone-flow-board" aria-label="两套余额快照汇合到最终 Grain">
        <div className="capstone-flow-board__column">
          <span className="capstone-eyebrow">核心系统</span>
          <strong>AccountBalanceSnapshot</strong>
          <small>account_id × snapshot_date</small>
        </div>
        <div className="capstone-flow-board__column">
          <span className="capstone-eyebrow">信贷系统</span>
          <strong>LoanBalanceSnapshot</strong>
          <small>loan_id × snapshot_date</small>
        </div>
        <span className="capstone-flow-board__join" aria-hidden="true">
          +
        </span>
        <div className="capstone-flow-board__column capstone-flow-board__column--target">
          <span className="capstone-eyebrow">最终产品</span>
          <strong>business_date × branch_id</strong>
          <small>Branch 经营视角</small>
        </div>
      </div>
      <div className="capstone-evidence-panel">
        <div>
          <span className="capstone-eyebrow">输入证据</span>
          <h3>两套输入的行含义不能混用</h3>
          <ul className="capstone-check-list">
            <li>AccountBalanceSnapshot：一个账户在一个 snapshot_date 的日终余额。</li>
            <li>LoanBalanceSnapshot：一笔贷款在一个 snapshot_date 的给定余额。</li>
            <li>Branch：公共维度只负责分行归属，不扩展贷款业务细节。</li>
          </ul>
        </div>
        <div className="capstone-decision-panel">
          <span className="capstone-eyebrow">有限选择 · Grain</span>
          <div className="capstone-choice-list">
            {GRAIN_OPTIONS.map((option) => (
              <ChoiceButton
                key={option.value}
                {...option}
                selected={state.grainChoice === option.value}
                onSelect={(choice) => dispatch({ type: 'choose-grain', choice })}
              />
            ))}
          </div>
        </div>
      </div>
      <DecisionNote
        decision={decision}
        tone={state.grainChoice === 'business-date-branch' ? 'success' : 'warning'}
      />
    </section>
  )
}

function BuildStage({ visualization, state, dispatch }: StageProps) {
  const decision = getLatestDecision(state, 'build')
  const buildChoice = state.buildChoice
  return (
    <section className="capstone-stage" aria-labelledby="capstone-stage-build">
      <StageTitle checkpoint={getCheckpoint(visualization, 'build')} />
      <div className="capstone-build-layout">
        <div className="capstone-build-steps">
          <article>
            <span>01</span>
            <strong>分别去重 / 聚合</strong>
            <p>把两份 Snapshot 各自收敛到 business_date × branch_id。</p>
          </article>
          <article>
            <span>02</span>
            <strong>使用 Branch 汇合</strong>
            <p>只把同一业务日期、同一分行的两个余额放进产品行。</p>
          </article>
          <article>
            <span>03</span>
            <strong>受控计算比值</strong>
            <p>deposit_balance = 0 时保留 NULL / not-calculable，不转换成 0。</p>
          </article>
        </div>
        <div className="capstone-decision-panel">
          <span className="capstone-eyebrow">有限选择 · 加工顺序</span>
          <div className="capstone-choice-list">
            <ChoiceButton
              value="aggregate-then-join"
              label="先分别聚合，再按分行汇合"
              detail="推荐：避免原始事实 Join 造成金额放大。"
              selected={buildChoice === 'aggregate-then-join'}
              onSelect={(choice) => dispatch({ type: 'choose-build', choice })}
            />
            <ChoiceButton
              value="join-raw-facts"
              label="先 Join 原始事实再聚合"
              detail="风险：两套事实的行会互相复制，结果 Grain 不稳定。"
              selected={buildChoice === 'join-raw-facts'}
              onSelect={(choice) => dispatch({ type: 'choose-build', choice })}
            />
          </div>
        </div>
      </div>
      <ProductTable visualization={visualization} />
      <div className="capstone-zero-note" role="note">
        <strong>分母为零的边界：</strong>
        B03 没有存款余额但有贷款余额，存贷比显示 <code>NULL</code> / <code>not-calculable</code>
        。这条记录仍可保留，但消费者必须理解它不是 0%。
      </div>
      <DecisionNote
        decision={decision}
        tone={buildChoice === 'aggregate-then-join' ? 'success' : 'warning'}
      />
    </section>
  )
}

function OperateStage({ visualization, state, dispatch }: StageProps) {
  const decision = getLatestDecision(state, 'operate')
  const finalTask = visualization.scheduler.tasks.at(-1)
  const finalTaskRun = finalTask
    ? visualization.scheduler.lateRun.taskRuns[finalTask.taskId]
    : undefined
  const visibleTasks = visualization.scheduler.tasks.filter(
    (task) =>
      task.layer === 'dwd' ||
      task.layer === 'dws' ||
      task.taskId.includes('loan') ||
      task.taskId === finalTask?.taskId,
  )
  return (
    <section className="capstone-stage" aria-labelledby="capstone-stage-operate">
      <StageTitle checkpoint={getCheckpoint(visualization, 'operate')} />
      <div className="capstone-timeline" aria-label="日批关键时间线">
        <article>
          <time>06:30</time>
          <strong>LoanBalanceSnapshot 原计划到达</strong>
          <p>这表示 expected arrival，不是 snapshot_date。</p>
        </article>
        <article>
          <time>07:00</time>
          <strong>跨系统加工开始</strong>
          <p>Scheduler 以 business_date = {visualization.mission.businessDate} 运行。</p>
        </article>
        <article>
          <time>07:35</time>
          <strong>迟到贷款事实实际到达</strong>
          <p>arrived_at 单独记录，未把业务日期改成 10 月 1 日。</p>
        </article>
        <article>
          <time>08:00</time>
          <strong>经营产品 SLA</strong>
          <p>完整产品、Quality 和 Release 都满足后才可消费。</p>
        </article>
      </div>
      <div className="capstone-operate-grid">
        <div>
          <span className="capstone-eyebrow">复用现有 Scheduler 语义</span>
          <h3>DAG 的关键依赖</h3>
          <ul className="capstone-task-list">
            {visibleTasks.map((task) => (
              <li key={task.taskId}>
                <span>{task.layer.toUpperCase()}</span>
                <div>
                  <strong>{task.label}</strong>
                  <small>
                    {task.dependsOn.length ? `依赖 ${task.dependsOn.join('、')}` : '无上游任务'} ·
                    输出 {task.contract.outputTable}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="capstone-run-card">
          <span className="capstone-eyebrow">运行证据</span>
          <strong>{visualization.scheduler.lateRun.status.toUpperCase()}</strong>
          <dl className="capstone-fact-list">
            <div>
              <dt>processing</dt>
              <dd>{visualization.scheduler.processingStartedAt}</dd>
            </div>
            <div>
              <dt>late input</dt>
              <dd>{visualization.scheduler.loanArrivedAt}</dd>
            </div>
            <div>
              <dt>final output</dt>
              <dd>{finalTaskRun?.endedAt ?? '待运行'}</dd>
            </div>
            <div>
              <dt>SLA state</dt>
              <dd>{finalTaskRun?.slaState ?? 'not-started'}</dd>
            </div>
          </dl>
        </div>
      </div>
      <ActionBar note="确认后进入同一项目中的两个固定数据事故；DAG 不会被另建一套 Capstone Scheduler 替代。">
        <button
          className="capstone-primary-button"
          type="button"
          onClick={() => dispatch({ type: 'confirm-operate' })}
        >
          {state.operateConfirmed ? '重新确认运行证据' : '确认日批运行证据'}
        </button>
      </ActionBar>
      <DecisionNote decision={decision} tone="success" />
    </section>
  )
}

function IncidentStatus({
  state,
  id,
}: {
  state: CapstoneProjectState
  id: 'loan-late' | 'deposit-reconciliation' | 'scale-sla-risk'
}) {
  const incident = state.incidents[id]
  return (
    <span className={`capstone-status-pill capstone-status-pill--${incident.status}`}>
      {incident.status}
    </span>
  )
}

function IncidentStage({ visualization, state, dispatch }: StageProps) {
  const decision = getLatestDecision(state, 'incident')
  return (
    <section className="capstone-stage" aria-labelledby="capstone-stage-incident">
      <StageTitle checkpoint={getCheckpoint(visualization, 'incident')} />
      <div className="capstone-incident-detail-grid">
        <article className="capstone-incident-card">
          <header>
            <span className="capstone-incident-number">事故 1</span>
            <div>
              <h3>LoanBalanceSnapshot 迟到</h3>
              <IncidentStatus state={state} id="loan-late" />
            </div>
          </header>
          <p>
            06:30 原计划到达，07:00 加工开始，07:35 实际到达，08:00 是完整产品
            SLA。贷款事实是最终产品的硬依赖。
          </p>
          <dl className="capstone-fact-list">
            <div>
              <dt>business_date</dt>
              <dd>{visualization.mission.businessDate}</dd>
            </div>
            <div>
              <dt>arrived_at</dt>
              <dd>{visualization.scheduler.loanArrivedAt}</dd>
            </div>
            <div>
              <dt>dependency</dt>
              <dd>waiting → ready → running</dd>
            </div>
            <div>
              <dt>恢复范围</dt>
              <dd>原业务日期的局部 Rerun / Backfill</dd>
            </div>
          </dl>
          <div className="capstone-choice-list">
            <ChoiceButton
              value="wait-for-loan"
              label="继续等待输入"
              detail="剩余窗口仍可完成完整产品时，等待是最小改动。"
              selected={state.loanLateDecision === 'wait-for-loan'}
              onSelect={(decision) => dispatch({ type: 'handle-loan-late', decision })}
            />
            <ChoiceButton
              value="rerun-original-business-date"
              label="按原业务日期局部 Rerun"
              detail="保留 2026-09-30 分区，只重跑迟到输入及其下游。"
              selected={state.loanLateDecision === 'rerun-original-business-date'}
              onSelect={(decision) => dispatch({ type: 'handle-loan-late', decision })}
            />
            <ChoiceButton
              value="publish-deposit-only"
              label="暂存存款侧部分结果"
              detail="不能静默当成完整 branch_business_daily，发布必须阻断。"
              selected={state.loanLateDecision === 'publish-deposit-only'}
              onSelect={(decision) => dispatch({ type: 'handle-loan-late', decision })}
            />
          </div>
          <div className="capstone-plan-inline">
            <strong>局部 Rerun：</strong>
            {visualization.scheduler.loanRerunPlan.taskIds.join(' → ')}
          </div>
        </article>
        <article className="capstone-incident-card">
          <header>
            <span className="capstone-incident-number">事故 2</span>
            <div>
              <h3>存款余额跨层对账失败</h3>
              <IncidentStatus state={state} id="deposit-reconciliation" />
            </div>
          </header>
          <p>DWD / DWS 都可以显示 SUCCESS，但同一日期、分行、单位和口径下的余额并不一致。</p>
          <div className="capstone-reconciliation-grid">
            <div>
              <span>DWD</span>
              <strong>
                {formatAmount(visualization.quality.reconciliation.expectedDwdBalance)}
              </strong>
            </div>
            <div>
              <span>DWS</span>
              <strong>
                {formatAmount(visualization.quality.reconciliation.observedDwsBalance)}
              </strong>
            </div>
            <div>
              <span>delta</span>
              <strong className="is-negative">
                {formatAmount(visualization.quality.reconciliation.delta)}
              </strong>
            </div>
          </div>
          <div className="capstone-release-chain" aria-label="质量失败传播链">
            <span>Scheduler SUCCESS</span>
            <b>↓</b>
            <span>Quality FAIL</span>
            <b>↓</b>
            <span>Release BLOCKED</span>
          </div>
          <div className="capstone-choice-list">
            {RECONCILIATION_OPTIONS.map((option) => (
              <ChoiceButton
                key={option.value}
                {...option}
                selected={state.reconciliationDecision === option.value}
                onSelect={(decision) => dispatch({ type: 'handle-reconciliation', decision })}
              />
            ))}
          </div>
        </article>
      </div>
      <div className="capstone-incident-footer" role="note">
        <strong>事故 3 会在 Scale checkpoint 发生：</strong>规模上涨后需要基于第 11
        章证据做一次有限优化和复测，不加入随机故障。
      </div>
      <DecisionNote
        decision={decision}
        tone={
          state.reconciliationDecision === 'block-and-investigate' &&
          state.loanLateDecision !== 'publish-deposit-only'
            ? 'success'
            : 'warning'
        }
      />
    </section>
  )
}

function InvestigationStage({ visualization, state, review, dispatch }: StageProps) {
  const decision = getLatestDecision(state, 'investigate')
  const result = analyzeLineageInvestigation(
    visualization.lineage.nodes,
    visualization.lineage.edges,
    visualization.lineage.investigationEvent,
  )
  const nodeLabels = new Map(visualization.lineage.nodes.map((node) => [node.id, node.label]))
  const selectedCandidate = result.rootCauseCandidates.find(
    (candidate) => candidate.id === state.investigationCandidateId,
  )
  const pathLabels = result.path?.nodeIds.map((id) => nodeLabels.get(id) ?? id) ?? []
  const directLabels = result.impact.directDownstream.map((id) => nodeLabels.get(id) ?? id)
  const blastLabels = result.blastRadius.nodeIds.map((id) => nodeLabels.get(id) ?? id)
  return (
    <section className="capstone-stage" aria-labelledby="capstone-stage-investigate">
      <StageTitle checkpoint={getCheckpoint(visualization, 'investigate')} />
      <div className="capstone-propagation-banner">
        <span>Quality Event</span>
        <b>→</b>
        <span>Release Blocked</span>
        <b>→</b>
        <span>Lineage Investigation</span>
        <b>→</b>
        <span>修复 / Rerun / 复检</span>
      </div>
      <div className="capstone-investigate-grid">
        <article className="capstone-evidence-card">
          <span className="capstone-eyebrow">Quality Event · 观察事实</span>
          <h3>{visualization.quality.event.ruleId}</h3>
          <dl className="capstone-fact-list">
            <div>
              <dt>target</dt>
              <dd>
                {visualization.quality.event.target.table}.
                {visualization.quality.event.target.field}
              </dd>
            </div>
            <div>
              <dt>partition</dt>
              <dd>
                {visualization.quality.event.partition.column} ={' '}
                {visualization.quality.event.partition.value}
              </dd>
            </div>
            <div>
              <dt>expected</dt>
              <dd>delta = 0</dd>
            </div>
            <div>
              <dt>observed</dt>
              <dd>delta = {visualization.quality.reconciliation.delta.toLocaleString('zh-CN')}</dd>
            </div>
            <div>
              <dt>Scheduler</dt>
              <dd>{visualization.quality.event.schedulerContext.taskStatus.toUpperCase()}</dd>
            </div>
            <div>
              <dt>Release</dt>
              <dd>BLOCKED</dd>
            </div>
          </dl>
          <p className="capstone-boundary-note">
            Quality Event 记录的是 DWD 120 亿 / DWS 118 亿这一观察事实；它没有把业务根因写死。
          </p>
        </article>
        <article className="capstone-evidence-card">
          <span className="capstone-eyebrow">Lineage · 根因候选</span>
          <h3>先近后远，选择优先复核入口</h3>
          <div className="capstone-choice-list">
            {result.rootCauseCandidates.map((candidate) => (
              <ChoiceButton
                key={candidate.id ?? candidate.entityId}
                value={candidate.id ?? candidate.entityId}
                label={candidate.label ?? nodeLabels.get(candidate.entityId) ?? candidate.entityId}
                detail={`${candidate.verificationStatus} · ${candidate.rationale}`}
                selected={state.investigationCandidateId === (candidate.id ?? candidate.entityId)}
                onSelect={(candidateId) => dispatch({ type: 'select-root-cause', candidateId })}
              />
            ))}
          </div>
          {selectedCandidate && (
            <p className="capstone-boundary-note">
              当前选择仍是 <strong>pending candidate</strong>，需要数据 Diff、SQL
              版本、任务日志或业务变更记录确认。
            </p>
          )}
        </article>
      </div>
      <div className="capstone-lineage-summary">
        <div>
          <span className="capstone-eyebrow">调查路径</span>
          <p>{pathLabels.join(' → ')}</p>
        </div>
        <div>
          <span className="capstone-eyebrow">直接下游</span>
          <p>{directLabels.join('、') || '—'}</p>
        </div>
        <div>
          <span className="capstone-eyebrow">Blast Radius</span>
          <p>{blastLabels.join('、') || '—'}</p>
        </div>
      </div>
      <div className="capstone-lineage-graph">
        <LineageGraph
          nodes={[...visualization.lineage.nodes]}
          edges={[...visualization.lineage.edges]}
          investigationEvent={visualization.lineage.investigationEvent}
        />
      </div>
      <div className="capstone-recovery-panel">
        <div>
          <span className="capstone-eyebrow">修复后验证</span>
          <h3>
            {state.qualityRecovered
              ? 'Quality PASS · Release released'
              : '还没有解除 Release Block'}
          </h3>
          <p>
            {state.qualityRecovered
              ? '同一 business_date 已重跑并完成对账复检。'
              : '选择候选后，按同一业务日期修复、Rerun，再重新执行 Quality。'}
          </p>
        </div>
        <button
          className="capstone-primary-button"
          type="button"
          disabled={!state.investigationCandidateId || state.qualityRecovered}
          onClick={() => dispatch({ type: 'recover-quality' })}
        >
          {state.qualityRecovered ? '已完成恢复' : '记录修复、Rerun 与复检'}
        </button>
      </div>
      <DecisionNote decision={decision} tone={state.qualityRecovered ? 'success' : 'warning'} />
      <p className="capstone-small-note">
        本次调查的传递影响来自现有 Lineage utility；Governance
        只消费这份影响结果，不重新建设影响分析。
      </p>
      {review.lineage.evidenceBoundary && (
        <p className="capstone-small-note">证据边界：{review.lineage.evidenceBoundary}</p>
      )}
    </section>
  )
}

function DeliverStage({ visualization, state, review, dispatch }: StageProps) {
  const decision = getLatestDecision(state, 'deliver')
  const fileState = getDataServiceFileState(review.status === 'BLOCKED' ? 'txt' : 'complete')
  const apiResponse = getDataServiceApiResponse(
    visualization.dataService.publishedBalances,
    'B01',
    visualization.mission.businessDate,
  )
  return (
    <section className="capstone-stage" aria-labelledby="capstone-stage-deliver">
      <StageTitle checkpoint={getCheckpoint(visualization, 'deliver')} />
      <div className="capstone-deliver-banner">
        <strong>{visualization.dataService.asset.assetName}</strong>
        <span>
          {review.quality.effectiveBlocked
            ? 'Release BLOCKED · 暂不可消费'
            : '已发布结果 · 可供消费'}
        </span>
      </div>
      <div className="capstone-consumer-grid">
        {CONSUMER_OPTIONS.map((option) => (
          <ChoiceButton
            key={option.value}
            {...option}
            selected={state.consumerChoice === option.value}
            onSelect={(consumer) => dispatch({ type: 'choose-consumer', consumer })}
          />
        ))}
      </div>
      <div className="capstone-delivery-details">
        <article>
          <span className="capstone-eyebrow">主消费者</span>
          <h3>经营报表 / BI</h3>
          <p>主路径固定给经营人员查看分行、业务日期、三个指标和风险状态。</p>
          <small>
            {state.consumerChoice === 'report' ? '当前已选择' : '等待选择或当前选择偏离主路径'}
          </small>
        </article>
        <article>
          <span className="capstone-eyebrow">文件扩展</span>
          <h3>{visualization.dataService.file.dataFileName}</h3>
          <p>TXT 只承载数据；{visualization.dataService.file.flagFileName} 出现后才算一批完成。</p>
          <strong className={fileState.canConsume ? 'is-positive' : 'is-negative'}>
            {fileState.statusLabel}
          </strong>
        </article>
        <article>
          <span className="capstone-eyebrow">API 扩展</span>
          <h3>{visualization.dataService.api.route}</h3>
          <p>GET 参数是 branch_id + business_date，访问方式不等于实时数据。</p>
          <pre aria-label="API response example">{JSON.stringify(apiResponse, null, 2)}</pre>
        </article>
      </div>
      <div className="capstone-zero-note" role="note">
        <strong>服务边界：</strong>无论报表、文件还是 API，都不能绕过 Quality / Release
        状态；普通业务系统不直接连接数仓内部表。
      </div>
      <DecisionNote
        decision={decision}
        tone={state.consumerChoice === 'report' ? 'success' : 'warning'}
      />
    </section>
  )
}

function ScaleStage({ visualization, state, review, dispatch }: StageProps) {
  const decision = getLatestDecision(state, 'scale')
  const diagnosis = visualization.performance.diagnosis.diagnosis
  return (
    <section className="capstone-stage" aria-labelledby="capstone-stage-scale">
      <StageTitle checkpoint={getCheckpoint(visualization, 'scale')} />
      <div className="capstone-scale-evidence">
        <div className="capstone-scale-symptom">
          <span className="capstone-eyebrow">事故 3 · 规模上涨</span>
          <IncidentStatus state={state} id="scale-sla-risk" />
          <h3>{diagnosis.symptom}</h3>
          <p>
            先看证据：Scan 是 {diagnosis.validation.beforeStageMinutes} min，端到端 Runtime 是{' '}
            {diagnosis.validation.beforeRuntimeMinutes} min；这次只做一个有限修改。
          </p>
        </div>
        <dl className="capstone-before-after">
          <div>
            <dt>Before Runtime</dt>
            <dd>{review.performance.beforeRuntime}</dd>
          </div>
          <div>
            <dt>After Runtime</dt>
            <dd>{review.performance.afterRuntime}</dd>
          </div>
          <div>
            <dt>Before Scan</dt>
            <dd>{review.performance.beforeScan}</dd>
          </div>
          <div>
            <dt>After Scan</dt>
            <dd>{review.performance.afterScan}</dd>
          </div>
          <div>
            <dt>Scan / Compute</dt>
            <dd>{review.performance.cost}</dd>
          </div>
          <div>
            <dt>复测</dt>
            <dd>{review.performance.measured ? '已完成' : '待完成'}</dd>
          </div>
        </dl>
      </div>
      <div className="capstone-decision-panel">
        <span className="capstone-eyebrow">有限选择 · 优化方向</span>
        <div className="capstone-choice-list">
          {PERFORMANCE_OPTIONS.map((option) => (
            <ChoiceButton
              key={option.value}
              {...option}
              selected={state.performanceChoice === option.value}
              onSelect={(choice) => dispatch({ type: 'choose-performance', choice })}
            />
          ))}
        </div>
      </div>
      <div className="capstone-acceptance-grid">
        {visualization.performance.tradeoffs.tradeoffs.acceptanceChecks.map((check) => (
          <article key={check.label}>
            <span>{check.label}</span>
            <strong>{check.value}</strong>
            <p>{check.detail}</p>
          </article>
        ))}
      </div>
      <ActionBar note="复测必须同时看正确性、SLA / Freshness、成本和维护复杂度。">
        <button
          className="capstone-primary-button"
          type="button"
          disabled={!state.performanceChoice || state.performanceMeasured}
          onClick={() => dispatch({ type: 'measure-performance' })}
        >
          {state.performanceMeasured ? '已完成 Before / After 复测' : '应用一次修改并复测'}
        </button>
      </ActionBar>
      <DecisionNote
        decision={decision}
        tone={
          state.performanceMeasured && state.performanceChoice === 'partition-pruning'
            ? 'success'
            : 'warning'
        }
      />
    </section>
  )
}

function ReviewList({ items, empty = '—' }: { items: readonly string[]; empty?: string }) {
  return items.length ? (
    <ul className="capstone-review-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  ) : (
    <p className="capstone-muted">{empty}</p>
  )
}

function ReviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="capstone-review-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function LaunchReviewStage({ visualization, state, review, dispatch }: StageProps) {
  return (
    <section
      className="capstone-stage capstone-launch-review"
      aria-labelledby="capstone-stage-launch-review"
    >
      <StageTitle checkpoint={getCheckpoint(visualization, 'launch-review')} />
      <div
        className={`capstone-launch-status capstone-launch-status--${review.status.toLowerCase().replace(/ /g, '-')}`}
      >
        <span className="capstone-eyebrow">工程式 Launch Review</span>
        <strong>{LAUNCH_STATUS_LABELS[review.status]}</strong>
        <p>
          {review.status === 'READY'
            ? '关键证据已经闭合，可以进入教学版发布判断。'
            : review.status === 'READY WITH RISK'
              ? '核心质量闸门已通过，但仍有已记录、消费者可理解的工程风险。'
              : '至少有一个关键恢复条件未满足，不能用风险说明替代发布阻断。'}
        </p>
      </div>
      <div className="capstone-review-summary-grid">
        <div>
          <span>Mission</span>
          <strong>{review.mission.id}</strong>
        </div>
        <div>
          <span>business_date</span>
          <strong>{review.mission.businessDate}</strong>
        </div>
        <div>
          <span>最终 Grain</span>
          <strong>{review.finalGrain}</strong>
        </div>
        <div>
          <span>产品</span>
          <strong>{review.dataService.assetName}</strong>
        </div>
      </div>
      <ReviewSection title="指标定义与来源系统">
        <MetricTable review={review} />
        <ReviewList items={review.sources} />
      </ReviewSection>
      <ReviewSection title="DAG / SLA / 运行">
        <dl className="capstone-review-facts">
          <div>
            <dt>task count</dt>
            <dd>{review.dag.taskCount}</dd>
          </div>
          <div>
            <dt>processing</dt>
            <dd>{review.dag.scheduledAt}</dd>
          </div>
          <div>
            <dt>late input</dt>
            <dd>{review.dag.lateInputArrival}</dd>
          </div>
          <div>
            <dt>SLA</dt>
            <dd>{review.dag.deliverySlaAt}</dd>
          </div>
          <div>
            <dt>final run</dt>
            <dd>{review.dag.finalRunStatus}</dd>
          </div>
          <div>
            <dt>output</dt>
            <dd>{review.dag.outputAvailableAt ?? '未产出'}</dd>
          </div>
        </dl>
        <ReviewList items={review.dag.dependencies} />
      </ReviewSection>
      <ReviewSection title="Quality / Release">
        <div className="capstone-review-callout">
          <strong>事故记录：{review.quality.failureEventId}</strong>
          <p>
            失败事实：{review.quality.expectedValue} / {review.quality.observedValue} · 初始状态{' '}
            {review.quality.failureStatus}
          </p>
          <p>
            当前有效状态：{review.quality.effectiveStatus} ·{' '}
            {review.quality.effectiveBlocked ? 'BLOCKED' : '可以继续'}
          </p>
          <small>{review.quality.evidenceBoundary}</small>
        </div>
      </ReviewSection>
      <ReviewSection title="Lineage / Blast Radius">
        <div className="capstone-review-columns">
          <div>
            <span>Upstream</span>
            <ReviewList items={review.lineage.upstream} />
          </div>
          <div>
            <span>Direct downstream</span>
            <ReviewList items={review.lineage.directDownstream} />
          </div>
          <div>
            <span>Transitive / Blast Radius</span>
            <ReviewList items={review.lineage.blastRadius} />
          </div>
        </div>
        <p className="capstone-boundary-note">{review.lineage.evidenceBoundary}</p>
        <ReviewList items={review.lineage.rootCauseCandidates} />
      </ReviewSection>
      <ReviewSection title="Governance">
        <dl className="capstone-review-facts">
          <div>
            <dt>asset</dt>
            <dd>{review.governance.technicalName}</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{review.governance.owner}</dd>
          </div>
          <div>
            <dt>lifecycle</dt>
            <dd>{review.governance.lifecycle}</dd>
          </div>
          <div>
            <dt>sensitivity</dt>
            <dd>{review.governance.sensitivity}</dd>
          </div>
          <div>
            <dt>quality</dt>
            <dd>{review.governance.qualityStatus}</dd>
          </div>
        </dl>
        <p>{review.governance.definition}</p>
        <p className="capstone-small-note">
          Quality evidence projection：{review.governance.qualityEvidence.source} ·{' '}
          {review.governance.qualityEvidence.ruleId} ·{' '}
          {review.governance.qualityEvidence.releaseDecision.status}
        </p>
        <p className="capstone-small-note">影响分析：{review.governance.impactSummary}</p>
      </ReviewSection>
      <ReviewSection title="Data Service / Consumer">
        <dl className="capstone-review-facts">
          <div>
            <dt>primary</dt>
            <dd>{review.dataService.consumerLabel}</dd>
          </div>
          <div>
            <dt>asset</dt>
            <dd>{review.dataService.assetName}</dd>
          </div>
          <div>
            <dt>file signal</dt>
            <dd>{review.dataService.fileCompletionSignal}</dd>
          </div>
          <div>
            <dt>can consume</dt>
            <dd>{review.dataService.canConsume ? 'yes' : 'no'}</dd>
          </div>
        </dl>
        <p>{review.dataService.apiBoundary}</p>
      </ReviewSection>
      <ReviewSection title="Performance Before / After">
        <dl className="capstone-review-facts">
          <div>
            <dt>Runtime</dt>
            <dd>
              {review.performance.beforeRuntime} → {review.performance.afterRuntime}
            </dd>
          </div>
          <div>
            <dt>Scan</dt>
            <dd>
              {review.performance.beforeScan} → {review.performance.afterScan}
            </dd>
          </div>
          <div>
            <dt>瓶颈</dt>
            <dd>{review.performance.bottleneck}</dd>
          </div>
          <div>
            <dt>Cost</dt>
            <dd>{review.performance.cost}</dd>
          </div>
          <div>
            <dt>Freshness</dt>
            <dd>{review.performance.freshness}</dd>
          </div>
          <div>
            <dt>correctness</dt>
            <dd>{review.performance.correctness}</dd>
          </div>
          <div>
            <dt>maintainability</dt>
            <dd>{review.performance.maintainability}</dd>
          </div>
        </dl>
      </ReviewSection>
      <ReviewSection title="Decision Records">
        <div className="capstone-decision-log">
          {review.decisionRecords.length ? (
            review.decisionRecords.map((record) => (
              <article key={record.id}>
                <header>
                  <strong>{record.checkpointId}</strong>
                  <span>{record.projectStatus}</span>
                </header>
                <p>{record.decision}</p>
                <small>输入：{record.input}</small>
                <small>后果：{record.consequence}</small>
              </article>
            ))
          ) : (
            <p className="capstone-muted">还没有 Decision Record。</p>
          )}
        </div>
      </ReviewSection>
      <div className="capstone-review-bottom-grid">
        <ReviewSection title="Known assumptions">
          <ReviewList items={review.knownAssumptions} />
        </ReviewSection>
        <ReviewSection title="Remaining risks">
          <ReviewList items={review.remainingRisks} />
        </ReviewSection>
        <ReviewSection title="Non-goals">
          <ReviewList items={review.nonGoals} />
        </ReviewSection>
        <ReviewSection title="后续演进方向">
          <ReviewList items={review.nextEvolution} />
        </ReviewSection>
      </div>
      <ActionBar note="评审结果不是单一分数；如果是 BLOCKED，请回到对应 checkpoint 修复并保留新的证据。">
        <button
          className="capstone-primary-button"
          type="button"
          onClick={() => dispatch({ type: 'complete-launch-review' })}
        >
          {state.launchReviewed ? '重新记录 Launch Review' : '记录 Launch Review'}
        </button>
      </ActionBar>
    </section>
  )
}

interface StageProps {
  visualization: CapstoneVisualization
  state: CapstoneProjectState
  review: CapstoneLaunchReview
  dispatch: (action: CapstoneAction) => void
}

function getCheckpoint(visualization: CapstoneVisualization, stageId: CapstoneStageId) {
  const checkpoint = visualization.checkpoints.find((candidate) => candidate.id === stageId)
  if (!checkpoint) throw new Error(`Capstone checkpoint 不存在: ${stageId}`)
  return checkpoint
}

function renderStage(stageId: CapstoneStageId, props: StageProps) {
  switch (stageId) {
    case 'mission-brief':
      return <MissionBriefStage {...props} />
    case 'design':
      return <DesignStage {...props} />
    case 'build':
      return <BuildStage {...props} />
    case 'operate':
      return <OperateStage {...props} />
    case 'incident':
      return <IncidentStage {...props} />
    case 'investigate':
      return <InvestigationStage {...props} />
    case 'deliver':
      return <DeliverStage {...props} />
    case 'scale':
      return <ScaleStage {...props} />
    case 'launch-review':
      return <LaunchReviewStage {...props} />
  }
}

export function CapstoneWorkbench({ visualization }: { visualization: CapstoneVisualization }) {
  const fallbackState = useMemo(
    () => createInitialCapstoneState(visualization.mission.id, visualization.mission.businessDate),
    [visualization.mission.businessDate, visualization.mission.id],
  )
  const [state, setState] = useState<CapstoneProjectState>(() =>
    getInitialCapstoneState(fallbackState),
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(CAPSTONE_PROGRESS_STORAGE_KEY, JSON.stringify(state))
    } catch {
      // 学习进度无法写入时，当前项目仍然可以继续完成。
    }
  }, [state])

  const review = useMemo(
    () => getCapstoneLaunchReview(visualization, state),
    [state, visualization],
  )
  const progress = getMissionProgress(state)
  const dispatch = (action: CapstoneAction) =>
    setState((current) => transitionCapstoneProject(current, action))
  const stageProps: StageProps = { visualization, state, review, dispatch }

  return (
    <div
      className="capstone-workbench"
      data-capstone-status={review.status}
      data-capstone-restored="true"
    >
      <header className="capstone-workbench__header">
        <div>
          <span className="capstone-eyebrow">Capstone Project / Mission Workbench</span>
          <h3>{visualization.mission.title}</h3>
          <p>
            一条连续项目：输入事实、工程决策、运行证据、事故恢复和上线评审都保留在同一个状态里。
          </p>
        </div>
        <div className="capstone-header-meta">
          <span
            className={`capstone-launch-status-chip capstone-launch-status-chip--${review.status.toLowerCase().replace(/ /g, '-')}`}
          >
            {review.status}
          </span>
          <span>
            <b>
              {progress.completedCount}/{progress.totalCount}
            </b>{' '}
            checkpoints
          </span>
          <button
            className="capstone-reset-button"
            type="button"
            onClick={() => dispatch({ type: 'reset' })}
          >
            重置项目
          </button>
        </div>
      </header>
      <div className="capstone-project-facts">
        <span>
          business_date <strong>{visualization.mission.businessDate}</strong>
        </span>
        <span>
          deliver by <strong>08:00</strong>
        </span>
        <span>
          product <strong>branch_business_daily</strong>
        </span>
        <span>
          Grain <strong>business_date × branch_id</strong>
        </span>
      </div>
      <nav className="capstone-checkpoint-nav" aria-label="Capstone 项目 checkpoint">
        <ol>
          {visualization.checkpoints.map((checkpoint) => {
            const status = state.checkpointStates[checkpoint.id]
            const isActive = state.activeCheckpointId === checkpoint.id
            return (
              <li
                key={checkpoint.id}
                className={`capstone-checkpoint capstone-checkpoint--${status}${isActive ? ' is-active' : ''}`}
              >
                <button
                  type="button"
                  disabled={status === 'locked'}
                  aria-current={isActive ? 'step' : undefined}
                  onClick={() =>
                    dispatch({ type: 'select-checkpoint', checkpointId: checkpoint.id })
                  }
                >
                  <span className="capstone-checkpoint__number">
                    {String(CAPSTONE_STAGE_IDS.indexOf(checkpoint.id) + 1).padStart(2, '0')}
                  </span>
                  <strong>{checkpoint.label}</strong>
                  <small>{STAGE_STATUS_LABELS[status]}</small>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>
      <section className="capstone-incident-strip" aria-label="三个固定事故">
        <article>
          <span>事故 1</span>
          <strong>LoanBalanceSnapshot 迟到</strong>
          <small>06:30 → 07:35 → 08:00</small>
        </article>
        <article>
          <span>事故 2</span>
          <strong>DWD / DWS 对账失败</strong>
          <small>120 亿 vs 118 亿 · Quality FAIL</small>
        </article>
        <article>
          <span>事故 3</span>
          <strong>规模上涨的 SLA 风险</strong>
          <small>Scan / Runtime · Before → After</small>
        </article>
      </section>
      <main className="capstone-workbench__main" aria-live="polite">
        {renderStage(state.activeCheckpointId, stageProps)}
      </main>
      <footer className="capstone-workbench__footer">
        <span>项目状态：{state.missionStatus}</span>
        <span>{LAUNCH_STATUS_LABELS[review.status]}</span>
        <span>评审状态选项：READY / BLOCKED / READY WITH RISK</span>
        <span>进度保存在本地浏览器，可重置、回到已完成 checkpoint 或继续上次 Mission。</span>
      </footer>
    </div>
  )
}
