import { useMemo, useReducer } from 'react'
import {
  DELIVERY_STATE_LABELS,
  accountBalanceDeliveryFixture,
  findDataFile,
  findSignal,
  getBatchKeyComparison,
  getBatchRecords,
  getBatchSuccessRecords,
  getConsumerObservations,
  getDeliveryContractFields,
  getDeliveryEliminations,
  getDeliveryEvidenceRows,
  getDeliveryStateLadder,
} from '../../features/delivery-investigation/model'
import { createDeliveryInvestigationKernel } from '../../features/delivery-investigation/steps'
import type {
  DeliveryInvestigationHighlight,
  DeliveryInvestigationState,
  DeliveryLocalization,
} from '../../features/delivery-investigation/types'
import {
  applyVisualizationPlayerAction,
  createVisualizationPlayer,
  getCurrentVisualizationStep,
  getVisualizationPlayerProgress,
  isVisualizationPlayerAtEnd,
  isVisualizationPlayerAtStart,
} from '../../utils/visualization-steps'

const fixture = accountBalanceDeliveryFixture

const STEP_KIND_LABELS: Record<DeliveryInvestigationHighlight['kind'], string> = {
  symptom: '现象',
  'producer-evidence': '证据',
  observation: '证据',
  localization: '定位',
  repair: '处理',
  verification: '验证',
  prevention: '防复发',
}

type NodeStatus = 'unknown' | 'running' | 'done' | 'waiting' | 'blocked'

function nodeFocus(
  highlight: DeliveryInvestigationHighlight,
  node: DeliveryInvestigationHighlight['focus'],
): 'primary' | 'context' | undefined {
  if (highlight.focus === 'chain') {
    return undefined
  }

  return highlight.focus === node ? 'primary' : 'context'
}

function DeliveryChain({
  state,
  highlight,
}: {
  state: DeliveryInvestigationState
  highlight: DeliveryInvestigationHighlight
}) {
  const { reveal } = highlight
  const dataFile = findDataFile(state.exchange, fixture.batchId)
  const signal = findSignal(state.exchange, fixture.batchId)
  const consumed = getBatchSuccessRecords(state.consumer, fixture.batchId)
  const attempts = getBatchRecords(state.consumer, fixture.batchId)

  const producerStatus: NodeStatus = !reveal.producerArtifact
    ? 'running'
    : state.producer.renameCompleted && !state.producer.tempFilePresent
      ? 'done'
      : 'blocked'
  const exchangeStatus: NodeStatus = !reveal.receiverObservation
    ? 'unknown'
    : dataFile?.readable
      ? 'done'
      : 'blocked'
  const consumerStatus: NodeStatus = !reveal.consumerEvidence
    ? 'waiting'
    : consumed.length > 0
      ? 'done'
      : 'waiting'
  const consumerBadge = !reveal.consumerEvidence
    ? '等待中 · 无数据'
    : consumed.length > 0
      ? '已消费'
      : state.consumer.serviceStatus === 'running'
        ? '运行中'
        : '未运行'

  return (
    <div className="delivery-investigation__chain" data-delivery-chain>
      <article
        className="delivery-investigation__node"
        data-node="producer"
        data-status={producerStatus}
        data-focus={nodeFocus(highlight, 'producer')}
        aria-label="Producer 节点"
      >
        <header className="delivery-investigation__node-header">
          <span className="delivery-investigation__node-role">Producer</span>
          <span className="delivery-investigation__node-badge" data-tone="success">
            Job SUCCESS
          </span>
        </header>
        <p className="delivery-investigation__node-task">{fixture.producerTask}</p>
        <dl className="delivery-investigation__node-facts">
          {reveal.businessDate && (
            <div>
              <dt>business_date</dt>
              <dd>{fixture.businessDate}</dd>
            </div>
          )}
          {reveal.producerArtifact && (
            <>
              <div>
                <dt>rename</dt>
                <dd>
                  {state.producer.tempFileName} → {state.producer.dataFileName}
                </dd>
              </div>
              <div>
                <dt>row count</dt>
                <dd>{state.producer.rowCount} 行</dd>
              </div>
            </>
          )}
          {!reveal.producerArtifact && (
            <p className="delivery-investigation__node-hint">运行完成，输出细节尚未展开。</p>
          )}
        </dl>
      </article>

      <div
        className="delivery-investigation__connector"
        data-connector="producer-exchange"
        data-state={reveal.producerArtifact ? 'done' : 'unknown'}
        aria-hidden="true"
      >
        <span>数据</span>
      </div>

      <article
        className="delivery-investigation__node"
        data-node="exchange"
        data-status={exchangeStatus}
        data-focus={nodeFocus(highlight, 'exchange')}
        aria-label="Exchange 节点"
      >
        <header className="delivery-investigation__node-header">
          <span className="delivery-investigation__node-role">Exchange</span>
          <span
            className="delivery-investigation__node-badge"
            data-tone={exchangeStatus === 'done' ? 'success' : 'muted'}
          >
            {!reveal.receiverObservation
              ? '未检查'
              : dataFile?.readable
                ? '文件已到达'
                : '文件不可用'}
          </span>
        </header>
        <p className="delivery-investigation__node-task">交付交换区</p>
        <dl className="delivery-investigation__node-facts">
          {reveal.receiverObservation && (
            <div>
              <dt>data_file</dt>
              <dd>
                {dataFile === undefined
                  ? '本批次文件未到达'
                  : `${dataFile.name} · ${dataFile.readable ? '可读' : '不可读'}`}
              </dd>
            </div>
          )}
          {reveal.completionObservation && (
            <div>
              <dt>completion_signal</dt>
              <dd data-state={signal === undefined ? 'danger' : 'success'}>
                {signal === undefined ? '缺失 / 不可匹配' : `${signal.name} · 已恢复`}
              </dd>
            </div>
          )}
          {!reveal.receiverObservation && (
            <p className="delivery-investigation__node-hint">交付通道状态尚未检查。</p>
          )}
        </dl>
      </article>

      <div
        className="delivery-investigation__connector"
        data-connector="exchange-consumer"
        data-state={
          consumed.length > 0
            ? 'done'
            : signal === undefined && reveal.completionObservation
              ? 'blocked'
              : 'unknown'
        }
        aria-hidden="true"
      >
        <span>消费</span>
      </div>

      <article
        className="delivery-investigation__node"
        data-node="consumer"
        data-status={consumerStatus}
        data-focus={nodeFocus(highlight, 'consumer')}
        aria-label="Consumer 节点"
      >
        <header className="delivery-investigation__node-header">
          <span className="delivery-investigation__node-role">Consumer</span>
          <span
            className="delivery-investigation__node-badge"
            data-tone={consumed.length > 0 ? 'success' : 'warning'}
          >
            {consumerBadge}
          </span>
        </header>
        <p className="delivery-investigation__node-task">{fixture.consumerTask}</p>
        <dl className="delivery-investigation__node-facts">
          {reveal.consumerEvidence ? (
            <>
              <div>
                <dt>service</dt>
                <dd>{state.consumer.serviceStatus}</dd>
              </div>
              <div>
                <dt>上一批次</dt>
                <dd>{fixture.previousBatchId} 已消费</dd>
              </div>
              <div>
                <dt>本批次尝试</dt>
                <dd>{attempts.length === 0 ? '无' : `${attempts.length} 次`}</dd>
              </div>
            </>
          ) : (
            <p className="delivery-investigation__node-hint">等待中 · 本业务日无数据。</p>
          )}
        </dl>
      </article>
    </div>
  )
}

function EvidencePanel({
  state,
  highlight,
}: {
  state: DeliveryInvestigationState
  highlight: DeliveryInvestigationHighlight
}) {
  const rows = getDeliveryEvidenceRows(state, highlight.reveal)

  return (
    <dl className="delivery-investigation__evidence" aria-label="交付链 Evidence Panel">
      {rows.map((row) => (
        <div className="delivery-investigation__evidence-row" key={row.field}>
          <dt>{row.field}</dt>
          <dd data-state={row.state}>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ProducerEvidencePanel({ state }: { state: DeliveryInvestigationState }) {
  return (
    <section
      className="delivery-investigation__panel"
      data-panel="producer-evidence"
      aria-label="Producer 产出证据"
    >
      <header className="delivery-investigation__panel-header">
        <span>Producer 输出目录 · rename 过程</span>
        <strong>final</strong>
      </header>
      <ol className="delivery-investigation__rename">
        <li data-state="done">
          <code>{state.producer.tempFileName}</code>
          <small>临时文件，仍在写入时不能消费</small>
        </li>
        <li data-state="done">
          <code>{state.producer.dataFileName}</code>
          <small>
            final · business_date = {state.producer.businessDate} · batch_id ={' '}
            {state.producer.batchId} · {state.producer.rowCount} 行
          </small>
        </li>
      </ol>
      <p>这只证明生产侧完成；交付链后面的状态还需要继续收集证据。</p>
    </section>
  )
}

function ObservationPanel({ state }: { state: DeliveryInvestigationState }) {
  const eliminations = getDeliveryEliminations(fixture, state.producer, state.exchange)
  const observations = getConsumerObservations(fixture, state.consumer, state.exchange)

  return (
    <>
      <section
        className="delivery-investigation__panel"
        data-panel="elimination"
        aria-label="交付状态排除"
      >
        <header className="delivery-investigation__panel-header">
          <span>排除已被证据否定的状态</span>
          <strong>只做排除，不定位</strong>
        </header>
        <ul className="delivery-investigation__eliminations">
          {eliminations.map((row) => (
            <li data-state-id={row.id} data-eliminated={row.eliminated} key={row.id}>
              <span className="delivery-investigation__elimination-mark" aria-hidden="true">
                {row.eliminated ? '✓' : '?'}
              </span>
              <div>
                <strong>{row.label}</strong>
                <small>{row.reason}</small>
              </div>
            </li>
          ))}
        </ul>
        <p>
          接收端之后的两个状态取决于触发条件与执行记录；下一步对照 business_date + batch_id
          与消费记录后再定位。
        </p>
      </section>

      <section
        className="delivery-investigation__panel"
        data-panel="consumer-observations"
        aria-label="Consumer 观察证据"
      >
        <header className="delivery-investigation__panel-header">
          <span>Consumer 观察证据</span>
          <strong>当前证据不支持 Consumer 执行失败</strong>
        </header>
        <ul className="delivery-investigation__observations">
          {observations.map((observation) => (
            <li key={observation.label}>
              <span>{observation.label}</span>
              <strong>{observation.value}</strong>
              <small>{observation.detail}</small>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function DeliveryLocalizationPanel({
  state,
  localization,
  showBatchKeys,
}: {
  state: DeliveryInvestigationState
  localization: DeliveryLocalization
  showBatchKeys: boolean
}) {
  const ladder = getDeliveryStateLadder(localization)
  const batchKeys = getBatchKeyComparison(fixture, state.exchange)

  return (
    <section
      className="delivery-investigation__panel"
      data-panel="localization"
      data-localized-state={localization.state}
      aria-label="完成信号边界定位"
    >
      <header className="delivery-investigation__panel-header">
        <span>批次键对照</span>
        <strong>{localization.stateLabel}</strong>
      </header>
      {showBatchKeys && (
        <div className="delivery-investigation__key-scroll">
          <table className="delivery-investigation__keys">
            <caption>期望值由 business_date + batch_id 推导，实际值来自接收端观察。</caption>
            <thead>
              <tr>
                <th scope="col">批次键</th>
                <th scope="col">期望</th>
                <th scope="col">实际</th>
                <th scope="col">一致</th>
              </tr>
            </thead>
            <tbody>
              {batchKeys.map((row) => (
                <tr data-key-id={row.id} data-matches={row.matches} key={row.id}>
                  <th scope="row">{row.label}</th>
                  <td>
                    <code>{row.expected}</code>
                  </td>
                  <td>
                    <code>{row.observed}</code>
                  </td>
                  <td>{row.matches ? '✓' : '✘'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ol className="delivery-investigation__ladder" data-delivery-state-ladder>
        {ladder.map((item) => (
          <li data-state-id={item.id} data-status={item.status} key={item.id}>
            <span className="delivery-investigation__ladder-mark" aria-hidden="true">
              {item.status === 'current' ? '●' : item.status === 'excluded' ? '✕' : '○'}
            </span>
            <div>
              <strong>{item.label}</strong>
              <small>{item.evidenceForm}</small>
            </div>
            <span className="delivery-investigation__ladder-status">
              {item.status === 'current'
                ? '当前定位'
                : item.status === 'excluded'
                  ? '已排除'
                  : '待判断'}
            </span>
          </li>
        ))}
      </ol>

      <div className="delivery-investigation__boundary" data-panel="failure-boundary">
        <span>failure boundary</span>
        <strong>{localization.failureBoundary}</strong>
        {localization.excludedState !== null && (
          <p>
            已排除「{DELIVERY_STATE_LABELS[localization.excludedState]}」：
            {localization.excludedReason}
          </p>
        )}
      </div>
    </section>
  )
}

function RepairPanel({ state }: { state: DeliveryInvestigationState }) {
  const validation = state.artifactValidation
  const repair = state.repair

  if (validation === null || repair === null) {
    return null
  }

  return (
    <section
      className="delivery-investigation__panel"
      data-panel="repair"
      data-repair-status={repair.restored ? 'restored' : 'blocked'}
      aria-label="修复：先验证 artifact 再恢复完成信号"
    >
      <header className="delivery-investigation__panel-header">
        <span>处理顺序：artifact validation → signal restore</span>
        <strong>{repair.restored ? '已恢复完成信号' : '修复被阻断'}</strong>
      </header>

      <ol className="delivery-investigation__repair-steps">
        <li data-step-state={validation.passed ? 'done' : 'failed'}>
          <strong>① 验证 data artifact</strong>
          <span>final 命名、接收端可读、batch identity 匹配、行数有效。</span>
        </li>
        <li data-step-state={validation.passed ? 'done' : 'pending'}>
          <strong>② 由 batch identity 推导信号名</strong>
          <span>
            期望 <code>{repair.expectedSignalName}</code>，不新建「新批次」。
          </span>
        </li>
        <li data-step-state={repair.restored ? 'done' : 'pending'}>
          <strong>③ 幂等恢复 completion signal</strong>
          <span>{repair.alreadyPresent ? '同批次信号已存在，保持原样。' : '按批次恢复一次。'}</span>
        </li>
      </ol>

      <ul className="delivery-investigation__checks" aria-label="artifact validation">
        {validation.checks.map((check) => (
          <li data-check-id={check.id} data-passed={check.passed} key={check.id}>
            <span className="delivery-investigation__check-mark" aria-hidden="true">
              {check.passed ? '✓' : '!'}
            </span>
            <div>
              <strong>{check.label}</strong>
              <small>{check.detail}</small>
            </div>
          </li>
        ))}
      </ul>

      <p className="delivery-investigation__blast-radius">{repair.blastRadiusNote}</p>
      <p className="delivery-investigation__pitfall">
        补 completion signal 是声明完成，不是制造完成：artifact 不完整时，正确动作是先修复 /
        重新交付数据。
      </p>
      {repair.blockedReason !== null && (
        <p className="delivery-investigation__blocked">{repair.blockedReason}</p>
      )}
    </section>
  )
}

function VerificationPanel({ state }: { state: DeliveryInvestigationState }) {
  const passedCount = state.verification.filter((check) => check.passed).length
  const allPassed = passedCount === state.verification.length && state.verification.length > 0

  return (
    <section
      className="delivery-investigation__panel"
      data-panel="verification"
      data-verification-passed={allPassed}
      aria-label="5 项端到端验证"
    >
      <header className="delivery-investigation__panel-header">
        <span>end-to-end 验证</span>
        <strong>
          {passedCount} / {state.verification.length} 通过
        </strong>
      </header>
      <ul className="delivery-investigation__checks">
        {state.verification.map((check) => (
          <li data-check-id={check.id} data-passed={check.passed} key={check.id}>
            <span className="delivery-investigation__check-mark" aria-hidden="true">
              {check.passed ? '✓' : '!'}
            </span>
            <div>
              <strong>{check.label}</strong>
              <small>{check.detail}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ContractPanel() {
  const fields = getDeliveryContractFields()

  return (
    <section
      className="delivery-investigation__panel"
      data-panel="contract"
      aria-label="最小 Delivery Contract"
    >
      <header className="delivery-investigation__panel-header">
        <span>最小 Delivery Contract</span>
        <strong>5 个字段</strong>
      </header>
      <div className="delivery-investigation__key-scroll">
        <table className="delivery-investigation__contract">
          <caption>只固化为本案例证据所要求的字段，不建设生产级传输协议。</caption>
          <thead>
            <tr>
              <th scope="col">字段</th>
              <th scope="col">含义</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.id} data-contract-field={field.id}>
                <th scope="row">
                  <code>{field.name}</code>
                </th>
                <td>{field.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        完成信号是抽象交付契约概念，本案例由 .flag 文件承载；ACK / MQ / callback 不在本案例范围。
      </p>
    </section>
  )
}

export function DeliveryInvestigationLab() {
  const kernel = useMemo(() => createDeliveryInvestigationKernel(), [])
  const [player, dispatch] = useReducer(
    applyVisualizationPlayerAction,
    kernel.size,
    createVisualizationPlayer,
  )
  const step = getCurrentVisualizationStep(player, kernel)
  const progress = getVisualizationPlayerProgress(player)
  const atStart = isVisualizationPlayerAtStart(player)
  const atEnd = isVisualizationPlayerAtEnd(player)

  if (!step.highlight) {
    throw new Error(`生产案例 13-2 步骤 ${step.id} 缺少 highlight 契约`)
  }

  const highlight = step.highlight
  const state = step.state
  const localization = state.localization

  return (
    <section
      className="delivery-investigation"
      data-diagram-type="flow"
      data-step-id={step.id}
      data-step-kind={highlight.kind}
      data-located-state={localization?.state ?? ''}
      aria-label="交付链分步调查"
    >
      <div className="visualization-toolbar delivery-investigation__toolbar">
        <div className="delivery-investigation__toolbar-main">
          <span className="visualization-toolbar__label">
            Step {progress.current} / {progress.total} · {STEP_KIND_LABELS[highlight.kind]}
          </span>
          <p aria-live="polite" aria-atomic="true">
            <strong>{step.title}</strong>：{step.description}
          </p>
        </div>
        <div className="visualization-toolbar__actions" role="group" aria-label="分步控制">
          <button
            className="button button--quiet button--small"
            type="button"
            onClick={() => dispatch('prev')}
            disabled={atStart}
          >
            上一步
          </button>
          <button
            className="button button--quiet button--small"
            type="button"
            onClick={() => dispatch('reset')}
          >
            重置
          </button>
          <button
            className="button button--primary button--small"
            type="button"
            onClick={() => dispatch('next')}
            disabled={atEnd}
          >
            {atEnd ? '已完成' : '下一步'}
          </button>
        </div>
      </div>

      <div
        className="delivery-investigation__progress"
        role="progressbar"
        aria-label="分步进度"
        aria-valuemin={1}
        aria-valuemax={progress.total}
        aria-valuenow={progress.current}
        aria-valuetext={`第 ${progress.current} 步，共 ${progress.total} 步`}
      >
        <span style={{ width: `${progress.ratio * 100}%` }} />
      </div>

      <DeliveryChain state={state} highlight={highlight} />
      <EvidencePanel state={state} highlight={highlight} />

      {highlight.kind === 'producer-evidence' && <ProducerEvidencePanel state={state} />}
      {highlight.kind === 'observation' && <ObservationPanel state={state} />}
      {highlight.reveal.localization && localization !== null && (
        <DeliveryLocalizationPanel
          state={state}
          localization={localization}
          showBatchKeys={highlight.kind === 'localization'}
        />
      )}
      {highlight.reveal.repair && <RepairPanel state={state} />}
      {highlight.reveal.verification && <VerificationPanel state={state} />}
      {highlight.reveal.contract && <ContractPanel />}
      {highlight.kind === 'prevention' && (
        <p className="delivery-investigation__review">
          完成信号机制（TXT 与 FLAG 如何协作）见 10-3，本案例只关注机制失效后的调查。
        </p>
      )}
    </section>
  )
}
