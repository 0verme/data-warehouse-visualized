# 数据仓库依赖链重做专题 · 实现设计（Phase 0）

> 状态：设计冻结（Phase 0）
>
> Parent Issue: [#221](https://github.com/0verme/data-warehouse-visualized/issues/221)
> Phase 0 Issue: [#229](https://github.com/0verme/data-warehouse-visualized/issues/229)
> 审计基线：`origin/main` = `cb9d273a0e55a4fd91737c3d2ca4e30f434aec50`（2026-10-17）
>
> **术语红线：本专题处理「依赖链重做（reprocessing）」，不是「依赖链重构（refactoring）」。**
> 二者不是同义词：重做指错误数据进入数仓后，按真实的血缘与调度依赖重新加工受影响的实例；
> 重构指修改程序结构、表结构或系统架构，本身不是本专题的教学目标。

## 1. 审计基线

以下事实来自对 `origin/main` `cb9d273` 的只读审计（`git archive` 导出到临时目录后检查），
不是从历史会话推断。

### 1.1 课程与内容组织

- 课程定义是 typed TypeScript：`src/data/course.ts` 是章节、课程 id、slug、order、难度、
  预计时长和 demo kind 的单一事实来源；正文在 `src/content/lessons/*.ts`。
- 当前课程统计（`README.md` 由 `tests/readme-course-facts.test.ts` 从 `course.ts` 派生校验）：
  **13 个章节、56 节课程、56 节已上线、0 节规划中、56 个交互实验入口、25 类实验工作台**。
- 章节内容通过 `src/content/lessons/index.ts` 静态 registry 与
  `src/content/lessons/client-loader.ts` 客户端按 slug 动态 import 双份注册，两处必须
  1:1 对应（`tests/client-loader.test.ts` 校验）。
- 每个 lesson 可组合多种 section kind：`narrative / compare / sql / visualization /
takeaway / engineering-note / pitfall / sql-sandbox`（`src/content/types.ts`）。
- 可视化 kind 在 `LessonVisualization` 联合类型中声明，由
  `src/components/lesson/LessonSectionRenderer.tsx` 懒加载分发；每个 kind 的专属 CSS
  在 `src/utils/lesson-styles.ts` 中登记；`tests/lesson-styles.test.ts` 校验归属。

与专题直接相关的既有章节：

| 章节                          | 与本专题的关系                                                              |
| ----------------------------- | --------------------------------------------------------------------------- |
| 第 05 章 调度系统（5 节）     | 业务日期 / 调度日期、readiness、失败、Retry / Rerun / Backfill、双入口、SLA |
| 第 06 章 数据质量（5 节）     | 规则、数据集、证据、发布门禁；ODS 验证门禁的证据语言                        |
| 第 07 章 数据血缘（5 节）     | 字段级血缘、调查、影响分析、证据；SQL 血缘与调度依赖的区分                  |
| 第 10 章 数据服务（5 节）     | 报表 / TXT+FLAG 文件 / API 三类消费模式；下游消费语义                       |
| 第 13 章 生产实践案例（2 节） | 13-1 生命周期、13-2 交付链调查；生产案例叙事与 Step 化实验的既有范式        |

### 1.2 可直接复用的内核与组件

- **Step Kernel / Headless Player**：`src/utils/visualization-steps.ts` 提供
  `VisualizationStep<S, H>`、`createStepKernel`、`createVisualizationPlayer` 和纯函数
  reducer。语义是「每步携带确定性完整快照，播放器只维护 index，无 timer / autoplay」。
  #119 的冻结边界：**不扩展该 primitive、不抽公共 `PlayerChrome`**。
- **纯逻辑 + fixture + steps 目录模式**（最近两篇生产案例的实践）：
  - `src/features/lifecycle-path/{types,model,steps}.ts`
  - `src/features/delivery-investigation/{types,model,steps}.ts`
  - 组件侧只消费 kernel，DOM 不硬编码结论。
- **可参考的血缘/影响实现**：`src/features/lineage-impact/steps.ts`（逐层展开）、
  `src/components/visualizations/LineageTeachingLab.tsx`（候选 / 证据 / 去重语义）。
- **可参考的调度实现**：`src/features/scheduler/{types,banking}.ts` 与
  `SchedulerRunSimulator.tsx`（运行状态、事件、互斥的既有表达；本专题不修改该组件）。
- **现有银行教学任务命名**：`prepare/transform/publish.*.daily.v1`（如
  `transform.deposit-balance.topic.daily.v1`），可作为专题任务命名的风格基线。
- **样式约定**：课程专属 CSS 放 `src/styles/lessons/<kind>.css`；共享组件放
  `src/components/visualizations/`；不新增全局依赖。

### 1.3 银行教学域

- `docs/BANKING_TEACHING_DOMAIN.md` 约束 Customer / Account / Transaction / Branch /
  Product / LoanContract / LoanNote / Repayment / Merchant / AcquiringTransaction 的
  identity、Grain 与关系；新对象必须先更新该文档。
- 本专题只使用现有对象：**Customer、Account、Transaction、Merchant**，不引入新
  Canonical Entity。ODS 事故数据为合成教学数据（示例账户、示例流水、示例商户），
  不含任何真实银行内部信息。
- 术语遵循 `docs/TERMINOLOGY.md`：`business_date` 不等于到达日；`WAITING != BLOCKED`、
  `SKIPPED != SUCCESS`、`SUCCESS` 不自动等于 Quality PASS 或 Delivery SUCCESS；
  `Retry / Rerun / Backfill / Replay` 按文档边界使用。
- 状态词必须带主体和范围；simulator 内部标识（如 plan id）必须明确标注为模拟器内部标识，
  不能呈现为生产平台既有机制。

### 1.4 i18n / SEO / 导航 / 进度

- 维护语言：`zh-CN`；`/en/` 是手工维护的英文命名空间（9 条 English 路由，独立测试），
  **不得**把中文新文章声称为已有英文翻译，也不为专题新增英文路由。
- 课程路由由 `getStaticPaths` 从 `lessons` 派生（`src/pages/learn/[slug].astro`）；
  canonical / sitemap / search index 自动覆盖已上线课程。
- 导航：`CourseSidebar` 按章节渲染；顶部导航与移动目录抽屉已有既有结构。
- 学习路线：`src/features/learning-roadmap/` 的 graph 要求每个**已上线** lesson 恰有
  一个 owner topic（`missing-lesson-owner` / `unavailable-lesson` 校验），
  `topic-details.ts` 需要为每个 topic 提供 whyLearn / learningOutcome。
- 进度：单一 storage key `data-warehouse-visualized:progress`（lesson id 维度），
  本专题不新增 storage key、不改变 ProgressState 契约。
- 搜索：`src/pages/search-index.json.ts` 构建期自动索引所有 lesson 的 typed content，
  新增文章无需额外接线，但必须通过已有 `test:e2e:search` 与 anchor 契约。

### 1.5 测试 / 构建 / CI

- 测试命令：`npm test`（Vitest）、`npm run check`（astro check）、`npm run lint`、
  `npm run format:check`、`npm run build`。
- PR CI：`.github/workflows/cloudflare-deploy.yml`，唯一 job
  `Test, build, and deploy`；在 `pull_request` 与 `main` push 上运行；包含全量测试、
  lint、format、type check、build、DuckDB isolation、SEO/sitemap 契约、Smart 404 契约
  以及 9 组浏览器 E2E 与 BASE_PATH 复核。
- 分支保护：`main` 当前没有 branch protection / ruleset（GitHub API 读取结果）；
  `allow_auto_merge=false`，允许 squash / merge / rebase，合并后不自动删除 branch。
  **即使没有强制保护，也必须等 CI 通过后再合并，不得直推 main、不得强推。**
- 计数契约（新增课程时必须在同一 PR 更新）：
  - `tests/learning-roadmap-graph.test.ts`、`tests/learning-roadmap-progress-view.test.ts`、
    `tests/learning-roadmap-view-model.test.ts`：56 节已上线；
  - `tests/english-seo-foundation.test.tsx`、`tests/english-seo-build-contract.mjs`：
    56 条 `/learn/` 静态路由与 sitemap 数量；
  - `tests/e2e/roadmap.mjs`、`tests/e2e/learn-mobile-navigation.mjs`：56 节映射与
    `1 / 56` 进度文案；
  - `README.md` 课程统计句与章节表由 `tests/readme-course-facts.test.ts` 校验。
- 移动端契约：390×844 / 320×720 × light/dark、无横向溢出、键盘可达、
  reduced-motion 安全；已有 e2e harness 位于 `tests/e2e/lib/harness.mjs`。

### 1.6 并发与冲突检查

- `#221` 及其子 Issue 之外，仓库当前开放项为英文专题规划轨（#220 / #222–#228）
  与 Smart 404 / GEO 等历史项；与本专题修改文件预计无重叠。
- 已有大量历史 worktree 保留未清理，属于既有约定；本轮只清理本任务自己创建且确认安全的
  worktree。
- 正式 Main Workspace 保持 clean，不在其中开发。

## 2. 交付范围与落点

### 2.1 第 14 章「依赖链重做」

新增 Chapter 14（chapter id `'14'`），8 节进阶实战课程。课程 id / slug 一次冻结，
但**只在该文章与实验真正完成后**才把 lesson 加入 `course.ts`（不做占位"规划中"页面，
避免占位内容进入站点、搜索索引与 sitemap）。

| 课程 | Article | 标题                                         | 建议 slug                          | order | 目标 kind                 |
| ---- | ------- | -------------------------------------------- | ---------------------------------- | ----- | ------------------------- |
| 14-1 | A1      | 为什么数仓任务成功了，数据仍然是错的？       | `reprocessing-incident-timeline`   | 100   | `dependency-reprocessing` |
| 14-2 | A2      | SQL 血缘与调度依赖：如何圈定依赖链重做范围？ | `reprocessing-impact-scope`        | 200   | 同上                      |
| 14-3 | A3      | 依赖链如何自动停止、等待和重新调用？         | `reprocessing-auto-stop-wait`      | 300   | 同上                      |
| 14-4 | A4      | 历史数据如何重做而不影响当天日切？           | `reprocessing-historical-parallel` | 400   | 同上                      |
| 14-5 | A5      | 为什么有些历史数据禁止重做？                 | `reprocessing-version-boundary`    | 500   | 同上                      |
| 14-6 | A6      | 数仓重做成功，为什么下游还要重新装数？       | `reprocessing-downstream-reload`   | 600   | 同上                      |
| 14-7 | A7      | 连续多日历史补数，为什么不能简单并行？       | `reprocessing-rolling-backfill`    | 700   | 同上                      |
| 14-8 | A8      | 如何设计自动化依赖链重做平台？               | `reprocessing-platform-design`     | 800   | 同上                      |

每篇文章必须具备：明确学习目标、可操作案例、技术推导、生产边界、关联课程入口
（至少回链第 05 / 07 章，按主题补 06 / 10 / 13 章）。难度全部 `advanced`，
预计时长 18–22 分钟，写入 `course.ts` 与 README 章节表。

### 2.2 实验室能力映射（E1–E6 + A7 / A8）

一套共享实验室 `DependencyReprocessingLab`，按 lesson focus 切换视图；共享同一
fixture 与同一纯逻辑内核，不为每课复制状态。

| 实验    | 能力                                                                    | 承载课程 |
| ------- | ----------------------------------------------------------------------- | -------- |
| E1      | 事故时间线与污染传播                                                    | 14-1     |
| E2      | 点击源节点，联合 SQL 血缘 / 调度 / 分区识别影响，去重生成重做清单       | 14-2     |
| E3      | 运行中停止、WAITING、自动依赖重新执行、普通任务失败、ODS 再次修复重入队 | 14-3     |
| E4      | 当日 / 历史模式切换、生产完成门禁、模拟平行 Job / Plan、日期参数        | 14-4     |
| E5      | 最新程序的历史兼容性判定，重大重构禁止直接重做                          | 14-5     |
| E6      | 下游消费 / 重新装数 / 通知与验证闭环                                    | 14-6     |
| A7 模式 | 连续多日补数的滚动窗口与跨天依赖顺序                                    | 14-7     |
| A8 模式 | 平台工程设计复盘（区分真实经验与演示架构）                              | 14-8     |

### 2.3 文件布局

```text
src/features/dependency-reprocessing/
  types.ts     # 领域类型（Phase 1-A 起）
  fixture.ts   # 合成事故 fixture（Phase 1-A 起）
  model.ts     # 纯函数：影响分析 / 状态机 / 门禁 / 历史 / 版本 / 下游 / 滚动
  steps.ts     # Step Kernel：每 lesson focus 的确定性步骤快照
  index.ts     # 对外导出（如需要）
src/components/visualizations/DependencyReprocessingLab.tsx
src/styles/lessons/dependency-reprocessing.css
src/content/lessons/dependency-reprocessing-incident.ts
src/content/lessons/dependency-reprocessing-impact.ts
...（每篇文章一个内容模块）
tests/dependency-reprocessing-*.test.ts(x)
```

接线点（每篇文章 PR 按需增加，不一次性改动全部）：

1. `src/data/course.ts`：章节定义、lesson 定义、章节 / 课程翻译。
2. `src/content/types.ts`：新增 `'dependency-reprocessing'` 可视化 kind 与
   `LessonDemo` 值；需带 `lessonFocus` 字段。
3. `src/components/lesson/LessonSectionRenderer.tsx`：lazy import + dispatch。
4. `src/utils/lesson-styles.ts`：CSS 归属登记。
5. `src/content/lessons/{index,client-loader}.ts`：双 registry。
6. `src/features/learning-roadmap/graph.ts` + `topic-details.ts`：新增 topic
   （`serving-production` stage 下，kind `case`），按已上线课程逐步加入 lessonIds；
   建议 topic 结构：
   - `reprocessing-incident-response`：14-1、14-2、14-3
   - `reprocessing-historical-recovery`：14-4、14-5
   - `reprocessing-consumer-closure`：14-6
   - `reprocessing-platform-operations`：14-7、14-8
7. README 课程统计句与章节表；上节列出的全部计数契约测试。
8. 新增 `tests/e2e/dependency-reprocessing.mjs`（本专题交互与移动端回归），
   按仓库惯例在 CI 中加入。

## 3. 生产语义契约（不可擅自改变）

以下 10 条是 #221 的业务契约，优先于任何实现便利或"最小重做范围"优化：

1. **血缘 + 调度联合分析**：SQL 读写血缘、实际 Job / Plan 调度依赖、业务日期 / 分区及
   实例状态结合判断；不能只靠 DAG 可达性断言结果已被污染。
2. **血缘范围内统一重做**：一旦确定本次任务实例 / 分区的血缘下游覆盖范围，已经执行的
   受影响任务都纳入重做，**包括 LEFT JOIN 或实际结果没有变化的情况**。未首次执行的任务
   进入等待，不伪称为"已经重做"。
3. **自动止损与互斥**：平台自动识别并阻断受影响的正常任务；正在运行的先停止并确认
   停止 / 副作用处置，再置 WAITING；正常链与重做链对受控任务及冲突数据写入不能同时运行；
   无关链路不应被误停。
4. **源头先验证**：ODS 修复并验证通过才放行依赖链重做；下游按依赖自动调用，人工几乎
   不参与；任务失败按正常凌晨生产故障流程处理，不发明独立的故障协议。
5. **再次修复 ODS**：重新根据血缘入队；对新修复波及的下游清空当前 SUCCESS、重新
   WAITING；保留历史执行日志。**日志按重做时的时分秒记录，不引入 Replay Generation /
   轮次 / generation 字段作为平台既有机制。** 模拟器内部如需唯一标识 plan，
   必须清楚标注"仅为模拟器内部标识"。
6. **当日与历史分流**："当日"指当前生产日切批次（可跨自然日）。当日重做沿现有生产
   Job / Plan 恢复；历史日期重做必须先等**当日全部跑批结束**，再按当前有效血缘 / 依赖
   生成**平行 Job 和 Plan**、绑定指定历史日期，不改变当前正常 Job / Plan 状态。
7. **历史版本边界**：平行 Job 使用**最新加工程序**，而非历史版本。若程序 / 表结构 /
   业务语义不兼容历史输入，特别是新老系统重大重构，**禁止直接历史重做**，转专项修复；
   不因 SQL 能运行就认定安全。
8. **下游闭环**：识别装数、接口、文件、报表、监管等消费方是否已消费旧结果，判断要否
   重装 / 刷新 / 更正，并通知与跟踪确认；**数仓任务 SUCCESS 不等于消费端恢复**。
9. **串行含义**：保持依赖先后顺序；教学中必须区分「依赖串行」与「全局并发数 1」，
   实际策略以生产规则为准。本专题 simulator 只建模依赖顺序约束，不宣称平台全局并发默认值。
10. **安全优先**：正常调度与重做互斥；检查共享无分区表 / 临时表写冲突、任务副作用、
    业务日期参数、源数据版本与质量。不以"最小重做范围"优化否定上述全覆盖规则。

术语自查（每篇 PR review 必查）：

- 不把"重做"写成"重构"；标题、正文、metadata、search tags 一致使用「重做 / reprocessing」。
- 不出现"第 N 轮重做""Replay Generation""重做批次号"等虚构机制。
- `WAITING`、`BLOCKED`、`FAILED`、`SKIPPED`、`SUCCESS` 均带主体与范围。
- 模拟器内部标识（plan id、event id）明确标注为模拟器内部标识。

## 4. 领域模型设计（Phase 1 冻结）

### 4.1 任务与任务实例

- `ReprocessingTaskDefinition`：`taskId`、`label`、`layer`（`ods / dwd / dws / ads /
consumer`）、`programVersion`、`reads` / `writes`（表 + 分区列）、`dependsOn`
  （调度依赖）、`sideEffects`、`businessDateParam`、备注。
- `ReprocessingTaskInstance`：`instanceId`、`taskId`、`businessDate`、`partition`、
  `state`、`attemptLogs`、`stopReason`、`failureReason`。
- **血缘与调度依赖分开建模**：`reads/writes` 表达 SQL 血缘；`dependsOn` 表达实际
  Job / Plan 调度依赖。影响分析取并集并去重，两类边都可以单独展示与断言。

### 4.2 运行状态

实例状态集合：`waiting / ready / running / stopping / stopped / success / failed /
blocked / skipped`。状态含义与 `docs/TERMINOLOGY.md` 一致：

- 停止是显式过程（`running → stopping → stopped`），停止后进入 `waiting`；
  "确认停止 / 副作用处置"作为日志事件与字段，不省略。
- `waiting` 表示输入或依赖尚未满足，不等于失败；`blocked` 表示门禁不允许继续。
- 重做失败保持 `failed`，与正常生产故障同语义；不引入专题私有失败状态。

### 4.3 影响分析与集合

`analyzeImpact(sourceInstanceId)` 输出：

- `affectedInstances`：血缘闭包 + 调度依赖闭包，按 (taskId, businessDate, partition)
  去重；包含 LEFT JOIN 下游即使结果未变化。
- `redoInstances`：受影响且已执行（success / failed）的实例 → 必须重做。
- `waitingInstances`：受影响且未首次执行的实例 → 等待依赖，不标"已重做"。
- `stopRequiredInstances`：受影响且 running / ready 的正常调度实例 → 先停止。
- `notifyConsumers`：受影响的消费方清单。
- `impactEvidence`：每条影响边为什么被纳入（血缘边 / 调度边 / 分区匹配），供解释面板。

### 4.4 门禁与互斥

- `OdsValidationGate`：`validated`（修复 + 验证通过）、`checks[]`、`blockedReason`。
  只有 `validated === true` 才允许依赖链重做开始。
- `mutualExclusion`：受控任务或冲突写入同时处于 normal 与 redo 运行计划时拒绝启动；
  纯函数返回可解释原因。无关链路不被误停。
- 重做任务的失败按正常生产失败处理：`failed` + 日志 + 重试策略沿用生产语义。

### 4.5 ODS 二次修复

- 输入新的验证结果后，重新计算影响集合；对受波及的 `success` 实例：
  `success → waiting`（清空当前成功状态）并记录日志；未受波及的成功状态保留。
- 历史日志追加而非覆盖；日志只使用时间戳顺序，不使用轮次编号。

### 4.6 当日与历史模式

- `mode: 'current' | 'historical'`。
- 当日：继续沿现有正常 Job / Plan 的实例与状态推进；当日批次可跨自然日。
- 历史：读取 `currentBatchGate`（当前日切所有任务是否结束）。未结束 → 拒绝历史重做并
  给出阻断原因；结束后生成 `ParallelPlan`（模拟器内部标识）：
  - 绑定 `businessDate`（历史日期）；
  - 复制当前有效血缘 / 依赖，使用**最新程序版本**；
  - 与当前正常 Job / Plan 隔离：不修改当前实例状态，不重置当日成功状态。

### 4.7 版本边界

- `evaluateVersionCompatibility(programVersion, targetDate, changeType)`：
  `compatible` → `allowed`；`schema-breaking / semantics-changed / major-refactor /
input-contract-changed` → `forbidden`，并给出转专项修复的 required action。
- 平行 Job 永远选用最新程序；不存在"用历史程序重做"的教学分支。

### 4.8 下游消费闭环

- `ConsumerRecord`：`kind: 'load' | 'interface' | 'file' | 'report' | 'regulatory'`、
  `consumedVersion`、`consumedNewVersion`、`requiredAction: none | reload | refresh | correct`、
  `confirmation: pending | confirmed`。
- 数仓 SUCCESS 后仍要按消费证据判断：已消费旧版本 → 需要重装 / 刷新 / 更正；
  通知与确认跟踪构成闭环；未确认不得声称消费端恢复。

### 4.9 滚动多日

- `RollingBackfill`：`dates[]`（如连续 7 日）、`order`（安全执行顺序）、
  `crossDayReuse`（哪些结果可复用）、`snapshotNotes`（余额快照跨天语义）。
- 展示"为什么不能简单并行"：T-1 的快照 / 余额类结果会被 T 依赖；跨天实例映射与
  当日生产状态隔离。

## 5. 实验室交互设计

所有模式遵循 `docs/DIAGRAM_VISUAL_GRAMMAR.md` §7.4 Interaction Quality 原则：
明确教学目标、`Input → State Transition → Observable Result → Explanation / Evidence`、
结果诚实可复核、主要反馈靠近操作、渐进披露、移动端与可访问性底线。

- **E1 事故时间线**：推进时间线（step player，无 timer），观察 ODS 不完整 → DWD / DWS /
  ADS 已运行的污染传播路径与已装入下游的证据；输出当前事故结论与下一步。
- **E2 影响范围**：选择源实例（ODS 分区）后，联合血缘 / 调度 / 分区计算并展示
  影响闭包、去重后的重做清单与四类集合（停止 / 重做 / 等待 / 通知）；点击节点可看
  纳入原因，拒绝纳入的节点给出排除原因。
- **E3 止损与重做**：操作"停止运行中任务 → 确认停止 → WAITING → 验证 ODS → 自动
  依赖调用 → 普通失败 → ODS 二次修复重新入队"，状态与日志逐事件变化；互斥冲突可复现。
- **E4 当日 / 历史**：切换模式与业务日期；当日未完时门禁明确阻断；完成后生成平行
  Job / Plan，并显示当前正常状态未被修改。
- **E5 版本边界**：切换变更类型（兼容 / 表结构破坏 / 语义变更 / 重大重构），给出
  是否允许的历史重做判定与替代路径。
- **E6 下游闭环**：勾选 / 观察消费者证据，生成重装动作与通知确认清单，
  对比"数仓 SUCCESS"与"消费端恢复"。

A7 / A8 模式沿用同一状态模型：A7 聚焦多日顺序与跨天复用，A8 输出平台设计要素对照
（真实经验 vs 演示架构）。

交互要求：移动端 390 / 320 可操作、无横向溢出；键盘可达、状态有可读反馈；
reduced-motion 下不依赖动画表达状态；不新增 storage key。

## 6. 测试与验收矩阵

#221 要求的测试场景与测试落点（Phase 1 起逐步实现）：

| #   | 场景                            | 测试落点                                    | 相关文章 |
| --- | ------------------------------- | ------------------------------------------- | -------- |
| 1   | LEFT JOIN 全覆盖                | `dependency-reprocessing-impact.test.ts`    | 14-2     |
| 2   | 多支汇合去重                    | `dependency-reprocessing-impact.test.ts`    | 14-2     |
| 3   | 停止运行任务并互斥              | `dependency-reprocessing-stop-redo.test.ts` | 14-3     |
| 4   | ODS 验证门禁                    | `dependency-reprocessing-stop-redo.test.ts` | 14-3     |
| 5   | 二次 ODS 修复重置受影响 SUCCESS | `dependency-reprocessing-stop-redo.test.ts` | 14-3     |
| 6   | 正常失败保持已成功上游          | `dependency-reprocessing-stop-redo.test.ts` | 14-3     |
| 7   | 当前日切跨自然日                | `dependency-reprocessing-history.test.ts`   | 14-4     |
| 8   | 历史日切未完阻断                | `dependency-reprocessing-history.test.ts`   | 14-4     |
| 9   | 平行 Job / Plan 日期与依赖      | `dependency-reprocessing-history.test.ts`   | 14-4     |
| 10  | 最新程序与重大重构禁止          | `dependency-reprocessing-history.test.ts`   | 14-5     |
| 11  | 下游已装载旧版本需重装          | `dependency-reprocessing-history.test.ts`   | 14-6     |
| 12  | 滚动七日影响日期                | `dependency-reprocessing-history.test.ts`   | 14-7     |

每个文章 / 实验 PR 另外必须通过：

- focused Vitest + 新增 UI 结构契约（React DOM 断言，避免只测文案）；
- `npm run check`、`npm run lint`、`npm run format:check`、`npm run build`；
- 相关既有 E2E（roadmap / learn-navigation / smoke / search）与新增专题 E2E；
- 中文 PR 含：背景与关联 Issue、修改内容、核心实现、验证命令与实际结果、
  风险与回滚方式、交互验证说明。

## 7. 子 Issue 计划

| 阶段      | 子 Issue                       | 依赖                       |
| --------- | ------------------------------ | -------------------------- |
| Phase 0   | #229（本文档）                 | —                          |
| Phase 1-A | #230 影响分析内核              | #229                       |
| Phase 1-B | #231 止损 / 等待 / ODS 门禁    | #229、#230                 |
| Phase 1-C | #232 历史 / 版本 / 下游 / 滚动 | #229、#230、#231           |
| Phase 2-A | #233 第 14 章脚手架 + A1 + E1  | #229、#230                 |
| Phase 2-B | #234 A2 + E2                   | #229、#230、#233           |
| Phase 2-C | #235 A3 + E3                   | #229、#231、#233           |
| Phase 3-A | #236 A4 + E4                   | #229、#232、#233           |
| Phase 3-B | #237 A5 + E5                   | #229、#232、#233           |
| Phase 3-C | #238 A6 + E6                   | #229、#232、#233           |
| Phase 4-A | #239 A7                        | #229、#232、#236           |
| Phase 4-B | #240 A8 + 集成收口             | #229、全部 Phase 2/3、#239 |
| Phase 5   | #241 总体验收与收口            | 全部                       |

交付纪律：全局开发并发数为 1，同一时间只推进一个子 Issue；每个子 Issue 独立
branch / worktree，PR CI 通过并合并后才进入下一个；不伪造测试或线上证据，
遇到真实阻塞时回写 Issue 并标记 BLOCKED。

## 8. 风险与回滚

| 风险                             | 处理                                                                   |
| -------------------------------- | ---------------------------------------------------------------------- |
| 计数契约测试随课程增加而反复失败 | 每个文章 PR 同步更新 README 与全部计数契约测试；不做绕过               |
| 新 kind 引入 CSS / 首屏体积增长  | 懒加载组件 + 课程专属 CSS；对照普通课程 initial JS 基线记录增量        |
| 生产语义被写成"平台既有机制"     | 设计文档 + 术语自查；模拟器标识显式标注；review 对照 #221 §5           |
| 与英文专题轨 / 其他开放 PR 冲突  | 文件级检查：本专题只动第 14 章与专题 feature 文件，不改第 05/07 章正文 |
| 交互在移动端不可用               | 专题 E2E 覆盖 390/320 × light/dark、键盘与 reduced-motion              |

回滚：每个 PR 可独立 revert；第 14 章与专题 feature 不构成既有课程依赖，
revert 后既有 56 节课程与路线图校验保持通过。

## 9. Non-goals

- 不接入真实银行生产数据、调度集群或线上任务停止 / 重跑。
- 不实现真实下游自动通知或监管更正。
- 不改造线上数仓调度器，不重构站点架构，不引入新后端。
- 不把历史补数做成完整商业 SaaS。
- 不新增 Canonical 业务实体；不改既有第 01–13 章正文（仅新增互链所必需的引用时，
  单独小 PR 并在 PR 中说明）。
- 不为"覆盖率"给每节课强加交互；不为专题扩展 #119 已冻结的 Step Kernel primitive。
