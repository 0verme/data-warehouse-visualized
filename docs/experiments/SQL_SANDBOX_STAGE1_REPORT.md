# SQL Sandbox Stage 1 教学 POC 报告（Issue #35）

- 日期：2026-10-04
- 实施基线：`origin/main` = `a6108635713ed43f2b8b672e2afd7c7dbc37881c`（PR #192 / Stage 0 merged）
- 工作区：`/vol5/1000/ai-workspace/data-warehouse-visualized_base/worktrees/issue-35-sql-sandbox-stage1`
- Branch：`feat/issue-35-sql-sandbox-stage1`
- 状态：**Stage 1 IMPLEMENTED；PR 待 review / merge，`READY != MERGED`**
- 说明：本报告只覆盖 Stage 1 教学 POC。未实现 JOIN 第二场景、窗口函数、SQL IDE 能力或全课程迁移。

---

## 0. 结论先行

| 验证项           | 结论                                       | 关键证据                                                                                                                                             |
| ---------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 目标课程教学闭环 | **PASS**                                   | `sql-transformation-layers` 末尾 optional 折叠实验：真实 DuckDB 执行 + 确定性 DWS / ADS 参考并排对照                                                 |
| 真 DuckDB 执行   | **PASS**                                   | `SELECT 1`、默认聚合、WHERE / GROUP BY / 明细 / ADS 复现全部来自真实 DuckDB 结果（浏览器 E2E 断言行数与金额，非字符串匹配）                          |
| 默认 SQL parity  | **PASS**                                   | 默认 SQL = `getTransformationStep('aggregate-layers').sql`；真实结果 3 行 / 430000 / 目标 1 行 / 300000，与 `getLayerSnapshots()` DWS / ADS 快照一致 |
| Lazy load 三段式 | **PASS**                                   | 普通课程 0 DuckDB；目标课程折叠 0 DuckDB 且不加载 Sandbox chunk；展开只加载 Sandbox UI chunk；运行才加载 runtime + worker + wasm                     |
| 静态隔离守卫     | **PASS**                                   | `scripts/check-duckdb-isolation.mjs` 扩展 Stage 1 断言；root / `BASE_PATH` 构建均通过；CI 继续在 `npm run build` 后执行                              |
| 错误体验         | **PASS**                                   | 语法 / 字段 / GROUP BY / 表 / 守卫 / 超时 6 类实测可读 + 原始错误可展开 + 可恢复                                                                     |
| Worker 生命周期  | **PASS**                                   | 折叠 0 / 运行 1 / 重置 0 / 重跑 1 / 软跳转离开 0 / 返回重开 1，无重复 worker                                                                         |
| BASE_PATH        | **PASS**                                   | `BASE_PATH=/data-warehouse-visualized/` build + isolation + E2E 56/56                                                                                |
| 普通课程 JS 成本 | **PASS（附披露）**                         | DuckDB 0 B；静态闭包 362,497 → **363,833 B（+1,336 B）**，全部来自折叠入口 UI（`LearnShell`），非 DuckDB                                             |
| 移动端冷启动     | **CONDITIONAL（与 Stage 0 相同的边缘值）** | Chromium 模拟 Pixel 5 / 4 Mbps / 100 ms / 4× CPU：14,840 / 15,094 / 15,411 ms，贴近 15 s 门槛，无 OOM / 崩溃；真机未验证                             |

> **Stage 1 判定建议：PASS（附移动端边缘值约束）**，是否进入 Stage 2 由 review / merge 后单独判定；本 PR 不启动 Stage 2。

---

## 1. 交付范围

### 1.1 教学形态

- 只在 `sql-transformation-layers`（第 04 章第 4 节）**最后**追加一个 `kind: 'sql-sandbox'` section。
- 默认折叠：折叠态只渲染标题、说明和「打开进阶实验」按钮；不加载 Sandbox chunk。
- 展开后：可用表说明 / SQL 编辑器 / 运行 / 重置 SQL / 重置实验环境 / 真实结果表 / 查询状态 / 错误反馈 / 参考结果对照。
- 默认 SQL 直接来自 `getTransformationStep('aggregate-layers')!.sql`，不维护第二份 SQL 字符串。
- 数据来自 `buildDepositBalanceRows(depositBalanceDataset)` 单向 seed（12 列，4 行），不使用 Sandbox 专用 fixture。

### 1.2 三段式加载（硬验收）

```text
普通课程 / 其他 SQL 课程
  → 0 DuckDB JS / 0 WASM / 0 Worker

sql-transformation-layers，未展开
  → 0 DuckDB；Sandbox chunk 未加载

展开 Sandbox，未运行
  → 只加载 SqlSandboxLab chunk（13,007 B raw / 5,398 B transfer）

点击运行
  → dynamic import runtime chunk（195,483 B raw / 45,841 B transfer）
  → CDN worker JS（188,628 B br）+ wasm（6,764,975 B br）
```

`@duckdb/duckdb-wasm` 仍只被 `src/features/sql-sandbox-experiment/runtime.ts` 静态 import；教学状态机在 `run()` 内 `await import('./runtime')`。`LessonSectionRenderer` / `LearnShell` / lesson content / `sql-transformation.ts` / `deposit-balance.ts` 均无 DuckDB 静态依赖。

### 1.3 SQL 能力边界与守卫

- 能力：`SELECT` / `WITH` / `WHERE` / `GROUP BY` / `HAVING` / `ORDER BY` / `LIMIT` / `DISTINCT` / 基础聚合 / `CASE WHEN`，单条只读语句。
- 守卫（复用 Stage 0 `guard.ts`）：单语句、首关键字 `SELECT` / `WITH`、长度 ≤ 4,000 字符、禁止 DDL / DML / 文件访问动词，注释与字符串字面量先做 mask。
- 展示上限 200 行（`arrowTableToResult`），超出显示「仅显示前 200 行」并保留真实行数。
- 查询超时 10,000 ms；超时后终止 worker 并提示「查询超时，实验环境已重置」，可重新运行。
- 安全边界仍是浏览器本地内存实例 + seed 后 `SET enable_external_access=false` + `SET lock_configuration=true` + 无服务端。

---

## 2. 文件清单

新增：

```text
src/features/sql-sandbox-experiment/
  errors.ts                    # 纯函数：错误分类 / 教学文案 / timeout 错误类型
  comparison.ts                # 纯函数：真实结果 ↔ DWS / ADS 参考对照
  use-lesson-sql-sandbox.ts    # Stage 1 状态机（自动启动 / race-safe / timeout / 生命周期）
src/components/visualizations/SqlSandboxLab.tsx
src/styles/lessons/sql-sandbox.css
tests/sql-sandbox.test.tsx
tests/e2e/sql-sandbox-stage1.mjs
docs/experiments/SQL_SANDBOX_STAGE1_REPORT.md
```

修改：

```text
src/content/types.ts                          # LessonSqlSandboxSection 契约
src/components/lesson/LessonSectionRenderer.tsx  # 折叠占位 + lazy lab 边界
src/content/lessons/sql-and-transformation-layers.ts  # 追加 sql-sandbox section
src/utils/heading-id.ts                       # SectionHeadingKind += sql-sandbox
src/utils/lesson-styles.ts                    # sql-sandbox.css 归属
src/features/search/types.ts + build-index.ts # sql-sandbox 搜索文档 kind
src/features/sql-sandbox-experiment/reference.ts  # getSqlSandboxReference（保留 Stage 0 alias）
src/features/sql-sandbox-experiment/runtime.ts    # busy worker 下 terminate 不挂起
scripts/check-duckdb-isolation.mjs            # Stage 1 静态断言 + BASE_PATH aware
tests/search-index.test.tsx / tests/lesson-styles.test.ts
package.json                                  # test:e2e:sql-sandbox
```

未修改：`SqlTransformationWorkbench.tsx`、`src/utils/sql-transformation.ts`、`src/data/deposit-balance.ts`、其余 4 节 SQL 课程交互、其他章节、全局 visualization framework；未抽 `DatasetRegistry` / `GenericSqlEngine` / `VisualizationAdapter` 等抽象。

---

## 3. 隔离证据

### 3.1 静态（`scripts/check-duckdb-isolation.mjs`）

root 构建实测：

```text
[isolation] harness 静态闭包: 273614 B
[isolation] DuckDB runtime chunk: /_astro/runtime.<hash>.js (195483 B)
[isolation] sql-sandbox lab chunk: /_astro/SqlSandboxLab.<hash>.js (13007 B)
[isolation] lesson runtime chunk: /_astro/runtime.<hash>.js (195483 B)
[isolation] 目标课程: learn/sql-transformation-layers/index.html
[isolation] sql-transformation-layers 静态闭包: 363833 B / 11 个文件
[isolation] 普通课程静态闭包最大值: 363833 B / 11 个文件
```

新增断言：

1. 目标课程静态闭包不得包含 `sql-sandbox-lab` 标记（Sandbox chunk 必须 dynamic import）。
2. Sandbox lab chunk 的静态闭包不得包含 DuckDB runtime 标记。
3. Sandbox lab 必须存在 dynamic import → DuckDB runtime chunk。
4. 非 `/dev/` 页面不得**引用** duckdb 资源（课程文案中的 “DuckDB” 不算；Stage 0 规则收窄为资源引用检查）。
5. checker 支持 `BASE_PATH` 前缀归一化（`BASE_PATH=/data-warehouse-visualized/` 构建同样通过）。

### 3.2 浏览器 Network（E2E）

- 普通课程 `why-data-warehouse` / `sql-and-transformation` / `scheduling-system`：0 DuckDB / wasm / worker 请求。
- 目标课程折叠态：0 DuckDB 请求、0 Sandbox chunk、0 worker。
- 展开后：Sandbox chunk 加载；仍 0 DuckDB 请求、0 worker。
- 首次运行后：worker = 1；请求仅 `duckdb-browser-eh.worker.js` 与 `duckdb-eh.wasm`（jsDelivr，`content-encoding: br`）。
- 全程 72 个请求中 **0 个非 GET / 0 个带 body**（SQL 文本未进入任何网络请求）。

### 3.3 普通课程 JS 闭包（披露）

| 项                | Stage 0 基线 |       Stage 1 |         变化 |
| ----------------- | -----------: | ------------: | -----------: |
| 普通课程静态闭包  |    362,497 B | **363,833 B** | **+1,336 B** |
| `LearnShell.*.js` |     90,519 B |      91,855 B |     +1,336 B |

- 变化全部来自共享 `LessonSectionRenderer` 的折叠占位 + lazy 边界代码；**DuckDB 0 B**。
- 未命中 Issue 原文旧数字 362,428 B；以本报告实测为准（Issue 已回写）。

---

## 4. 功能证据（真实 DuckDB）

Chromium 153.0.8010.12（Playwright headless，持久磁盘 profile）：

| 实验                                   | 真实结果                           | 对照判定                                 |
| -------------------------------------- | ---------------------------------- | ---------------------------------------- |
| `SELECT 1`                             | 1 行                               | 无 balance 列，提示无法对照金额          |
| 默认聚合（canonical SQL）              | 3 行 / 430000 / 目标 1 行 / 300000 | 与 DWS 参考快照一致                      |
| `WHERE customer_scope='小微'`          | 1 行 / 300000                      | 命中 ADS 目标口径                        |
| `WHERE branch_name='杭州分行'`         | 2 行 / 380000                      | 与参考快照不一致（仍包含空客户口径分组） |
| `GROUP BY branch_name`                 | 2 行 / 430000                      | 合计一致，但行粒度不同                   |
| 去掉 GROUP BY 选 `account_id, balance` | 4 行 / 430000                      | 合计一致，但行粒度不同                   |
| 五个维度全部放进 WHERE                 | 1 行 / 300000                      | 命中 ADS 目标口径                        |
| 空结果 WHERE                           | 0 行                               | 明确的空结果状态，不是执行失败           |

错误体验（均保留 SQL、可继续修改 / 重试）：

| 类型         | 教学文案                         | 原始错误               |
| ------------ | -------------------------------- | ---------------------- |
| Parser       | SQL 语法不完整                   | 可展开                 |
| Binder 字段  | 字段不存在（列出 12 个可用字段） | 可展开                 |
| GROUP BY     | 聚合字段与 GROUP BY 不一致       | 可展开                 |
| Catalog 表   | 表不存在                         | 可展开                 |
| 守卫         | 只读实验限制                     | 无原始错误（本地拦截） |
| 超时（10 s） | 查询超时，实验环境已重置         | 可展开                 |

Reset / 生命周期：

- 「重置 SQL」：恢复 canonical 默认 SQL，清空结果与错误，保留已就绪环境。
- 「重置实验环境」：worker 0，状态回到未运行；再次运行重新建库并返回 3 行。
- 软跳转离开 → worker 0；返回重开 → worker 1；重复进出无多个 worker。
- 超时后 worker 被回收，可重新初始化。

---

## 5. 性能证据

### 5.1 桌面（Chromium headless，持久磁盘 profile）

| 指标                          |                                                      数值 |
| ----------------------------- | --------------------------------------------------------: |
| runtime chunk                 |                         195,483 B raw / 45,841 B transfer |
| Sandbox lab chunk             |                           13,007 B raw / 5,398 B transfer |
| worker JS（CDN br）           |                                                 188,628 B |
| wasm（CDN br）                | 6,764,975 B（Resource Timing `transferSize` 6,765,275 B） |
| 冷启动（点击运行 → 首条结果） |                       **2,428 ms**（多次 2,409–2,784 ms） |
| 热缓存 reload 后运行          |                             **957 ms**（多次 915–978 ms） |
| 热缓存 wasm                   |                                        `transferSize = 0` |
| 默认聚合查询耗时              |                                                101–124 ms |
| worker 数量                   |                                   空闲 0 / 运行 1，无泄漏 |

### 5.2 移动端（Chromium 模拟 Pixel 5 / 4 Mbps / 100 ms RTT / 4× CPU）

| 指标                          |                                                     数值 |
| ----------------------------- | -------------------------------------------------------: |
| 冷启动（点击运行 → 首条结果） |                      14,840 / 15,094 / 15,411 ms（三次） |
| 崩溃 / OOM / pageerror        |                                                       无 |
| 15 s 门槛                     |     **边缘（2/3 次略超）**，与 Stage 0 的 14,997 ms 同级 |
| 390 / 320 px                  | documentScrollWidth = innerWidth；编辑器不超宽；结果正确 |

### 5.3 真实测量与旧 Issue 数字

- Issue #35 原文的旧 bundle / SHA 数字已过期，不再作为决策依据；本轮全部重新测量并回写。
- 未为了匹配旧数字做任何硬优化。

---

## 6. BASE_PATH

- `BASE_PATH=/data-warehouse-visualized/ npm run build`：67 pages。
- isolation checker（base-aware）：PASS。
- E2E（真实子路径 preview）：**56/56 PASS**，dynamic import / worker / wasm / Sandbox chunk 均正确继承前缀。
- 未写死 `/` 路径。

---

## 7. 测试与浏览器覆盖

本地验证（PR 前）：

```text
npm test                         66 files / 569 passed（新增 tests/sql-sandbox.test.tsx 28 项）
npm run check                    0 errors / 0 warnings / 68 hints
npm run lint                     PASS
npm run format:check             PASS
npm run build                    67 pages
scripts/check-duckdb-isolation   PASS（root + BASE_PATH）
npm run test:e2e:learn-scroll    2961/2961
sql-sandbox-stage1 E2E           root 68/68（desktop 56 + mobile 12）
sql-sandbox-stage1 E2E           BASE_PATH 56/56
git diff --check                 PASS
```

浏览器覆盖：

| 环境                                                | 覆盖                                      |
| --------------------------------------------------- | ----------------------------------------- |
| Chromium 桌面 1280（headless）                      | ✅ 完整教学闭环 + 错误 + reset + 生命周期 |
| Chromium 390 / 320 视口                             | ✅ 几何无横向溢出 + 真实执行              |
| Chromium 移动模拟（Pixel 5 + 4G 节流）              | ✅ 无崩溃；冷启动边缘值                   |
| Firefox / Safari / iOS Safari / Android Chrome 真机 | ❌ **未验证（明确标记）**                 |
| 中国大陆 jsDelivr 可达性                            | ❌ **未验证**                             |

---

## 8. 已知限制与 Stage 2 输入

- 移动端冷启动处于 15 s 门槛边缘（与 Stage 0 相同），真机内存 / OOM 未验证。
- CDN 依赖 jsDelivr 可达性；中国网络环境未验证。
- SQL 能力仍是只读子集，无 JOIN / 窗口函数 / 自动补全 / 持久化；守卫是粗粒度关键字拦截，不是 SQL AST。
- 普通课程 JS 闭包 +1,336 B（折叠入口 UI），已在本报告与 Issue 中披露并更新基线。
- 本 PR 未实现第二个 Sandbox 场景（JOIN），也未抽取通用 SQL / 结果表抽象；Stage 2 若 PASS 再评估。
