import type { DataQualityVisualization } from '../../features/data-quality/types'
import type { LessonContent } from '../types'
import { createDataQualityVisualization, createQualitySchedulerRun } from '../../utils/data-quality'
import { legacySchedulerVisualization } from './legacy-scheduling-system'
import { depositBalanceQualityEvent } from '../../features/data-quality/banking'

export { depositBalanceQualityEvent }

const qualitySchedulerRun = createQualitySchedulerRun(
  legacySchedulerVisualization.tasks,
  legacySchedulerVisualization.targetDate,
)

export const dataQualityVisualization: DataQualityVisualization =
  createDataQualityVisualization(qualitySchedulerRun)

export const dataQualityContent: LessonContent = {
  eyebrow: '第 07 课 · 质量事件调查台',
  opening: {
    eyebrow: '调度全部显示打勾，报表数据就一定准吗？',
    title: '任务成功了，数据就一定准吗？',
    intro:
      '早上的报表按时生成，调度页面也全部显示 success，但销售额比财务对账少了一半。打开质量检查，逐条找出缺行、重复、非法状态、孤儿引用、对账漂移和迟到分区。',
    cards: [
      { label: 'Scheduler Run', value: 'success', detail: '代码执行完成，不等于数据正确' },
      {
        label: 'Quality checks',
        value: '6 rules',
        detail: '完整性、唯一性、有效性、引用、对账、Freshness',
      },
      { label: '真实证据', value: 'samples', detail: '每个异常都回到表、字段和业务分区' },
      {
        label: 'Release',
        value: '4 actions',
        detail: 'block / warn / quarantine / continue with risk',
      },
    ],
    question: '如果任务是绿色的，但销售额少了一半，你会先查哪一条规则？',
  },
  subtitle:
    '调度成功后，逐条核对完整性、唯一性、有效性、引用关系、金额对账和数据时效，再决定报表能不能发布。',
  quickSummary:
    '质量检查要说明查哪张表、哪个字段、哪个分区和阈值；异常要带失败样本，发布决定要能解释阻断、告警、隔离或带风险继续。',
  concept: {
    term: '质量闸门',
    definition:
      '质量闸门把一次已成功的 Scheduler Run 再交给规则检查；它输出规则级 pass / warn / fail、可回放的质量事件与证据，并根据处置策略决定下游是否放行。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '任务成功，只说明代码跑完了吗？',
      paragraphs: [
        '调度页面的 success 只能证明任务没有报错，不能证明每一条订单都已到达、金额没有重复或汇总没有漂移。质量检查要把运行结果和具体数据样本放在一起看。',
        '默认场景故意从 DWD 输出拿掉 I1002-2。DWD task 仍然是 success，但完整性规则会指出少了哪一条明细，DWD / DWS 对账也会暴露金额差异。',
      ],
      bullets: [
        '规则定义不能只留下一个分数：要能说出检查了哪张表、哪个字段和哪个分区。',
        '阈值是规则的一部分；调整它会改变 pass / warn / fail，但不会改写失败样本。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'QUALITY EVENT INVESTIGATION · 质量异常调查',
      title: '失败样本如何决定发布',
      description:
        '选择一个异常场景，点击规则查看失败样本；调整阈值并切换处置动作，观察同一批证据如何改变下游发布结果。',
      visualization: dataQualityVisualization,
    },
    {
      kind: 'narrative',
      title: '五种质量问题，五种不同的调查入口',
      paragraphs: [
        '完整性和唯一性要回到 DWD 明细粒度；有效性要回到状态枚举；引用完整性要沿订单主表与明细的关系确认；跨表对账要比较 DWD 净额和 DWS 汇总；Freshness 则要把业务日期和 Scheduler 的实际完成时间放在一起看。',
        '例如，缺少 I1002-2 会同时影响 DWD 完整性和 DWS 对账。把异常落到具体行、字段和分区，才能判断应该阻断哪一个下游结果。',
      ],
      bullets: [
        '表级行数缺失：发现“订单明细少了一行”。',
        '主键重复：发现重复写入会放大金额。',
        '枚举和引用：发现状态不可解释或明细找不到主订单。',
        '跨表对账和 Freshness：发现汇总漂移与迟到分别影响正确性和时效。',
      ],
    },
    {
      kind: 'takeaway',
      title: '发布决定必须留下完整链路',
      text: '一次可复盘的质量决定，至少要能从 release decision 找回本次 Scheduler Run、失败规则、阈值、失败样本、严重级别、下游影响和 remediation。',
      bullets: [
        'block：失败规则阻断完整下游发布，修复后按同一业务日期重跑。',
        'warn：带着告警继续，消费方必须看见证据和风险。',
        'quarantine：隔离失败样本，不把未经确认的完整结果放行。',
        'continue with risk：明确记录豁免和剩余风险，而不是把 fail 改名为 pass。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '质量校验必须精确拦截到异常样本，而不是只报一个错误分数',
      text: '检查结果要指出异常所在的表、字段、业务分区和样本行，并说明它对下游输出的影响。只有这样，值班工程师才能判断该修复、隔离还是允许带风险发布。',
    },
    {
      kind: 'pitfall',
      title: '质量通过也有边界',
      text: '规则没有覆盖的字段、过宽或过窄的阈值、以及本身错误的业务口径，都可能让所有检查 pass 但报表仍然不可信。质量闸门提升可解释性，不替代业务定义、血缘调查和治理责任。',
    },
  ],
}
