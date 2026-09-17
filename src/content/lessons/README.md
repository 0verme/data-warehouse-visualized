# 课程内容

每节课的教学文案与可视化输入数据放在本目录，课程元数据统一维护在 `src/data/course.ts`。

课程元数据中的 `chapter` 标识一级章节，`order` 是章节内排序权重而不是展示编号。新增课程时只需选择合适的权重（例如在 100 和 200 之间使用 150）；`src/utils/lesson.ts` 会根据当前排序动态计算 `1-1`、`1-2` 等课程编号。请保持课程的 `id` 与 `slug` 不变，不要把展示编号写入课程内容。

课程正文当前只维护中文，暂不按 locale 搬迁目录；新增语言时，先在课程元数据中补充对应翻译，再单独扩展正文内容，并保持 lesson `id` 与 `slug` 不变。

当前已实现：

- `why-data-warehouse.ts`：1-1 核心系统、信贷系统与跨系统分析
- `warehouse-layers.ts`：1-2 数据职责、公共加工与变化影响
- `report-metric-journey.ts`：1-3 存贷比报表数字的数据链路
- `warehouse-terms.ts`：1-4 OLTP、OLAP、ETL、ELT 与 Data Warehouse 术语
- `data-modeling.ts`：贷款业务过程选择与 LoanContract / LoanNote / Repayment 最小链路
- `grain.ts`：合同、借据、还款三种 Grain 与 Join 放大错误
- `star-schema-and-grain.ts`：账户交易字段归位、事实/维度与星型模型
- `fact-table-types.ts`：Transaction Fact、Periodic Snapshot Fact、Accumulating Snapshot Fact 对照
- `slowly-changing-dimension.ts`：Customer 覆盖更新与拉链表的历史时间点实验
- `data-lineage.ts`：7-1 表级血缘
- `data-lineage-fields.ts`：7-2 字段级血缘
- `data-lineage-investigation.ts`：7-3 Quality Event 调查
- `data-lineage-impact.ts`：7-4 变更影响范围
- `data-lineage-evidence.ts`：7-5 血缘关系证据
- `data-governance.ts`：第 08 章五节数据治理课程，依次练习资产选择、Quality / Freshness 证据、字段使用、deprecated 迁移和 Owner 责任清单
- `lakehouse.ts`：第 09 章四节湖仓课程，依次练习 Lake-first、异构湖仓复制、Table Layer 与湖仓一体
- `sql-and-transformation.ts`：存款余额指标定义与加工计划
- `sql-and-transformation-cleaning.ts`：账户日明细去重、缺失关联与币种标准化
- `sql-and-transformation-join.ts`：账户介质一对多 Join 与余额放大
- `sql-and-transformation-layers.ts`：DWD → DWS → ADS 分层聚合
- `sql-and-transformation-contract.ts`：输入、输出、业务日期与加工契约
- `metric-system.ts`：存款余额的统计集合与口径差异
- `deposit-metric-definition.ts`：指标定义卡逐项补全
- `deposit-metric-time.ts`：存款余额状态与期间存入事件的时间语义
- `deposit-metric-derivations.ts`：客户、产品、币种、机构和日期口径组合
- `scheduling-business-date.ts`：业务日期、到达时间和目标分区时间轴
- `scheduling-readiness.ts`：三种启动条件与 DAG 放行
- `scheduling-failure.ts`：失败传播、Attempt 与 Retry
- `scheduling-rerun.ts`：Retry、Rerun、Backfill、重跑范围与幂等
- `scheduling-sla.ts`：迟到数据传播与业务 SLA
- `scheduling-system.ts`：复用存款余额任务契约的时间轴 DAG Run 模拟
- `data-quality.ts`：6-1 运行状态、质量状态与发布状态
- `data-quality-rules.ts`：6-2 从 Grain 推出记录级质量规则
- `data-quality-dataset.ts`：6-3 应到集合、Freshness 与跨层对账
- `data-quality-evidence.ts`：6-4 Quality Event 与行级/聚合证据
- `data-quality-release.ts`：6-5 银行关键数据 BLOCK 与埋点 quarantine 对照
- `data-service.ts`：10-1 至 10-5 已发布存款余额的报表 / BI、TXT + FLAG、API 与消费方式选择
- `performance-and-practice.ts`：11-1 反欺诈 T+1 特征任务的执行阶段诊断
- `performance-scan-layout.ts`：11-2 Partition Pruning、小文件、Compaction 与日期分区倾斜
- `performance-shuffle-skew.ts`：11-3 开户机构 Shuffle Key 倾斜、Worker 长尾与通用处理方向
- `performance-first-seen.ts`：11-4 customer-counterparty first_seen 增量状态与固定窗口特征
- `performance-tradeoffs.ts`：11-5 Before / After、迟到数据、副作用与工程取舍
