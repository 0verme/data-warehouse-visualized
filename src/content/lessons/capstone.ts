import { capstoneVisualization } from '../../features/capstone/banking'
import type { LessonContent } from '../types'

export const capstoneContent: LessonContent = {
  eyebrow: '第 12 章 · Capstone Project',
  opening: {
    eyebrow: '跨系统分行经营分析数据产品',
    title: '今天 08:00，你要交付的不是一张临时报表',
    intro:
      '经营管理部门要比较各分行的存款余额、贷款余额和存贷比。存款来自核心系统，贷款来自信贷系统；两边的快照到达时间、数据粒度和失败方式都不同。你需要把它们组织成一份可解释、可恢复、可消费的 branch_business_daily。',
    cards: [
      {
        label: '业务日期',
        value: '2026-09-30',
        detail: '余额属于哪一天，和数据什么时候到达平台是两件事。',
      },
      {
        label: '交付 SLA',
        value: '08:00',
        detail: '完整结果、质量状态和发布条件都要在时间窗口内闭合。',
      },
      {
        label: '最终 Grain',
        value: 'business_date × branch_id',
        detail: '一行代表一家分行在一个业务日期的经营指标快照。',
      },
    ],
    question: '如果 Scheduler 显示 SUCCESS，但 Quality FAIL，你会把什么交给消费者？',
  },
  subtitle:
    '用一条连续 Mission Workbench，把第 01～11 章学过的业务问题、粒度、指标、加工、调度、质量、血缘、治理、数据服务和性能判断放进同一个项目。',
  quickSummary:
    '从 AccountBalanceSnapshot 与 LoanBalanceSnapshot 出发，完成 branch_business_daily 的设计和加工，处理两起固定数据事故，做一次性能复测，最后写下 READY、BLOCKED 或 READY WITH RISK 的 Launch Review。',
  concept: {
    term: '跨系统数据产品',
    definition:
      '跨系统数据产品不是把几张表拼在一起，而是为一份有明确 Grain、时间语义、质量闸门、消费者契约和恢复路径的结果负责。',
  },
  sections: [
    {
      kind: 'visualization',
      eyebrow: '连续项目工作台',
      title: '九个 checkpoint，共享一份 Mission 状态',
      description:
        '从 Mission Brief 开始，依次经过 Design、Build、Operate、Incident、Investigate、Deliver、Scale 和 Launch Review。每次有限选择都会留下 Decision Record，后续 checkpoint 会看到前面的后果。',
      visualization: capstoneVisualization,
    },
    {
      title: 'Mission Brief：先把交付边界说清楚',
      paragraphs: [
        '业务方要的是分行经营分析，不是账户明细或贷款合同明细。这个区别会直接决定最终 Grain：branch_business_daily 的一行必须能回答“某家分行在某个业务日期的存款、贷款和存贷比是多少”。',
        '本项目把 2026-09-30 定义为 business_date，把 08:00 定义为交付 SLA。AccountBalanceSnapshot 和 LoanBalanceSnapshot 的 arrived_at 只描述数据何时到达平台，不能把快照所属业务日期改成到达日。',
      ],
      bullets: [
        '存款余额：按业务日期和分行汇总 AccountBalanceSnapshot.balance。',
        '贷款余额：按业务日期和分行汇总 LoanBalanceSnapshot.balance。',
        '存贷比：loan_balance ÷ deposit_balance，分母为零时保留 NULL / not-calculable。',
      ],
    },
    {
      title: 'Design 与 Build：先保护 Grain，再安排 Join',
      paragraphs: [
        '两套快照的原始行含义不同，却都可以沿 Branch 维度汇总。稳妥的加工顺序是分别去重、分别按 business_date × branch_id 聚合，再把两个结果汇合。这样每个输入在进入 Join 前已经收敛到目标粒度。',
        '页面中的 B03 没有存款余额但有贷款余额，是一个故意保留的边界。把不可计算写成 0 会让消费者误以为存贷比为零；保留 NULL 并明确状态，才不会把缺失分母伪装成业务结论。',
      ],
      bullets: [
        'AccountBalanceSnapshot 的去重、账户到分行映射和贷款快照的分行汇总各自有边界。',
        'Branch 是公共维度；Customer、LoanContract、LoanNote 等不进入当前产品主链。',
        '每个指标都同时说明公式、单位、业务日期和目标 Grain。',
      ],
    },
    {
      title: 'Operate 与 Incident：运行成功不代表产品可信',
      paragraphs: [
        '日批从 07:00 开始，贷款快照原计划 06:30 到达，却在 07:35 才到。你可以继续等待，也可以保留原 business_date 做局部 Rerun；无论怎么选，都不能把存款侧部分结果命名成完整的 branch_business_daily。',
        '第二起事故更容易被忽略：Scheduler 显示 SUCCESS，但 DWD 存款余额是 120 亿，DWS 只有 118 亿。质量规则发现 delta = -2 亿后，Release 必须 BLOCKED。任务运行状态、质量状态和发布状态各自回答不同问题。',
      ],
      bullets: [
        '迟到输入看 arrived_at，重跑看原 business_date 和目标分区。',
        '质量事故需要保留 expected、observed、partition 和 Scheduler context。',
        '事故处理记录决定后续是等待、Rerun、调查，还是继续阻断。',
      ],
    },
    {
      title: 'Investigate：用事件和血缘缩小调查范围',
      paragraphs: [
        'Quality Event 告诉你哪里、哪一天、哪条规则失败，以及失败时任务处于什么状态；Lineage 告诉你这个字段从哪里来、会影响哪些下游。两者结合，可以从 DWS 目标字段沿上游路径检查加工、维度和源快照。',
        '血缘箭头和 Blast Radius 是依赖证据，不自动等于业务根因证明。真正的根因还需要数据 Diff、SQL 版本、任务日志、执行参数或业务变更记录来确认。修复之后，要按同一业务日期重跑，再重新做 Quality 检查。',
      ],
      bullets: [
        '先看直接上游，再按证据展开到源快照和公共维度。',
        '把根因候选标记为 pending，避免把猜测写成结论。',
        '只有 Quality recovery 通过，Release 才能解除阻断。',
      ],
    },
    {
      title: 'Deliver：消费者拿到的是契约，不是内部表',
      paragraphs: [
        '经营报表 / BI 是本 Mission 的主消费者，它需要按分行和业务日期查看一份稳定的经营快照。文件接口可以使用 TXT + FLAG 的批次契约；API 可以按 branch_id 和 business_date 读取已发布结果，但 API 并不意味着实时数据。',
        '三种交付方式都必须服从 Quality / Release。服务层可以隐藏数仓内部的分层和重跑细节，却不能绕过发布闸门给出一份消费者无法解释的半成品。',
      ],
      bullets: [
        '主消费者与扩展消费者的目标、触发方式和完成信号不同。',
        '文件以 FLAG 表示一批数据完成，API 只访问已发布的业务日期结果。',
        '消费者契约需要说明 NULL / not-calculable 等边界。',
      ],
    },
    {
      title: 'Scale：一次有限优化，也要接受复测',
      paragraphs: [
        '第三起事故不是随机故障，而是规模上涨后原来的扫描方式暴露了瓶颈。Before 证据显示 Scan 是主要耗时，端到端 Runtime 已经逼近甚至超过交付窗口。你可以选择 Partition Pruning、增加资源或暂不改变，但选择之后必须一起检查 Runtime、Scan、成本、Freshness、正确性和维护复杂度。',
        'Partition Pruning 的收益来自缩小扫描范围，不是把数字调小；增加资源可能让任务跑快，却会增加成本和容量责任；暂不改变则保留了维护简单这一点，同时接受 SLA 风险。复测结果要和原始证据放在一起，才能支持 Launch Review。',
      ],
      bullets: [
        '先定位主要瓶颈，再选择有限修改。',
        'Before / After 同时记录性能收益和工程代价。',
        '没有正确性和 Freshness 证据，性能变快也不能直接上线。',
      ],
    },
    {
      title: 'Launch Review：把“能不能上线”写成工程判断',
      paragraphs: [
        '最终评审不压缩成一个分数。你需要同时查看 Grain、指标定义、输入到达、DAG、质量事件、血缘影响、治理责任、消费者契约、性能复测和剩余风险。关键条件缺失时，结果是 BLOCKED；核心条件满足但仍有明确风险时，才是 READY WITH RISK；证据闭合且没有未接受的关键风险，才是 READY。',
        '评审还要写下 Known assumptions、Non-goals 和后续演进方向。当前项目不建设真实银行核心系统、生产级传输平台或完整贷款域；如果未来扩展监管口径、增量策略或更多贷款业务，应该重新定义范围和验收条件。',
      ],
      bullets: [
        'READY：完整产品、质量恢复、消费者契约和性能证据闭合。',
        'BLOCKED：存在未恢复质量失败、错误 Grain、部分结果或未复测的关键条件。',
        'READY WITH RISK：可以评审，但迟到 Rerun、消费者偏离或资源成本等风险必须被明确看到。',
      ],
    },
    {
      kind: 'takeaway',
      title: '项目完成的标志，是每个选择都能解释',
      text: '做完 Capstone 后，你应该能从一行 branch_business_daily 追溯到两套源快照，解释它为什么在这个 business_date 产出，说明质量失败时为什么没有发布，并向消费者讲清楚结果可以怎样使用、还有哪些风险。',
      bullets: [
        '先定义一行，再定义加工；先保留证据，再做发布判断。',
        '把 Scheduler、Quality、Lineage、Governance、Data Service 和 Performance 放在同一个决策链里。',
        '每次改变都留下后果和恢复路径，让项目可以继续演进，而不是只能演示一次。',
      ],
    },
  ],
}
