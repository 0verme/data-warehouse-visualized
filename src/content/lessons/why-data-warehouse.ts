import type { LessonContent } from '../types'

export const whyDataWarehouseContent: LessonContent = {
  eyebrow: '第 01 课 · 先建立全局视角',
  subtitle: '业务系统负责把事情做成，数据仓库负责把事情看清。',
  quickSummary:
    '当订单、用户、商品和支付各自保存数据时，分析需要一个统一、可追溯、尽量不打扰交易的空间。',
  concept: {
    term: '数据仓库',
    definition:
      '面向分析组织和保存数据的系统。它通常汇集多个来源，并通过加工形成稳定、可复用的分析数据。',
  },
  sections: [
    {
      title: '先看现实里的四本账',
      paragraphs: [
        '一个电商平台不会只拥有一张“万能表”。下单、注册、商品变更和支付，往往由不同业务系统负责。每个系统围绕自己的交易目标设计，字段、更新频率和数据保留方式也不一样。',
      ],
      bullets: [
        '订单库关心下单与履约',
        '用户库关心账户与身份',
        '商品库关心价格与库存',
        '支付库关心支付状态与对账',
      ],
    },
    {
      title: '交易和分析是不同负载',
      paragraphs: [
        '在线交易更在意一次写入是否快速、准确，分析则经常需要扫描大量记录、跨系统关联并观察一段时间的变化。把所有分析查询直接压到核心交易库上，可能让两类负载互相影响。',
        '数据仓库提供了一个缓冲和组织层：先接入来源数据，再按分析需要统一口径、保留历史并生成可复用的数据集。',
      ],
    },
  ],
  visualization: {
    kind: 'systems',
    warehouseLabel: '数据仓库',
    systems: [
      { id: 'orders', name: '订单库', detail: '下单、履约、退款', volume: '高频写入' },
      { id: 'users', name: '用户库', detail: '账户、会员、标签', volume: '持续变更' },
      { id: 'products', name: '商品库', detail: '商品、价格、库存', volume: '业务更新' },
      { id: 'payments', name: '支付库', detail: '支付、对账、渠道', volume: '状态流转' },
    ],
    outputs: [
      { name: '经营报表', detail: '统一查看日、周、月趋势' },
      { name: '指标分析', detail: '复用同一套业务口径' },
      { name: '专题探索', detail: '支持跨主题的历史分析' },
    ],
  },
  comparison: {
    title: 'OLTP 与 OLAP：目标不同，不是绝对对立',
    intro: '同一个企业可以同时使用两类系统；关键是让负载落在更适合它的地方。',
    columns: [
      {
        label: 'OLTP',
        title: '在线交易处理',
        points: ['围绕单笔业务快速读写', '保持事务和状态准确', '典型对象是订单、账户、支付'],
      },
      {
        label: 'OLAP',
        title: '在线分析处理',
        points: [
          '面向多表关联与批量扫描',
          '关注趋势、聚合和历史对比',
          '典型对象是报表、指标、专题分析',
        ],
      },
    ],
  },
  code: {
    label: '分析问题示例',
    language: 'sql',
    code: `SELECT
  DATE_TRUNC('day', paid_at) AS paid_date,
  SUM(amount) AS paid_amount
FROM dws_sales
WHERE paid_at >= CURRENT_DATE - INTERVAL '7 day'
GROUP BY 1
ORDER BY 1;`,
  },
  engineeringTip:
    'OLTP 和 OLAP 是常见的工程分类，不意味着一家公司必须把它们部署成两套完全隔离的产品。边界应由数据规模、访问模式、稳定性和成本共同决定。',
  pitfalls: [
    '不要把“业务库不能做分析”说成绝对规则；小规模场景可能直接查询业务库。',
    '数据仓库不是简单的数据备份，而是面向分析的组织、加工和复用。',
  ],
}
