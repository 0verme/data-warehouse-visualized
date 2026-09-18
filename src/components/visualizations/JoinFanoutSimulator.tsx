import { useMemo, useReducer } from 'react'
import type {
  JoinFanoutHighlight,
  JoinFanoutLeftRow,
  JoinFanoutResultRow,
  JoinFanoutRightRow,
  JoinFanoutState,
  JoinFanoutStepKind,
} from '../../features/join-fanout/types'
import { createJoinFanoutKernel } from '../../features/join-fanout/steps'
import {
  applyVisualizationPlayerAction,
  createVisualizationPlayer,
  getCurrentVisualizationStep,
  getVisualizationPlayerProgress,
  isVisualizationPlayerAtEnd,
  isVisualizationPlayerAtStart,
} from '../../utils/visualization-steps'

const STEP_KIND_LABELS: Record<JoinFanoutStepKind, string> = {
  observe: '观察',
  match: '逐行匹配',
  expand: '结果膨胀',
  diagnose: '根因',
  fix: '修复',
}

function isRowHighlighted(ids: readonly string[], id: string): boolean {
  return ids.includes(id)
}

function getLeftRowStatus(
  kind: JoinFanoutStepKind,
  isCurrent: boolean,
  isMatched: boolean,
): string {
  if (!isCurrent) {
    return isMatched ? '已匹配' : '等待匹配'
  }

  switch (kind) {
    case 'observe':
      return '当前查看'
    case 'match':
      return '当前处理'
    case 'diagnose':
      return '重复 key'
    default:
      return '已匹配'
  }
}

function getRightRowStatus(
  kind: JoinFanoutStepKind,
  isCurrent: boolean,
  isMatched: boolean,
): string {
  if (!isCurrent) {
    return isMatched ? '已匹配' : '等待匹配'
  }

  switch (kind) {
    case 'observe':
      return '当前查看'
    case 'match':
      return '当前匹配'
    case 'diagnose':
      return '重复 key'
    case 'fix':
      return '已聚合'
    default:
      return '已匹配'
  }
}

function LeftTable({
  state,
  highlight,
}: {
  state: JoinFanoutState
  highlight: JoinFanoutHighlight
}) {
  const matchedLeftRowIds = new Set(state.resultRows.map((row) => row.leftRowId))

  return (
    <table className="join-fanout__table">
      <caption>
        <span>左表</span>
        <strong>{state.leftRows.length} 行</strong>
      </caption>
      <thead>
        <tr>
          <th scope="col">
            <code>{highlight.joinKey}</code>
            <small>JOIN key</small>
          </th>
          <th scope="col">
            <code>account_id</code>
          </th>
          <th scope="col">
            <code>balance</code>
          </th>
          <th scope="col">状态</th>
        </tr>
      </thead>
      <tbody>
        {state.leftRows.map((row: JoinFanoutLeftRow) => {
          const isCurrent = isRowHighlighted(highlight.leftRowIds, row.id)
          const isMatched = matchedLeftRowIds.has(row.id)
          const status = getLeftRowStatus(highlight.kind, isCurrent, isMatched)
          const rowState =
            isCurrent && highlight.kind === 'match' ? 'active' : isMatched ? 'matched' : 'waiting'

          return (
            <tr
              className={isCurrent ? 'is-current' : isMatched ? 'is-matched' : undefined}
              data-state={rowState}
              data-focus={isCurrent ? 'primary' : undefined}
              key={row.id}
            >
              <td>
                <code className="join-fanout__key">{row.customerId}</code>
              </td>
              <td>{row.accountId}</td>
              <td>{row.balance.toLocaleString('zh-CN')}</td>
              <td>
                <span className="join-fanout__row-status">{status}</span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function RightTable({
  state,
  highlight,
}: {
  state: JoinFanoutState
  highlight: JoinFanoutHighlight
}) {
  const matchedRightRowIds = new Set(state.resultRows.map((row) => row.rightRowId))
  const isAligned = highlight.kind === 'fix'

  return (
    <table className="join-fanout__table">
      <caption>
        <span>右表{isAligned ? '（已聚合）' : ''}</span>
        <strong>{state.rightRows.length} 行</strong>
      </caption>
      <thead>
        <tr>
          <th scope="col">
            <code>{highlight.joinKey}</code>
            <small>JOIN key</small>
          </th>
          <th scope="col">
            <code>tag</code>
          </th>
          <th scope="col">状态</th>
        </tr>
      </thead>
      <tbody>
        {state.rightRows.map((row: JoinFanoutRightRow) => {
          const isCurrent = isRowHighlighted(highlight.rightRowIds, row.id)
          const isMatched = matchedRightRowIds.has(row.id)
          const status = getRightRowStatus(highlight.kind, isCurrent, isMatched)
          const rowState =
            isCurrent && highlight.kind === 'match' ? 'active' : isMatched ? 'matched' : 'waiting'

          return (
            <tr
              className={isCurrent ? 'is-current' : isMatched ? 'is-matched' : undefined}
              data-state={rowState}
              data-focus={isCurrent ? 'primary' : undefined}
              key={row.id}
            >
              <td>
                <code className="join-fanout__key">{row.customerId}</code>
              </td>
              <td>
                <span className="join-fanout__tags">
                  {row.tags.map((tag) => (
                    <span className="join-fanout__tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </span>
              </td>
              <td>
                <span className="join-fanout__row-status">{status}</span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ResultTable({
  state,
  highlight,
}: {
  state: JoinFanoutState
  highlight: JoinFanoutHighlight
}) {
  const isFix = highlight.kind === 'fix'
  const isExpand = highlight.kind === 'expand' || highlight.kind === 'diagnose'
  const isObserve = highlight.kind === 'observe'
  const tone = isFix ? 'ok' : isObserve ? 'neutral' : isExpand ? 'risk' : 'warning'
  const heading = isFix ? '正确输出' : isObserve ? 'Join 输出' : '错误 Join 输出'
  const note = isFix
    ? '右表回到一行一个 key，结果仍是账户粒度。'
    : isExpand
      ? '警告：结果行数被放大，不能再按行求和。'
      : isObserve
        ? '还没有开始匹配，先确认两边都不是唯一 key。'
        : '错误结果正在生成，注意每一行来自哪次匹配。'

  return (
    <section className="join-fanout__result" data-tone={tone} aria-label={heading}>
      <div className="join-fanout__result-heading">
        <div>
          <span>{heading}</span>
          <strong>{state.resultRows.length} 行</strong>
        </div>
        <p>{note}</p>
      </div>
      {state.resultRows.length === 0 ? (
        <p className="join-fanout__empty">还没有生成结果行：两边数据都还没有开始匹配。</p>
      ) : (
        <div className="join-fanout__table-scroll">
          <table className="join-fanout__table join-fanout__table--result">
            <thead>
              <tr>
                <th scope="col">
                  <code>{highlight.joinKey}</code>
                </th>
                <th scope="col">
                  <code>account_id</code>
                </th>
                <th scope="col">
                  <code>balance</code>
                </th>
                <th scope="col">
                  <code>tag</code>
                </th>
                <th scope="col">状态</th>
              </tr>
            </thead>
            <tbody>
              {state.resultRows.map((row: JoinFanoutResultRow) => {
                const isNew = isRowHighlighted(highlight.resultRowIds, row.id)
                const status = isFix
                  ? '修复结果'
                  : isExpand
                    ? '最终结果'
                    : isNew
                      ? '新生成'
                      : '保留'

                return (
                  <tr
                    className={isNew ? 'is-new' : undefined}
                    data-state={isNew ? 'new' : 'kept'}
                    data-focus={isNew ? 'primary' : undefined}
                    key={row.id}
                  >
                    <td>
                      <code className="join-fanout__key">{row.customerId}</code>
                    </td>
                    <td>{row.accountId}</td>
                    <td>{row.balance.toLocaleString('zh-CN')}</td>
                    <td>
                      <span className="join-fanout__tags">
                        {row.tags.map((tag) => (
                          <span className="join-fanout__tag" key={tag}>
                            {tag}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td>
                      <span className="join-fanout__row-status">{status}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function JoinFanoutSimulator() {
  const kernel = useMemo(() => createJoinFanoutKernel(), [])
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
    throw new Error(`Golden Sample 步骤 ${step.id} 缺少 highlight 契约`)
  }

  const highlight = step.highlight
  const { counts } = step.state

  return (
    <section
      className="join-fanout"
      data-diagram-type="schema"
      aria-label="JOIN 膨胀分步实验"
      data-step-id={step.id}
    >
      <div className="visualization-toolbar join-fanout__toolbar">
        <div className="join-fanout__toolbar-main">
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
        className="join-fanout__progress"
        role="progressbar"
        aria-label="分步进度"
        aria-valuemin={1}
        aria-valuemax={progress.total}
        aria-valuenow={progress.current}
        aria-valuetext={`第 ${progress.current} 步，共 ${progress.total} 步`}
      >
        <span style={{ width: `${progress.ratio * 100}%` }} />
      </div>

      <div className="join-fanout__equation">
        <div>
          <small>左表已匹配</small>
          <strong>{counts.matchedLeftRows}</strong>
          <span>行</span>
        </div>
        <b>×</b>
        <div>
          <small>右表</small>
          <strong>{counts.rightRows}</strong>
          <span>行</span>
        </div>
        <b>=</b>
        <div className="is-result">
          <small>结果</small>
          <strong>{counts.resultRows}</strong>
          <span>行</span>
        </div>
      </div>

      <div className="join-fanout__tables">
        <div className="join-fanout__table-scroll">
          <LeftTable state={step.state} highlight={highlight} />
        </div>
        <div className="join-fanout__table-scroll">
          <RightTable state={step.state} highlight={highlight} />
        </div>
      </div>

      <ResultTable state={step.state} highlight={highlight} />
    </section>
  )
}
