# 英文内容矩阵与 Phase 0 审计（#220）

> **状态：** Phase 0 COMPLETE · **实施授权 2026-10-17（Maintainer-Authorized Content Expansion）** · 冻结实施队列见 §14
> **Parent Epic：** [#220](https://github.com/0verme/data-warehouse-visualized/issues/220)
> **授权：** [#39](https://github.com/0verme/data-warehouse-visualized/issues/39) `Phase 4 — Expansion` = **ACTIVE / Maintainer-Authorized（2026-10-17）**，授权范围 = 本文件 §14 冻结实施队列；[#179](https://github.com/0verme/data-warehouse-visualized/issues/179) 原始实验基线保持不变，GSC / SERP 转为上线后持续观测机制
> **六 Cluster 规划 Child：** [#222](https://github.com/0verme/data-warehouse-visualized/issues/222) A / [#223](https://github.com/0verme/data-warehouse-visualized/issues/223) B / [#224](https://github.com/0verme/data-warehouse-visualized/issues/224) C / [#225](https://github.com/0verme/data-warehouse-visualized/issues/225) D / [#226](https://github.com/0verme/data-warehouse-visualized/issues/226) E / [#227](https://github.com/0verme/data-warehouse-visualized/issues/227) F
> **并行中文总控：** [#221](https://github.com/0verme/data-warehouse-visualized/issues/221)（依赖链重做专题；见 §11）
> **审计基线：** `origin/main` = `cb9d273a0e55a4fd91737c3d2ca4e30f434aec50`（PR #219 Smart 404 Phase 2 merged）
> **文档用途：** 作为 #220 的候选判定、Topic Cluster、复用地图、质量合同、冻结实施队列与 Agent Loop 边界的单一规划入口。**授权范围以 §14 为准；未进入 §14 队列的主题不自动获得授权。**

---

## 0. 本轮边界

**本轮做：** 只读审计、24 候选逐项去重判定、Cluster 规划 Child Issue、质量/验收模板、Loop 执行边界、证据与阻塞记录。

**本轮不做：** 不生成 24 篇英文文章；不新建 `/en/` 页面、路由、组件或工具；不修改任何页面实现；不解除 #39 Phase 4 HOLD；不把「审计完成 / Issue 创建 / 页面发布 / 搜索增长」混为同一完成状态。

---

## 1. 审计基线与方法

### 1.1 基线与环境

| 项目            | 值                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository      | `0verme/data-warehouse-visualized`                                                                                                                                         |
| 审计基线        | `origin/main` = `cb9d273a0e55a4fd91737c3d2ca4e30f434aec50`（`git fetch origin --prune`，2026-10-17）                                                                       |
| 前置合并        | PR #219 Smart 404 Phase 2（`cb9d273`）；PR #217（`d22d7f7`）；PR #218（`67c27bb`）                                                                                         |
| 生产站点        | `https://sql.sb`                                                                                                                                                           |
| 内容基线 A      | PR #178 merge `16738ac`（5 个 MVP 页面 + `/en/data-warehouse/`）                                                                                                           |
| 发现基线 B      | PR #204 merge `1060e4a`（Header / Learn drawer 英文入口）                                                                                                                  |
| 生产探针时间    | 2026-10-17T06:29Z（bash `curl`，非本地 build）                                                                                                                             |
| 观测状态        | #179：`DATA NOT YET AVAILABLE`；下次窗口 `2026-10-20T03:53Z`；28 天读数约 `2026-11-03T03:53Z`                                                                              |
| 仓库 Agent 指令 | 仓库当前**没有** `AGENTS.md`；有效约束 = `CONTRIBUTING.md` + `docs/TERMINOLOGY.md` + `docs/BANKING_TEACHING_DOMAIN.md` + `docs/DIAGRAM_VISUAL_GRAMMAR.md` + #220 Loop 契约 |

### 1.2 只读生产探针结果（2026-10-17）

| 检查项            | 结果                                                                                                                                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9 条英文 URL      | 全部 `200`（`/en/`、`/en/sql/`、`/en/sql/sql-join-duplicate-rows/`、`/en/data-warehouse/`、`/en/data-warehouse/grain/`、`/en/data-warehouse/idempotent-etl/`、`/en/data-warehouse/data-lineage-vs-task-dependency/`、`/en/data-warehouse/scd-type-2/`、`/en/tools/`） |
| 无 trailing slash | `/en` → `307` → `/en/`；`/en/data-warehouse/grain` → `307` → 对应规范 URL                                                                                                                                                                                             |
| 未知英文路径      | `/en/nonexistent-220-probe/` → `404`（无 soft-200 / soft-redirect）                                                                                                                                                                                                   |
| canonical 污染    | `/en/data-warehouse/grain/?utm_source=probe220` 仍 self-canonical                                                                                                                                                                                                     |
| `lang` / H1       | `<html lang="en">`；每页唯一 `<h1>`                                                                                                                                                                                                                                   |
| sitemap           | `sitemap-index.xml` → `sitemap-0.xml`，共 **68** URL，其中 9 条英文 URL 全部在列                                                                                                                                                                                      |
| robots            | `Allow: /`，仅 `Disallow: /dev/`，发布 sitemap                                                                                                                                                                                                                        |
| GSC / SERP        | **不可访问 / 无数据**（`DATA NOT YET AVAILABLE`；不是 0、不是失败）                                                                                                                                                                                                   |

### 1.3 证据分级（本文件及后续 Child 必须沿用）

| 级别                           | 定义                                                        | 可支撑的决策                                 |
| ------------------------------ | ----------------------------------------------------------- | -------------------------------------------- |
| **Verified**                   | 本次真实请求 / 构建 / 测试可复现                            | 技术上线验收、回归结论                       |
| **Observed**                   | 历史 Issue / PR 中记录的已验证事实（含 commit 与 run 链接） | 复用、依赖、基线判断                         |
| **Editorial hypothesis**       | 基于内容匹配的搜索意图假设，无 GSC / SERP 数据              | 候选规划、URL 假设；**不得称为已验证关键词** |
| **Unknown / Data unavailable** | GSC、SERP、排名、impressions 等不可得                       | 必须如实记录；**不得推断为失败或成功**       |

---

## 2. 现有英文内容盘点（9 条路由）

### 2.1 路由清单

| #   | URL                                                   | 类型                 | 源码                                              | Primary intent（现状）             | 交互 / 图解                                               | 状态                          |
| --- | ----------------------------------------------------- | -------------------- | ------------------------------------------------- | ---------------------------------- | --------------------------------------------------------- | ----------------------------- |
| 1   | `/en/`                                                | 命名空间入口 / hub   | `src/pages/en/index.astro`                        | English resources entry            | 三张 namespace 卡片                                       | 冻结                          |
| 2   | `/en/sql/`                                            | 命名空间索引         | `src/pages/en/sql/index.astro`                    | SQL 资源入口                       | 卡片索引                                                  | 冻结                          |
| 3   | `/en/sql/sql-join-duplicate-rows/`                    | 实质内容页           | `.../sql-join-duplicate-rows/index.astro`         | `why does SQL join duplicate rows` | `JoinDuplicatesLab`（7 步 step player）                   | 冻结（C 锚点）                |
| 4   | `/en/data-warehouse/`                                 | 命名空间索引         | `src/pages/en/data-warehouse/index.astro`         | Data warehouse 资源入口            | 四张页面卡片                                              | 冻结（A 簇候选 merge 目标）   |
| 5   | `/en/data-warehouse/grain/`                           | 实质内容页           | `.../grain/index.astro`                           | `data warehouse grain example`     | `GrainChooserLab`（grain 选择 + 错误 grain 复算）         | 冻结（B 锚点）                |
| 6   | `/en/data-warehouse/idempotent-etl/`                  | 实质内容页           | `.../idempotent-etl/index.astro`                  | `how to make ETL job idempotent`   | `IdempotentRerunLab`（append / overwrite / merge + 重跑） | 冻结（D 候选 improve）        |
| 7   | `/en/data-warehouse/data-lineage-vs-task-dependency/` | 实质内容页           | `.../data-lineage-vs-task-dependency/index.astro` | `data lineage vs task dependency`  | `LineageVsDependencyLab`（4 场景双图对照）                | 冻结（E 锚点 + improve 目标） |
| 8   | `/en/data-warehouse/scd-type-2/`                      | 实质内容页           | `.../scd-type-2/index.astro`                      | `SCD Type 2 example`               | `ScdTimelineLab`（Type 1/2 + 半开区间边界）               | 冻结                          |
| 9   | `/en/tools/`                                          | 工具 shell（无工具） | `src/pages/en/tools/index.astro`                  | Tools namespace shell              | 无                                                        | 冻结（保持空 shell）          |

### 2.2 页面结构合同（既有，后续页面必须复用）

- `BaseLayout` 生成 title / description / canonical（去 BASE_PATH）/ OG；英文页额外 `lang="en"`、`ogLocale="en_US"`。
- `EnglishArticleLayout` = `EnglishFoundationShell`（Overview / SQL / Data warehouse / Tools 导航 + Chinese home footer）+ 共享 article 样式。
- 文章结构现状：`EnglishBreadcrumb` → header（eyebrow / H1 / lede）→ `Quick answer` → 分节 h2 → `english-callout` / `english-table` / compare 卡片 → `Related pages`（普通链接）。
- 路由单源：`src/utils/english-routes.ts` 的 `ENGLISH_PATHS` + `getEnglishRoute()`；页面、导航、测试共同读取，禁止散落硬编码。
- 构建合同：`tests/english-seo-build-contract.mjs`（9 条路由的 lang / title / description / canonical / og / 无 hreflang / 无 noindex / sitemap / 56 节课程不回归）；`tests/e2e/english-foundation.mjs`、`tests/e2e/english-header-discovery.mjs`（浏览器合同 / 双 build）。
- 现有 title 长度 55–65 字符（含 `| sql.sb`）；摘要均以 English-first 写作，无 hreflang。

### 2.3 交互 / 图解 / 实验资产（英文侧）

| 资产                               | 位置                                                                        | 教学形式                                                                                             | 复用建议                                                       |
| ---------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `JoinDuplicatesLab`                | `src/components/english/JoinDuplicatesLab.tsx`                              | 7 步 step player：观察键 → 1:N 扇出 → M:N 扇出 → SUM 失真 → DISTINCT 陷阱 → 预聚合修复 → EXISTS 修复 | C 簇锚点；step kernel 可直接复用于其他「多步状态」主题         |
| `GrainChooserLab`                  | `src/components/english/GrainChooserLab.tsx`                                | grain 三选一 + 错误 grain 复算（`grain-error` kernel）                                               | B 簇 grain 页面；fact/dim、star/snowflake 候选参考其对照式布局 |
| `IdempotentRerunLab`               | `src/components/english/IdempotentRerunLab.tsx`                             | 写策略 × 输入版本的确定性状态迁移                                                                    | D 簇；failure recovery 设计可复用其「状态迁移 + 行结果」表达   |
| `LineageVsDependencyLab`           | `src/components/english/LineageVsDependencyLab.tsx`                         | 同一 workflow 的调度依赖图 vs SQL/data lineage 图对照（4 场景）                                      | E 簇；impact / observability 候选可直接扩展场景                |
| `ScdTimelineLab`                   | `src/components/english/ScdTimelineLab.tsx`                                 | Type 1/2 版本 + 日期游标 + 半开区间边界                                                              | B 簇 SCD 页面；incremental/历史候选可参考边界表达              |
| `src/features/english-*`           | join（含 step kernel）/ grain / etl / lineage / scd 的纯函数模型与 fixtures | 确定性、可单测                                                                                       | **所有英文新页面优先复用，不复制**                             |
| `src/utils/visualization-steps.ts` | 共享 step kernel + player 状态机                                            | 步骤语义                                                                                             | 已在 join 使用；新交互页面优先复用                             |
| `src/utils/customer-history.ts`    | 日期区间工具                                                                | 历史版本命中                                                                                         | 已在 SCD 使用                                                  |

### 2.4 内部链接矩阵（生产实测）

所有页面共享：FoundationShell 顶部导航（Overview / SQL / Data warehouse / Tools）+ footer 的 Chinese home；文章页额外 Breadcrumb 与 Related pages。

| 来源 → 目标           | `/en/` | `/en/sql/` | join        | `/en/data-warehouse/` | grain       | etl         | lineage     | scd         | `/en/tools/` |
| --------------------- | ------ | ---------- | ----------- | --------------------- | ----------- | ----------- | ----------- | ----------- | ------------ |
| `/en/`                | nav    | nav        | —           | nav                   | —           | —           | —           | —           | nav          |
| `/en/sql/`            | nav    | nav        | 卡片        | nav                   | —           | —           | —           | —           | nav          |
| join                  | nav    | nav        | —           | nav                   | **related** | —           | —           | —           | nav          |
| `/en/data-warehouse/` | nav    | nav        | —           | nav                   | 卡片        | 卡片        | 卡片        | 卡片        | nav          |
| grain                 | nav    | nav        | **related** | nav                   | —           | —           | —           | **related** | nav          |
| etl                   | nav    | nav        | —           | nav                   | **related** | —           | **related** | —           | nav          |
| lineage               | nav    | nav        | —           | nav                   | **related** | **related** | —           | —           | nav          |
| scd                   | nav    | nav        | —           | nav                   | **related** | **related** | —           | —           | nav          |
| `/en/tools/`          | nav    | nav        | —           | nav                   | —           | —           | —           | —           | nav          |

观察：导航与 Related pages 已形成最小闭环；`scd ↔ lineage`、`join ↔ etl` 之间无强语义链接（当前不需要硬加）。后续新页面必须同时具备「入链（索引/相关页）」与「回链（related 指向既有锚点）」。

### 2.5 现有页面可改进点（gate-free，Phase 0 允许）

- **E 簇（#15 / #16）：** lineage 页面以「两张图不一致」开篇，缺少一句式 lineage 定义；quick answer 与 impact 小节可原地增强。
- **D 簇（#12）：** idempotent-etl 已有 retry / rerun / backfill 小节；可加强术语边界与 `docs/TERMINOLOGY.md` 引用。
- **A 簇（#1 merge）：** `/en/data-warehouse/` 索引可用一小段承接「What is a data warehouse」，不写成长文。
- **低优先：** 个别 title 超过 60 字符（idempotent-etl 65、lineage 63、scd 62）；非阻塞，若实施页面时顺手收敛即可。
- **内链：** `scd → lineage`（影响 / 历史修正）可选；不做机械 hard link。

---

## 3. 中文资产复用地图（56 节 / 13 章）

> 英文页面 **English-first 独立写作**，复用对象是**数据、fixture、交互内核、状态模型与教学形式**，不是逐段翻译。

| 章节              | 节数 | 关键 slug                                                                                          | 主要可复用资产 / 内核                                                                                                       | 关联英文 Cluster |
| ----------------- | ---- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 01 认识数据仓库   | 4    | `why-data-warehouse`、`warehouse-layers`、`report-metric-journey`、`warehouse-terms`               | 分层实验 `LayerEvolutionLab`、`LayerNetworkEvolution`、术语实验                                                             | A                |
| 02 数据建模       | 5    | `data-modeling`、`grain`、`star-schema-and-grain`、`fact-table-types`、`slowly-changing-dimension` | `StarSchemaFlow`、`BankingFactTypesLab`、`BankingStarSchemaLab`、`LoanGrainLab`、`star-schema.ts`、`banking-fact-types.ts`  | B                |
| 03 指标体系       | 4    | `metric-system`、`deposit-metric-*`                                                                | `MetricDefinitionLab`、口径 / 时间工具                                                                                      | A / B 边界       |
| 04 SQL 与数据加工 | 5    | `sql-transformation-*`                                                                             | `SqlTransformationWorkbench`、SQL Sandbox (DuckDB-WASM)                                                                     | C / E            |
| 05 调度系统       | 5    | `scheduling-*`                                                                                     | `SchedulerRunSimulator`、`SchedulerDateSemanticsExperiment`、`DuplicateSchedulerEntryLab`                                   | D                |
| 06 数据质量       | 5    | `data-quality-*`                                                                                   | `DataQualityWorkbench`、`features/data-quality`                                                                             | E                |
| 07 数据血缘       | 5    | `data-lineage-*`                                                                                   | `LineageTeachingLab`、`LineageViewDependencyPanel`、`features/lineage`、`lineage-impact`                                    | E / D            |
| 08 数据治理       | 5    | `data-governance-*`                                                                                | `GovernanceWorkbench`、生命周期 / 责任模型                                                                                  | E                |
| 09 湖仓           | 4    | `lakehouse-*`                                                                                      | `LakehouseArchitectureLab`（3 变体）、`src/utils/lakehouse.ts`                                                              | F / A 边界       |
| 10 数据服务       | 5    | `data-service-*`                                                                                   | `DataServiceWorkbench`                                                                                                      | E 边界           |
| 11 性能与工程实践 | 6    | `performance-*`、`streaming-warehouse-golden`                                                      | `PerformanceScanLab`、`PerformanceSkewLab`、`PerformanceMicrobatchLab`、`StreamingGoldenLab`、`PERFORMANCE_SIMULATION_NOTE` | C / D            |
| 12 综合实战       | 1    | `build-a-warehouse`                                                                                | `CapstoneWorkbench`、`LifecyclePathLab`、`DeliveryInvestigationLab`                                                         | D / E            |
| 13 生产实践案例   | 2    | `lifecycle-path-failure`、`delivery-completion-signal`                                             | 案例 fixture + Evidence Gating 模式                                                                                         | D / E            |

**实验与运行时边界：** SQL Sandbox（#35）是可选折叠实验（DuckDB-WASM，lazy load），只用于 `sql-transformation-layers`；英文页面**不得**为此新增重型运行时，也不得默认加载 WASM。

---

## 4. 24 候选专题逐项判定（核心）

### 4.1 判定表

| #   | Tier（原表） | Candidate                         | 判定         | Cluster | 目标 / 说明                                                            | 优先级          |
| --- | ------------ | --------------------------------- | ------------ | ------- | ---------------------------------------------------------------------- | --------------- |
| 1   | P0           | What Is a Data Warehouse?         | **merge**    | A       | 归入 `/en/data-warehouse/` 索引短定义；不建 head-term 长文页           | 中              |
| 2   | P0           | OLTP vs OLAP                      | **defer**    | A       | 无差异化实验资产；通用对比词；待 SERP 证据                             | 低              |
| 3   | P0           | ETL vs ELT                        | **defer**    | A       | 与 idempotent-etl 的 write policy 边界未定前不建页                     | 低              |
| 4   | P0           | Data Warehouse Layers Explained   | **new**      | A       | `/en/data-warehouse/layers/`（候选）；A 簇唯一 anchor                  | 高              |
| 5   | P0           | Fact Tables vs Dimension Tables   | **new**      | B       | `/en/data-warehouse/fact-vs-dimension-tables/`（候选）                 | 高              |
| 6   | P0           | Star Schema vs Snowflake Schema   | **new**      | B       | `/en/data-warehouse/star-schema-vs-snowflake/`（候选）                 | 中              |
| 7   | P0           | Slowly Changing Dimensions (SCD)  | **existing** | B       | 由 `/en/data-warehouse/scd-type-2/` 覆盖；不建通用 SCD URL             | 冻结            |
| 8   | P0           | SQL JOIN Duplicates Explained     | **existing** | C       | `/en/sql/sql-join-duplicate-rows/`；C 锚点                             | 冻结            |
| 9   | P1           | Data Warehouse Grain Explained    | **existing** | B       | `/en/data-warehouse/grain/`；B 锚点                                    | 冻结            |
| 10  | P1           | Incremental Load vs Full Load     | **new**      | B       | `/en/data-warehouse/incremental-vs-full-load/`（候选）                 | 中              |
| 11  | P1           | Data Pipeline Dependencies        | **existing** | D       | 由 lineage-vs-task-dependency 页面覆盖                                 | 冻结            |
| 12  | P1           | Retry vs Rerun vs Backfill        | **improve**  | D       | 原地增强 idempotent-etl 对应小节；独立 URL 需 SERP 证据                | 高（gate-free） |
| 13  | P1           | Data Pipeline Failure Recovery    | **new**      | D       | `/en/data-warehouse/pipeline-failure-recovery/`（候选）；#220 重点专题 | 最高            |
| 14  | P1           | Data Quality Checks               | **new**      | E       | `/en/data-warehouse/data-quality-checks/`（候选）                      | 高              |
| 15  | P1           | Data Lineage Explained            | **improve**  | E       | 原地增强既有 lineage 页面 quick answer                                 | 高（gate-free） |
| 16  | P1           | Impact Analysis in Data Pipelines | **improve**  | E       | 原地增强既有 lineage 页面 impact 小节                                  | 高（gate-free） |
| 17  | P2           | Data Skew Explained               | **new**      | C       | `/en/sql/data-skew/`（候选，namespace 待冻结）                         | 中              |
| 18  | P2           | SQL Window Function Performance   | **defer**    | C       | 无独立实验资产；待窄角度或放弃                                         | 低              |
| 19  | P2           | Partition Pruning Explained       | **new**      | C       | `/en/sql/partition-pruning/`（候选，namespace 待冻结）                 | 中              |
| 20  | P2           | Data Lake vs Data Warehouse       | **defer**    | F       | 待 lakehouse 锚点存在后再评估                                          | 低              |
| 21  | P2           | What Is a Lakehouse?              | **new**      | F       | `/en/data-warehouse/lakehouse/`（候选）；准确性审查门槛最高            | 中（最后实施）  |
| 22  | P2           | Apache Iceberg Explained          | **defer**    | F       | 无实操资产、事实时效性风险；待实验或可维护事实源                       | 低              |
| 23  | P2           | Data Contracts Explained          | **new**      | E       | `/en/data-warehouse/data-contracts/`（候选）                           | 中              |
| 24  | P2           | Data Pipeline Observability       | **new**      | E       | `/en/data-warehouse/pipeline-observability/`（候选）                   | 中              |

**汇总：** `existing` 4 · `improve` 3 · `merge` 1 · `new` 11 · `defer` 5 · `reject` 0。
**额外 watch（不计入 24）：** transaction fact vs periodic snapshot fact（B 簇，defer；继承 #177 Watch 列表）。

### 4.2 defer 与 merge 的理由（防止「清单即 KPI」）

- **defer 不是失败**，而是 editorial hypothesis 暂不进入实施队列：通用 head term（OLTP/OLAP、ETL/ELT、Data Lake vs DW）、缺少独立资产的 window performance、以及事实时效性风险高的 Iceberg。
- **merge 与 improve** 明确不产生新 URL：`What Is a Data Warehouse` 由索引承接；lineage / impact / retry / rerun / backfill 由既有 URL 增强。
- **new 11 项全部受 #39 Phase 4 HOLD 约束**：本文件只冻结候选身份与边界，不构成发布授权。

### 4.3 已上线页面防复活名单（不得因候选池再建同 intent URL）

`/en/sql/sql-join-duplicate-rows/`、`/en/data-warehouse/grain/`、`/en/data-warehouse/idempotent-etl/`、`/en/data-warehouse/data-lineage-vs-task-dependency/`、`/en/data-warehouse/scd-type-2/`、以及三个索引与 `/en/tools/`。任何实施 Child 创建前必须再次对照本名单与 #208 的 STOP 记录。

---

## 5. Topic Cluster 规划（A–F）

每个 Cluster 的详细判定表、依赖、页面候选、质量标准、验收与 Loop 边界见对应规划 Child Issue。本节只做总览。

### Cluster A · Fundamentals & Architecture — [#222](https://github.com/0verme/data-warehouse-visualized/issues/222)

- 候选：`merge` What Is a Data Warehouse → 索引；`defer` OLTP vs OLAP；`defer` ETL vs ELT；`new` Layers。
- Anchor：`/en/data-warehouse/layers/`（候选）。
- 边界：讲分层动机与跨层读取代价；不把 ODS/DWD/DWS/ADS 或 medallion 说成标准；与 F 簇 lakehouse 划清「湖 / 仓 / 表格式」。
- 复用：`warehouse-layers`、`sql-transformation-layers`、`LayerEvolutionLab`、`LayerNetworkEvolution`。

### Cluster B · Modeling & Historical Data — [#223](https://github.com/0verme/data-warehouse-visualized/issues/223)

- 候选：`existing` grain / SCD；`new` fact vs dimension、star vs snowflake、incremental vs full；watch snapshot fact。
- 边界：grain（一行是什么）↔ fact/dim（角色与键）↔ star/snowflake（拓扑）↔ SCD（历史）↔ incremental/full（加载范围）。
- 复用：第 02 章全部资产 + `StarSchemaFlow`、`BankingFactTypesLab`、`BankingStarSchemaLab`、`LoanGrainLab`。

### Cluster C · SQL Correctness & Performance — [#224](https://github.com/0verme/data-warehouse-visualized/issues/224)

- 候选：`existing` JOIN duplicates；`new` data skew、partition pruning；`defer` window performance。
- 边界：行放大（JOIN）↔ 分布长尾（skew）↔ 扫描裁剪（pruning）；性能页面必须沿用「教学模拟 ≠ benchmark」标注。
- 复用：`english-join`、`join-fanout`、`PerformanceSkewLab`、`PerformanceScanLab`、第 11 章性能 fixtures。

### Cluster D · Scheduling & Recovery — [#225](https://github.com/0verme/data-warehouse-visualized/issues/225)

- 候选：`existing` dependencies；`improve` retry/rerun/backfill；`new` failure recovery（#220 重点）。
- 状态机前提：`BAD_INPUT → IMPACT_DISCOVERY → QUIESCE_RUNNING → SAFE_RERUN_PLAN → ORDERED_REPLAY → VALIDATION → CONSUMER_NOTIFICATION`。
- **#221 协调：** 中文线（8 篇文章 + 事故实验室）先行；英文线只做 English-first 独立页面并复用其案例 / 内核 / 术语，不重复实现。
- 禁止：新建调度日期 / 业务日期英文页面（#208 STOP）。
- 复用：`lifecycle-path`、`delivery-investigation`、`duplicate-scheduler-entry`、`scheduler`、`scheduling-failure`、`scheduling-rerun`。

### Cluster E · Quality, Lineage & Governance — [#226](https://github.com/0verme/data-warehouse-visualized/issues/226)

- 候选：`improve` lineage / impact（gate-free）；`new` quality checks、data contracts、pipeline observability。
- 边界：质量检查（校验什么）↔ 契约（生产者 / 消费者接口）↔ observability（健康信号）↔ lineage / impact（来源与影响）。
- 复用：第 06 / 07 / 08 章、`DataQualityWorkbench`、`GovernanceWorkbench`、`LineageTeachingLab`、13-2 交付案例。

### Cluster F · Open Lakehouse — [#227](https://github.com/0verme/data-warehouse-visualized/issues/227)

- 候选：`new` What Is a Lakehouse（准确性门槛最高）；`defer` Data Lake vs DW、Apache Iceberg。
- 边界：与 A 簇 layers 不重叠；不写产品评测、不编造版本 / benchmark。
- 复用：第 09 章、`LakehouseArchitectureLab`、`object-lifecycle`。

---

## 6. 实施优先级与 Wave 规划（Gate 解除后启动）

| Wave                              | 内容                                                                                | 前置条件                                 |
| --------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- |
| **Wave 0（现在可做，gate-free）** | 既有页面原地增强（#12 / #15 / #16）；内链审计；证据与观测回写；内容矩阵维护         | 无需 Gate；不新增 URL / primary intent   |
| **Wave 1**                        | D 失败恢复（重点，需先完成设计与 #221 协调）；E quality checks；B fact vs dimension | #39 允许 + #179 结论 + intent audit PASS |
| **Wave 2**                        | C partition pruning；A layers；B incremental vs full                                | 同上；一个 Cluster 一个最小 Child        |
| **Wave 3**                        | B star vs snowflake；E data contracts；E observability；C data skew                 | 同上                                     |
| **Wave 4**                        | F lakehouse anchor                                                                  | 同上 + 准确性审查 PASS                   |
| **Deferred**                      | OLTP vs OLAP；ETL vs ELT；window performance；Data Lake vs DW；Iceberg              | 真实 query 证据 + 可维护资产             |

原则：#220 明确「不强制按表清仓、不强制凑够 24 篇」；按独立意图与实际效果选择下一个 Child。

---

## 7. 页面质量合同

### 7.1 继承 #220 Phase 2（九条，全部适用）

1. One URL, one primary intent。
2. Concrete engineering evidence。
3. Distinct teaching form；优先复用现有 island / fixture / 引擎。
4. Domain consistency（术语 + 教学域）。
5. Native English quality；不编造 benchmark / 结论。
6. Discovery / SEO（slug、title/H1、description、lang、self-canonical、sitemap、可爬取、内链）。
7. Correctness & regression（SQL/fixture 自动验证、build/tests、BASE_PATH、移动端、中文不回归）。
8. Evidence labeling（hypothesis / 上线验收 / GSC 成效分开）。
9. Delivery（一个 Child 一个聚焦 PR + before/after + 证据）。

### 7.2 仓库附加合同

- 复用 `BaseLayout` / `EnglishArticleLayout` / `EnglishFoundationShell` / `EnglishBreadcrumb` / `getEnglishRoute`；路由只登记在 `ENGLISH_PATHS`。
- 不新增 `/en/learn/*`、`/en/labs/*`、`/en/cases/*`、`/zh/*`、`/en/blog/*`；不建 locale / router / content 框架。
- 无真实语言等价不新增 `hreflang`；不把近似内容标为 alternate。
- 不引入新依赖或重型运行时；SQL Sandbox 保持 lazy / opt-in。
- 术语遵循 `docs/TERMINOLOGY.md`；案例遵循 `docs/BANKING_TEACHING_DOMAIN.md`；交互遵循 `docs/DIAGRAM_VISUAL_GRAMMAR.md` §7.4 Interaction Quality。
- 正文含中文的 PR 必须检查 diff 编码（UTF-8、无乱码）。

---

## 8. 实施 Child 最小模板（Gate 解除后使用）

```text
标题: [English][Cluster X][实施] <页面 / 任务>
Parent: #22x（Cluster 规划 Issue）· Epic: #220
Gate 证据: #39 允许结论链接 + #179 观测结论链接
范围: 单一 primary intent；冻结 URL；明确的 Non-goals
候选判定: 对应本文件 §4 的 new / improve 条目
复用资产: fixture / 内核 / 组件清单（不复制）
质量标准: 本文件 §7（九条 + 仓库附加）
验收命令: npm test / npm run check / npm run build / npm run test:english-seo-build / BASE_PATH 构建 / test:e2e:english-foundation / 人工 UAT
交付: 一个聚焦 PR；before/after、目标 URL、测试输出、内链、风险、rollback
Loop: 串行；BLOCKED 如实记录；禁止自行解除 Gate
```

---

## 9. Agent Loop 执行边界

1. **同步**：先 `git fetch` 最新 `origin/main`，读取 Issue/PR 与本文件，确认 #39 / #179 Gate 状态；不覆盖脏工作区。
2. **单线程**：一次只领取一个 Child；一个 worktree / branch / PR；绝不并行修改英文路由、共享导航或 `ENGLISH_PATHS`。
3. **Gate 优先**：Gate 未解除时只做 Wave 0；新增搜索型页面一律 HOLD。
4. **禁止自创**：路由架构、locale、hreflang、大量并行分支、跳过 CI、无证据批量发文、强行合并、删除受保护内容。
5. **失败语义**：CI 失败、证据冲突、测试环境不可用、Gate 未解除时标记 `BLOCKED` 并停止对应实现；只读审计可继续；禁止伪称 PASS。
6. **回写**：每轮把 baseline、decision、变更、验证、PR/merge、可观察 URL、下一步、blocker 回写 Child 与 #220。
7. **合并授权**：自动合并仅适用于已授权且通过校验、review 与分支保护的 Child；不以无人值守为理由绕过门槛。
8. **状态真实性**：创建候选 Issue ≠ 审计完成 ≠ 页面发布 ≠ 搜索增长；四者必须分开记录。

---

## 10. 已确认可执行（gate-free）任务（Wave 0，2026-10-17 已完成；保留为历史记录）

| 任务                                                                | Cluster | 说明                                                             | 前置     |
| ------------------------------------------------------------------- | ------- | ---------------------------------------------------------------- | -------- |
| 既有 lineage 页面 quick answer 增强（#15）                          | E       | 补一句式 lineage 定义与「与 task dependency 的区别」；不新增 URL | 无       |
| 既有 lineage 页面 impact 小节增强（#16）                            | E       | 强调影响闭包与证据，不拆 URL                                     | 无       |
| idempotent-etl 的 retry / rerun / backfill 小节增强（#12）          | D       | 与 `docs/TERMINOLOGY.md` 对齐，补边界与互链                      | 无       |
| `/en/data-warehouse/` 索引承接 What Is a Data Warehouse（#1 merge） | A       | 一小段定义 + 指向子页面；不写成长文                              | 无       |
| 内链审计与最小补齐（含 scd → lineage 评估）                         | 全部    | 普通链接；不硬加无关链接                                         | 无       |
| #179 观测窗口回写（2026-10-20 / 2026-11-03）                        | —       | GSC 可用性、query → page；不可用则继续 `DATA NOT YET AVAILABLE`  | 外部数据 |
| 内容矩阵与 Child 判定维护                                           | 全部    | 每轮更新本文件与 #220                                            | 无       |

> **2026-10-17 更新：** 表中 Wave 0 任务（E 簇 lineage 增强、D 簇 retry / rerun / backfill 增强、A 簇索引短定义、内链审计）已由 PR #244 / #246 / #248 / #249 / #252 完成并 merged。§4.1 中 11 个 `new` 候选的新页面实现已由 #39 Maintainer-Authorized Content Expansion 授权，进入 §14 冻结实施队列。

**历史 HOLD 记录（已解除）：** §4.1 中 11 个 `new` 候选在授权前的新页面实现 HOLD。

---

## 11. 阻塞、风险与依赖

| 类型   | 内容                                                                         | 影响                                               | 处理                                          |
| ------ | ---------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------- |
| Gate   | #39 `Phase 4 — Expansion` = **ACTIVE / Maintainer-Authorized**（2026-10-17） | 已解除：授权 11 个 new + 重评纳入的 defer 候选实施 | 按 §14 冻结队列串行实施                       |
| 数据   | #179 GSC / SERP = `DATA NOT YET AVAILABLE`；环境无 GSC 访问                  | 不阻断实施；影响上线后成效观测                     | 按批次记录观测基线；如实记录；不推断 0 / 失败 |
| 先例   | #208（CLOSED，2026-10-10）Scheduling / Business Date topic cluster STOP      | 禁止复活同 intent 日期语义页                       | 写入 §4 / Cluster D                           |
| 并行   | #221（中文依赖链重做专题，2026-10-17）                                       | 与 Cluster D 同域；重复建设 / 术语漂移风险         | 英文线只做独立页面 + 复用；跟踪 #221 设计     |
| 资产   | C 簇 window performance 无独立实验资产；F 簇 Iceberg 无实操资产              | 无法保证差异化与准确性                             | 保持 defer；满足条件再评估                    |
| 准确性 | Lakehouse / 表格式事实时效性强                                               | 事实过时或误导                                     | Cluster F 准确性审查清单 + 不确定处降级表述   |
| 环境   | 本环境无 GSC 登录 / 无 SERP 数据源                                           | 证据级别受限                                       | Editorial hypothesis 标注；#179 观测窗口      |

---

## 12. Non-goals

- 不批量翻译 56 节中文课程；不建 `/en/learn/*`。
- 不新建路由框架、locale runtime、CMS、翻译流水线或 `hreflang`。
- 不建工具页面（`/en/tools/*` 保持 shell）。
- 不承诺排名 / 流量 / 收录结果；不把 HTTP 200 写成搜索成功。
- 不为「24 篇」或「P0」凑数建页；不因热点硬写 Iceberg。

---

## 13. 变更记录

| 日期       | 变更                                                                                                                                                         | 证据                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 2026-10-17 | Phase 0 审计完成；24 候选判定冻结；创建 Cluster A–F 规划 Child #222–#227；标注 #221 协调与 #208 停止先例                                                     | 本文件；#220；生产探针 9/9 200；sitemap 68（9 英文）                               |
| 2026-10-17 | 维护者调整策略为 Maintainer-Authorized Content Expansion；GSC / SERP 转为上线后观测；5 个 defer 候选重评（2 纳入 / 3 保持 defer）；冻结 13 篇实施队列（§14） | #39 Phase 4 更新；#220 Current Contract Update；本文件 §14                         |
| 2026-10-17 | 队列第 1 篇 `pipeline-failure-recovery` merged 并上线；§14.5 台账启用                                                                                        | PR #262 `e0a564b`；deploy `39028372556`；生产探针 10/10 英文路由                   |
| 2026-10-17 | 队列第 2 篇 `data-quality-checks` merged 并上线；台账补录第 2 行                                                                                             | PR #265 `4a599a5`；deploy `39030453540`；生产探针 11/11 英文路由                   |
| 2026-10-17 | 队列第 3 篇 `data-contracts` merged 并上线；台账补录第 3 行                                                                                                  | PR #267 `e6fac48`；deploy `39032017897`；生产探针 12/12 英文路由                   |
| 2026-10-17 | 队列第 4 篇 `pipeline-observability` merged 并上线；Cluster E 完成；台账补录第 4 行                                                                          | PR #269 `428dded`；deploy `39033653943`；生产探针 13/13 英文路由                   |
| 2026-10-17 | 队列第 5 篇 `fact-vs-dimension-tables` merged 并上线；Cluster B 开始；台账补录第 5 行                                                                        | PR #271 `67c48a0`；deploy `39035457680`；生产探针 14/14 英文路由                   |
| 2026-10-18 | 队列第 6 篇 `star-schema-vs-snowflake` merged 并上线；Cluster B 第 2 篇完成；补录第 6 篇行并复核第 6 篇生产交互                                              | PR #273 `671adfd`；CI `39085637391`；deploy `39086246495`；生产页面与交互探针 PASS |

> 后续 Loop 应在完成 Wave 0 任务、Gate 变化或 Child 判定调整时更新本表与 #220，而不是重写整份文档。

---

## 14. 冻结实施队列（2026-10-17 · Maintainer-Authorized Content Expansion）

> **依据：** #39 Phase 4 维护者授权（授权范围 = 本文件已审计矩阵）；策略目标 = 一次性建立覆盖完整、互相关联、具备独立教学价值的英文专题网络，GSC / SERP 不再作为强制前置。
> **边界：** 队列外主题不自动获得授权；不为凑篇数发布；所有关键词仍为 **editorial hypothesis**，不得表述为已验证的高流量机会。

### 14.1 冻结结论

| 类别                  | 数量 | 说明                                                                                              |
| --------------------- | ---- | ------------------------------------------------------------------------------------------------- |
| `new`（原审计 11 项） | 11   | 全部进入实施队列                                                                                  |
| `defer` 重评后纳入    | 2    | OLTP vs OLAP；ETL vs ELT（理由见 §14.2）                                                          |
| `defer` 保持          | 3    | SQL window function performance；Data Lake vs Data Warehouse；Apache Iceberg Explained            |
| `existing`            | 4    | 不重复创建 URL：JOIN duplicates、grain、SCD Type 2、lineage vs task dependency（含 dependencies） |
| `improve`             | 3    | Wave 0 已完成（PR #244 / #246 / #249）：lineage 定义、impact、retry / rerun / backfill            |
| `merge`               | 1    | Wave 0 已完成（PR #248）：What Is a Data Warehouse → `/en/data-warehouse/` 索引短定义             |
| `reject`              | 0    | —                                                                                                 |

**本轮新增页面目标：13 篇；实施完成后英文 URL 总数预计 9 + 13 = 22 条**（不含未来轮次）。

### 14.2 defer 候选重评结论（2026-10-17）

| #   | 候选                            | 重评结论                  | 理由                                                                                                                                                                                                                                   |
| --- | ------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | OLTP vs OLAP                    | **纳入本轮**（Cluster A） | 独立意图（为什么数仓不能直接承接事务负载 / 行存与列存差异）；概念稳定、无需依赖第三方 SERP；本站可用确定性 page-access 模型讲清「同一聚合在行存与列存下各读多少数据」；与 layers / grain 无同意图冲突，且能为 Cluster A 提供基础锚点。 |
| 3   | ETL vs ELT                      | **纳入本轮**（Cluster A） | 独立意图（转换发生在加载前还是加载后）；工程后果可观察：原始数据留存、可重放范围、计算位置；与 idempotent-etl（写入是否满足重复执行安全）和 layers（层职责）边界明确。范围收紧为「转换位置决策」，不写成管道教程。                     |
| 18  | SQL Window Function Performance | **保持 defer**            | 缺少独立确定性实验资产；窄化角度未定义；与通用 window function 教程竞争，无法保证本站差异化教学价值。                                                                                                                                  |
| 20  | Data Lake vs Data Warehouse     | **保持 defer**            | lakehouse 页面（Cluster F）将直接解释湖 / 仓 / 表格式关系；单独 head-to-head URL 与 lakehouse 及 layers 页面存在同意图竞争风险；待真实 query 证据显示独立意图后再评估。                                                                |
| 22  | Apache Iceberg Explained        | **保持 defer**            | 本站没有 Iceberg 实操实验资产；规范 / 版本 / 生态事实时效性强，无法保证长期准确性；待出现可维护事实源或真实实验后再评估。                                                                                                              |

### 14.3 实施顺序与页面合同（串行，一次一篇）

> 顺序遵循维护者指定队列：D → E → B → C → A → F。每篇 = 一个最小实施 Child Issue + 一个 worktree / branch / 聚焦 PR。
> 「Primary intent」为冻结假设（editorial hypothesis）；「URL」为冻结 stable slug，实施时不得漂移。

| 序  | Cluster | 页面                            | Stable URL                                      | Primary intent（假设）                                              | 与既有页边界                                                                                                                                        | 复用资产（不复制）                                                                                                                                                            |
| --- | ------- | ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | D #225  | Data pipeline failure recovery  | `/en/data-warehouse/pipeline-failure-recovery/` | `data pipeline failure recovery`；`rerun downstream after bad data` | 不讲写入是否幂等（idempotent-etl）、不讲依赖图差异（lineage 页面）；聚焦「坏数据已进入下游后的影响闭包 → 停止 / 等待 → 安全重跑顺序 → 验证 → 通知」 | `src/features/dependency-reprocessing/{fixture,model,session,steps}.ts`（#221 内核，只读复用）；step kernel；`LifecyclePathLab` / `DeliveryInvestigationLab` 的状态与证据表达 |
| 2   | E #226  | Data quality checks             | `/en/data-warehouse/data-quality-checks/`       | `data quality checks`；`what to validate in a data pipeline`        | 不是监控 / 告警（observability）；不是生产者契约（contracts）；聚焦「检查什么、在哪检查、失败后阻断还是放行」                                       | `src/features/data-quality/*`；`DataQualityWorkbench` 规则 / 证据表达                                                                                                         |
| 3   | E #226  | Data contracts                  | `/en/data-warehouse/data-contracts/`            | `data contract example`；`producer consumer data contract`          | 不是数据质量规则（checks）；聚焦生产者 / 消费者接口、字段语义、变更责任与破坏性变更流程                                                             | `sql-transformation-contract` 课程数据；治理变更责任模型；`GovernanceWorkbench` 表达                                                                                          |
| 4   | E #226  | Data pipeline observability     | `/en/data-warehouse/pipeline-observability/`    | `data pipeline observability`；`pipeline health signals`            | 不是「校验规则」（checks）、不是「来源 / 影响」（lineage）；聚焦「看得见哪些信号、如何判断一次运行 / 一个数据集是否健康」                           | `src/features/delivery-investigation/*`；`scheduling-sla` / `data-quality-evidence` 语义；`DeliveryInvestigationLab` 时间线                                                   |
| 5   | B #223  | Fact table vs dimension table   | `/en/data-warehouse/fact-vs-dimension-tables/`  | `fact table vs dimension table`                                     | 不重复解释 grain（一行是什么）；聚焦角色、主键 / 外键、度量与描述的分工、为什么通常不合并                                                           | `star-schema.ts`；`banking-fact-types.ts`；`BankingFactTypesLab` 对照式布局                                                                                                   |
| 6   | B #223  | Star schema vs snowflake schema | `/en/data-warehouse/star-schema-vs-snowflake/`  | `star schema vs snowflake schema`                                   | 不是 fact/dim 定义；聚焦同一模型的规范化程度与 join 形状、维护 / 查询取舍                                                                           | `star-schema.ts`；`BankingStarSchemaLab`；`StarSchemaFlow` 拓扑表达                                                                                                           |
| 7   | B #223  | Incremental load vs full load   | `/en/data-warehouse/incremental-vs-full-load/`  | `incremental load vs full load`                                     | 不重复 idempotent-etl 的写策略；聚焦「重算范围 / 成本 / 迟到数据 / 如何验证等价」                                                                   | `performance-tradeoffs` 语义；微批 fixture；`IdempotentRerunLab` 状态表达方式（仅参考）                                                                                       |
| 8   | C #224  | Data skew                       | `/en/sql/data-skew/`                            | `data skew in SQL`；`one task takes all the time`                   | 不是 JOIN 行放大正确性；聚焦执行分布长尾、键选择 / 加盐 / 重分布的取舍；标注「教学模拟 ≠ benchmark」                                                | `src/features/performance/*` skew fixture；`PerformanceSkewLab`                                                                                                               |
| 9   | C #224  | Partition pruning               | `/en/sql/partition-pruning/`                    | `partition pruning explained`；`partition filter not used`          | 不是 skew（分布）；聚焦扫描裁剪、谓词 / 类型 / 统计信息为何导致裁剪失效；写清「取决于引擎」                                                         | `src/features/performance/*` scan fixture；`PerformanceScanLab`                                                                                                               |
| 10  | A #222  | Data warehouse layers           | `/en/data-warehouse/layers/`                    | `data warehouse layers explained`；`staging vs core vs mart`        | 不把 ODS/DWD/DWS/ADS 或 medallion 说成标准；不写湖仓（Cluster F）；聚焦分层动机、跨层读取代价、何时不需要更多层                                     | `warehouse-layers` / `sql-transformation-layers` 课程数据；`LayerEvolutionLab` / `LayerNetworkEvolution`                                                                      |
| 11  | A #222  | OLTP vs OLAP                    | `/en/data-warehouse/oltp-vs-olap/`              | `oltp vs olap`；`why can a data warehouse not handle transactions`  | 不是 layers（层职责）；聚焦访问模式（行存 / 列存、单行读写 vs 大范围聚合扫描）与架构后果                                                            | 新增确定性 page-access 模型；`LayerEvolutionLab` 布局参考                                                                                                                     |
| 12  | A #222  | ETL vs ELT                      | `/en/data-warehouse/etl-vs-elt/`                | `etl vs elt`；`transform before or after load`                      | 不是写策略幂等；聚焦转换位置对原始数据留存 / 重放 / 计算位置的影响与决策清单                                                                        | 新增确定性「转换位置」模型；`sql-transformation-layers` 课程数据                                                                                                              |
| 13  | F #227  | What is a lakehouse             | `/en/data-warehouse/lakehouse/`                 | `what is a lakehouse`                                               | 不是 layers；聚焦文件 / 表 / 查询引擎角色与表格式解决的问题；不作产品背书、不编造版本与 benchmark                                                   | `src/utils/lakehouse.ts`；`LakehouseArchitectureLab` 表达；准确性审查清单（#227 §5）                                                                                          |

### 14.4 每篇统一验收标准（继承 §7 并具体化）

1. `ENGLISH_PATHS` 登记 stable URL；页面使用 `EnglishArticleLayout` + `EnglishBreadcrumb`；`active` 分区正确。
2. 准确 title（含 `| sql.sb`，≤ 约 65 字符）、唯一 H1、description、self-canonical、`lang=en`、`og:locale=en_US`、无 hreflang、无 noindex、进入 sitemap。
3. Quick answer + 分节 h2 + 可复核示例（表格 / fixture / SQL + 期望输出）+ 工程解释 + 边界与权衡 + Related pages（入链 + 回链）。
4. 交互 / 图解为 deterministic React island 或静态对照；优先复用既有 fixture / step kernel；不新增重型依赖。
5. 新 fixture 纯函数单测（`npm test`）；SEO build contract（`tests/english-seo-build-contract.mjs` 路由清单 + title）、`tests/english-foundation.mjs`（如涉及）；`npm run check` / `lint` / `format:check` / `build` / `test:english-seo-build` / `BASE_PATH` build + SEO contract。
6. 中文 `/learn/*` 与既有 9 条英文路由零回归；移动端 320 / 390 与桌面 1280 人工或脚本检查无横向溢出、无文本拼接。
7. PR 为中文说明（before / after、目标 URL、测试输出、内链、风险、rollback）；CI 全绿后按授权 squash merge；merge 后回写 Child Issue、#220 与 §14.5 台账。

### 14.5 批次上线台账（每篇 merge 后追加）

| 日期 (UTC) | URL                                             | Cluster / Child     | PR                                                                   | Merge SHA | Deploy run            | 观测基线（GSC / 探针）                                                                                                                                                                                                                                |
| ---------- | ----------------------------------------------- | ------------------- | -------------------------------------------------------------------- | --------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-17 | `/en/data-warehouse/pipeline-failure-recovery/` | D #225 / Child #261 | [#262](https://github.com/0verme/data-warehouse-visualized/pull/262) | `e0a564b` | `39028372556` success | 生产探针 2026-10-17T11:17Z：HTTP 200 / `lang=en` / self-canonical / `og:locale=en_US` / 无 noindex / 无 hreflang / 唯一 H1 / SSR 正文 17,283 字符；sitemap 含该 URL（英文路由 10 条）；GSC = `DATA NOT YET AVAILABLE`                                 |
| 2026-10-17 | `/en/data-warehouse/data-quality-checks/`       | E #226 / Child #264 | [#265](https://github.com/0verme/data-warehouse-visualized/pull/265) | `4a599a5` | `39030453540` success | 生产探针 2026-10-17T11:52Z：HTTP 200 / `lang=en` / self-canonical / 无 noindex / 无 hreflang / 唯一 H1 / SSR 正文 15,211 字符 / 无 CJK；sitemap 含该 URL（英文路由 11 条）；GSC = `DATA NOT YET AVAILABLE`                                            |
| 2026-10-17 | `/en/data-warehouse/data-contracts/`            | E #226 / Child #266 | [#267](https://github.com/0verme/data-warehouse-visualized/pull/267) | `e6fac48` | `39032017897` success | 生产探针 2026-10-17T12:15Z：HTTP 200 / `lang=en` / self-canonical / 无 noindex / 无 hreflang / 唯一 H1 / SSR 正文 12,944 字符 / 无 CJK；sitemap 含该 URL（英文路由 12 条）；GSC = `DATA NOT YET AVAILABLE`                                            |
| 2026-10-17 | `/en/data-warehouse/pipeline-observability/`    | E #226 / Child #268 | [#269](https://github.com/0verme/data-warehouse-visualized/pull/269) | `428dded` | `39033653943` success | 生产探针 2026-10-17T12:59Z：HTTP 200 / `lang=en` / self-canonical / 无 noindex / 无 hreflang / 唯一 H1 / SSR 正文 12,017 字符 / 无 CJK；sitemap 含该 URL（英文路由 13 条）；GSC = `DATA NOT YET AVAILABLE`                                            |
| 2026-10-17 | `/en/data-warehouse/fact-vs-dimension-tables/`  | B #223 / Child #270 | [#271](https://github.com/0verme/data-warehouse-visualized/pull/271) | `67c48a0` | `39035457680` success | 生产探针 2026-10-17T13:19Z：HTTP 200 / `lang=en` / self-canonical / 无 noindex / 无 hreflang / 唯一 H1 / SSR 正文 11,484 字符 / 无 CJK；sitemap 含该 URL（英文路由 14 条）；GSC = `DATA NOT YET AVAILABLE`                                            |
| 2026-10-18 | `/en/data-warehouse/star-schema-vs-snowflake/`  | B #223 / Child #272 | [#273](https://github.com/0verme/data-warehouse-visualized/pull/273) | `671adfd` | `39086246495` success | 生产探针 2026-10-18T01:31Z：HTTP 200 / `lang=en` / self-canonical / `og:locale=en_US` / 无 noindex / 无 hreflang / 唯一 H1 / SSR 正文 11,523 字符 / 无 CJK；sitemap 含该 URL（英文路由 15 条）；320/360 交互复验 PASS；GSC = `DATA NOT YET AVAILABLE` |
| 2026-10-18 | `/en/data-warehouse/incremental-vs-full-load/`  | B #223 / Child #274 | [#275](https://github.com/0verme/data-warehouse-visualized/pull/275) | `5f29c4d` | `39090202803` success | 生产探针 2026-10-18T02:39Z：HTTP 200 / `lang=en` / canonical / `og=en_US` / H1=1 / SSR 12,551 字符；无 noindex / hreflang / CJK；sitemap 16 条。浏览器 320/360 无溢出，三种方案交互预期值与等价性 PASS，0 page errors；GSC = `DATA NOT YET AVAILABLE` |
| 2026-10-18 | `/en/sql/data-skew/`                            | C #224 / Child #277 | [#278](https://github.com/0verme/data-warehouse-visualized/pull/278) | `95e7554` | `39103430803` success | HTTP 200 / `lang=en` / canonical / `og=en_US` / H1=1 / SSR 10,779 chars; no noindex/hreflang/CJK; sitemap route (17 URLs); 320/360/390/1280 no overflow; lab PASS, 0 errors; GSC = `DATA NOT YET AVAILABLE`                                           |

**观测基线规则：** 每篇记录 launch date、URL、commit、deploy run 与首次生产探针结果（HTTP / lang / canonical / sitemap / SSR 正文）；GSC / SERP 数据可得时追加 query / impression / index 状态，不可得时记 `DATA NOT YET AVAILABLE`；不与 #179 Baseline A / B 合并。

### 14.6 Loop 恢复指引

1. 读取本文件 §14 + #220 Current Contract Update + `STATUS.md`。
2. 按 §14.3 顺序找到第一篇尚未在 §14.5 台账登记的行，即为下一任务；若该行已有 Child Issue，先 `gh issue view` 核对状态与 PR。
3. 已 merged 的页面不得重复开发；已 OPEN 的 PR 先查 CI / mergeable，失败先修复。
4. 一次只允许一个实施工作推进；共享文件（`ENGLISH_PATHS`、`tests/english-seo-build-contract.mjs`、索引页、导航）只能串行修改。
5. 受阻时如实标记 `BLOCKED` 并跳过到下一个不依赖该阻塞的队列项，但不绕过 CI / 评审 / 保护规则。
