# 数据仓库依赖链重做专题 · 最终验收记录（Phase 5）

> 总控 Issue：[#221](https://github.com/0verme/data-warehouse-visualized/issues/221)
>
> 验收子 Issue：[#241](https://github.com/0verme/data-warehouse-visualized/issues/241)
>
> 审计基线：`origin/main` `6a886edac8975917245cf5d0351b07771a09ffe5`（PR #258 merged，2026-10-17）
>
> 范围：本记录只汇总可追溯的仓库证据、CI 记录与生产只读观察；不包含任何真实银行数据，也不宣称本教学模拟器等同于生产平台。

## 1. 交付清单

### 1.1 八篇文章 + 八个实验模式

| 文章                                            | slug                               | 实验模式                      | 对应子 Issue | PR   | Merge     |
| ----------------------------------------------- | ---------------------------------- | ----------------------------- | ------------ | ---- | --------- |
| A1 为什么数仓任务成功了，数据仍然是错的？       | `reprocessing-incident-timeline`   | E1 事故时间线与污染传播       | #233         | #250 | `56ca891` |
| A2 SQL 血缘与调度依赖：如何圈定依赖链重做范围？ | `reprocessing-impact-scope`        | E2 影响范围与去重清单         | #234         | #251 | `70b3f4a` |
| A3 依赖链如何自动停止、等待和重新调用？         | `reprocessing-auto-stop-wait`      | E3 停止 / 等待 / 自动重做     | #235         | #253 | `28e3264` |
| A4 历史数据如何重做而不影响当天日切？           | `reprocessing-historical-parallel` | E4 当日 / 历史与平行 Job Plan | #236         | #254 | `5184248` |
| A5 为什么有些历史数据禁止重做？                 | `reprocessing-version-boundary`    | E5 版本兼容边界               | #237         | #255 | `1664013` |
| A6 数仓重做成功，为什么下游还要重新装数？       | `reprocessing-downstream-reload`   | E6 下游消费与确认闭环         | #238         | #256 | `d812915` |
| A7 连续多日历史补数，为什么不能简单并行？       | `reprocessing-rolling-backfill`    | 滚动窗口与跨天依赖            | #239         | #257 | `37abdc4` |
| A8 如何设计自动化依赖链重做平台？               | `reprocessing-platform-design`     | 平台能力与边界                | #240         | #258 | `6a886ed` |

### 1.2 共用内核

- 领域层：`src/features/dependency-reprocessing/{types,fixture,date,model,session,steps}.ts`（纯逻辑，无 React / DOM 依赖）。
- 组件：`src/components/visualizations/DependencyReprocessingLab.tsx`（按 `lessonFocus` 分发八个实验模式，lazy 加载）。
- 样式：`src/styles/lessons/dependency-reprocessing.css`（容器查询 + reduced-motion）。
- 课程接线：第 14 章（8 节，order 100–800），content 双 registry、renderer lazy dispatch、lesson-styles、roadmap Topic `reprocessing-incident-response`。
- 设计契约：`docs/REPROCESSING_SERIES_DESIGN.md`。

## 2. #221 验收标准逐条核对

| #   | 验收标准                                                                                                                                                                                     | 证据                                                                                                                                                                                                                          | 结论               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1   | 八篇文章有明确学习目标、生产案例、技术推导、边界条件与对应交互；杜绝把「重做」写成「重构」                                                                                                   | 8 个课程文件各含 opening / concept / narrative / visualization / engineering-note / pitfall / takeaway；`tests/dependency-reprocessing-series.test.ts` 校验结构与 8 个 focus 一一对应；A1 内设「依赖链重做 ≠ 依赖链重构」对照 | PASS               |
| 2   | 核心语义 10 条一致，无凭空引入的轮次字段或虚构审批、发布机制                                                                                                                                 | `docs/REPROCESSING_SERIES_DESIGN.md` §3 冻结 10 条语义与术语红线；系列审计断言无「第 N 轮重做 / Replay Generation」；`session.ts` 日志仅时间戳                                                                                | PASS               |
| 3   | 测试场景包含 LEFT JOIN 全覆盖、多支汇合去重、停止互斥、ODS 门禁、二次修复重置、正常失败保持上游、当日跨自然日、历史日切阻断、平行 Job/Plan、最新程序与重大重构禁止、下游旧版本重装、滚动七日 | 见第 3 节测试矩阵（12/12 场景有独立断言）                                                                                                                                                                                     | PASS               |
| 4   | 自动化测试与构建按仓库规范通过；图解与移动触控有可见操作反馈；无隐私/银行内部信息泄露                                                                                                        | 第 4 节最终验证结果；E2E 672 checks 覆盖 8 模式 × 1280/390/320 × light/dark；fixture 为合成数据，系列审计断言 fixture 无「真实」标记                                                                                          | PASS               |
| 5   | 代码、文案、导航及 SEO/i18n 本地化策略兼容；不把中文文章标成已有英文翻译                                                                                                                     | 英文命名空间保持 9 条手工路由不变；`english-seo-build-contract` 校验 64 Learn lessons 与 sitemap；课程仅注册 zh-CN                                                                                                            | PASS               |
| 6   | 每个交付有可追踪子 Issue 和中文 PR，含变更、证据、验证、风险与回滚                                                                                                                           | 13 个子 Issue（#229–#241）与 13 个中文 PR；每个 PR 正文含背景、修改、核心实现、验证结果、风险回滚                                                                                                                             | PASS               |
| 7   | 不绕开 CI/分支保护；不能安全验证则 BLOCKED 而不是虚构 PASS                                                                                                                                   | 每个 PR 均等待 `Test, build, and deploy` 通过后才 squash merge；无直推 / 强推 main；main 无分支保护但 CI 流程被遵守（见第 5 节）                                                                                              | PASS               |
| 8   | 必要的生产部署观察（无证据不宣称生产 PASS）                                                                                                                                                  | 第 6 节：部署 run 成功且 8/8 URL HTTP 200、canonical/lang/sitemap 正确；同时标注未覆盖的验证范围                                                                                                                              | PASS（范围见 6.3） |

## 3. 测试矩阵（12 项验收场景）

| #   | 场景                                       | 测试落点                                                                                           | 结果 |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---- |
| 1   | LEFT JOIN 全覆盖（结果未变化也重做）       | `tests/dependency-reprocessing-impact.test.ts`、`tests/dependency-reprocessing-lab.test.tsx`       | PASS |
| 2   | 多支汇合节点去重（证据保留、清单唯一）     | `tests/dependency-reprocessing-impact.test.ts`、`tests/dependency-reprocessing-lab.test.tsx`       | PASS |
| 3   | 停止运行任务并互斥（含写入冲突）           | `tests/dependency-reprocessing-stop-redo.test.ts`、`tests/dependency-reprocessing-session.test.ts` | PASS |
| 4   | ODS 验证门禁（不通过不放行）               | 同上                                                                                               | PASS |
| 5   | 二次 ODS 修复重置受影响 SUCCESS 并保留日志 | 同上                                                                                               | PASS |
| 6   | 正常失败保持已成功上游、不级联清空无关成功 | `tests/dependency-reprocessing-stop-redo.test.ts`、`tests/dependency-reprocessing-session.test.ts` | PASS |
| 7   | 当前日切跨自然日仍属当日                   | `tests/dependency-reprocessing-history.test.ts`                                                    | PASS |
| 8   | 历史日切未完时阻断历史重做                 | 同上                                                                                               | PASS |
| 9   | 平行 Job/Plan 日期与依赖、不重置当前状态   | 同上、`tests/dependency-reprocessing-lab.test.tsx`                                                 | PASS |
| 10  | 最新程序与重大重构禁止直接历史重做         | 同上、`tests/dependency-reprocessing-lab.test.tsx`                                                 | PASS |
| 11  | 下游已装载旧版本需重装并确认               | 同上、`tests/dependency-reprocessing-lab.test.tsx`                                                 | PASS |
| 12  | 滚动七日影响日期集合与跨天顺序             | `tests/dependency-reprocessing-history.test.ts`、`tests/dependency-reprocessing-lab.test.tsx`      | PASS |

## 4. 最终验证结果（基线 `6a886ed`）

| 命令                                                        | 结果                                               |
| ----------------------------------------------------------- | -------------------------------------------------- |
| `npm test`                                                  | 78 files / **717 tests passed**（含系列审计 6 项） |
| `npm run check`                                             | **0 errors / 0 warnings / 68 hints**               |
| `npm run lint` / `npm run format:check`                     | pass                                               |
| `npm run build`                                             | **78 pages**                                       |
| `npm run test:e2e:reprocessing -- --skip-build`             | **672/672 checks**                                 |
| `npm run test:e2e:roadmap -- --skip-build`                  | **355/355 checks**                                 |
| `npm run test:e2e:learn-navigation -- --skip-build`         | **262/262 checks**                                 |
| `npm run test:e2e:smoke -- --skip-build`                    | **58/58 checks**                                   |
| `npm run test:english-seo-build`                            | PASS · 9 English routes · 64 Learn lessons         |
| `npm run test:smart-404-build`                              | PASS · 76 recoverable routes                       |
| `BASE_PATH=/seo-base-path/` build + english-seo + smart-404 | PASS（同一计数）                                   |

性能证据：普通课程初始闭包 = client 212,931 B + LearnShell 95,344 B + ClientRouter 16,357 B（合计 324,632 B）；普通课程 HTML 对 `DependencyReprocessingLab` 引用 0；专题组件为单 77,751 B lazy chunk，仅第 14 章课程按需加载。

## 5. 过程与边界审计

- 子 Issue：#229–#240 全部 CLOSED，均有对应中文 PR 与 squash merge commit；PR 正文含 `Closes #N` 与 `Refs #221`（#230、#233 曾因遗漏关闭关键字由人工回写并关闭，已在流程记录中标注）。
- CI：每个 PR 均等待 workflow `Test, build, and deploy`（含单元测试、lint、format、check、build、SEO/404 契约、全部浏览器 E2E、BASE_PATH 复核）通过后合并；未使用 auto-merge，未强推。
- 内容边界：未修改既有第 01–13 章正文（仅在 A6 新增内部关联引用）；未新增英文翻译；未引入新依赖；未接入真实调度平台或真实银行数据。
- 模拟器标识：`simulatorPlanId` 等内部标识均显式标注为模拟用途，不作为平台批次或轮次机制。

## 6. 生产观察

### 6.1 部署证据

- main push 部署 run `39023694058`（headSha `6a886eda`，2026-10-17）**success**。

### 6.2 只读 HTTP 观察（2026-10-17，https://sql.sb/）

- 第 14 章 8 条课程 URL：**8/8 HTTP 200**。
- A8 页面：`<html lang="zh-CN">`、canonical `https://sql.sb/learn/reprocessing-platform-design/`、标题正确、HTML 含 `data-reprocessing-mode="platform-design"`、无 noindex。
- sitemap：`https://sql.sb/learn/` 65 条（64 课 + 学习索引），其中 8 条专题 URL 完整；总 URL 76 条。
- 既有路由无回归：`/learn/scheduling-system/`、`/learn/delivery-completion-signal/`、`/learn/why-data-warehouse/`、`/`、`/learn/`、`/roadmap/`、`/en/` 均 HTTP 200。

### 6.3 未覆盖范围（不宣称的部分）

- 未执行生产端的人工视觉 UAT 与真机触控测试；移动端与 light/dark 的交互验证在本地 E2E（1280/390/320）与系列实验室 ad-hoc 浏览器检查中完成。
- 未观察真实用户行为、搜索索引收录或 GSC 数据；这些不属于本专题的可验证范围。

## 7. 结论

#221 的八篇文章、八个实验模式、12 项验收场景、导航/SEO/i18n/进度契约与生产部署观察均有可追溯证据（子 Issue、PR、merge commit、CI run、测试输出、HTTP 观察）。无未解决阻塞项。

**VERDICT：ACCEPTED** — 满足 #221 全部验收条件，可以关闭总控。
