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
    '用 AccountBalanceSnapshot 日批任务的两天对照，看清 initialize 与 maintain 两条生命周期路径的差别。',
  quickSummary:
    '同一个任务在目标对象「不存在」和「已经存在」时走两条不同的路径。Day 1 成功只证明 initialize 路径成立；没有执行过的 maintain 路径，需要另一组运行状态单独验证。',
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
      kind: 'visualization',
      eyebrow: '生产案例实验 · 7 步证据链',
      title: '把两天的运行一步步对照',
      description:
        '从现象开始，先看第一批证据，再揭示两天进入的不同生命周期路径，展开 maintain 的准备规则，修正后对同一业务日期 Rerun，并用 5 项数据检查和一条最小测试矩阵收口。',
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
      title: '案例边界',
      text: '这是基于真实生产问题模式抽象出来的教学案例，不代表任何具体银行或系统的真实事故。案例只覆盖「目标对象不存在 / 目标对象已经存在 / 同一业务日期重跑」三种生命周期状态，不展开 schema evolution、backfill、迟到数据等其他状态，也不涉及具体数据库的 DDL 与分区语法。',
    },
    {
      kind: 'takeaway',
      title: '把两个结论带回自己的任务',
      text: '任务第一次运行成功，只证明当时进入的那条路径成立。判断一个生命周期任务是否真的写好了，要回到执行路径本身。',
      bullets: [
        '测试覆盖的是执行路径，而不是代码文件。',
        '首次运行成功，不代表后续生命周期路径已经得到验证。',
        '生命周期任务的最小检查：目标对象不存在、目标对象已经存在、同一业务日期重跑。',
      ],
    },
  ],
}
