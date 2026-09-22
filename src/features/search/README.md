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
  lessons: SearchLesson[] // 54 条课程元数据（title / subtitle / summary / tags / chapter / number / order）
  docs: SearchDoc[] // 449 个可跳转 target（当前语料）
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

## 非目标（P1-B 未做）

SearchDialog / Ctrl+K / 顶栏与抽屉入口 / a11y / 搜索历史 / 推荐词 / 同义词表 / 拼音 / 模糊匹配 / 语义检索 / 结果 UI 全部属于 P1-C 或 Phase 2。
本目录不读取 `localStorage`、不写进度、不触发导航。
