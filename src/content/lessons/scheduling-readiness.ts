import type { LessonContent } from '../types'
import { createBankingSchedulerVisualization } from '../../features/scheduler/banking'

export const schedulingReadinessContent: LessonContent = {
  eyebrow: '第 06 章 · 运行条件与 DAG',
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
  subtitle: '用同一条存款余额 DAG 对比定时抽数、上游完成信号和 FTP 到达检测。',
  quickSummary:
    '任务放行同时依赖运行窗口、当前业务日期的输入和必要上游条件；Trigger 到了，不代表 Start 已经发生。',
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
        '选择定时主动抽数、等待上游完成信号或扫描 FTP 到达。每种方式都使用 2026-09-30 的同一批输入，但等待的条件和发现时间不同。',
      visualization: createBankingSchedulerVisualization('readiness'),
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
          label: '外部数据到达检测',
          title: '定期扫描 FTP 是否出现文件',
          points: [
            '合作方 02:07 上传完成，本方 02:30 扫描才发现。',
            '发现时间晚于实际到达时间。',
            '检测到文件后，任务才开始处理这批业务日期。',
          ],
        },
      ],
    },
    {
      kind: 'takeaway',
      title: 'Trigger ≠ Start，Waiting ≠ Failed',
      text: '02:00 已经触发的 Run，如果输入还没有 ready，就应该显示等待输入或等待上游。等到条件满足后才开始执行；在此之前没有失败，也不应该把等待误称为 Retry。',
      bullets: [
        '运行窗口满足只是必要条件，不是完整输入的证明。',
        'READY 表示可以运行，RUNNING 才表示已经开始工作。',
        '任务依赖是运行放行条件，不等于完整数据血缘。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要看到定时器响了就认为数据齐了',
      text: '时间触发可以很准，但上游仍可能迟到；外部文件也可能已经上传却尚未被扫描发现。排查时要把业务日期、输入状态和依赖状态放在一起看。',
    },
  ],
}
