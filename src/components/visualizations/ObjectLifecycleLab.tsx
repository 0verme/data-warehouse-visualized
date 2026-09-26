import { useReducer } from 'react'
import {
  createInitialObjectLifecycleSelection,
  getObjectLifecycleSnapshot,
  OBJECT_LIFECYCLE_EVENTS,
  OBJECT_LIFECYCLE_STRATEGIES,
  reduceObjectLifecycleSelection,
} from '../../features/object-lifecycle/model'
import type { ObjectLifecycleStrategy } from '../../features/object-lifecycle/types'

function getOtherStrategy(strategy: ObjectLifecycleStrategy): ObjectLifecycleStrategy {
  return strategy === 'drop-ctas' ? 'fixed-table' : 'drop-ctas'
}

function StrategySnapshot({
  strategy,
  event,
  selected,
}: {
  strategy: ObjectLifecycleStrategy
  event: ReturnType<typeof createInitialObjectLifecycleSelection>['event']
  selected: boolean
}) {
  const snapshot = getObjectLifecycleSnapshot(strategy, event)
  const strategyDefinition = OBJECT_LIFECYCLE_STRATEGIES.find((item) => item.id === strategy)!

  return (
    <article
      className="object-lifecycle__snapshot"
      data-selected={selected}
      data-tone={snapshot.tone}
      data-object-exists={snapshot.targetExists}
      data-strategy={strategy}
    >
      <h4>
        {strategyDefinition.label} · {strategyDefinition.title}
      </h4>
      <dl>
        <div>
          <dt>对象</dt>
          <dd>{snapshot.targetExists ? '存在' : '不存在'}</dd>
        </div>
        <div>
          <dt>identity</dt>
          <dd>{snapshot.objectIdentity}</dd>
        </div>
        <div>
          <dt>可见数据</dt>
          <dd>{snapshot.visibleData}</dd>
        </div>
        <div>
          <dt>schema</dt>
          <dd>{snapshot.schema}</dd>
        </div>
      </dl>
    </article>
  )
}

export function ObjectLifecycleLab() {
  const [selection, dispatch] = useReducer(
    reduceObjectLifecycleSelection,
    undefined,
    createInitialObjectLifecycleSelection,
  )
  const selectedStrategy = OBJECT_LIFECYCLE_STRATEGIES.find(
    (item) => item.id === selection.strategy,
  )!
  const otherStrategy = getOtherStrategy(selection.strategy)
  const observation = getObjectLifecycleSnapshot(selection.strategy, selection.event)

  return (
    <section
      className="object-lifecycle"
      data-object-lifecycle
      data-object-lifecycle-strategy={selection.strategy}
      data-object-lifecycle-event={selection.event}
      aria-label="加工结果对象生命周期策略对照"
    >
      <header className="object-lifecycle__intro">
        <div>
          <span className="eyebrow eyebrow--small">OBJECT LIFECYCLE · 确定性教学模型</span>
          <h3>结果正确之外，目标对象要不要保持稳定？</h3>
        </div>
        <p>
          两种方式都可能产出正确数据。选择策略和运行事件，观察对象
          identity、schema、读者可见性及恢复责任。
        </p>
      </header>

      <div className="object-lifecycle__strategies" role="group" aria-label="选择要聚焦的加工策略">
        {OBJECT_LIFECYCLE_STRATEGIES.map((strategy) => (
          <article
            className="object-lifecycle__strategy"
            data-selected={strategy.id === selection.strategy}
            key={strategy.id}
          >
            <button
              className="object-lifecycle__strategy-select"
              type="button"
              aria-pressed={strategy.id === selection.strategy}
              onClick={() => dispatch({ type: 'select-strategy', strategy: strategy.id })}
            >
              <span>{strategy.label}</span>
              <strong>{strategy.title}</strong>
              <small>{strategy.summary}</small>
            </button>
            <pre>
              <code>{strategy.sql}</code>
            </pre>
          </article>
        ))}
      </div>

      <div className="object-lifecycle__event-heading">
        <div>
          <span className="eyebrow eyebrow--small">运行事件</span>
          <h4>同一策略遇到不同状态，会留下什么？</h4>
        </div>
        <button
          className="object-lifecycle__reset"
          type="button"
          onClick={() => dispatch({ type: 'reset' })}
        >
          重置实验
        </button>
      </div>
      <div className="object-lifecycle__events" role="group" aria-label="选择运行事件">
        {OBJECT_LIFECYCLE_EVENTS.map((event) => (
          <button
            className="object-lifecycle__event"
            type="button"
            aria-pressed={event.id === selection.event}
            onClick={() => dispatch({ type: 'select-event', event: event.id })}
            key={event.id}
          >
            <strong>{event.label}</strong>
            <small>{event.detail}</small>
          </button>
        ))}
      </div>

      <div className="object-lifecycle__comparison" aria-live="polite" aria-atomic="true">
        <div className="object-lifecycle__comparison-heading">
          <div>
            <span className="eyebrow eyebrow--small">当前事件 · {selection.event}</span>
            <h4>两种策略的对象与数据状态</h4>
          </div>
          <p>
            聚焦：{selectedStrategy.label} · {selectedStrategy.title}
          </p>
        </div>
        <div className="object-lifecycle__snapshots">
          <StrategySnapshot strategy={selection.strategy} event={selection.event} selected />
          <StrategySnapshot strategy={otherStrategy} event={selection.event} selected={false} />
        </div>
      </div>

      <section
        className="object-lifecycle__details"
        data-tone={observation.tone}
        aria-label={`${selectedStrategy.title}：${observation.runStatus}`}
      >
        <header className="object-lifecycle__details-heading">
          <div>
            <span className="eyebrow eyebrow--small">{selectedStrategy.label} · 执行路径</span>
            <h4>{observation.runStatus}</h4>
          </div>
          <p>{observation.conclusion}</p>
        </header>
        <ol className="object-lifecycle__operations">
          {observation.operations.map((operation, index) => (
            <li data-state={operation.state} key={`${index}-${operation.title}`}>
              <span>
                {operation.state === 'done'
                  ? '完成'
                  : operation.state === 'failed'
                    ? '失败'
                    : '待处理'}
              </span>
              <strong>{operation.title}</strong>
              <small>{operation.detail}</small>
            </li>
          ))}
        </ol>
        <dl className="object-lifecycle__observations">
          {observation.observations.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </dd>
            </div>
          ))}
        </dl>
        <p className="object-lifecycle__transaction-note">
          <strong>模型边界：</strong> {observation.transactionNote} #01 / #02
          是逻辑对象代次的教学标记，不代表数据库 catalog
          ID。具体事务、DDL、锁、权限、依赖和可见性行为依数据库实现而异；本案例聚焦对象生命周期与工程影响。
        </p>
      </section>

      <p className="object-lifecycle__choice">
        <strong>怎么选：</strong>需要稳定对象 identity、schema
        契约和下游引用时，固定表可能更合适，但要设计刷新原子性、回滚与 schema
        migration；一次性派生、临时结果或明确允许新对象代次时，CTAS
        可能更简单。不存在对所有场景都正确的单一写法。
      </p>
    </section>
  )
}
