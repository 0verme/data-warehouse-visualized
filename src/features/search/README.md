# Knowledge Search（#148 Phase 1 / P1-B）

本目录提供 P1-C `SearchDialog` 直接消费的**搜索数据契约 + 匹配纯函数**，不包含任何 UI。

```text
src/data/course.ts + src/content/lessons/*.ts     单一事实源（既有）
        ↓ build 期 buildSearchIndex()
src/pages/search-index.json.ts                    静态端点 /search-index.json
        ↓ 浏览器首次打开搜索时 fetch(getSearchIndexUrl())
searchKnowledge(index, query)                     归一化 substring 匹配 + 结构化排序
        ↓
SearchHit[]（含 heading / anchor / href / snippet segments）→ P1-C 渲染
```

## 文件职责

| 文件             | 作用                                                         | 运行环境      |
| :--------------- | :----------------------------------------------------------- | :------------ |
| `types.ts`       | `SearchIndex` / `SearchDoc` / `SearchHit` 等契约             | 两端          |
| `build-index.ts` | 从课程元数据与类型化正文派生索引（纯函数、确定性）           | 仅构建期      |
| `normalize.ts`   | 查询 / 文档归一化与 term 切分                                | 两端          |
| `match.ts`       | `searchKnowledge()`、打分、排序、snippet                     | 浏览器 / 测试 |
| `deep-link.ts`   | 索引地址与 `/learn/<slug>/#<anchor>` 深链（走 `getRoute()`） | 两端          |

**硬约束**：`build-index.ts` 只允许被构建期端点与测试引用；客户端模块不得 import 课程正文或 `course.ts`，否则索引/正文会进入普通课程初始 JS。

## SearchDoc 契约

```ts
interface SearchIndex {
  version: number // SEARCH_INDEX_VERSION，schema 变更时递增
  lessons: SearchLesson[] // 56 条课程元数据（title / subtitle / summary / tags / chapter / number / order）
  docs: SearchDoc[] // 469 个可跳转 target（origin/main e4d089f 当前语料）
}

interface SearchDoc {
  id: string // `<lessonId>:<kind>:<sectionIndex>`，确定性、全局唯一
  lessonId: string
  slug: string
  kind: SearchDocKind
  heading: string // 小节标题；lesson / summary / pitfall / engineering-note 为空
  text: string // 该 target 的可搜索正文；lesson 文档为空（文本在 SearchLesson 元数据里）
  anchor: string | null // P1-A `src/utils/heading-id.ts` 产出的 heading id
  sectionIndex: number // `content.sections[]` 下标；课程级文档为 -1
}
```

`kind` 取值：`lesson` / `opening` / `summary` / `concept` / `narrative` / `compare` / `sql` / `visualization` / `takeaway` / `pitfall` / `engineering-note`。

### 数据来源

| doc kind           | 来源                                            | heading         | text                                        | anchor                                                              |
| :----------------- | :---------------------------------------------- | :-------------- | :------------------------------------------ | :------------------------------------------------------------------ |
| `lesson`           | `lessonDefinitions` + `lessonTranslations`      | —               | —（匹配 title / tags / summary / subtitle） | `getLessonHeadingId`                                                |
| `opening`          | `content.opening`                               | `opening.title` | intro + cards + question                    | `getOpeningHeadingId`                                               |
| `summary`          | `content.quickSummary`                          | —               | quickSummary                                | `null`                                                              |
| `concept`          | `content.concept`                               | `concept.term`  | `concept.definition`                        | `getConceptHeadingId`                                               |
| `narrative`        | `sections[]`（含无 kind 的 legacy narrative）   | `section.title` | paragraphs + bullets                        | `getSectionHeadingId(...,'narrative')`                              |
| `compare`          | `sections[]`                                    | `section.title` | intro + columns                             | `getSectionHeadingId(...,'compare')`                                |
| `sql`              | `sections[]` 或 legacy `content.code`           | `label`         | `code`                                      | `getSectionHeadingId(...,'sql')` / `getLegacyHeadingId(...,'code')` |
| `visualization`    | `sections[]`                                    | `section.title` | `description`                               | `getSectionHeadingId(...,'visualization')`                          |
| `takeaway`         | `sections[]`                                    | `section.title` | text + bullets                              | `getSectionHeadingId(...,'takeaway')`                               |
| `pitfall`          | `sections[]` 或 legacy `content.pitfalls`       | —               | text                                        | `null`                                                              |
| `engineering-note` | `sections[]` 或 legacy `content.engineeringTip` | —               | text                                        | `null`                                                              |

- 不复制维护第二份课程元数据：全部字段派生自 `course.ts` 与 `src/content/lessons/*.ts`。
- `pitfall` / `engineering-note` 在渲染器里没有 heading id → `anchor: null`，深链退化为课程页（Phase 1 已知限制）。
- `visualization` 只索引 `description`；可视化配置内部的节点 / 图例文本不在 Phase 1 索引范围。

## 匹配 / 排序契约

归一化：`toLowerCase()` + 去掉空白、`_`、`-`、`–`、`—`、`/` 与中英文标点，然后 `includes`。
`first_seen` = `first seen` = `first-seen`；`ETL / ELT` = `etl/elt`；中文按字符子串匹配，无分词、无同义词表、无模糊匹配。

查询切分：按原始空白切分 → 每个 part 归一化 → 去空、去重 → **AND 语义**（每个 term 都必须命中）。

排序层级（数字与顺序写入测试，倒置即失败）：

| 层级 | 匹配位置                                      |               基础分 |
| :--- | :-------------------------------------------- | -------------------: |
| 4    | 课程标题（仅 `lesson` 文档）                  |                  100 |
| 3    | 小节标题                                      |                   40 |
| 2    | tags / summary / subtitle（仅 `lesson` 文档） |                   20 |
| 1    | 正文                                          | 8 × min(3, 出现次数) |

- 先按层级降序，再按总分降序；同分按 章节 → 课序 → `sectionIndex` → kind → `docId` 收敛，同一查询结果完全稳定。
- 整串相等（tag / 标题等整个单位等于 term）+15；命中位于字段归一化文本前 20 字符内 +5。
- 每个 term 只取最高层级的一次命中（不跨字段累加）。
- 默认最多 8 条，单课最多 2 条。

## Snippet 契约

- 以首次命中为中心：前 12、后 60 个**归一化字符**，截断侧加 `…`；窗口为单位边界时保留相邻标点，因此短摘要能自然收尾。
- 命中在 heading / tags / 元数据、正文里没有时 → 回退 `lesson.summary`（`数据倾斜` 走这条路径，此时没有 `<mark>`）。
- `segments: { text, match }[]`：P1-C 直接渲染为 React 文本节点，**不需要 `dangerouslySetInnerHTML`**；最多 3 处 `match: true`。

## Deep link 契约

- `getSearchIndexUrl()` → `getRoute('/search-index.json')`，`BASE_PATH` 子路径部署可用。
- `hit.href` = `/learn/<slug>/#<anchor>`；`anchor === null` → `/learn/<slug>/`。
- anchor 一律来自 P1-A `src/utils/heading-id.ts`，P1-B 不重新 slugify。

## P1-C 消费方式

```ts
const response = await fetch(getSearchIndexUrl())
const index = (await response.json()) as SearchIndex
const { terms, hits } = searchKnowledge(index, query)

for (const hit of hits) {
  hit.chapterTitle // 第 05 章 · 调度
  hit.lessonTitle // 课程标题
  hit.heading // 小节标题（可能为空）
  hit.href // /learn/<slug>/#<anchor>
  hit.snippet.segments // [{ text, match }]
}
```

## P1-C UI / loading / navigation contract

- `LearnShell` 只保留轻量 `React.lazy(() => import('./SearchDialog'))` loader；dialog、匹配器与 dialog CSS 在用户首次打开时才下载。索引由 `load-index.ts` 在首次 mount 后 `fetch(getSearchIndexUrl())`，只缓存当前浏览器会话内的 Promise / 数据；HTTP 或 schema 失败会淘汰缓存，支持对同一端点重试。
- `SearchDialog` 直接调用 `searchKnowledge(index, query)` 并渲染 `SearchHit`；不在 UI 侧重做 normalization、ranking、snippet 或链接。
- Desktop ≥901px：搜索按钮在 Learn 顶栏操作组首位并显示 `Ctrl / ⌘ K`；Mobile ≤900px：入口只放在目录抽屉 intro 与课程导航之间，开 dialog 时关闭抽屉。
- 支持 `Ctrl+K` / `Cmd+K` / `/`，以及 `ArrowUp` / `ArrowDown` / `Home` / `End` / `Enter` / `Escape`。`/` 不拦截输入、文本区域、select、contenteditable 或 role=textbox。
- 使用原生 modal `<dialog>.showModal()`（浏览器 modal focus containment）并补充 Tab / Shift+Tab 边界循环；打开后 focus input，关闭后回到触发点（移动端抽屉入口退回目录按钮）。搜索结果为 `role=option`，active option 同时有 `aria-selected` 与非颜色图形标记。
- 空查询显示轻量示例、不展示结果；无结果明确提示且有替代示例；索引加载中 / 失败也有状态与重试。
- 结果用真实 `<a href={hit.href}>` 执行 P1-A ClientRouter / fragment contract；同课 hash 由浏览器定位，跨课由 `useLessonAnchorScroll` 定位，dialog 不触碰进度状态。
- Browser regression: `npm run test:e2e:search`（CI release gate），覆盖按需 fetch 与会话缓存、keyboard / focus trap / restore、empty/results/retry、Desktop / Mobile / viewport / theme、当前课与跨课真实 heading 定位、direct load、Back / Forward。

## 明确留给 Phase 2 / 未实现

不做搜索历史 / 最近搜索 / 推荐词 / 个性化、同义词表（包括 `首次交易` → `第一次交易`）、拼音、模糊匹配、AI / 语义搜索、服务端 / 第三方搜索、命令系统或 Learning Paths。搜索 UI 不读写 `localStorage`、不保存用户画像、不修改进度；除真正导航外不更新当前课程。
