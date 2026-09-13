import type { LessonContent } from '../types'

export const dataLineageContent: LessonContent = {
  eyebrow: '第 08 课 · 追踪一张表的来路与去向',
  subtitle: '一张表的字段变化，可能沿着依赖关系影响多个下游。',
  quickSummary:
    '数据血缘把表、字段或任务之间的依赖连起来，让我们知道数据从哪里来，以及修改后会影响哪里。',
  concept: {
    term: '数据血缘',
    definition: '描述数据对象之间来源、加工和消费关系的依赖信息。它是理解系统影响范围的重要线索。',
  },
  sections: [
    {
      title: '先把依赖关系画出来',
      paragraphs: [
        '在一个最小例子里，ODS.ORDER 是来源，DWD.ORDER_DETAIL 负责统一订单明细；它又被销售主题和用户主题复用，最终共同支撑一个报表。图上的箭头表达的是“谁依赖谁”。',
      ],
    },
    {
      title: '变更前先问影响范围',
      paragraphs: [
        '如果删除或修改 DWD.ORDER_DETAIL，直接下游的两张 DWS 表会先失去输入，ADS.REPORT 也会受到传导影响。这个从当前节点向下游扩散的集合，就是一次教学化的 Impact Analysis。',
      ],
      bullets: [
        '上游：帮助定位来源和排查问题',
        '直接下游：帮助安排修改与验证顺序',
        '最终影响：帮助评估变更的爆炸半径',
      ],
    },
  ],
  visualization: {
    kind: 'lineage',
    nodes: [
      { id: 'ods-order', label: 'ODS.ORDER', layer: 'ODS', role: '原始订单来源', x: 90, y: 90 },
      {
        id: 'dwd-order-detail',
        label: 'DWD.ORDER_DETAIL',
        layer: 'DWD',
        role: '统一订单明细',
        x: 380,
        y: 90,
      },
      { id: 'dws-sales', label: 'DWS.SALES', layer: 'DWS', role: '销售主题汇总', x: 205, y: 245 },
      { id: 'dws-user', label: 'DWS.USER', layer: 'DWS', role: '用户主题汇总', x: 555, y: 245 },
      { id: 'ads-report', label: 'ADS.REPORT', layer: 'ADS', role: '经营分析报表', x: 380, y: 385 },
    ],
    edges: [
      { source: 'ods-order', target: 'dwd-order-detail' },
      { source: 'dwd-order-detail', target: 'dws-sales' },
      { source: 'dwd-order-detail', target: 'dws-user' },
      { source: 'dws-sales', target: 'ads-report' },
      { source: 'dws-user', target: 'ads-report' },
    ],
  },
  code: {
    label: '一个需要血缘的问题',
    language: 'sql',
    code: `-- 如果 order_status 的含义发生变化，先找谁依赖它
SELECT downstream_table
FROM lineage_edges
WHERE upstream_table = 'DWD.ORDER_DETAIL';`,
  },
  engineeringTip:
    '真实血缘通常来自 SQL 解析、任务配置、元数据平台或人工补充。本课只用静态图模拟依赖关系，不连接数据库或调度系统。',
  pitfalls: [
    '上游和下游是相对当前节点而言的；换一个选中节点，统计结果也会变化。',
    '图上的依赖不等于业务因果关系，仍需要结合任务和字段语义判断。',
  ],
}
