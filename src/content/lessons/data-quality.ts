import type { DataQualityVisualization } from '../../features/data-quality/types'
import type { LessonContent } from '../types'
import { createDataQualityVisualization, createQualitySchedulerRun } from '../../utils/data-quality'
import { schedulerVisualization } from './scheduling-system'

const qualitySchedulerRun = createQualitySchedulerRun(
  schedulerVisualization.tasks,
  schedulerVisualization.targetDate,
)

export const dataQualityVisualization: DataQualityVisualization =
  createDataQualityVisualization(qualitySchedulerRun)

export const dataQualityContent: LessonContent = {
  eyebrow: '第 07 课 · 质量事件调查台',
  opening: {
    eyebrow: '先相信一次成功，再找出它为什么不够',
    title: '任务成功了，报表就可信吗？',
    intro:
      '第 06 章的 DAG Run 已经把 ADS 产出为 success。现在不要再看一张绿色状态卡：打开质量闸门，找出缺行、重复、非法状态、孤儿引用、对账漂移和迟到分区。',
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
    '从真实 Scheduler Run 出发，注入确定性故障，沿 Quality Check → Quality Event → Evidence 做出发布决定。',
  quickSummary:
    '质量不是一个脱离样本的分数：规则要有 identity、目标、阈值和严重级别，失败要带证据，发布要能解释阻断、告警、隔离或带风险继续的后果。',
  concept: {
    term: '质量闸门',
    definition:
      '质量闸门把一次已成功的 Scheduler Run 再交给规则检查；它输出规则级 pass / warn / fail、可回放的质量事件与证据，并根据处置策略决定下游是否放行。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '绿色的 task status 只回答“代码结束了吗？”',
      paragraphs: [
        '本实验复用第 05 章的订单加工快照和第 06 章的真实 Scheduler domain。run、task、business date、dt 分区和 task status 都来自同一套状态机；质量层不复制一份假的调度状态。',
        '默认场景故意从 DWD 输出拿掉 I1002-2。DWD task 仍然是 success，但完整性规则会指出少了哪一条明细，DWD / DWS 对账也会暴露金额差异。',
      ],
      bullets: [
        '规则 identity 不等于分数：要能说出检查了哪张表、哪个字段和哪个分区。',
        '阈值是规则的一部分；调整它会改变 pass / warn / fail，但不会改写失败样本。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'QUALITY EVENT INVESTIGATION · #06 → #07',
      title: '让异常数据、证据和发布状态成为主角',
      description:
        '先选一个故障注入器，再点击规则查看失败样本；调整当前规则阈值，最后切换处置动作，观察同一批证据如何改变下游发布结果。',
      visualization: dataQualityVisualization,
    },
    {
      kind: 'narrative',
      title: '五种质量问题，五种不同的调查入口',
      paragraphs: [
        '完整性和唯一性要回到 DWD 明细粒度；有效性要回到状态枚举；引用完整性要沿订单主表与明细的关系确认；跨表对账要比较 DWD 净额和 DWS 汇总；Freshness 则要把业务日期和 Scheduler 的实际完成时间放在一起看。',
        '故障注入器只改变本地确定性 fixture，不连接生产数据库，也不试图做通用 Fault Injection Framework。它的目的，是让学习者看到规则如何把一个“数字不对”变成可调查的事件。',
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
      title: '给第 08 / 09 章的最小稳定边界',
      text: '本章暴露 QualityRuleDefinition、QualityCheckResult、QualityEvent、QualityEvidence、QualitySchedulerContext、QualityInvestigationContext 和 QualityReleaseDecision。后续血缘或治理课程可以 import 这些领域对象，沿 target、scheduler context 和 downstream impacts 继续调查；本章不实现血缘 UI、治理目录或通用质量平台。',
    },
    {
      kind: 'pitfall',
      title: '质量通过也有边界',
      text: '规则没有覆盖的字段、过宽或过窄的阈值、以及本身错误的业务口径，都可能让所有检查 pass 但报表仍然不可信。质量闸门提升可解释性，不替代业务定义、血缘调查和治理责任。',
    },
  ],
}
