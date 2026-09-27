import type { LessonContent } from '../types'
import { createBankingSchedulerVisualization } from '../../features/scheduler/banking'

export const schedulingReadinessContent: LessonContent = {
  eyebrow: '第 05 章 · 运行条件与 DAG',
  opening: {
    eyebrow: '已经两点了，任务为什么还不能开始？',
    title: '一个任务，到底什么时候才可以开始？',
    intro:
      '定时器到了 02:00，只能说明系统发出了触发信号。存款余额任务还要等 2026-09-30 所需的输入和必要的上游条件满足，才有资格从等待进入运行。',
    cards: [
      { label: '运行窗口', value: '02:00', detail: '日批触发，开始检查条件' },
      { label: '输入状态', value: '等待 → ready', detail: '当前业务日期所需输入到齐' },
      { label: 'DAG', value: 'DWD → DWS → ADS', detail: '依赖边决定谁可以继续' },
    ],
    question: '如果钟表已经指向 02:00，哪一个条件还没有满足？',
  },
  subtitle:
    '用同一条存款余额 DAG 对比时间触发、依赖触发与外部条件检测，并观察 Sensor 如何判断 ready。',
  quickSummary:
    '时间到了可以开始检查；上游成功可以放行；外部条件成立也可以放行。Sensor 只是观察外部条件的一种方式，不代表数据天然完整。',
  concept: {
    term: '运行条件（Run Condition）',
    definition:
      '一个任务只有在运行窗口满足、当前业务日期所需输入 ready、以及必要上游依赖满足时，才会从 READY 进入 RUNNING。DAG 表达的是这种任务运行依赖。',
  },
  sections: [
    {
      kind: 'narrative',
      title: 'DAG 上的箭头表示什么？',
      paragraphs: [
        '这条加工链可以读成：五份输入准备完成后，DWD 才能整理账户余额明细；DWD 成功后，DWS 才能形成存款余额主题；最后 ADS 才能发布结果。箭头表达任务之间的运行等待关系。',
        '表依赖描述“DWS 的数据来自 DWD”，任务依赖描述“DWS 任务要等 DWD 任务成功”。两者有关联，但 DAG 不是完整的表级、字段级血缘图。',
      ],
      bullets: [
        '多份输入会汇合到 DWD；缺一份就不能假定输入完整。',
        'DWS 的运行资格来自 DWD 任务成功，不只是看表名相似。',
        '完整血缘还要回答字段和来源，留到后面的章节处理。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'DAG 放行实验 · 三种真实运行方式',
      title: '切换启动方式，观察任务何时获得运行资格',
      description:
        '选择定时主动抽数、等待上游完成信号或扫描 FTP 到达，对比三种放行条件；另一个局部 Sensor 面板会用抽象文件演示轮询、完整性协议与 timeout。',
      visualization: createBankingSchedulerVisualization('readiness'),
    },
    {
      kind: 'narrative',
      title: '文件出现，不等于外部数据已经 ready',
      paragraphs: [
        '当上游交付时间不确定时，Sensor 可以按配置的间隔主动观察外部条件：条件未满足就继续等待；满足后报告 SUCCESS，下游才获得运行资格；超过等待边界则进入 timeout，转人工处理或按约定明确失败。',
        '例如 02:07 看到 `data.csv` 的名字，02:08 文件还在写入，直到 02:10 同批 `data.csv.done` 出现才代表约定的交付完成。只检查文件存在的 Sensor 可能在 02:08 提前放行；要求完成信号的协议则会继续等。',
      ],
      bullets: [
        'Polling interval 决定检查频率和可能的发现延迟，也影响外部系统承受的检查压力。',
        'Timeout 是运行边界，不自动意味着所有系统都应失败；超时后的人工处理 / 明确失败路径要事先约定。',
        '可用的完成协议不一定必须是 done flag，但必须能可靠区分“开始交付”和“完整可消费”。',
      ],
    },
    {
      kind: 'compare',
      title: '三种方式，等的到底是什么？',
      intro: '它们都能启动同一条 DAG，但“可以开始”的证据来源不同。',
      columns: [
        {
          label: '时间触发 / 主动抽数',
          title: '时间到了就主动查询',
          points: [
            '02:00 连接上游，主动抽取 business_date = 2026-09-30。',
            '表达“时间到了，我开始做事”。',
            '触发本身不能证明上游数据已经完整。',
          ],
        },
        {
          label: '上游完成信号',
          title: '等状态从 PROCESSING 变成 SUCCESS',
          points: [
            '检查当天上游运行记录，而不是只看墙上时间。',
            'SUCCESS 信号到达后，下游获得运行资格。',
            'DAG 边把等待条件传给下游任务。',
          ],
        },
        {
          label: '外部条件触发 / Sensor',
          title: '主动观察，直到条件满足或超时',
          points: [
            'Sensor 按配置间隔检查外部状态；间隔长短是成本与发现延迟的取舍，不是固定标准。',
            '文件名已出现但仍在写入时，存在性检查可能误判；ready protocol 需要能证明整批已完成。',
            '条件满足报告 SUCCESS 后下游才获得资格；超时则转人工处理或明确失败，不默认自动失败。',
          ],
        },
      ],
    },
    {
      kind: 'takeaway',
      title: 'Trigger ≠ Start，Waiting ≠ Failed',
      text: '三种方式的边界不同：时间触发是“时间到了就检查或执行”；依赖触发是“上游任务成功后放行”；Sensor 是“主动观察外部条件，直到满足或超时”。没有一种对所有场景都更高级。',
      bullets: [
        '任务等待条件未满足时仍是等待，不是失败，也不是 Retry。',
        '文件存在只能证明交付已开始；文件完整性需要双方约定的 ready protocol 来判断。',
        '短轮询更快发现的可能性更高，但检查次数 / 外部压力也更高；timeout 与人工接手边界需要结合 SLA 和交付方式决定。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要把“文件存在”或“Sensor SUCCESS”直接当成完整性证明',
      text: 'Sensor 只能根据配置的条件做判断：如果协议只看文件名，partial file 也可能被误放行。排查时还要核对同批完成信号、当前业务日期、上游状态、轮询与 timeout 策略。',
    },
  ],
}
