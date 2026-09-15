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
- `data-governance.ts`：资产目录、治理决策台、生命周期与血缘影响消费
- `sql-and-transformation.ts`：SQL 表快照、加工差异与任务契约
- `scheduling-system.ts`：复用 SQL 任务契约的时间轴 DAG Run 模拟
