import { useId, useState } from 'react'

function FlowNode({ kind, label, detail }: { kind: string; label: string; detail: string }) {
  return (
    <div className="lineage-teaching-flow__node" data-node-type={kind}>
      <span className="lineage-teaching-flow__layer">{kind}</span>
      <strong>{label}</strong>
      <small>{detail}</small>
    </div>
  )
}

function RelationArrow({ label }: { label: string }) {
  return (
    <span className="lineage-teaching-flow__arrow" aria-label={label}>
      <span aria-hidden="true">↓</span>
      <small>{label}</small>
    </span>
  )
}

export function LineageViewDependencyPanel() {
  const headingId = useId().replace(/:/g, '')
  const sourceId = useId().replace(/:/g, '')
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="lineage-teaching-panel lineage-teaching-panel--view-dependency">
      <div className="lineage-teaching-panel-heading">
        <span className="lineage-teaching-overline">Scheduler Dependency ≠ SQL Lineage</span>
        <h3>View 折叠了查询路径，不会替调度器补齐依赖</h3>
        <p>
          数据库 View 是正常的查询抽象。下面用一个教学样例分别观察显式调度依赖和 SQL
          实际读取；图中不对 View 性能作结论。
        </p>
      </div>

      <section className="lineage-teaching-contrast" aria-labelledby={`${headingId}-surface`}>
        <div className="lineage-teaching-panel-heading">
          <h4 id={`${headingId}-surface`}>排障时首先看到的简化线索</h4>
        </div>
        <ol className="lineage-teaching-flow" aria-label="JOB_A 到 REPORT 的简化路径">
          <li>
            <FlowNode kind="调度任务" label="JOB_A" detail="一个可见的上游任务" />
          </li>
          <li>
            <RelationArrow label="简化路径" />
          </li>
          <li>
            <FlowNode kind="数据库 View" label="V_CUSTOMER" detail="封装查询定义" />
          </li>
          <li>
            <RelationArrow label="简化路径" />
          </li>
          <li>
            <FlowNode kind="报告" label="REPORT" detail="下游消费结果" />
          </li>
        </ol>
        <p>
          这条简图把任务、View 和消费结果放在一起帮助定位；它不是一张统一的调度 DAG，也不能说明 SQL
          的完整读取来源。
        </p>
      </section>

      <div className="lineage-teaching-contrast-grid">
        <section
          className="lineage-teaching-contrast lineage-view-dependency__perspective"
          data-perspective="scheduler"
          aria-labelledby={`${headingId}-scheduler`}
        >
          <div className="lineage-teaching-panel-heading">
            <span className="lineage-teaching-overline">运行时序 · 显式配置</span>
            <h4 id={`${headingId}-scheduler`}>调度器知道谁要等谁</h4>
          </div>
          <ol className="lineage-teaching-flow" aria-label="显式任务依赖：JOB_A 先于 REPORT_JOB">
            <li>
              <FlowNode kind="任务" label="JOB_A" detail="已登记的上游任务" />
            </li>
            <li>
              <RelationArrow label="depends_on（显式配置）" />
            </li>
            <li>
              <FlowNode kind="任务" label="REPORT_JOB" detail="等待 JOB_A 完成" />
            </li>
          </ol>
          <div className="lineage-view-dependency__missing">
            <strong>本例的调度配置没有显式列出这些 SQL 输入的就绪等待：</strong>
            <div
              className="lineage-teaching-mini-flow"
              aria-label="未登记的 SQL 输入：Customer 与 Account"
            >
              <code>Customer</code>
              <span aria-hidden="true">+</span>
              <code>Account</code>
            </div>
            <p>
              这是可观察的配置差异，不表示 SQL
              没有读取它们；是否要配置额外调度依赖，应按任务时序和就绪保障判断。
            </p>
          </div>
        </section>

        <section
          className="lineage-teaching-contrast lineage-view-dependency__perspective"
          data-perspective="sql-lineage"
          aria-labelledby={`${headingId}-sql`}
        >
          <div className="lineage-teaching-panel-heading">
            <span className="lineage-teaching-overline">数据来源 · SQL 定义</span>
            <h4 id={`${headingId}-sql`}>SQL 会沿 View 读取底层对象</h4>
          </div>
          <button
            className="button button--primary button--small lineage-view-dependency__toggle"
            type="button"
            aria-expanded={expanded}
            aria-controls={sourceId}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? '收起真实依赖' : '展开真实依赖'}
          </button>
          <p className="lineage-view-dependency__status" role="status" aria-live="polite">
            {expanded
              ? 'SQL 血缘已展开：V_CUSTOMER 读取 Customer 和 Account。'
              : 'V_CUSTOMER 的 SQL 上游已折叠（2 个来源）。'}
          </p>
          <ol className="lineage-teaching-flow" aria-label="SQL 实际读取路径">
            <li id={sourceId} data-view-sql-upstream hidden={!expanded}>
              <div
                className="lineage-teaching-source-grid lineage-view-dependency__source-pair"
                role="group"
                aria-label="V_CUSTOMER 的两个 SQL 上游表"
              >
                <FlowNode kind="表" label="Customer" detail="客户信息" />
                <FlowNode kind="表" label="Account" detail="账户关联信息" />
              </div>
              <RelationArrow label="V_CUSTOMER 的 SQL 同时读取两张表" />
            </li>
            <li>
              <FlowNode kind="View" label="V_CUSTOMER" detail="数据库查询定义" />
            </li>
            <li>
              <RelationArrow label="REPORT 查询 View 结果" />
            </li>
            <li>
              <FlowNode kind="消费结果" label="REPORT" detail="下游分析结果" />
            </li>
          </ol>
        </section>
      </div>

      <p className="lineage-teaching-boundary">
        SQL lineage 回答“查询读取了什么”；Scheduler dependency 回答“运行要等待什么”。View
        可以合理存在，排障与影响分析时仍应核对底层 SQL 来源和运行依赖。
      </p>
    </div>
  )
}
