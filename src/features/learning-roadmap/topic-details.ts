/**
 * Topic learning semantics SSOT for the Learning Roadmap.
 *
 * This file owns exactly two pieces of presentation copy per Topic:
 * - `whyLearn`       — the engineering consequence of missing the concept.
 * - `learningOutcome` — the judgement a learner should gain after the Topic.
 *
 * It deliberately does NOT own Lesson titles, Lesson summaries, Lesson bodies,
 * prerequisites, relations or estimated time. Those stay in `course.ts` and the
 * frozen `learningGraph` (see `graph.ts`); the view model joins them at build time.
 */
export interface LearningTopicDetail {
  topicId: string
  whyLearn: string
  learningOutcome: string
}

export const learningTopicDetails: readonly LearningTopicDetail[] = [
  {
    topicId: 'warehouse-mental-model',
    whyLearn:
      '分不清 OLTP / OLAP 与 ETL / ELT 的职责时，容易把交易系统的即时查询直接当成经营分析口径。',
    learningOutcome: '判断一个分析问题该由业务系统处理，还是需要数据仓库承接。',
  },
  {
    topicId: 'data-flow-and-layers',
    whyLearn: '不清楚每层各自负责什么时，容易把清洗、汇总和指标口径堆在一起，一处改动牵动全链路。',
    learningOutcome: '识别一个报表数字经过的加工层，判断问题应该在哪一层解决。',
  },
  {
    topicId: 'business-process-and-grain',
    whyLearn: 'Grain 不确定时，JOIN 与聚合很容易重复计量：同一笔借据被还款记录放大成多行。',
    learningOutcome: '判断一行数据代表哪件业务事实，并据此选择可安全聚合的粒度。',
  },
  {
    topicId: 'star-schema-and-fact-types',
    whyLearn: '把交易、快照和生命周期事件混成一张事实表时，时间语义会互相污染，指标难以解释。',
    learningOutcome: '区分不同事实表的时间语义，为业务过程选择合适的事实类型。',
  },
  {
    topicId: 'historical-dimensions',
    whyLearn: '维度只保留当前值时，历史事实会被新的客户等级或机构归属改写，回溯分析得到错误结论。',
    learningOutcome: '识别需要保留历史的维度变化，并判断何时使用拉链表。',
  },
  {
    topicId: 'metric-definition-and-scope',
    whyLearn: '统计对象、范围和时间没有写清时，同一个「存款余额」会给出多个互相矛盾的答案。',
    learningOutcome: '解释指标差异来自哪一项定义要素，而不是把口径分歧当成数据错误。',
  },
  {
    topicId: 'metric-time-and-derivation',
    whyLearn: '分不清时点值与期间累计时，日终余额会被误当成当日流量，派生指标随之整体错位。',
    learningOutcome: '区分状态与事件的时间语义，并选择能支持派生指标的基础度量。',
  },
  {
    topicId: 'transformation-planning-and-cleaning',
    whyLearn: '加工前不确认输出一行代表什么，去重和关联会在错误粒度上执行，错误被写进下游明细。',
    learningOutcome: '判断加工输出的一行代表什么，再选择去重、关联和标准化的处理顺序。',
  },
  {
    topicId: 'grain-safe-joins-and-layered-output',
    whyLearn: '一对多 JOIN 会复制度量，金额随关联行数放大，而且整个过程没有任何系统报错。',
    learningOutcome: '判断 JOIN 前后粒度是否变化，并验证汇总结果没有被重复计数。',
  },
  {
    topicId: 'processing-contract',
    whyLearn: '输入、业务日期和重复执行预期没有约定时，重跑与补数会制造重复或缺失的写入。',
    learningOutcome: '判断一段加工能否安全重跑，并写清输入、业务日期与重复执行预期。',
  },
  {
    topicId: 'business-date-and-readiness',
    whyLearn:
      '把调度日期、自然日期和业务日期混为一谈时，任务会写错分区，或在输入未就绪时提前启动。',
    learningOutcome: '区分三类日期，并判断一个任务应等待哪些输入才能开始。',
  },
  {
    topicId: 'failure-and-recovery',
    whyLearn:
      '分不清 Retry、Rerun 与 Backfill 的语义时，补数可能重复写入，失败传播范围也难以判断。',
    learningOutcome: '判断一次「再跑一次」应该用哪种恢复方式，以及会影响哪些下游任务。',
  },
  {
    topicId: 'sla-and-data-availability',
    whyLearn: '只看任务成功不看业务可用时间时，上游延迟会一路传到报表，直到业务方发现数据没到。',
    learningOutcome: '追踪延迟在加工链上的传递，判断数据是否满足业务可用时间。',
  },
  {
    topicId: 'quality-rules-and-state',
    whyLearn: '把调度 SUCCESS 当成数据可信时，行级错误与关键字段异常会在发布环节前无人拦截。',
    learningOutcome: '区分运行状态与质量状态，并为一张表确定值得检查的规则范围。',
  },
  {
    topicId: 'quality-batch-and-evidence',
    whyLearn: '只检查单行时，应到数据缺失、口径漂移和整批不可信通常不会被发现。',
    learningOutcome: '从整批完整性、Freshness 与对账判断一份数据是否可信，并组织可调查的证据。',
  },
  {
    topicId: 'quality-release-decision',
    whyLearn: '发现问题却没有发布决定时，不可信数据仍可能流向消费方，事后无法解释谁放行了它。',
    learningOutcome: '判断质量问题应 BLOCK 还是 quarantine，并说明该决定的适用条件。',
  },
  {
    topicId: 'lineage-foundations',
    whyLearn:
      '只知道直接上游表时，字段重命名、过滤和 JOIN 造成的变化无法定位，排查会在错误方向耗时。',
    learningOutcome: '追踪一份数据在表级与字段级上的来源，定位变化发生的加工位置。',
  },
  {
    topicId: 'lineage-investigation-and-impact',
    whyLearn: '质量告警后没有调查顺序时，排查会在无关上游往返，真正的根因候选被排到后面。',
    learningOutcome: '从告警对象出发确定根因候选与受影响下游，并确定检查范围。',
  },
  {
    topicId: 'lineage-evidence',
    whyLearn: '把一条未经验证的血缘箭头当作事实时，影响分析会建立在猜测之上。',
    learningOutcome: '判断一条血缘关系由什么证据支持、当前是否可以直接使用。',
  },
  {
    topicId: 'asset-governance',
    whyLearn: '名称相似的多张资产容易被随手取用，业务定义或 Grain 不一致会让统计结果悄悄偏离。',
    learningOutcome: '选择业务定义、Grain 与可用性证据匹配的资产，而不是凭表名猜测。',
  },
  {
    topicId: 'field-access-and-lifecycle',
    whyLearn: '能查到字段不代表应该直接使用；权限与生命周期变化会让旧任务在不该继续后仍然运行。',
    learningOutcome: '判断字段的最小必要访问方式，并识别旧资产的废弃与替代状态。',
  },
  {
    topicId: 'change-responsibility',
    whyLearn: '字段变更后只通知直接下游时，传递影响的资产与 Owner 会被遗漏，责任无人闭环。',
    learningOutcome: '追踪一次字段变更的传递影响，并映射到需要处理的资产负责人。',
  },
  {
    topicId: 'lakehouse-boundaries-and-replication',
    whyLearn:
      '把所有数据都放进仓、或全部留在湖，无法同时满足访问频率与查询 SLA，成本和延迟都会失控。',
    learningOutcome: '判断哪些数据值得进入 Warehouse，哪些留在湖中即可满足消费。',
  },
  {
    topicId: 'table-layer-and-lakehouse-unity',
    whyLearn:
      '只看文件而不理解表能力时，Schema Evolution、Snapshot 与 Time Travel 的正确性边界会被误判。',
    learningOutcome: '解释文件上的表能力如何工作，并区分异构湖仓与共享元数据的责任边界。',
  },
  {
    topicId: 'data-service-contract',
    whyLearn:
      '数据加工完成后没有明确交付契约时，消费方会自行解读口径与可用时间，责任边界变得模糊。',
    learningOutcome: '区分人查看、批量接收与按需获取三类消费模式及其契约要求。',
  },
  {
    topicId: 'delivery-channels',
    whyLearn:
      '不看消费者与数据量就选交付方式时，报表、文件与 API 的边界会被混用，触发方式也随之含糊。',
    learningOutcome: '识别不同交付渠道的触发方式与可用性标志，判断一批数据何时真正可消费。',
  },
  {
    topicId: 'data-service-choice',
    whyLearn: '交付方式只按个人偏好选择时，实时性、数据量和消费方系统反而无法被满足。',
    learningOutcome: '选择与消费者、数据量和触发方式匹配的交付渠道。',
  },
  {
    topicId: 'performance-diagnosis-and-scan',
    whyLearn:
      '任务变慢时凭印象调参，扫描阶段、分区裁剪和小文件问题会被掩盖，优化投入无法命中瓶颈。',
    learningOutcome: '判断主要耗时来自哪个执行阶段，以及扫描布局是否是瓶颈原因。',
  },
  {
    topicId: 'performance-skew-and-incremental-state',
    whyLearn: '分不清日期分区倾斜与 Shuffle 倾斜时，加分区或调并行度可能完全无效。',
    learningOutcome: '区分两类倾斜，并判断用增量状态替代全量历史扫描是否成立。',
  },
  {
    topicId: 'performance-tradeoffs',
    whyLearn: '只对比跑得快时，正确性、幂等和迟到数据会被牺牲，优化反而制造新的数据问题。',
    learningOutcome: '判断优化是否同时守住正确性、幂等与扫描成本，而不是只看跑得更快。',
  },
  {
    topicId: 'capstone-delivery',
    whyLearn: '只按单点知识完成任务时，调度、质量、血缘和服务的联合约束会在发布前夜集中暴露。',
    learningOutcome: '综合加工、质量、血缘与交付约束完成一次跨系统发布判断。',
  },
  {
    topicId: 'production-lifecycle-debugging',
    whyLearn:
      '只凭「昨天成功了」判断今天应该成功时，目标对象存在与不存在的路径差异会在第二天才暴露。',
    learningOutcome: '从两天运行证据定位生命周期路径差异，完成排查与复盘。',
  },
]

const topicDetailById = new Map(
  learningTopicDetails.map((detail) => [detail.topicId, detail] as const),
)

if (topicDetailById.size !== learningTopicDetails.length) {
  throw new Error('Duplicate Roadmap Topic Detail topicId')
}

/** Fail-fast lookup: every graph Topic must have exactly one detail entry. */
export function getLearningTopicDetail(topicId: string): LearningTopicDetail {
  const detail = topicDetailById.get(topicId)
  if (!detail) throw new Error(`Missing Roadmap Topic detail for Topic "${topicId}"`)
  return detail
}
