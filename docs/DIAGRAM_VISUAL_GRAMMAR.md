# 数仓图解视觉语法

> Issue #95 · Phase 1 Audit / Specification
>
> 本文是设计审计与规范，不是实现说明。Phase 1 不修改业务代码、CSS、课程内容、交互行为，也不实现 Pilot。

## 1. 结论摘要

sql.sb 目前已经有一套内容丰富的交互式教学实验，但“图解”不是单一渲染形态：同一个课程单元可能同时使用流程、表格、时间轴、选择器、证据面板和局部关系图。Phase 1 的结论是：

1. **不建立一个统一画布或 Diagram Engine。** 应统一技术关系的语义和状态表达，保留每章的布局、隐喻和交互节奏。
2. **Diagram Type 收敛为 8 个主类型：** `Flow`、`Architecture`、`Layer`、`Schema`、`Dependency`、`State`、`Timeline`、`Comparison`。`Data Flow / Process` 是 `Flow` 的两个变体；`Architecture / Integration` 是 `Architecture` 的两个关注点；`State / Flow` 不再作为独立的混合类型。
3. **表格、矩阵、证据抽屉和 Detail 面板是辅助视图，不是新的 Diagram Type。** 当表格比连线更清楚时，应明确选择表格，而不是强行画图。
4. **颜色不能同时承担 Layer、Focus 和 State。** Layer 主要由文字、顺序和空间表达；State 由稳定文字 / 图形表达，颜色仅作辅助；Accent 只给当前教学焦点和少量关键差异。
5. **连接线需要关系类型。** 数据 / 加工、控制依赖、交付、可选关系、字段派生和证据关联不能共用同一套虚线或同一种强调方式。
6. **Overview → Detail 是复杂实验的默认拆解方式。** `LineageGraph`、`SchedulerRunSimulator`、`CapstoneWorkbench` 不应通过缩小字体维持一张高密度总图。
7. **Pilot 选取三个差异明显的候选：** `BusinessSystemFlow`、`LineageGraph`（包含 teaching 与 legacy 分支）、`LakehouseArchitectureLab`。在 Pilot 前不抽取共享 primitive。

## 2. 审计范围与证据

### 2.1 盘点范围

基于 `origin/main`（commit `8d5f9f5a9124f36c2814683c3238e1e8d5b85a86`）及 Issue #95 工作树审计：

- `src/components/visualizations/`：**33 个 TSX 文件**。
  - `LessonSectionRenderer` 当前直接装配 27 个课程组件名；其余包括 `LineageTeachingLab`、`ModelingPerspectiveSwitcher`、`PerformanceLabShared`、性能子实验等共享 / 分支辅助组件。
  - `HeroDataFlow` 是首页 Hero 实验，不属于 typed lesson section，但纳入补充审计。
- 课程内容：**43 个 lesson 文件、54 个 `kind: 'visualization'` typed sections**。
  - 其中 `data-governance` 有 5 个、`data-service` 有 5 个、`lakehouse` 有 4 个 section；其余 lesson 各有 1 个。
  - `legacy-scheduling-system` 的 1 个 section 仍保留 legacy 调度内容，单独标记，不把它误并入新的章节主线。
- 运行与装配：`src/content/types.ts`、`src/components/lesson/LessonSectionRenderer.tsx`、`src/content/lessons/index.ts`、`src/data/course.ts`、`src/components/visualizations/index.ts`。
- 样式与主题：`src/styles/tokens.css`、`themes.css`、`components/shared-lesson.css`、`components/visualization-compact.css` 以及各 lesson stylesheet。

### 2.2 现状判断

当前系统已有值得保留的基础：

- `tokens.css` 已有 foundation、info / success / warning / danger、交互和 dark theme token；兼容别名让旧 lesson stylesheet 可以继续工作。
- `LessonSectionRenderer` 已经允许一个 lesson 组合 narrative、compare、SQL、visualization、takeaway、engineering note 和 pitfall；这支持 Overview 与 Detail 分开，而不是所有内容塞进图面。
- 大多数实验保留了文字状态、`aria-live`、表格 caption、按钮语义和重置入口；这说明视觉语法可以服务于现有交互，而不需要把 Lab 静态化。
- `LineageGraph` 已有 SVG connection layer、节点选择、direct / transitive impact、evidence drawer 和 investigation path，是研究连接语义的高价值样本。
- 多处已经使用 `@container visualization`，但同时存在 viewport media query、lesson-specific breakpoint、不同的网格降级和局部硬编码颜色；因此响应式和语义仍未形成跨课约定。

当前主要问题不是缺少视觉，而是**相同的技术概念在不同组件中由不同的颜色、箭头、卡片形状、虚线和动画表达**。审计结论不要求这些差异立即消失，只要求区分“概念语义”和“课程隐喻”。

## 3. Diagram Type 选择规范

### 3.1 最小类型词汇

| 规范名称 | 包含的现有候选 | 首要回答的问题 | 不应承担的问题 |
| --- | --- | --- | --- |
| **Flow** | Data Flow、Process | 数据 / 对象 / 工作如何从起点经过步骤到达结果？ | 多个系统边界的完整架构取舍、复杂影响分析 |
| **Architecture** | Architecture、Integration | 哪些系统、平台能力、消费者和责任边界如何协作？ | 仅仅表示一串加工步骤 |
| **Layer** | Layer Stack | 每一层承担什么职责，为什么要沉淀或复用？ | 把层名当成固定行业标准 |
| **Schema** | ER、Schema、Grain | 一行、表、字段、键、事实与维度如何组织？ | 运行时序和事故传播 |
| **Dependency** | Dependency Graph、Impact Analysis | 什么依赖什么，改变 / 失败后哪些对象会受影响？ | 把依赖自动解释成业务因果 |
| **State** | State / Flow | 对象有哪些状态，什么事件让它转移，当前能否继续？ | 只用颜色呈现状态，或把时间先后当成状态 |
| **Timeline** | Timeline | 业务日期、到达时间、版本、事件和运行如何在时间上对齐？ | 把连续时间轴当作任意流程箭头 |
| **Comparison** | Architecture Comparison、Before / After | 在相同输入或约束下，两个或多个方案差异和取舍是什么？ | 给架构方案伪造一个单一总分 |

**辅助视图：** `Table / Matrix`、`Evidence`、`Detail Panel`、`Choice / Decision` 不单独扩展 Diagram Type。它们可以作为任意主类型的辅助视图；如果一个 section 的教学目标主要是字段定义、规则证据或候选判断，应直接声明为辅助视图优先。

**Composite 不是第九种类型。** `CapstoneWorkbench` 是由多个 checkpoint 组成的教学编排：每个 checkpoint 仍应声明自己的 Flow、Schema、State、Dependency、Timeline 或 Comparison 角色。

### 3.2 选型规则

1. 先把教学问题写成一句话，例如“数据从哪里来？”、“DWD 失败会影响谁？”或“同一个 customer 在某个时间点是什么状态？”；这句话比组件名称优先。
2. 选择一个主类型；只有当第二个视图解决不同且必要的问题时，才添加一个轻量辅助类型。
3. `Flow` 用于方向和顺序，`Dependency` 用于依赖与影响，`Timeline` 用于时间对齐；不要因为都有箭头就混成一种图。
4. `Architecture` 只有在系统 / 运行环境 / 消费者 / 责任边界本身是教学对象时才使用；普通的 Source → DWD → ADS 不需要额外包成 Architecture。
5. 如果主要问题是字段值、粒度、证据、规则或前后表快照，优先用 `Schema` / `Table` / `Evidence` Detail，而不是堆节点。
6. 当主图超过可读复杂度时，先拆 `Overview → Detail`，再考虑隐藏次要信息；不通过缩小字号或降低连接对比度来“容纳”更多对象。
7. 空间邻接已经清楚表达的顺序不重复画线。线只表达空间本身无法表达的关系。

## 4. 最小 Visual Grammar

### 4.1 Node

Node 是一个可被学习者单独理解、定位、选择或比较的概念，不是所有装饰性文字都要做成节点。

| Node 角色 | 典型对象 | 最小标识 | 说明 |
| --- | --- | --- | --- |
| `entity` | Source、System、Table、Field、Task、Metric、Consumer | 名称 + 类型 / 作用 | 能独立回答“它是什么” |
| `stage` | Transformation、Check、Checkpoint、发布步骤 | 顺序 + 动作 + 输出 | 过程节点必须说明动作，而不只是编号 |
| `decision` | 口径选择、重跑方式、Release 决策、Owner 动作 | 选择条件 + 结果 | 选择项不是普通装饰卡片 |
| `state` | queued、running、SUCCESS、FAILED、BLOCKED | 稳定文字或符号 | 只在状态转移是教学目标时作为节点 |
| `evidence` | Quality Event、SQL 证据、任务记录、快照 | 来源 + 状态 + 时间 / 分区 | 证据不是根因，不应被画成已证实结论 |

Node 默认至少包含：名称、角色 / 类型、与当前教学问题相关的一条说明。数字、箭头标签、caption、legend 和操作提示不自动升级为 Node。

### 4.2 Layer

Layer 表示有顺序的抽象或职责，不表示固定颜色或固定缩写。推荐使用“职责 + 可选本课名称”的方式：

- 输入 / 来源（source / input）
- 落地 / 保留来源事实（landing / raw-preserving）
- 明细 / 稳定加工（detail / curated detail）
- 汇总 / 主题结果（aggregate / subject result）
- 服务 / 发布（serving / published）
- 消费 / 决策（consumer / decision）

课程可以继续使用 `ODS / DWD / DWS / ADS`、`Lake / Warehouse`、`Task / Metric` 等领域名称，但必须在文字中说明本课语义。不要因为 Layer 需要区分而给每层分配一套色相；层的主要编码是顺序、标题、边界和职责。

### 4.3 Zone

Zone 是有真实边界的范围，至少要满足以下一个条件：所有权、运行环境、数据管理 / 计算边界或消费边界发生变化。典型 Zone：

- 业务系统区 / 数据平台区 / 消费者区；
- Lake / Warehouse / Shared Table；
- 生产团队 / 治理团队 / 消费团队；
- 当前转换区 / 上游来源区。

普通的卡片网格、为了排版而加的容器或同一责任范围内的标题分组不称为 Zone。Zone 优先使用背景、边框、标题和留白表达，不能只靠一条跨越全图的颜色带暗示。

### 4.4 State

State 必须用稳定文字或符号可读，颜色只作辅助。基础状态族：

- `idle / waiting`：尚未开始或等待依赖；
- `active / running`：当前正在处理；
- `success / ready`：已完成并满足继续条件；
- `warning / partial / quarantine`：有边界或已隔离，不能默认为成功；
- `failure / blocked`：失败或被闸门阻断；
- `selected / affected`：这是教学关注状态，不是业务运行状态，应与上面状态分开编码。

状态转移要标明触发事件或条件，例如 `Quality FAILED → Release BLOCKED`；不要把 `teal = 完成` 当作全局规则，因为现有代码中 teal 也同时被用作连接、Layer、选中和说明色。

### 4.5 Focus

一张图只保留一个主要 Focus，可有少量上下文 Focus：

1. `primary`：当前选中节点、当前阶段、当前候选或当前时间点；
2. `path`：围绕 primary 的数据路径、依赖路径或影响传播路径；
3. `context`：与 primary 直接相关的邻居；
4. `muted`：只降低装饰性或非当前问题信息的权重，不隐藏仍需理解的关系。

Focus 不创造新的业务关系：影响传播应在原有数据 / 依赖连接上提升权重，而不是用另一种没有图例的线代表“影响”。页面应同时提供文字摘要、`aria-live` 或 Detail，使 Focus 不依赖颜色、移动或闪烁才能被理解。

## 5. Connector Grammar

### 5.1 最小关系集合

| 关系 | 视觉建议 | 方向 | 标签要求 | 语义边界 |
| --- | --- | --- | --- | --- |
| `data / transform` | 高可读实线、明确箭头 | 生产者 → 派生数据 / 消费者 | 只有加工动作不明显时标注 `filter / join / aggregate` | 表示数据来源或字段派生，不自动表示业务因果 |
| `control / dependency` | 与数据线可区分的长虚线箭头 | 前置任务 / 条件 → 被放行任务 | 跨层或容易误读时标注 `depends on / waits for` | 表示运行资格或控制先后，不表示数据从哪里来 |
| `delivery / publish-consume` | 穿越发布边界的实线或带契约端点的连接 | 已发布资产 → 受控消费者 | 需要标注 `publish / report / file / API` 之一 | 表示交付契约，不代表消费者可以直接访问内部表 |
| `optional / asynchronous` | 点线或开放端点箭头 | 可能到达 / 异步输入 → 等待方 | 必须有文字 `optional / async / late` | 只表示关系本身可选或异步，不表示证据不确定 |
| `field derivation` | 只在字段 / 局部 Detail 中使用紧凑箭头 | 输入字段 → 输出字段 / 操作 | `rename / SUM / JOIN / FILTER` 等动作应写出 | 不把字段级细节扩散到表级总图 |
| `evidence association` | 低权重关联线、括号或 Detail 引用 | 证据记录 ↔ 被支持的关系 | 标注证据来源与 `confirmed / pending` | 证据支持关系，不宣布 Root Cause |
| `focus overlay` | 保留原连接类型，只提高对比度 / 宽度 / 端点 | 不改变原方向 | 可在旁边加“当前路径 / 直接下游” | 不是新的关系类型，避免把所有高亮线误读成数据线 |

**重要区分：** `pending / inferred` 是证据状态，不等于 `optional / asynchronous`。待确认的边仍应保留其原关系类型，并附确认状态；不能因为状态 pending 就统一画成虚线。

### 5.2 方向、几何和标签

- 数据方向始终遵循真实的生产 / 派生 / 消费方向；影响分析仍从变更起点向下游展示，不用反向箭头制造“影响来自下游”的错觉。
- 控制依赖从前置条件指向被放行任务；如果教学要问“谁在等待”，用文字说明，不反转箭头。
- 线性 Flow / Process 默认使用直线或正交线；Dependency Graph 默认优先正交路由，只有局部拓扑确实需要时才使用曲线。
- Node 连接点应按输入 / 输出侧分配；同一边缘多条线拥挤时，拆分边、使用边缘汇聚点或进入 Detail，不把多条关系压在一个像素点上。
- 交叉不可避免时，优先拆 Overview 与 Detail；若必须保留，使用清楚的跳线 / 遮挡规则和图例，不能依靠线宽猜测前后关系。
- 连接标签只在关系不能由方向、空间或图例唯一推断时出现。标签靠近关系中点并带不透明背景，不覆盖 Node、焦点环或另一条线。
- 如果顺序、同一 Zone 内的列布局或表格行已经充分表达关系，则省略连接线；省略后必须仍能读出方向和边界。

### 5.3 当前实现的连接问题

现有组件混用 `→ / ↓ / ↔` 字符、CSS 伪元素、HTML connector、SVG `<line>` 和 timeline rail。它们都可以保留，但后续实现应给连接加语义级数据 / class，而不只依据视觉位置：

- `LineageGraph` 已有 `relation`、`evidence`、direct / transitive class，是最适合验证的样本；
- `SchedulerRunSimulator` 的 Task Dependency 不应复用 Lineage 的 Data Dependency 视觉；
- `BusinessSystemFlow`、`PipelineFlow` 和 `ReportMetricJourney` 的主路径可以共用 Flow 语义，但不需要共用同一布局；
- `LayerEvolutionLab` 中“汇集”和“复用”是有业务含义的连接标签，不能退化成无意义的装饰箭头；
- Lakehouse 的“复制 / 同步”和“共享基础能力”必须用不同关系和 Zone 边界表达。

## 6. 信息密度与 Overview → Detail

### 6.1 密度预算

每个视图应先确定：

- 一个主要教学问题；
- 一个主要 Focus；
- 最多一条主要关系路径；
- 当前问题所需的 Node、State 和结果；
- 其余内容进入 Detail、表格、证据抽屉或下一步。

下列内容不应同时争夺同一图面焦点：完整 SQL、全量字段表、所有统计数字、完整证据链、所有下游节点和操作说明。`LineageGraph` 和 `CapstoneWorkbench` 目前已经显露出组合内容需要拆分的边界；这是信息架构问题，不是继续缩小卡片的问题。

### 6.2 Overview → Detail 规则

1. Overview 只显示关系、方向、层 / Zone、当前状态和必要标签。
2. 选择 Node / Stage / Edge 后显示 Detail：字段、SQL、证据、计数、时间或决策说明。
3. Detail 不改变 Overview 的关系含义；关闭 Detail 后，学习者仍能理解主问题。
4. 多分支影响先显示直接下游，再按步骤显示传递影响；不要在提交预测前全部点亮。
5. 表格、时间轴和证据列表可作为 Detail，不必强行画入 Overview。
6. 当可读 Node 数量、分支数或独立语义超过一个视图能复述的范围时，提供子视图选择器；不要仅使用 opacity 隐藏关键对象。

### 6.3 现有重复模式

- 多数 Lab 都使用“圆角卡片 + 选中边框 + 一段说明”，但卡片是否代表 Node、Choice、Evidence 或 Detail 由局部 class 猜测。
- `is-selected`、`is-active`、`is-related`、`is-affected`、`is-done` 在不同 lesson 中有不同权重；后续应把“交互选中”和“业务状态”分开。
- `LineageGraph` 的 direct / transitive 影响已经有清晰的教学拆分；teaching wrapper 则使用垂直 flow、候选卡和证据面板。两者应共享语义，不应被迫共享画布。
- 表格和时间轴通常比全图更适合回答 Grain、Metric、SCD 和性能前后对照；这些实验不需要被改造成节点图。

## 7. Diagram Semantic Tokens

### 7.1 现有基础与问题

`src/styles/tokens.css` 已提供以下可复用层：foundation（surface、border、text）、info、success、warning、danger、interactive、focus、motion，以及兼容别名 `--surface`、`--line`、`--blue`、`--teal`、`--amber`。dark theme 也已有对应语义值。

但 Diagram 角色尚未独立：

- `--blue` 既表示交互焦点、当前处理、DWD / Task 标签，也被当作一般强调色；
- `--teal` 既表示成功、完成、连接、共享层、发布可用，又表示某些普通标签；
- `--amber` 既表示 warning、DWS、调查候选和风险；
- `star-schema.css`、`banking-modeling.css`、`scd.css`、`sql-workbench.css` 等仍有局部 hex / rgb 或 fallback literal；部分 ADS / metric 标签使用历史紫色；
- `success-bg` / `success-border` 常被用于“选中”或“架构强调”，这不一定代表业务成功。

Phase 1 不修改 `tokens.css`，只提出下面的语义层供 Pilot 验证。

### 7.2 建议的 Diagram 角色

| 建议角色 | Phase 2 初始映射建议 | 使用范围 |
| --- | --- | --- |
| `--diagram-bg` | `var(--demo-bg)` 或经验证的 `--canvas` | 图面 / 实验工作区背景 |
| `--diagram-surface` | `var(--surface-1)` / `var(--surface)` | Node、Detail、证据卡 |
| `--diagram-surface-subtle` | `var(--surface-2)` / `var(--surface-muted)` | 非焦点区域、表头、辅助区 |
| `--diagram-border` | `var(--border)` / `var(--line)` | 普通边界 |
| `--diagram-border-strong` | `var(--border-strong)` / `var(--line-strong)` | 连接、分区、键边界 |
| `--diagram-text` | `var(--text-primary)` / `var(--ink)` | Node 与主要说明 |
| `--diagram-muted` | `var(--text-muted)` / `var(--ink-muted)` | 次要说明、等待状态 |
| `--diagram-accent` | `var(--interactive)` / `var(--blue)` | 当前教学焦点、交互选择 |
| `--diagram-accent-soft` | `var(--info-bg)` / `var(--surface-blue)` | Focus 背景和浅色选择态 |
| `--diagram-connection` | `var(--border-strong)` | 默认连接 |
| `--diagram-connection-muted` | `var(--border)` | 非焦点连接、上下文关系 |
| `--diagram-success` | `var(--success-text)` / `var(--teal)` | 真实完成、可发布、已确认 |
| `--diagram-warning` | `var(--warning-text)` / `var(--amber)` | 迟到、部分、风险、待处理 |
| `--diagram-danger` | `var(--danger-text)` / `var(--danger)` | 失败、阻断、明确数据异常 |

`--diagram-info`、`--diagram-focus-ring` 或按关系拆分的 connection token 只有在 Pilot 证明现有角色不足时才新增。Token 名称描述语义，不描述 blue / green / purple 等色相。

### 7.3 Light / Dark 约定

- Light / Dark 只在语义 token 层切换，lesson 不再为同一技术角色复制一套颜色。
- Layer 不靠色相区分；用 Layer label、顺序、Zone 边界和 Node 说明区分。
- `accent` 只用于 Focus；普通 Node、连接和说明使用中性 token。
- `success / warning / danger` 只能用于确实存在的运行、质量、风险或发布状态，并配合文字 / 图形。
- 连接线在 dark theme 中不能直接复用浅色低对比 hex；必须验证普通、焦点和 disabled 关系的对比度。
- 后续验收至少检查：普通文字 4.5:1、较大文字 3:1、非文字 UI / 关系边界 3:1；不能只在一个主题截图确认。

### 7.4 后续迁移判断

Pilot 前不做全仓 token 迁移。Pilot 后只有同时满足以下条件的角色才值得抽取 primitive：

- 在三个 Pilot 中都出现；
- 名称和使用边界可以用一句话说明；
- Light / Dark 不需要组件特例；
- 不会把课程独特隐喻误收敛成共享 API；
- 能通过文字 / 图形保持可访问性，不依赖颜色。

## 8. Motion Grammar

### 8.1 动效的允许目的

Motion 只在它帮助理解以下一种关系时使用：

- **顺序：** 阶段 / 步骤按什么顺序发生；
- **因果：** 选择如何改变结果；
- **状态：** waiting → running → success / failure；
- **传播：** 故障、字段变化或影响如何到达下游。

静态图必须已经包含完整语义；动画不能是唯一的箭头、状态或结果。纯装饰性的循环、弹跳、粒子或无因果数字滚动不进入共享规范。

### 8.2 动效契约

每个交互动画都应能回答：

1. 触发者是什么（点击、提交、时间推进、故障注入）；
2. 影响哪个 Node / Connector / State；
3. 最终静态状态是什么；
4. 动画中断、重复点击和重置如何处理；
5. `prefers-reduced-motion: reduce` 下如何直接展示同一信息。

当前代码中已经有可复用的行为样本：`BusinessSystemFlow` / `PipelineFlow` / `HeroDataFlow` / `SchedulerRunSimulator` / `LineageGraph` 使用定时器或 RAF 推进过程；多个 lesson CSS 使用 reveal / pulse；部分组件会清理 timer。后续规范应保留这些教学行为，但统一“状态先可读、动画后增强”的约束。

### 8.3 Reduced motion

- `reduce` 下跳到最终状态或逐步状态的静态结果，不隐藏节点、证据、方向或数值。
- 影响传播可改为一次性显示完整路径，并保留“直接下游 / 传递影响”的文字。
- 动画状态变化使用 `aria-live` 或稳定的当前状态文本；不要以颜色闪烁作为通知。
- 所有 JS timer / RAF 都必须可取消；组件卸载、重置、切换场景时不能留下旧回调。
- 当前 reduced-motion 覆盖分布在 shared / quality / service / governance / lineage / scheduler / SQL / performance 等样式与若干 JS 分支，仍有 lesson-specific reveal / pulse 没有一致的语义检查；Phase 2 需以 Pilot 建立最小测试清单。

## 9. Responsive Grammar

响应式先按图形语义选择策略，再选择 breakpoint。优先使用 visualization container 宽度，不把课程壳层的 viewport 宽度当成唯一依据。

| 图形族 | 窄容器策略 | 必须保留 | 可以降级 |
| --- | --- | --- | --- |
| Linear Flow / Process | 横向变纵向，箭头旋转为垂直；阶段仍按原顺序 | Node 顺序、方向、动作、当前状态、主结果 | 重复说明、非关键统计 |
| Layer / Architecture | 先压缩并列列数，再纵向堆叠；Zone 标题仍可见 | 层职责、边界、主路径、选择结果 | 装饰性图标、重复副标题 |
| Schema / Star / Dependency | 不把空间关系无限缩小；选择 Overview → Detail、局部横向滚动或可读重排 | Node 名称 / 类型、连接方向、键 / 关系、Focus、结果 | 非焦点证据、次要标签 |
| Table / Matrix | 只在表格本身有教学价值时使用局部 `overflow-x`；禁止页面级横向滚动 | 列标题、行身份、选中 / 结果、caption | 解释性重复文字 |
| Timeline | 保留顺序和时间点；时间点过多时局部滚动或滑块 + 当前 Detail | 时间语义、当前点、事件 / 状态区别 | 非当前点的长说明 |
| Composite / Capstone | 先显示 checkpoint / 子视图选择，再显示一个阶段的 Detail | 当前 checkpoint、锁定 / 可用 / 完成 / 阻断、恢复入口 | 其他 checkpoint 的完整内部细节 |

当前实现已经有 shared compact CSS 和多个 lesson container query，但也有 760 / 680 / 620 / 480 等 viewport breakpoint 与 lesson-specific query 并存。后续不要求统一所有数值，而要求每个组件声明自己的“图形族 + 降级策略”。

响应式验收条件：

- 不产生页面级横向滚动；
- 主关系、方向、状态和结果在最窄目标容器仍可读；
- Focus 有文字 / 控件入口，不只依赖画布位置；
- 表格 / 时间轴的滚动范围局部可见；
- 复杂实验在必要时拆 Detail，而不是让所有 Node 缩成无法阅读的卡片。

## 10. 完整可视化盘点

### 10.1 盘点记法

下表覆盖 54 个 typed visualization sections。表中的语义字段是**规范映射**，不是要求当前代码立即改成统一 class。

- `N` = Node；`C` = Connector；`L` = Layer；`Z` = Zone；`S` = State；`F` = Focus；`M` = Motion。
- `T0` = 主要使用 foundation / 兼容别名（`surface / line / ink / blue / teal / amber`）；`T1` = 使用 info / success / warning / danger 等状态 token；`T2` = 存在局部 literal、历史 hue 或组件自有 token，需要 Pilot 后评估。
- `R1` = 线性纵向重排；`R2` = 选择 Detail / 局部滚动；`R3` = 表格 / 时间轴局部滚动；`R4` = 复合实验按子视图拆分。
- `P1` / `P2` / `P3` 是三个 Pilot 候选；`—` 表示不纳入 Pilot。

### 10.2 Intro、Modeling、Metric 与 Transformation

| # | Lesson / section · component | 主类型 + 辅助类型 | 教学问题 | N / C / L / Z / S / F / M | R · 当前 token / 语义问题 | Pilot |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `why-data-warehouse` · `BusinessSystemFlow` | Architecture + Flow | 两套业务系统如何汇合为一个经营结果？ | N=核心系统、信贷系统、Warehouse、输出；C=数据汇集 / 发布；L=source→warehouse→consumer；Z=业务系统 / 数仓 / 消费；S=phase 0–3、selected；F=选中来源与当前阶段；M=数据包进入、汇集、输出 | R1；T0+T1。`teal` 同时承担连接、完成和 Warehouse 强调，需改由关系 / 状态角色区分。 | **P1** |
| 2 | `warehouse-layers` · `LayerEvolutionLab` | Layer + Comparison | 下游变多时，哪些加工应沉淀为公共能力？ | N=source、shared stage、consumer；C=汇集 / 复用；L=来源→公共加工→消费；Z=各自加工区 / 公共加工区；S=direct / shared；F=需求数量与 shared architecture；M=切换需求导致结构重排 | R1；T0+T1+T2。shared / selected / success 背景有重叠，层语义不应依靠颜色。 | — |
| 3 | `warehouse-terms` · `WarehouseTermsLab` | Layer + Comparison（Table / Decision 辅助） | 一个术语在链路中回答哪个问题？ | N=术语卡、术语组、场景、答案；C=术语与场景的映射，不强制画线；L=位置 / 职责 / 做法分组；Z=术语词汇区 / 场景区；S=selected scenario；F=当前答案术语；M=无必要动画，选择后更新 Detail | R2；T0+T2。这是“分类 + 判断”，不是图解；历史局部视觉应保留为卡片 / 矩阵，不抽成 Node primitive。 | — |
| 4 | `data-modeling` · `LoanBusinessProcessLab` | Flow + Schema | “新增贷款”究竟对应哪个业务过程、对象和事件？ | N=Customer、合同 / 放款 / 还款 / 结清步骤、measure；C=业务时间顺序；L=customer→business event→measure；Z=贷款业务区 / 分析声明区；S=selected、confirmed；F=当前过程与度量；M=点击步骤 / 确认判断，不自动播放 | R1；T0+T1。选中与已确认都用强调，后续需区分教学 Focus 与决策 State。 | — |
| 5 | `grain` · `LoanGrainLab` | Schema + Flow | 一份合同为什么会在不同 Grain 上产生多行和错误金额？ | N=Grain option、表行、错误 / 修复模型；C=合同 Grain→Join→匹配 Grain；L=contract / loan note / repayment；Z=事实表 / Join / 结果；S=joined、calculated、fixed；F=当前 Grain 与错误步骤；M=逐步执行 SUM、修复模型 | R2+R3；T0+T1+T2。表格、步骤和状态有局部色相，需让 Grain / State / Focus 分离。 | — |
| 6 | `fact-table-types` · `BankingFactTypesLab` | Timeline + Schema | 事件、状态、生命周期分别如何表达一行和时间？ | N=fact type、milestone、sample row；C=生命周期时间推进；L=event / periodic state / accumulating lifecycle；Z=LoanNote / transaction / snapshot；S=selected、reached；F=事实形态与 milestone；M=点击 milestone 推进 | R2+R3；T0+T1+T2。三种事实用局部 modifier hue，颜色不应变成事实类型的唯一编码。 | — |
| 7 | `star-schema-and-grain` · `BankingStarSchemaLab` | Schema + Comparison | 字段如何归位，事实表如何通过键连接不同观察角度？ | N=source field、fact、dimension；C=字段归类、foreign-key spoke；L=事件 / 观察角度 / 度量；Z=事实表中心 / 维度区 / 字段 Detail；S=selected table、wrong→calculated→fixed；F=字段 board、当前表、错误步骤；M=错误模型逐步暴露 | R2+R3；T0+T1+T2。星拓扑使用历史紫色 / 局部 literal，需验证 dark 与非色觉可读性。 | — |
| 8 | `slowly-changing-dimension` · `BankingCustomerHistoryLab` | Timeline + State | 属性变化后，历史订单在时间点查询中应命中哪个版本？ | N=dimension version、order、change、time point；C=effective interval / JOIN；L=old version→new version→as-of result；Z=fact order / dimension history；S=initial、updated、historical、Type 1 / Type 2；F=mode 与当前时间点；M=update、启用 Type 2、timeline selection | R2+R3；T0+T1+T2。Type 1 / 2、当前版本和选中行视觉重叠，状态文字必须优先。 | — |
| 9 | `report-metric-journey` · `ReportMetricJourney` | Flow + Timeline | 报表上的 75% 如何追溯回两路源数据？ | N=source、warehouse steps、formula、report；C=数据流 / 公式加工；L=source→整理→计算→report；Z=core / credit / warehouse / report；S=selected step；F=当前旅程步骤；M=点击步骤切换 Detail，不需自动播放 | R1；T0+T1。步骤高亮与完成色应由 Focus 和 State 分开。 | — |
| 10 | `metric-system` · `BankingMetricScopeLab` | Comparison + Schema | 同一账户快照为什么会因统计集合不同而产生三个数字？ | N=scenario、account snapshot、result；C=filter→membership→sum；L=input snapshot→scope→metric；Z=全行 / 客户 / 产品 / 机构统计边界；S=selected scenario、empty result；F=当前 scope 与贡献行；M=无必要动效 | R2+R3；T0+T1。Info / selected / result emphasis 边界不一致，后续统一 Focus token。 | — |
| 11 | `deposit-metric-definition` · `BankingMetricDefinitionLab` | Process + Schema | 如何从指标名称逐步补成可复算定义？ | N=definition stage、field、definition card；C=name→time→scope→grain；L=名称→业务条件→可复算卡；Z=业务定义区 / 工程交接区；S=pending / complete；F=当前 stage 与待补字段；M=stage selection / panel reveal | R1；T0+T1。待补字段使用局部 pending 色，不应与 warning / failure 混用。 | — |
| 12 | `deposit-metric-derivations` · `BankingMetricDerivationLab` | Process + Comparison | 改变客户、产品、机构、币种或日期时，统计集合如何变化？ | N=filter choice、snapshot rows、metric result；C=条件→集合→结果；L=account snapshot→scope→metric；Z=controls / result / row Detail；S=selected、no-match；F=当前组合和贡献行；M=无必要动效 | R2+R3；T0+T1。大量 choice 的 selected 样式是交互 Focus，不应沿用 success 背景。 | — |
| 13 | `deposit-metric-time` · `BankingMetricTimeLab` | Timeline + Schema | “截至某天的状态”和“期间累计事件”分别需要什么事实？ | N=mode、date point、snapshot、transaction、result；C=时间点 / 时间段；L=state snapshot vs event stream；Z=状态事实区 / 交易事实区；S=as-of / period、included / excluded；F=mode、as-of date；M=时间 rail 选择 | R2+R3；T0+T1+T2。included / excluded 仍需文字，不能只靠行色；时间轴与表格需局部滚动。 | — |
| 14 | `sql-and-transformation` · `SqlTransformationWorkbench` | Process + Flow | 指标卡需要哪些输入表、字段和加工计划？ | N=input table、field、plan、output grain；C=字段依赖 / 加工路径；L=source→DWD→DWS→ADS；Z=计划区 / 快照区 / SQL Detail；S=focus mode、snapshot；F=当前 focus（plan 等）；M=切换 focus / 前后表快照 | R2+R3；T0+T1+T2。SQL code panel 有独立深色 literal，层 / 当前 focus 需拆语义。 | — |
| 15 | `sql-and-transformation-cleaning` · `SqlTransformationWorkbench` | Process + Evidence | 去重、缺失、异常值各留下什么可复核证据？ | N=raw row、anomaly、clean result、evidence；C=filter / clean / evidence；L=raw→stable detail；Z=input / quality evidence；S=anomaly kind、pass / fail；F=当前异常类型；M=切换样本 / Detail | R2+R3；T0+T1。异常色可以保留，但 evidence 与 failure 需要文字和来源。 | — |
| 16 | `sql-and-transformation-contract` · `SqlTransformationWorkbench` | Process + State | 一段加工如何交付给下一个环节？ | N=task、business date、partition、input/output contract；C=control handoff / data output；L=input→execution→output；Z=task contract boundary；S=missing / declared / valid；F=当前契约字段；M=字段补全，不需连续动画 | R2；T0。契约状态当前依赖文本与卡片，后续可用 State token，但不应变成流程图模板。 | — |
| 17 | `sql-and-transformation-join` · `SqlTransformationWorkbench` | Flow + Schema | 一对多 Join 如何改变结果行数和金额？ | N=left row、right row、join result、measure；C=one-to-many / duplicated measure；L=source tables→join→result；Z=事实 / 维度 / 结果；S=before / after、duplicated；F=join key 与放大结果；M=快照切换 | R2+R3；T0+T1+T2。重复金额的危险色与选中色需分离；表格优先于全图。 | — |
| 18 | `sql-and-transformation-layers` · `SqlTransformationWorkbench` | Layer + Flow | 从 DWD 到 DWS / ADS，一行发生了什么变化？ | N=layer snapshot、row、field、output；C=层间 transform；L=detail→aggregate→serving；Z=DWD / DWS / ADS；S=selected layer；F=当前层与行变化；M=切层 / snapshot update | R1+R3；T0+T1。层名和 Focus 颜色不能耦合；同一组件多个 focus 应共享一套语义。 | — |

### 10.3 Scheduling、Quality 与 Lineage

| # | Lesson / section · component | 主类型 + 辅助类型 | 教学问题 | N / C / L / Z / S / F / M | R · 当前 token / 语义问题 | Pilot |
| ---: | --- | --- | --- | --- | --- | --- |
| 19 | `legacy-scheduling-system` · `SchedulerRunSimulator` | Dependency + Timeline / State | 一个 DAG Run 中，迟到、失败、重试和重跑如何留下证据？ | N=task、attempt、run、partition、output；C=control dependency；L=ODS→DWD→DWS→ADS；Z=scheduler / data task / output；S=queued、waiting、running、success、retry、failed、skipped、SLA；F=场景、当前时钟、任务；M=时钟推进、retry / rerun propagation | R2+R3；T0+T1+T2。状态数量多，不能靠绿 / 红节点区分所有语义；这是 legacy 单独审计。 | — |
| 20 | `scheduling-business-date` · `SchedulerRunSimulator` | Timeline + Dependency | 凌晨运行的任务真正修改哪个业务分区？ | N=trigger、arrived、processing、business partition；C=时间事件 + control dependency；L=arrival→processing→partition output；Z=scheduler / business-date boundary；S=waiting / ready / running / done；F=business date 与 target partition；M=时间推进 | R2+R3；T0+T1。arrival date 与 business date 不能使用相同视觉标签。 | — |
| 21 | `scheduling-readiness` · `SchedulerRunSimulator` | Dependency + State | Task 何时真正获得运行资格？ | N=trigger、upstream task、input readiness、task；C=depends on / waits for；L=upstream→readiness→task；Z=event / scheduler；S=waiting、ready、running；F=启动方式与等待条件；M=切换策略、状态推进 | R2；T0+T1。控制依赖和数据到达当前都在同一 DAG 语境中，需用关系标签区分。 | — |
| 22 | `scheduling-failure` · `SchedulerRunSimulator` | State + Dependency | DWD 失败一次后，下游是等待、重试还是跳过？ | N=task、attempt、downstream、recovery；C=control dependency / retry path；L=DWD→DWS→ADS；Z=run / recovery；S=failed、retry、waiting、skipped、recovered；F=failed task 与 attempt；M=retry / downstream propagation | R2；T0+T1+T2。retry、failure、skipped 的 warning / danger 需要稳定文字和图例。 | — |
| 23 | `scheduling-rerun` · `SchedulerRunSimulator` | Dependency + Comparison | “再跑一次”是局部补数、全链路重跑还是另一个业务日期？ | N=target date、rerun scope、task、write mode；C=control dependency / write relation；L=selected task→downstream partition；Z=run scope / partition；S=partial / full、overwrite / append；F=目标日期和重跑入口；M=scope selection / rerun simulation | R2+R3；T0+T1。overwrite / append 的结果差异应以表格和文字为主，不用同一 danger 色。 | — |
| 24 | `scheduling-sla` · `SchedulerRunSimulator` | Timeline + State | 所有任务成功后，为什么结果仍可能超过 SLA？ | N=task end、output ready、deadline、consumer；C=temporal / control path；L=task chain→published result；Z=scheduler / consumer SLA；S=success、late、MET、MISSED；F=deadline 与 final output；M=时钟推进、SLA crossing | R2+R3；T0+T1+T2。success 与 on-time 是两个 State，当前视觉容易合并。 | — |
| 25 | `data-quality` · `DataQualityWorkbench` | State + Flow / Evidence | Scheduler SUCCESS、Quality FAILED、Release BLOCKED 各回答什么？ | N=run、quality check、release gate、Quality Event；C=state transition；L=run→quality→release；Z=pipeline / release boundary；S=SUCCESS、FAILED、BLOCKED；F=当前状态与失败证据；M=状态切换 / evidence reveal | R1；T0+T1。success 背景用于状态是合理的，但不能复用为普通 selected。 | — |
| 26 | `data-quality-rules` · `DataQualityWorkbench` | State + Evidence / Schema | 一条记录在身份、字段、语义、引用哪一处不对？ | N=record、field、rule、reference；C=constraint / evidence；L=grain→field→reference；Z=record / reference dataset；S=pass / fail、selected fault；F=当前 rule / bad row；M=切换故障案例 | R2+R3；T0+T1。错误类型应有文字 / rule id，不由红色单独承担。 | — |
| 27 | `data-quality-dataset` · `DataQualityWorkbench` | State + Evidence | 每行正常时，整批和跨层加工为什么仍可能错？ | N=row、batch、layer snapshot、reconciliation；C=data flow / reconciliation；L=row→batch→DWD/DWS；Z=dataset / processing chain；S=row-valid、batch-incomplete、mismatch；F=批次证据与对账结果；M=场景切换 / result update | R2+R3；T0+T1。局部对账色和 Quality 状态需避免同一个 success 角色。 | — |
| 28 | `data-quality-evidence` · `DataQualityWorkbench` | Evidence + State | 一次失败能否被其他人复核？ | N=Quality Event、sample、run context、rule；C=evidence association；L=event→sample / context；Z=quality system / source context；S=failed、reproducible、unknown；F=当前 evidence record；M=切换证据 Detail | R2；T0+T1。证据不足不是 failure，unknown / pending 要独立表达。 | — |
| 29 | `data-quality-release` · `DataQualityWorkbench` | State + Decision | 同样失败时，数据用途如何改变 Release 处置？ | N=quality result、use case、release decision、consumer；C=decision / gate；L=quality→quarantine / release / block；Z=quality gate / consumer；S=released、quarantine、blocked；F=当前用途和规则；M=选择用途 / 决策更新 | R2；T0+T1。danger 只表示真实阻断，quarantine 不应被涂成 failure。 | — |
| 30 | `data-lineage` · `LineageGraph` / `LineageTeachingLab` | Dependency + Evidence | 这份数据的直接来源、加工位置和消费去向是什么？ | N=Snapshot、DWD、DWS、ADS、Metric；C=data / transform；L=SOURCE→DWD→DWS→ADS→METRIC；Z=table graph；S=selected、direct / transitive；F=当前表节点；M=teaching 选择，legacy 可回放影响 | R1（teaching flow）+R2（graph Detail）；T0+T1+T2。legacy canvas 中 Layer hue、Focus 和 impact style 有重叠。 | **P2** |
| 31 | `data-lineage-fields` · `LineageGraph` / `LineageTeachingLab` | Schema + Dependency / Evidence | 表级上游之外，具体字段如何形成当前字段？ | N=field、operation、path、evidence；C=field derivation；L=DWD field→operation→DWS field；Z=single transformation hop；S=confirmed / pending；F=selected dependency tab；M=tab / path reveal | R2+R3；T0+T1。字段路径的 operation highlight 不应与确认状态共用 accent。 | — |
| 32 | `data-lineage-investigation` · `LineageGraph` / `LineageTeachingLab` | Dependency + State / Evidence | Quality Event 后先查直接上游还是继续向源头？ | N=event、anomaly、direct upstream、source candidate、check；C=data / control / evidence；L=anomaly→direct upstream→source；Z=current transform / upstream source；S=event、direct、branch、normal / abnormal；F=anomaly node 与调查分支；M=步骤指示与分支选择 | R1+R2；T0+T1。investigation step、Quality Event、candidate 的 emphasis 需各有语义，不能全用绿色。 | — |
| 33 | `data-lineage-impact` · `LineageGraph` / `LineageTeachingLab` | Dependency + State | 变更的直接下游和传递 Blast Radius 分别是什么？ | N=source、direct downstream、transitive node、metric；C=data impact path；L=DWD→DWS→ADS→Metric；Z=table impact scope；S=selected、submitted、revealed；F=direct prediction→blast radius；M=逐层 reveal propagation | R1+R2；T0+T1。当前 `is-direct` / `is-transitive` 需要保留基础关系，不把 dashed 误读为另一种数据依赖。 | — |
| 34 | `data-lineage-evidence` · `LineageGraph` / `LineageTeachingLab` | Evidence + Dependency | 图上的箭头凭什么相信，确认状态与证据来源是什么？ | N=edge、source、target、evidence record、status；C=evidence association；L=relation→evidence→boundary；Z=lineage evidence drawer；S=confirmed / pending；F=selected edge / record；M=列表选择 / Detail | R2；T0+T1。pending 不能自动变成 optional dotted connector；证据和关系必须分层。 | — |

### 10.4 Governance、Lakehouse 与 Data Service

| # | Lesson / section · component | 主类型 + 辅助类型 | 教学问题 | N / C / L / Z / S / F / M | R · 当前 token / 语义问题 | Pilot |
| ---: | --- | --- | --- | --- | --- | --- |
| 35 | `data-governance` · `GovernanceWorkbench` | Decision + Schema / Evidence | 搜到的候选资产哪一个真正匹配当前问题？ | N=search、asset、definition、consumer；C=candidate match / selection；L=discovery→definition→selection；Z=catalog / asset / consumer；S=candidate、selected；F=selected asset；M=搜索 / 卡片 Detail | R2；T0+T1。资产卡边界与选中状态主要依赖局部色，不能把 DWD / DWS / ADS 颜色当推荐级别。 | — |
| 36 | `data-governance` · `GovernanceWorkbench` | Evidence + Decision | Quality 和 Freshness 如何组成“当前可用”证据？ | N=asset、quality status、freshness、evidence；C=evidence→recommendation；L=definition→quality→freshness→decision；Z=catalog / consumer context；S=PASS、UNKNOWN、stale、recommended / blocked；F=当前证据集合；M=候选切换 | R2；T0+T1。PASS、freshness 和推荐结论不能压成一个绿色分数。 | — |
| 37 | `data-governance` · `GovernanceWorkbench` | Decision + Schema | 资产可用后，哪些字段可直接使用、处理后使用或不可直接使用？ | N=field、purpose、role、access result；C=field access decision；L=asset→field→consumer；Z=ordinary / sensitive / restricted boundary；S=direct、processed、not-direct；F=purpose 与 selected fields；M=勾选 / 用途切换 | R2；T0+T1。sensitivity、selection 和 access decision 可能共用强调色，需要文字和 badge 分层。 | — |
| 38 | `data-governance` · `GovernanceWorkbench` | State + Decision | deprecated 资产仍可查时，为什么仍要迁移？ | N=old asset、replacement、lifecycle；C=replacement / migration；L=active→deprecated→replacement；Z=catalog / production dependency；S=active、deprecated、migrated；F=旧资产与替代资产；M=切换替代资产 | R2；T0+T1。deprecated 是生命周期状态，不应复用 danger 表示运行失败。 | — |
| 39 | `data-governance` · `GovernanceWorkbench` | Dependency + Process | 影响结果已知后，哪个 Owner 要执行什么动作？ | N=field、affected asset、Owner、action；C=impact handoff / responsibility；L=source field→assets→owner action；Z=teams / governance / consumer；S=pending、assigned、confirmed；F=当前动作卡；M=展开影响路径 / action Detail | R2；T0+T1。Owner / action 不是普通下游 Node；应显式标记责任边界。 | — |
| 40 | `lakehouse` · `LakehouseArchitectureLab`（lake-first） | Architecture + Flow / Comparison | 哪些输入先进入 Lake，什么需求值得建立 Warehouse 服务层？ | N=source、Lake、Warehouse、consumer、query demand；C=data flow / selection；L=source→Lake→optional Warehouse→consumer；Z=source / Lake / Warehouse / consumer；S=lake-only / warehouse candidate；F=访问频率、SLA、复杂度、消费方式；M=需求切换 / placement update | R1；T0+T1+T2。Lake / Warehouse 层、selected demand 和 success emphasis 需要独立语义。 | **P3** |
| 41 | `lakehouse` · `LakehouseArchitectureLab`（replication） | Architecture + Flow / State | 执行一次同步后，副本和责任增加在哪里？ | N=source、Lake copy、Transform / Sync、Warehouse copy；C=sync / delivery；L=source→Lake→sync→Warehouse；Z=两套数据管理 / 计算边界；S=single copy、syncing、replicated、lag / rerun；F=同步动作与副本；M=执行同步 | R1；T0+T1。复制成功不等于一致性，当前 success 视觉需与 replica presence 分开。 | — |
| 42 | `lakehouse` · `LakehouseArchitectureLab`（table layer） | State + Timeline / Architecture | Files + Metadata 如何形成可回看的 Table State？ | N=file、schema、commit、snapshot、version；C=commit causality / version timeline；L=files→metadata→table state→version；Z=storage / table layer；S=failed、old visible、committed、time-travel selected；F=commit result 与 version；M=文件失败、Commit、选择 v1 | R2+R3；T0+T1。失败写入与旧版本可见是不同状态；表格 / 文件网格不应伪装成全图。 | — |
| 43 | `lakehouse` · `LakehouseArchitectureLab`（unity） | Architecture Comparison + State | “一体”到底共享 Storage、Table、Metadata、Catalog 还是 Compute？ | N=Storage、Table semantics、Metadata、Catalog、Compute、Governance；C=shared boundary / architecture relation；L=foundation→table/meta→compute→governance；Z=heterogeneous / shared foundations；S=heterogeneous / shared mode；F=selected shared layer；M=切换 architecture mode | R1+R2+R3；T0+T1+T2。局部 comparison literal 与 architecture emphasis 并存，需先定义 Zone 再谈颜色。 | — |
| 44 | `data-service` · `DataServiceWorkbench`（overview） | Architecture + Flow | 同一份已发布结果面对哪三类消费者？ | N=published asset、person / system / app、delivery mode；C=publish / consume；L=production→published→consumer；Z=warehouse / report / file / API；S=published、can consume；F=当前消费者；M=consumer selection | R1+R2；T0+T1。`published` 的 success 不能直接套到普通 selected card。 | — |
| 45 | `data-service` · `DataServiceWorkbench`（report） | Flow + Comparison | 报表如何按机构、日期和视图服务人的查看？ | N=report、filter、table、trend、consumer；C=query / consume；L=published asset→report view；Z=BI / human consumer；S=table / trend、selected branch；F=日期、机构、视图；M=筛选 / view switch | R2+R3；T0+T1。表格与趋势是 Detail 视图，不必额外画连接线。 | — |
| 46 | `data-service` · `DataServiceWorkbench`（file） | State + Flow | TXT 出现后为什么仍要等 FLAG？ | N=TXT、FLAG、batch、downstream；C=delivery / completion signal；L=producer→file batch→consumer；Z=producer / file exchange / consumer；S=writing、waiting、complete、can consume；F=FLAG boundary；M=阶段点击 / readiness update | R1；T0+T1。`FLAG` 是完成信号，不应与普通 success 节点混成同一形态。 | — |
| 47 | `data-service` · `DataServiceWorkbench`（API） | Flow + Architecture | 请求参数如何得到一条受控 JSON 响应？ | N=request、parameter、published asset、JSON response；C=request / response；L=app→service→published result；Z=app / service / asset；S=idle、requested、returned、invalid selection；F=参数与响应；M=发送请求 / response reveal | R1+R2；T0+T1。API 的 response success 不代表实时性，业务日期需单独标注。 | — |
| 48 | `data-service` · `DataServiceWorkbench`（decision） | Comparison + Decision | 同一数据需求应选择报表、文件还是 API？ | N=consumer scenario、option、reason、selection；C=requirement→delivery decision；L=need→delivery mode→contract；Z=human / batch system / app；S=selected、matched / mismatch；F=当前场景与选择；M=选择后解释更新 | R2；T0+T1。匹配结果是教学判断，不应使用 Release success 的视觉。 | — |

### 10.5 Performance 与 Capstone

| # | Lesson / section · component | 主类型 + 辅助类型 | 教学问题 | N / C / L / Z / S / F / M | R · 当前 token / 语义问题 | Pilot |
| ---: | --- | --- | --- | --- | --- | --- |
| 49 | `performance-and-practice` · `PerformanceLab` / `PerformanceDiagnosisLab` | Process + Comparison / Evidence | 任务变慢时先定位哪个 Stage / Task，而不是先加资源？ | N=stage、task、symptom、hypothesis、measurement；C=execution / diagnostic evidence；L=Scan→Join→Shuffle→Aggregate→Write；Z=engine stage / worker task；S=selected、measured、hypothesis accepted；F=bottleneck stage；M=选阶段 / validation measurement | R2；T0+T1。阶段选择、测量成功和性能风险不应共享同一 accent。 | — |
| 50 | `performance-scan-layout` · `PerformanceLab` / `PerformanceScanLab` | Comparison + Evidence | 过滤条件生效后，实际读取范围和文件布局改变了什么？ | N=filter、partition、file、scan cost；C=data read / evidence；L=partition→file→scan；Z=storage layout / execution；S=wide / pruned、selected scope；F=scan scope 与文件；M=scope / file story 切换 | R2+R3；T0+T1。文件状态和成本结果应以文字 / 数字为主，不靠颜色比较。 | — |
| 51 | `performance-shuffle-skew` · `PerformanceLab` / `PerformanceSkewLab` | Comparison + State | 倾斜发生在什么位置，哪种处理方向适合当前分布？ | N=worker、key distribution、strategy、task time；C=partition / shuffle；L=partition→worker→stage；Z=worker chart / strategy choice；S=balanced、skewed、selected strategy；F=hot worker / skew location；M=选择场景与策略 | R2；T0+T1。worker bar 的长度本身表达数量，颜色只补充状态；避免 red = slow 的唯一编码。 | — |
| 52 | `performance-first-seen` · `PerformanceLab` / `PerformanceStateLab` | State + Timeline / Schema | 如何把重复历史扫描改成有业务含义的状态？ | N=events、history、first-seen state、feature；C=temporal derivation；L=history→state→feature；Z=transaction history / state table；S=before / after、first seen / known；F=状态转换与结果；M=方案切换 / result reveal | R2+R3；T0+T1。状态表不是事件表，需靠 schema 和文字而非颜色区分。 | — |
| 53 | `performance-tradeoffs` · `PerformanceLab` / `PerformanceTradeoffLab` | Comparison + Evidence | Before / After 除运行时间外，正确性、SLA、成本和维护代价如何复测？ | N=before、after、acceptance check、risk；C=compare / validation；L=runtime、scan、freshness、cost、maintainability；Z=job / business acceptance；S=accepted、risk、retest pending；F=acceptance checks；M=逐项检查 | R2+R3；T0+T1。Before / After 需要中性对照，不应把 after 自动表示为 success。 | — |
| 54 | `capstone` · `CapstoneWorkbench` | Composite（由 Flow / Schema / Dependency / State / Timeline / Comparison 组成） | 一条连续 Mission 如何保留 Grain、运行、事故、调查、交付、性能和 Launch Review 的决策链？ | N=checkpoint、source、decision、incident、product、review；C=checkpoint flow、dependency、impact、delivery；L=Mission→Design→Build→Operate→Incident→Investigate→Deliver→Scale→Review；Z=业务 Mission / 数据平台 / 消费者 / review；S=locked、available、completed、blocked、READY / BLOCKED / READY WITH RISK；F=active checkpoint 与最近 Decision Record；M=checkpoint transition / recovery / reset | R4+R3；T0+T1+T2（capstone 自有变量映射 foundation）。密度最高；不得在 Pilot 中直接抽成全局模板。 | 观察对象，不作为首轮 Pilot |

## 11. 共享模式与应保留的课程差异

### 11.1 值得在 Pilot 后验证的共享模式

- **Flow rail：** source / stage / consumer 的顺序、数据方向、当前阶段和最终结果；适合 `BusinessSystemFlow`，可能对 `PipelineFlow`、`ReportMetricJourney` 有启发。
- **Focus / path overlay：** 保留基础连接，只提高当前节点、直接路径和传递路径；适合 `LineageGraph`，不要先抽通用 canvas。
- **Zone boundary：** Lake / Warehouse、业务系统 / 平台 / 消费者、发布契约边界；适合 `LakehouseArchitectureLab` 和 `BusinessSystemFlow`。
- **State badge + text：** 状态文字、图形、背景和连接权重的组合；成功、选中、影响、待确认必须能独立解释。
- **Local Detail：** 选择 Node / Edge / Stage 后在图下方或侧方显示字段、证据、快照和决策；它比把所有信息塞回节点更稳定。

### 11.2 不应在 Phase 1 收敛的差异

- 银行课程的业务过程、Fact Type、Grain、SCD 和 Metric 口径需要各自的表格、时间轴和字段 Detail；它们不应被改造成同一张“数仓流程图”。
- `LineageTeachingLab` 的垂直教学 flow 与 `LineageGraph` legacy SVG canvas 可以共享 Dependency / Evidence 语义，但不应强行统一布局。
- Lakehouse 的 Snapshot / Schema Evolution / Time Travel 是架构实验中的局部时间与状态视图，不应复制 Scheduler 的 DAG UI。
- Governance 的资产、字段和 Owner 判断是决策 / 证据工作台，不应借用 Lineage 的箭头来制造虚假的数据依赖。
- Performance 的 Stage / Worker / Before-After 主要是证据比较，不应为了“图解统一”增加装饰性连线。
- Capstone 的 checkpoint 顺序是项目教学编排，不是新的通用 Diagram Type。

## 12. Pilot 规范（Phase 2 输入）

### 12.1 Pilot A：`BusinessSystemFlow`

**验证问题：** 多来源、主数据流、阶段播放和消费者输出能否在不改变现有布局的情况下使用统一的 Flow / Zone / Focus / State 语义？

必须观察：

- `source → warehouse → output` 的数据方向和 `ingest / process / publish` 标签是否足够；
- 选中 Source、当前 Phase、已完成和输出可用是否不再共用同一种颜色；
- packet animation 在 reduced motion 下是否等价地展示最终状态；
- 宽容器、窄容器和手机纵向重排后，主路径与输出仍可读；
- 是否真的出现跨课可复用的 `FlowNode` / `FlowConnector` 形态，还是只有语义可复用。

### 12.2 Pilot B：`LineageGraph`

**验证问题：** Dependency Graph 的节点、关系、Focus path、direct / transitive impact 和 Evidence 是否能同时可读？

必须同时观察：

- legacy SVG canvas 与 `LineageTeachingLab` wrapper 两种呈现是否可以共用 relation / state / evidence 词汇；
- `data / transform`、`control / dependency`、`evidence association`、`pending` 是否不再依赖同一种虚线；
- 选中节点、当前调查路径、直接下游、传递影响和删除 / 受影响状态是否分层；
- 交叉、连接点、标签和节点密度何时触发 Overview → Detail；
- reduced motion 下影响传播是否一次性可读，且保留 direct / transitive 文字；
- SVG canvas 窄容器是否应局部滚动、拆视图或改为 selected Detail，而不是继续把 Node 缩到 108px。

### 12.3 Pilot C：`LakehouseArchitectureLab`

**验证问题：** Architecture / Integration 的 Zone、复制、共享基础能力、Snapshot 和复杂响应式是否能共用语义而保留各自教学隐喻？

必须观察：

- Source / Lake / Warehouse / Consumer 与 Storage / Table / Compute / Governance 的 Zone 边界是否清楚；
- `sync / copy`、`publish / consume`、`shared foundation` 不互相伪装；
- replication、table layer、unity、modeling perspective 等子视图是否需要各自的 Overview 与 Detail；
- 表格、文件批次、Snapshot rail 和 comparison matrix 在窄容器中是否只局部滚动；
- Light / Dark 是否可以仅切换语义 token，而不依靠历史 local hue；
- 现有切换、执行同步、失败提交、Time Travel、重置行为全部保留。

### 12.4 Pilot 验收记录模板

每个 Pilot 后至少记录：

- 主类型 / 辅助类型是否仍然准确；
- Node、Connector、Layer、Zone、State、Focus 是否能用相同术语复述；
- 默认、选中、失败、完成、待确认、影响中的静态状态截图 / 文本；
- Light / Dark 对比检查；
- 宽容器、窄容器、手机容器和局部滚动结果；
- `prefers-reduced-motion` 结果；
- 现有交互的逐项回归（点击、播放、切换、故障 / 影响传播、Detail、重置）；
- 哪些模式出现至少两次且边界稳定；
- 哪些差异明确不应抽取 primitive；
- 是否产生独立 Phase 2 PR，而不是把 Pilot 继续扩大为全仓迁移。

## 13. Phase 1 交付边界与后续动作

### 本阶段完成

- 54 个 typed visualization sections 的完整盘点；
- 8 个最小 Diagram Type 及选型规则；
- Node / Layer / Zone / State / Focus 最小词汇；
- Connector Grammar（方向、线型、标签、连接点、交叉和省略规则）；
- Diagram Semantic Token 角色、Light / Dark 映射建议及现有 token 关系；
- 信息密度、Overview → Detail、Motion、Reduced Motion、Responsive 规范；
- 2～3 个 Pilot 候选及独立验收输入；
- 当前重复模式、语义冲突和不应收敛的课程差异记录。

### 明确不做

- 不修改 `src/`、`src/styles/`、课程内容、Lesson Schema 或交互；
- 不修改 `tokens.css`，不迁移旧颜色；
- 不新增 Diagram Engine、通用布局引擎、自动寻路器或 Mermaid；
- 不把所有 Lab 改成 SVG、同一种布局或同一套卡片模板；
- 不在本 Issue 实现 Pilot 或共享 primitive；
- 不关闭 Issue #95，不把文档 PR 误报为 Pilot 已完成。

### 后续顺序

1. 以本规范创建三个独立 Pilot 任务，先验证语义，再决定是否抽取 primitive。
2. Pilot 之后再确定具体 token 值、对比度、连接 marker、focus ring 和组件 API。
3. 只迁移存在明确教学收益的组件；旧组件按课程修改节奏渐进迁移。
4. 新课程新增 visualization 时，先在内容设计中声明主 Diagram Type、教学问题和窄容器策略，再决定实现形态。

## 附录 A：审计参考路径

- `src/content/types.ts`：`LessonVisualization` 与 typed section 联合类型；
- `src/components/lesson/LessonSectionRenderer.tsx`：section 到 visualization 的装配与 legacy 兼容；
- `src/components/visualizations/index.ts`：课程可见 visualization barrel；
- `src/components/visualizations/BusinessSystemFlow.tsx`、`LineageGraph.tsx`、`LineageTeachingLab.tsx`、`LakehouseArchitectureLab.tsx`：三个 Pilot 及相关分支；
- `src/components/visualizations/PerformanceLab*.tsx`：性能子实验与共享辅助；
- `src/styles/tokens.css`、`themes.css`：现有 foundation、状态和 dark theme；
- `src/styles/components/shared-lesson.css`、`visualization-compact.css`：共享图形与 container query；
- `src/styles/lessons/*.css`：各章节的图形、动画、响应式和局部颜色实现。
