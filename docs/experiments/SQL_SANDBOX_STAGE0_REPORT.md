# SQL Sandbox Stage 0 技术验证报告（Issue #35）

- 日期：2026-10-04
- 验证基线：`origin/main` = `f7678f0`（PR #190 merged；Issue #35 原文基线 `10ee05d` 已过期）
- 工作区：`/vol5/1000/ai-workspace/data-warehouse-visualized_base/worktrees/issue-35-duckdb-stage0`
- Branch：`feat/issue-35-duckdb-stage0`
- 状态：**Stage 0 COMPLETE；DECISION = PASS（附 Stage 1 约束）**
- 说明：本报告只覆盖 Stage 0 技术验证。未实现正式 SQL Sandbox，未进入课程 UI，未修改 `SqlTransformationWorkbench`。

---

## 0. 结论先行

| 验证项                         | 结论                                       | 关键证据                                                                                                              |
| ------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Dependency / Runtime Isolation | **PASS**                                   | 普通 `/learn/*` 页面 0 DuckDB 请求；`runtime.ts` 是唯一静态 import；harness 点击后才 `import('./runtime')`            |
| WASM / Worker Loading          | **PASS**                                   | Chromium 真实执行 `SELECT 1`、Banking seed `SELECT / WHERE / GROUP BY / SUM`；`SET enable_external_access=false` 生效 |
| Hosting Strategy               | **PASS（CDN 路径）**                       | CDN 冷启动 6,953,603 B transfer；self-host 1.32.0 wasm 32.66 MiB > Cloudflare 25 MiB 单文件上限                       |
| BASE_PATH                      | **PASS**                                   | `BASE_PATH=/data-warehouse-visualized/` 下 45/45 检查通过；worker / wasm / dynamic import URL 全部带前缀              |
| Worker Lifecycle               | **PASS**                                   | create → query → terminate → recreate → ClientRouter 软跳转后 worker 均为预期值（0/1）                                |
| Performance                    | **PASS（桌面实测；移动为 Chromium 模拟）** | 桌面冷启动 2.4 s / 热启动 1.4 s；移动模拟（4 Mbps / 100 ms / 4× CPU）15.0 s，无崩溃                                   |
| Architecture Pollution         | **PASS**                                   | 普通课程静态闭包 362,428 B → 362,497 B（+69 B，来自共享 preload helper 抽取；无 DuckDB）                              |
| Isolation Guard                | **PASS**                                   | `scripts/check-duckdb-isolation.mjs` + CI step；构建产物静态验证                                                      |

> **PASS 的含义**：允许进入 #35 Stage 1 教学 POC。Stage 1 必须采用 CDN 托管策略（或先单独验证替代自托管方案），并保留本报告记录的未验证项。

---

## 1. 基线与 Issue 假设复核

Issue #35 的规格基线是 `origin/main @ 10ee05d`，当前最新为 `f7678f0`（Phase 5 / PR #190）。重新核对后的差异：

| Issue 假设                                               | 当前 main 实测                                                              | 处理                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------- |
| 第 04 章 = SQL 与数据加工，5 节课                        | 仍成立（`src/data/course.ts`）                                              | 沿用                                      |
| `SqlTransformationWorkbench` 826 行、单组件 5 focus      | 仍成立（仅 #146 nested-scroll 修复过）                                      | Stage 0 未修改                            |
| DWD 表 14 列（含 `updated_at` / `ingested_at`）          | `buildDepositBalanceRows()` 输出 **12 列**，无 `updated_at` / `ingested_at` | Stage 0 seed 使用 12 列（与现有函数一致） |
| 普通课程 initial JS 基线 332,184 B                       | 当前基线 **362,428 B**（#148 / #151 / #175 等已合入）                       | 以当前基线为准                            |
| `SqlTransformationWorkbench` chunk 49,812 B              | 当前 **20,843 B**（lazy 化与 chunk 演进）                                   | 以当前实测为准                            |
| `@duckdb/duckdb-wasm` 最新 stable 1.32.0 / DuckDB v1.4.3 | npm 实测仍为 1.32.0；浏览器 `SELECT version()` = `v1.4.3`                   | pin 1.32.0                                |
| Astro / Vite 版本                                        | Astro 7.3.2 / Vite 8.3.0                                                    | 实测 `?url` 行为                          |

---

## 2. 依赖与运行时隔离

### 2.1 实现边界

新增代码全部位于独立实验目录与隐藏入口：

```text
src/features/sql-sandbox-experiment/
  types.ts / guard.ts / seed.ts / result.ts / reference.ts
  runtime.ts                 ← 唯一静态 import '@duckdb/duckdb-wasm' 的模块
  use-sql-sandbox.ts         ← 状态机；只在 start() 内 dynamic import('./runtime')
  harness/SqlSandboxStage0Harness.tsx + harness.css
src/pages/dev/sql-sandbox-poc.astro   ← 隐藏入口（client:only，noindex）
scripts/check-duckdb-isolation.mjs
scripts/check-duckdb-stage0-vite-url.mjs
tests/sql-sandbox-stage0.test.tsx
tests/e2e/sql-sandbox-stage0.mjs
```

- 未修改 `SqlTransformationWorkbench.tsx`、`src/utils/sql-transformation.ts`、`src/data/deposit-balance.ts`（只读复用）。
- `LessonSectionRenderer` / `content/types.ts` 零改动；课程 UI 零改动。
- `package.json` 新增 `@duckdb/duckdb-wasm@1.32.0`（exact pin）。

### 2.2 三段式加载（真实浏览器验证）

| 阶段                      | 行为                            | 实测                                                       |
| ------------------------- | ------------------------------- | ---------------------------------------------------------- |
| 普通课程 / harness 未点击 | 0 DuckDB JS / 0 WASM / 0 Worker | Network 0 请求；静态闭包无 DuckDB                          |
| 点击「启动实验环境」      | 动态加载 runtime chunk          | `runtime.*.js` 195,399 B raw / 45,406 B gzip / 38,749 B br |
| runtime 初始化            | worker + wasm                   | worker 772,759 B raw；wasm 34,242,586 B raw                |

### 2.3 构建产物隔离

`scripts/check-duckdb-isolation.mjs` 在 `dist/` 上验证：

- 除 `/dev/` 外所有 HTML 无 `duckdb` 引用；
- `/learn/*` 静态 import 闭包无 DuckDB 运行时；
- harness 静态闭包无 DuckDB 运行时，且存在 dynamic import 指向 DuckDB runtime chunk；
- 默认构建无 `duckdb-*.wasm` / `duckdb-browser-*.worker.js` 资产（CDN 策略）。

实测输出：

```text
[isolation] harness 静态闭包: 273470 B
[isolation] DuckDB runtime chunk: /_astro/runtime.Y0VX8KFa.js (195399 B)
[isolation] 普通课程静态闭包最大值: 362497 B / 11 个文件
[isolation] DuckDB 隔离检查通过
```

该脚本已加入 `.github/workflows/cloudflare-deploy.yml` 的 `npm run build` 之后。

### 2.4 普通课程 initial JS 变化

| 项                                |   基线（origin/main） | Stage 0 后 |         变化 |
| --------------------------------- | --------------------: | ---------: | -----------: |
| 普通课程静态闭包（54/54 页一致）  |             362,428 B |  362,497 B |    **+69 B** |
| `LearnShell.*.js`                 |              91,814 B |   90,519 B |     −1,295 B |
| `preload-helper.*.js`（共享抽取） | （内联在 LearnShell） |    1,364 B | 新共享 chunk |

结论：新增页面引入第二个 dynamic import 后，Vite 把 `__vitePreload` helper 抽成共享 chunk，净增 69 B；**没有任何 DuckDB JS / WASM / Worker 进入普通课程闭包**。`SqlTransformationWorkbench` chunk 出现 −5 B 的 minifier/chunk 噪声（源文件零改动）。

---

## 3. WASM / Worker 加载与真实 SQL

浏览器：Playwright Chromium 153.0.8010.12（headless）。DuckDB bundle：`eh`（`selectBundle` 依据 `wasmExceptions=true`），单线程，未启用 COI。

真实执行结果（来自真实 DuckDB，不是字符串匹配）：

| 实验                                              | 真实结果                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `SELECT 1 AS value;`                              | 1 行，`value = 1`                                                            |
| 默认聚合（`aggregate-layers` SQL）                | 3 行，合计 430,000，目标口径 1 行 / 300,000                                  |
| `WHERE` 目标口径                                  | 1 行，300,000                                                                |
| `GROUP BY branch_name`                            | 2 行，杭州 380,000 + 上海 50,000 = 430,000                                   |
| 账户明细                                          | 4 行                                                                         |
| `SUM(balanc)`                                     | `Binder Error: Referenced column "balanc" not found...`                      |
| `SELECT 1 +;`                                     | `Parser Error: syntax error at or near ";"`                                  |
| `read_csv_auto('https://example.com/stage0.csv')` | `Permission Error: ... file system operations are disabled by configuration` |
| `INSERT INTO ...`                                 | 守卫拦截（只读查询）                                                         |
| 错误后重新执行默认 SQL                            | 成功，可恢复                                                                 |

`SET enable_external_access=false` + `SET lock_configuration=true` 在 seed 后执行，外部访问与配置修改均被 DuckDB 拒绝。

---

## 4. Hosting Strategy（重新实测 pinned version）

### 4.1 `@duckdb/duckdb-wasm@1.32.0` 资源体积（npm tarball 实测）

| 文件                          |                       raw |     gzip -9 |  brotli -11 | jsDelivr 实际 br |
| ----------------------------- | ------------------------: | ----------: | ----------: | ---------------: |
| `duckdb-eh.wasm`              | 34,242,586 B（32.66 MiB） | 7,677,553 B | 5,186,702 B |  **6,764,975 B** |
| `duckdb-browser-eh.worker.js` |                 772,759 B |   188,678 B |   155,830 B |    **188,628 B** |
| `duckdb-browser.mjs`（glue）  |                  31,977 B |           — |           — |                — |

npm `dist.unpackedSize` = 144,178,808 B（CI `npm ci` 成本增量）。

### 4.2 方案 A：CDN（jsDelivr）— 验证通过

`getJsDelivrBundles()` 自动 pin `@duckdb/duckdb-wasm@1.32.0`；`createWorker()` 用 Blob + `importScripts` 包装。浏览器实测：

- worker：`transferSize = 188,928 B`，`content-encoding: br`，`cache-control: immutable`（1 年）；
- wasm：`transferSize = 6,765,275 B`，`content-encoding: br`；
- 冷启动 DuckDB 首次传输 ≈ **6,953,603 B（≈ 6.63 MiB / 6.95 MB）**；
- 热加载（持久磁盘 profile）：worker / wasm `transferSize = 0`，命中浏览器缓存；
- 未设置 CSP / COOP / COEP，`crossOriginIsolated = false`，runtime 正常。

### 4.3 方案 B：self-hosted static assets

本地把 `duckdb-eh.wasm` + worker 复制进 `dist/_astro/`，以同源 URL 加载（`astro preview` 返回 `application/wasm`）：

- 浏览器实测可启动并执行 SQL（桌面本地 1,348 ms）；
- **Cloudflare Workers Static Assets 单文件上限 = 25 MiB（Free / Paid 相同，官方 Platform Limits 实测复核）**；
- 1.32.0 EH wasm 32.66 MiB / MVP wasm 37.54 MiB → **无法自托管**；
- 1.28.0（DuckDB v0.9.1）EH 17.27 MiB / MVP 21.07 MiB 在限制内（jsDelivr br：EH 3,598,350 B / worker 68,505 B），但本次未对其做浏览器运行验证；
- 自托管实现注意：DuckDB 在 blob worker 内用 `new Request(url)` 加载 wasm，**相对路径会失败**，必须传绝对 URL（Stage 0 已修复并在 BASE_PATH 下复验）。

### 4.4 方案 C：预压缩资产（`_headers` + `_redirects`）— 本地验证为负

用 `wrangler dev`（workerd 本地）验证 `duckdb-eh.wasm.br`（br11 = 5,186,702 B，低于 25 MiB）+ `_redirects` 重写 + `_headers` 设置 `Content-Type: application/wasm` / `Content-Encoding: br`：

- 响应头按预期返回 `Content-Encoding: br`；
- 但响应体被二次编码（响应首字节为压缩流而非 `.br` 文件内容），浏览器 `WebAssembly.compile` 失败：`expected magic word 00 61 73 6d`；
- 结论：本地 workerd 无法可靠承载预压缩 wasm；真实 Cloudflare 边缘行为未验证，**不作为 Stage 1 路径**。

### 4.5 Cloudflare 部署现状

- 部署形态：Cloudflare Workers Static Assets（`wrangler.jsonc`，assets = `./dist`）；
- 官方限制（实测抓取文档）：单文件 25 MiB；文件数 Free 20,000；`_headers` 规则支持（100 条）；
- CDN 方案不向 `dist/` 增加任何 wasm / worker 资产，当前部署可承载隐藏 harness 页面与 runtime chunk；
- self-host 1.32.0 会直接超过单文件限制，**不可部署**；
- 仓库当前无 CSP；若未来引入：CDN 方案需要 `worker-src blob:`、`script-src` / `connect-src` 允许 `cdn.jsdelivr.net`；self-host 需要 `worker-src 'self'`。

---

## 5. BASE_PATH

`BASE_PATH=/data-warehouse-visualized/ npm run build` + 子路径 preview，45/45 检查通过：

- 页面 / 资源：`http://127.0.0.1:PORT/data-warehouse-visualized/dev/sql-sandbox-poc/`；
- dynamic import runtime：`/data-warehouse-visualized/_astro/runtime.Y0VX8KFa.js`（transfer 45,787 B gzip）；
- self-host worker / wasm：`/data-warehouse-visualized/_astro/duckdb-stage0/...`，均 200 且正确加载；
- CDN 策略在子路径下同样通过（外部 URL 与 BASE_PATH 无关）。

另用独立最小 Vite build 复核 `?url`（`scripts/check-duckdb-stage0-vite-url.mjs`）：Vite 8.3.0 在 `--base /data-warehouse-visualized/` 下输出 `duckdb-eh-*.wasm` / `duckdb-browser-eh.worker-*.js` 资产，bundle 中的 URL 均带 base 前缀，资产字节与源文件一致。

---

## 6. Worker Lifecycle

CDP `Target.getTargets` 实测 worker 数量：

| 步骤                                                  | worker 数 |
| ----------------------------------------------------- | --------: |
| 页面加载 / 点击启动前                                 |         0 |
| 启动后                                                |         1 |
| terminate 后                                          |         0 |
| 重建后                                                |         1 |
| ClientRouter 软跳转到 `/learn/why-data-warehouse/` 后 |         0 |
| 返回 harness 后                                       |         0 |
| 再次启动                                              |         1 |
| 最终 terminate                                        |         0 |

- 模块级 handle + `pagehide` / `astro:before-swap` / unmount cleanup 均触发 terminate；
- 多次进入 / 退出未出现 worker 增长或 zombie；
- 重复执行查询复用同一 worker；terminate 后重新创建不重复注册。

---

## 7. Performance Evidence

### 7.1 桌面 Chromium（真实浏览器，持久磁盘 profile）

| 指标                                   |                                        数值 |
| -------------------------------------- | ------------------------------------------: |
| DuckDB runtime JS chunk                | 195,399 B raw / 45,406 B gzip / 38,749 B br |
| WASM raw                               |                                34,242,586 B |
| 首次加载 transfer（worker + wasm，br） |                                 6,953,603 B |
| 冷启动（点击 → ready）                 |                                **2,421 ms** |
| 冷启动：动态 import                    |                                       25 ms |
| 冷启动：worker + wasm 实例化           |                                    2,001 ms |
| 冷启动：seed（4 行）                   |                                       49 ms |
| 第一次查询（`SELECT 1`）               |                                   **14 ms** |
| 第二次查询（默认聚合）                 |                                   **22 ms** |
| 后续查询（WHERE / GROUP BY / 明细）    |                                    14–16 ms |
| 热启动（terminate → start，同页）      |                                    1,333 ms |
| 热加载（reload，缓存命中）             |                                    1,396 ms |
| 热加载 transfer（worker + wasm）       |                   0 B（`transferSize = 0`） |

### 7.2 移动端（Chromium 模拟，非真机）

Pixel 5 viewport + `Network.emulateNetworkConditions`（4 Mbps、100 ms RTT）+ `Emulation.setCPUThrottlingRate(4)`：

| 指标                   |          数值 |
| ---------------------- | ------------: |
| 冷启动（点击 → ready） | **14,997 ms** |
| 动态 import            |        219 ms |
| worker + wasm 实例化   |     14,396 ms |
| seed                   |         80 ms |
| 崩溃 / pageerror       |            无 |

**未验证（明确标记）**：真实 iOS Safari / Android Chrome、真机内存与 OOM、中国大陆网络下 jsDelivr 可达性。上述移动数据只代表 Chromium 模拟环境。

---

## 8. Tests

| 命令                                                                          | 结果                                                                        |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `npm test`                                                                    | 65 files / **541 tests passed**（新增 13 项 Stage 0 测试）                  |
| `npm run check`                                                               | 0 errors / 0 warnings / 60 hints                                            |
| `npm run lint`                                                                | pass                                                                        |
| `npm run format:check`                                                        | pass                                                                        |
| `npm run build`                                                               | 67 pages（66 + 隐藏 harness）                                               |
| `git diff --check`                                                            | pass                                                                        |
| `node scripts/check-duckdb-isolation.mjs`                                     | pass                                                                        |
| `node scripts/check-duckdb-stage0-vite-url.mjs`                               | pass                                                                        |
| `node tests/e2e/sql-sandbox-stage0.mjs --mobile`                              | **48/48 checks**（含 CDN + self-host + 移动模拟 + 生命周期）                |
| `BASE_PATH=/data-warehouse-visualized/ node tests/e2e/sql-sandbox-stage0.mjs` | **45/45 checks**                                                            |
| `npm run test:english-seo-build`                                              | pass（9 English routes / 54 Learn lessons；robots 断言已允许 `/dev/` 例外） |
| `npm run test:e2e:smoke -- --skip-build`                                      | 58/58 checks                                                                |

新增 focused 测试覆盖：guard 拦截、seed 与 `buildDepositBalanceRows()` 一致性、参考快照 parity、Arrow→rows 转换（含 BigInt / 截断）、汇总与目标口径命中、harness SSR。

---

## 9. Stage 0 交付物与仓库影响

- 新增：`src/features/sql-sandbox-experiment/**`、`src/pages/dev/sql-sandbox-poc.astro`、`scripts/check-duckdb-isolation.mjs`、`scripts/check-duckdb-stage0-vite-url.mjs`、`tests/sql-sandbox-stage0.test.tsx`、`tests/e2e/sql-sandbox-stage0.mjs`、本报告；
- 修改：`package.json` / `package-lock.json`（pin `@duckdb/duckdb-wasm@1.32.0`）、`astro.config.mjs`（sitemap 排除 `/dev/`）、`public/robots.txt`（Disallow `/dev/`）、`src/layouts/BaseLayout.astro`（新增可选 `head` slot 用于 `noindex`）、`eslint.config.mjs`（`scripts/**/*.mjs` node globals）、`tests/english-seo-build-contract.mjs`（robots 断言允许唯一 `/dev/` Disallow）、`.github/workflows/cloudflare-deploy.yml`（isolation guard step）；
- 隐藏 harness：不进入课程导航、不进入 sitemap（实测 66 条 sitemap 无 `/dev/`）、`noindex, nofollow`、robots 禁止抓取；`client:only`，不是正式产品能力。

---

## 10. Decision

### PASS

理由：bundle isolation、BASE_PATH、worker lifecycle、Cloudflare CDN 承载、首次加载成本、当前架构污染程度全部达到 Stage 0 目标；无阻塞性失败。CDN 路径是唯一已验证的托管策略；self-host 1.32.0 被 Cloudflare 25 MiB 单文件上限明确阻断，预压缩方案本地验证为负。

### 随 PASS 记录的约束（Stage 1 必须遵守）

1. **托管策略使用 CDN（jsDelivr）**；不得把 1.32.0 wasm 放进 `dist/`。若必须自托管，需要先单独验证 1.28.0（DuckDB v0.9.1）或真实 Cloudflare 边缘的预压缩行为。
2. **保持实验边界**：`runtime.ts` 仍是唯一静态 import；普通课程 0 DuckDB 的 isolation guard 必须继续通过。
3. **移动端证据目前只有 Chromium 模拟**；Stage 1 若涉及移动端验收，需要真机 / 真实网络补充验证。
4. **中国大陆 CDN 可达性未验证**；需要产品决策或实测后再扩大推广。
5. 隐藏 harness 只用于验证；Stage 1 接入课程 UI 时必须新增 `sql-sandbox` section 设计，不能把 `/dev/sql-sandbox-poc` 当产品入口。

---

## 11. NEXT

- 允许进入 **#35 Stage 1 教学 POC**：`sql-transformation-layers` 折叠实验（默认 SQL = `aggregate-layers`，seed 复用 `buildDepositBalanceRows()`），CDN 托管。
- 不自动实现 Stage 1；需要单独的任务 / PR 与规格。
- Stage 1 开始前建议把本报告 §10 约束回写到 Issue #35，并在实现 PR 中保留 `scripts/check-duckdb-isolation.mjs` 与 BASE_PATH E2E。
- 真实设备 / 中国大陆网络 / 1.28.0 自托管保留为 Stage 1 风险项，而不是 Stage 0 失败项。
