import type { LessonContent } from '../types'

export const deliveryInvestigationContent: LessonContent = {
  eyebrow: '第 13 章 · 生产实践案例',
  opening: {
    eyebrow: '任务状态正常，消费者却没有数据',
    title: '任务 SUCCESS，为什么下游没有拿到数据？',
    intro:
      '2026-09-30 的日批任务显示 SUCCESS，Consumer 却没有拿到该业务日的数据，也没有报错。先按证据链确认：数据究竟停在了生产、完成、传输、识别还是消费边界。',
    cards: [
      { label: 'Producer Job', value: 'SUCCESS', detail: '2026-09-30' },
      { label: 'Consumer', value: '无数据', detail: '未报错，保持等待' },
      { label: '当前结论', value: '待定位', detail: '先收集证据' },
    ],
    question: '任务执行成功，为什么不能直接等同于这批数据已经交付？',
  },
  subtitle:
    '沿一条 Producer → Exchange → Consumer 交付链收集证据、排除假设、定位完成信号边界，再用最小安全修复和端到端验证收口。',
  quickSummary:
    'Job SUCCESS 只覆盖数据生产。交付还要证明数据文件完成、同批次完成信号有效、Consumer 能按 business_date + batch_id 识别并消费。完成信号机制见 10-3，本案例只处理机制失效后的调查。',
  concept: {
    term: '交付完成（Delivery Completion）',
    definition:
      '一批数据交付完成，至少要能证明：数据文件已经完成、同批次完成信号有效、接收端能够按 business_date + batch_id 识别并消费。Job SUCCESS ≠ Delivery SUCCESS。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '先把交付链摆出来',
      paragraphs: [
        'build.account-balance-snapshot.daily 把账户余额写成 AccountBalanceSnapshot：一行代表一个账户在一个快照日的余额，Grain 是 Account × snapshot_date，business_date = snapshot_date = 2026-09-30。',
        '这份快照不是写进数仓表就结束了。它还要经过 Exchange（交换区）到达接收端，再由 consume.account-balance-snapshot.daily 消费。业务数据属于 Account × snapshot_date；业务日期、批次号、文件名和完成信号属于交付 identity，它们不进入业务 Grain，也不成为新的业务 key。',
        '把交付拆成一条链：Producer 完成 → 数据文件完成并 final → 传输到接收端 → 接收端识别本批次 → Consumer 消费。每往右一步，都需要新的证据；Producer 的 SUCCESS 只覆盖最左边。',
      ],
      bullets: [
        'business_date = 2026-09-30，batch_id = 20260930。',
        '文件名与完成信号名都由 batch identity 推导。',
        '交付 metadata 只描述「这一批」，不改变业务行含义。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '生产案例实验 · 交付链调查',
      title: '停在哪个边界：生产、完成、传输、识别还是消费',
      description:
        '沿同一条交付链走 7 步：先只看现象，再收集 Producer、交换区和 Consumer 的证据，定位完成信号边界，最后验证修复并固化为最小 Delivery Contract。',
      visualization: { kind: 'delivery-investigation' },
    },
    {
      kind: 'narrative',
      title: '调查复盘：证据是怎样收敛的',
      paragraphs: [
        'Producer 侧的证据先排除了「未产出」和「已产出但未完成」：临时文件已经消失，最终命名完成，business_date 与 batch_id 正确，行数与预期一致。但这只说明生产侧完成，不能说明交付完成。',
        '交换区的证据排除了「已完成但未传输」：接收端已经有同名 final 数据文件，并且可读。此时数据已经到达，但同批次的完成信号在接收端不存在，Consumer 的触发条件不满足。',
        'Consumer 的证据排除了「已识别但未消费」：进程实例状态为 running；上一批次 20260929 已正常消费；本批次没有任何执行尝试或失败记录。注意，这里不能用「没有报错」推出「Consumer 一定没问题」，只能说当前证据不支持 Consumer 执行失败。',
        '最后用 business_date + batch_id 对照期望的完成信号名，定位出断点在完成信号 / delivery contract 未闭合，而不是数据生产或 Consumer 执行。',
      ],
      bullets: [
        '未产出 / 已产出但未完成 / 已完成但未传输：由 Producer 与交换区证据排除。',
        '已传输但未被识别：数据到达接收端，但同批次完成信号缺失。',
        '已识别但未消费：由「本批次无执行尝试或失败记录」排除。',
      ],
    },
    {
      kind: 'narrative',
      title: '处理：先证明 artifact 安全，再声明完成',
      paragraphs: [
        '缺完成信号时，不能直接补一个信号。completion signal 是「这批数据已经完成交付」的声明；只有数据文件已经 final、接收端可读、business_date + batch_id identity 匹配、行数有效时，才能按批推导信号名并幂等恢复。',
        '恢复信号之后还要做端到端验证，而不是只看信号文件出现了：artifact 完整可读、signal identity 与批次连续、Consumer 恰好消费一次、没有其他批次副作用、消费行数与已验证 artifact 一致。',
        '完成信号机制本身（TXT 与 FLAG 如何协作）见 10-3；本案例只关注这套机制失效以后，如何用证据判断数据停在哪一层。完成信号是抽象交付契约概念，本案例用 .flag 文件承载它。',
      ],
      bullets: [
        '先验证 artifact，再恢复信号：顺序不能颠倒。',
        '信号名由 batch identity 推导，不新建「新批次」。',
        '验证必须 end-to-end，覆盖识别与消费，而不只是生产。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '最小 blast radius 的适用边界',
      text: '本案例在 artifact 已确认正确时只恢复 completion signal，不重跑整个上游 DAG。这是当前 fixture 下的最小 blast-radius 选择，不是通用规则：如果 artifact 不完整、不可读或批次 identity 不匹配，正确动作是先修复数据或重新交付，而不是补发信号。',
    },
    {
      kind: 'pitfall',
      title: '补 completion signal 是声明完成，不是制造完成',
      text: '信号只声明「这批数据已经可以消费」。在 artifact 未验证前补信号，会把不完整的数据放行给下游，把静默失败升级成数据错误。',
    },
    {
      kind: 'takeaway',
      title: '把两个结论带回自己的交付任务',
      text: '任务 SUCCESS 只表示任务执行完成；交付完成需要数据文件、完成信号与消费证据共同成立。把最小 Delivery Contract 固定下来，下一次才能快速判断数据停在哪一层。',
      bullets: [
        'Job SUCCESS ≠ Delivery SUCCESS。',
        '最小 Delivery Contract 5 字段：business_date、batch_id、data_file、completion_signal、row_count_or_size。',
        '没有实体证据时，「没有报错」不能作为「链路正常」的充分证据。',
        '修复顺序是 artifact validation → signal restore → end-to-end verification。',
      ],
    },
  ],
}
