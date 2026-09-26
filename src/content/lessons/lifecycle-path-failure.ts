import type { LessonContent } from '../types'

export const lifecyclePathFailureContent: LessonContent = {
  eyebrow: '第 13 章 · 生产实践案例',
  opening: {
    eyebrow: '同一个任务、同一段代码，两天结果不同',
    title: '上线当天明明成功了，为什么第二天才失败？',
    intro:
      '2026-09-18 的日批成功，2026-09-19 的日批失败，rows written = 0。先按证据链走一遍：现象、证据、判断、定位、处理、验证、防复发。',
    cards: [
      { label: 'Day 1', value: 'SUCCESS', detail: '2026-09-18' },
      { label: 'Day 2', value: 'FAILED', detail: '2026-09-19' },
      { label: '已写入', value: '0 行', detail: 'Day 2 停在 prepare' },
    ],
    question: '第一次运行成功，究竟验证了哪些执行路径？',
  },
  subtitle:
    '用 AccountBalanceSnapshot 日批任务对照 initialize / maintain 路径，再比较固定结果对象与 CTAS 替换的工程影响。',
  quickSummary:
    '同一个任务在目标对象「不存在」和「已经存在」时走不同路径；Day 1 成功不证明 maintain 已验证。随后比较固定对象与 CTAS 的 identity、schema、失败恢复和运行边界。',
  concept: {
    term: '生命周期执行路径（Lifecycle Execution Path）',
    definition:
      '同一个任务会因为目标对象当前状态进入不同路径：目标对象不存在时走 initialize，已经存在时走 maintain。测试覆盖的是执行路径，而不是代码文件。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '先认识这条日批任务',
      paragraphs: [
        'build.account-balance-snapshot.daily 每天把账户余额写成 AccountBalanceSnapshot：一行代表一个账户在一个快照日的余额，Grain 是 Account × snapshot_date，业务日期 business_date 同时也是 snapshot_date。',
        '这份快照按业务日期组织写入。在这个教学案例里，可以把「当前业务日期的写入单元」理解为按 snapshot_date 组织的日期分区或等价写入单元；具体数据库如何实现，不是这一课的重点。',
        '这条任务有一个生命周期分支：第一次运行时目标对象还不存在，之后每次运行目标对象都已经存在。两天的结果不同，先不要急着改代码，按证据一步步看。',
      ],
      bullets: [
        'Day 1 = 2026-09-18，Day 2 = 2026-09-19。',
        'Grain：一行 = 一个账户 × 一个快照日。',
        '这一课只处理「生成快照」这一段，不展开上游来源与下游消费。',
      ],
    },
    {
      kind: 'narrative',
      title: '同名目标表，是否还是同一个对象？',
      paragraphs: [
        '前面的故障调查聚焦「目标对象当前是否存在」以及 initialize / maintain 路径。这一段换一个问题：加工结果的名字相同，是否意味着结果对象的 identity、schema 和下游契约也保持不变？',
        '下面用 `ads_deposit_balance_daily` 对照 DROP + CTAS 与固定表 TRUNCATE + INSERT。两者在正常执行时都可能得到正确数据；选择依据应是对象生命周期、schema 稳定性和运行场景，而不是 SQL 风格偏好。',
      ],
      bullets: [
        '通用事实：DROP 后重新 CREATE 是新的对象创建过程；CTAS 的列形状来自查询结果。',
        '工程实践：固定表把 schema 契约放在目标定义里，但刷新、回滚和迁移仍需设计。',
        '组织选择：授权恢复、依赖处理、发布门禁和 lineage 记录策略应按团队与平台约定决定。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '生产案例实验 · 证据链 + 对象生命周期',
      title: '先调查执行路径，再比较结果对象策略',
      description:
        '先沿 7 步证据链对照两天运行，定位 initialize / maintain 差异；完成后继续切换 DROP + CTAS 与固定表刷新，以及正常成功、失败、schema 变化和 Retry 事件。',
      visualization: { kind: 'lifecycle-path' },
    },
    {
      kind: 'narrative',
      title: '第一次运行掩盖了什么',
      paragraphs: [
        'Day 1 的目标对象不存在，任务走 initialize：创建目标对象时顺带初始化了 2026-09-18 的写入单元，然后写入快照。这条路径成立，所以当天成功。',
        'Day 2 的目标对象已经存在，任务走 maintain。prepare 需要为 2026-09-19 准备写入单元，但它只检查了目标对象是否存在，没有确认当前 business_date 的写入单元是否就绪。缺陷第一次真正被执行，任务停在写入之前。',
        '所以 Day 1 成功证明的是 initialize 路径，而不是 maintain 路径。代码里存在一个分支，不等于这个分支被运行过。',
      ],
      bullets: [
        'initialize：目标对象不存在时，创建对象并初始化第一个日期写入单元。',
        'maintain：目标对象已存在时，维护后续业务日期。',
        '同一个任务、同一段代码，两条路径需要分别验证。',
      ],
    },
    {
      kind: 'narrative',
      title: '这几个概念在前面已经讲过',
      paragraphs: [
        'business_date 与「任务凌晨运行、处理前一天数据」的时间语义见 05-1；Rerun 与幂等的区分见 05-4；Periodic Snapshot 与 Grain 见 02-4。这里只回忆一句：同一业务日期的重复执行，要按既定写入策略保持同一份结果，而不是叠加一份。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '教学模型与数据库行为边界',
      text: '本案例是基于生产工程取舍的确定性教学模型，不代表具体银行或数据库实现。失败场景明确假设 DROP 或 TRUNCATE 已提交；若 DDL/DML 与后续步骤处于不同事务边界、数据库支持 DDL 回滚或采用原子发布，对象存在性与读者可见结果可能不同。锁、并发、权限、依赖、metadata、lineage 和统计信息也依数据库与工具实现而异；本案例聚焦对象生命周期与工程影响，不模拟所有数据库语义。',
    },
    {
      kind: 'takeaway',
      title: '把两个结论带回自己的任务',
      text: '任务第一次运行成功，只证明当时进入的执行路径成立；选择结果表刷新方式，还要判断对象 identity 是否需要稳定，以及团队能否承担对应的 schema、发布和恢复责任。',
      bullets: [
        '测试覆盖的是执行路径，而不是代码文件。',
        '首次运行成功，不代表后续生命周期路径已经得到验证。',
        'CTAS 并非错误；一次性派生与稳定生产对象有不同的生命周期要求。',
        '具体 DDL/事务和并发可见性依数据库实现而异，方案结论应附运行边界。',
      ],
    },
  ],
}
