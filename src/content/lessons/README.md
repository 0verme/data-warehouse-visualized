# 课程内容

每节课的教学文案与可视化输入数据放在本目录，课程元数据统一维护在 `src/data/course.ts`。

课程元数据中的 `chapter` 标识一级章节，`order` 是章节内排序权重而不是展示编号。新增课程时只需选择合适的权重（例如在 100 和 200 之间使用 150）；`src/utils/lesson.ts` 会根据当前排序动态计算 `1-1`、`1-2` 等课程编号。请保持课程的 `id` 与 `slug` 不变，不要把展示编号写入课程内容。

课程正文当前只维护中文，暂不按 locale 搬迁目录；新增语言时，先在课程元数据中补充对应翻译，再单独扩展正文内容，并保持 lesson `id` 与 `slug` 不变。

当前已实现：

- `why-data-warehouse.ts`：业务系统与分析负载
- `warehouse-layers.ts`：ODS / DWD / DWS / ADS 数据流
- `data-modeling.ts`：贷款业务过程选择与 LoanContract / LoanNote / Repayment 最小链路
- `grain.ts`：合同、借据、还款三种 Grain 与 Join 放大错误
- `star-schema-and-grain.ts`：账户交易字段归位、事实/维度与星型模型
- `fact-table-types.ts`：Transaction Fact、Periodic Snapshot Fact、Accumulating Snapshot Fact 对照
- `slowly-changing-dimension.ts`：Customer 覆盖更新与拉链表的历史时间点实验
- `data-lineage.ts`：血缘关系与影响分析
- `data-governance.ts`：第 09 章五节数据治理课程，依次练习资产选择、Quality / Freshness 证据、字段使用、deprecated 迁移和 Owner 责任清单
- `sql-and-transformation.ts`：SQL 表快照、加工差异与任务契约
- `metric-system.ts`：存款余额的统计集合与口径差异
- `deposit-metric-definition.ts`：指标定义卡逐项补全
- `deposit-metric-time.ts`：存款余额状态与期间存入事件的时间语义
- `deposit-metric-derivations.ts`：客户、产品、币种、机构和日期口径组合
- `scheduling-business-date.ts`：业务日期、到达时间和目标分区时间轴
- `scheduling-readiness.ts`：三种启动条件与 DAG 放行
- `scheduling-failure.ts`：失败传播、Attempt 与 Retry
- `scheduling-rerun.ts`：Retry、Rerun、Backfill、重跑范围与幂等
- `scheduling-sla.ts`：迟到数据传播与业务 SLA
- `scheduling-system.ts`：兼容旧调度事实的导出入口
- `data-quality.ts`：7-1 运行状态、质量状态与发布状态
- `data-quality-rules.ts`：7-2 从 Grain 推出记录级质量规则
- `data-quality-dataset.ts`：7-3 应到集合、Freshness 与跨层对账
- `data-quality-evidence.ts`：7-4 Quality Event 与行级/聚合证据
- `data-quality-release.ts`：7-5 银行关键数据 BLOCK 与埋点 quarantine 对照
