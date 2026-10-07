# 课程术语契约（Phase 1）

> **用途：** 为新增或修改过的课程内容提供一组精简、高风险术语约定；不是全站词典，也不要求批量迁移历史课程。
>
> `docs/BANKING_TEACHING_DOMAIN.md` 继续约束银行教学对象、identity、Grain、关系和业务边界。本文件补充跨章节的技术词汇与语义边界，不取代或扩展该 Domain Contract。

术语含义应结合课程上下文阅读。下文标为 **sql.sb 教学约定** 的含义不是所有平台或组织的通用定义；标为 **通用概念** 的词也可能因系统边界而有不同实现。课程正文、标题、metadata 和 search tags 描述同一概念时应保持语义一致。

## Streaming / Incremental

### Source Cursor

- **Preferred term:** `Source Cursor`；需要强调进度边界时可写 `Source High-water Cursor`。
- **Means / answers:** 源端变更序列中已读到的位置，回答“source 读到哪里”。11-5 的例子按 source-visible 时间和唯一 change ID 推进。
- **Not equivalent to:** `Event-time Watermark`。Cursor 表示 source progress；Watermark 表示 event-time completeness policy。Checkpoint 可能保存 cursor，但二者不是同一概念。
- **Used in:** 第 11 章 11-5「优化副作用与工程取舍」的微批增量读取。
- **Convention:** `(availableAt, changeId)` 是本课的模型，不是所有 source 的游标格式。

### Event-time Watermark

- **Preferred term:** `Event-time Watermark`；仅在明确讨论第 11 章 11-6 流处理窗口时，可简写为 `Watermark`。
- **Means / answers:** 对 event-time 处理进度及窗口完整性的策略性估计；本课用它决定何时 emit、接受 late revision、finalize 和清理窗口状态。
- **Not equivalent to:** `Source Cursor` 或 `Checkpoint`；也不表示之后绝不会再有迟到事件。
- **Used in:** 第 11 章 11-6「Advanced Golden Lesson」。
- **Convention / general fact:** Watermark 是流处理中的通用概念；计算方式、lateness 和 finalization 行为取决于系统及策略。本课的时间和值是教学模型。

### Checkpoint

- **Preferred term:** `Checkpoint`；首次使用时说明它保存或覆盖的状态边界。
- **Means / answers:** 用于从某个可恢复边界继续处理的已保存进度或状态，回答“恢复从哪里、凭什么状态继续”。
- **Not equivalent to:** `Source Cursor` 或 `Event-time Watermark`。Cursor 可以作为 checkpoint 的一部分；checkpoint 也可能覆盖 operator state。它本身不证明外部 sink 已提交，也不等于 exactly-once。
- **Used in:** 11-5 中 checkpoint 保存 source cursor；11-6 中恢复需同时检查 source position、operator state、replay 和 sink write。
- **Convention / general fact:** checkpoint 的覆盖范围取决于所讨论的系统边界；不要把某一课的字段结构泛化为产品或行业保证。

## Recovery / Reprocessing

以下是课程当前有明确教学区分的用法，不是对所有调度器命令的统一定义。

### Retry

- **Preferred term:** `Retry`；说明是在重试任务 Attempt，还是重读尚未确认的批次。
- **Means / answers:** 调度课程中是同一任务实例的下一次 Attempt，业务日期不变；11-5 微批例子中则是 cursor 未持久化后再次读取该批变更。
- **Not equivalent to:** `Rerun`。Retry 的作用范围和触发原因必须按当前系统上下文说明。
- **Used in:** 第 05 章 05-2 / 05-4 与第 11 章 11-5。
- **Convention:** 两个场景的恢复边界不同，不要只凭 `Retry` 一词推断输入、日期或 sink 副作用。

### Rerun

- **Preferred term:** `Rerun`。
- **Means / answers:** 第 05 章教学约定中，对一个已存在的业务日期明确发起一次新运行；还需说明 DAG 起点、目标分区和写入方式。
- **Not equivalent to:** `Retry`（同一任务实例的新 Attempt）或 `Backfill`（批量历史日期处理）。
- **Used in:** 第 05 章 05-4，以及迟到修正后的课程案例。
- **Convention:** 平台对 rerun 的范围可能不同；本项目的“单业务日期”是教学模型，不是通用调度器规则。

### Backfill

- **Preferred term:** `Backfill`。
- **Means / answers:** 第 05 章教学约定中，按明确范围批量补跑多个历史业务日期。
- **Not equivalent to:** 单个日期的 `Rerun` 或同一实例内的 `Retry`。
- **Used in:** 第 05 章 05-1 / 05-4；11-5 另有「补跑受影响窗口」的局部例子。
- **Convention:** 11-5 的窗口补跑不自动表示跨多个业务日期；日期范围、依赖范围和写入策略必须按上下文给出。不同产品和团队的命令边界可能不同。

### Replay

- **Preferred term:** `Replay`；首次使用时写明被重放的输入或事件及恢复上下文。
- **Means / answers:** 11-6 中，从一致的 source / state 恢复边界重新处理已读 offsets；回答“恢复时哪些输入会再次经过处理”。
- **Not equivalent to:** 无故障时重复投递的业务事件；后者应按课程给出的稳定 transaction identity 识别。
- **Used in:** 第 11 章 11-6 的 checkpoint recovery 案例。
- **Convention:** 除该流处理上下文外，本仓库没有为 `Replay` 建立跨章节的稳定独立定义；其他场景按具体输入、状态和副作用说明，必要时标为 context-dependent。

## Execution / Business Time

| Term                                  | Current course usage                                                 | Boundary                                                                       |
| ------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Business Date` / `business_date`     | 数据在业务上归属哪一天；日批即使次日到达或运行，也可处理前一业务日。 | 本项目跨课程约定；不是到达日、运行日或系统当前日期。具体映射由任务契约决定。   |
| `Schedule Date` / `schedule_date`     | 第 05 章的教学变量，标识任务约定的调度实例日期。                     | 项目教学命名，不是跨平台统一字段；不能仅凭它推导 `Business Date`。             |
| `Execution Date`                      | 当前课程没有稳定的单一日期字段定义。                                 | 避免不加说明地使用；分别写清 `trigger_time`、实际开始 / 完成时间或实例日期。   |
| `Data Date`                           | 当前课程没有建立稳定的 canonical 定义。                              | **Context-dependent**；使用时明确它指业务归属、快照日期还是输入日期。          |
| `Event Time` / `event_time`           | 11-6 中事件发生时间，决定事件属于哪个 event-time window。            | 通用概念；具体字段来源和业务含义需由课程说明，不等于 source-visible time。     |
| `Processing Time` / `processing_time` | 11-6 中 runtime 实际处理事件的时间。                                 | 通用概念；不等于事件发生时间或 source 到达时间。                               |
| `Arrival Time` / `arrived_at`         | 输入或 delivery 何时对平台 / source 可见；各课程按其明确边界使用。   | 与 `Event Time`、`Processing Time`、`Business Date` 分开命名，不自动相互推导。 |

第 05 章还区分数据库环境的 `current_date`、调度实例日期、业务日期和 `snapshot_date`。时区、日切和字段映射都应写在任务 / 案例契约中；不要把某团队的 T-1 规则写成普遍事实。

## System Status

**没有一个适用于全站的统一状态机。** 状态词必须带上主体和范围（例如 task、dependency、quality、release、delivery 或 product review）；代码中的小写 enum 与文案中的大写标签不改变这个边界。

| Term      | Course meaning / boundary                                                                     |
| --------- | --------------------------------------------------------------------------------------------- |
| `WAITING` | 第 05 章中，任务尚未满足输入或依赖条件；本身不表示任务执行失败。                              |
| `BLOCKED` | 依赖或 gate 当前不允许后续任务 / 发布继续；不等于该下游任务自己执行失败。                     |
| `FAILED`  | 对应范围内的任务 Attempt 或质量检查实际失败；说明主体，不能把下游未启动当作它自己的失败。     |
| `SKIPPED` | 调度模型中任务没有执行；不代表执行成功，也不自动说明跳过原因。                                |
| `SUCCESS` | 指明的任务 / 运行完成；不单独证明 SLA 满足、数据正确、质量通过或交付完成。                    |
| `READY`   | 必须说明 ready 的对象和用途：可运行输入 / 依赖，与 Capstone 的产品评审 `READY` 不是同一状态。 |

因此，`WAITING != BLOCKED`、`BLOCKED != FAILED`、`SKIPPED != SUCCESS`；`SUCCESS` 也不自动等于 `READY`、Quality PASS 或 Delivery SUCCESS。这些是对现有课程局部语义的保护，不构成新增的全局状态机。

## 适用方式

- 优先用于新增内容及实际触及的正文、标题、metadata、search tags 和实验说明；不要求批量改写历史课程。
- 查不到适用定义时，保留必要上下文或标注 `context-dependent`，不要为术语统一虚构确定性。
- 技术语义 review 的简短入口见 [`CONTRIBUTING.md`](../CONTRIBUTING.md) 与 [Pull Request template](../.github/pull_request_template.md)。
