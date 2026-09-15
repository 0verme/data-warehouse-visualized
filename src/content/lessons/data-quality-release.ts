import type { LessonContent } from '../types'
import { createDataQualityVisualization } from '../../utils/data-quality'
import { qualitySchedulerRun, qualityTeachingModel } from './data-quality'

export const dataQualityReleaseVisualization = createDataQualityVisualization(
  qualitySchedulerRun,
  'release',
  qualityTeachingModel,
)

export const dataQualityReleaseContent: LessonContent = {
  eyebrow: '第 07 章 · 7-5 发布判断',
  opening: {
    eyebrow: '发现问题以后，这份数据还能发布吗？',
    title: '发现问题以后，这份数据还能发布吗？',
    intro:
      '存款余额是正式经营指标。即使只有 3 条记录的 branch_id 无法关联，其中一条余额也可能是 230,000,000。异常行数少，不能替业务负责人替换发布判断。',
    cards: [
      { label: '主案例', value: '存款余额', detail: '银行关键分析数据' },
      { label: '已知事实', value: '3 rows', detail: 'branch_id = B9999' },
      { label: '默认动作', value: 'BLOCK', detail: '不发布已知不可信结果' },
      { label: '对照', value: '埋点 quarantine', detail: '只在独立记录条件满足时使用' },
    ],
    question: '三条异常记录，为什么不能直接删掉后继续发布存款余额？',
  },
  subtitle: '发布动作取决于数据用途和业务影响；银行关键余额默认 BLOCK。',
  quickSummary:
    '存款余额失败时阻断 DWD / DWS / ADS 发布。只有彼此独立、可安全移除且业务允许损失的非关键埋点，才展示 quarantine 对照。',
  concept: {
    term: 'Release Decision / 发布决定',
    definition:
      '发布决定说明当前质量事实能否进入下游。它不是对严重级别的固定映射，而是结合数据用途、证据和业务影响作出的处理判断。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '银行关键结果，默认先停住',
      paragraphs: [
        '存款余额会进入 DWD 明细、DWS 主题和 ADS 指标。已知有机构引用异常时，删除几条记录会同时改变余额结果和机构口径；剩余数据看起来整齐，不代表结果仍然完整。',
        '因此主案例的教学结论固定为 Quality FAILED → Release BLOCKED。修复证据指向的问题、按同一 business_date 重跑，再重新检查。',
      ],
      bullets: [
        '少量异常行，不等于业务影响小。',
        '严重程度只是问题描述的一部分，不自动决定动作。',
        '银行关键数据已知失败时，不用“带风险继续”掩盖事实。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'RELEASE DECISION LAB · 按用途判断',
      title: '同样是失败，数据用途会改变处置条件',
      description:
        '先看存款余额的 BLOCK，再切换到极小的行为埋点对照。页面不会把四种动作做成平级按钮，而是把适用条件写在证据旁边。',
      visualization: dataQualityReleaseVisualization,
    },
    {
      kind: 'narrative',
      title: '什么时候可以隔离而不是阻断？',
      paragraphs: [
        '页面曝光或点击行为埋点是非关键对照：100 万条事件中少量 JSON 格式非法，且每条事件彼此独立。若移除异常记录不会改变剩余数据的业务语义、业务也允许这种损失，才可以隔离异常记录并留下告警。',
        '这不是银行余额的补救办法，也不意味着所有质量失败都能靠删除样本解决。',
      ],
      bullets: [
        '异常记录彼此独立。',
        '移除后不会改变剩余数据语义。',
        '业务明确允许这类损失，并能看到告警。',
      ],
    },
    {
      kind: 'takeaway',
      title: '发布判断要回到数据用途',
      text: '质量事实说明哪里失败，发布决定说明现在是否交付。关键银行数据质量失败默认 BLOCK；非关键埋点只有在隔离条件成立时才可继续处理正常记录。',
      bullets: [
        'DWD / DWS 存款余额：BLOCK。',
        '行为埋点独立格式错误：满足条件时 quarantine。',
        '两种处置都必须保留 Quality Event 和证据。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要用删除坏行替换业务判断',
      text: '先问这条数据服务什么业务、异常是否会改变剩余结果的含义，再决定是否隔离。关键余额结果不能因为坏行数量少就自动放行。',
    },
  ],
}
