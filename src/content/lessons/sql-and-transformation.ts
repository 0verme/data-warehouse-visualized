import type { LessonContent } from '../types'
import type {
  SqlTransformationVisualization,
  TransformationDataset,
  TransformationTaskContract,
} from '../../features/sql-transformation/types'

export const sqlTransformationDataset: TransformationDataset = {
  targetDate: '2026-09-13',
  orders: [
    {
      eventId: 'EVT-1001',
      orderId: 'O1001',
      userId: 'U001',
      orderTime: '2026-09-13 09:10',
      status: 'PAID',
      orderAmount: 100,
      updatedAt: '2026-09-13 09:10:02',
      ingestedAt: '2026-09-13 09:11',
    },
    {
      eventId: 'EVT-1002-A',
      orderId: 'O1002',
      userId: 'U002',
      orderTime: '2026-09-13 10:20',
      status: 'PAID',
      orderAmount: 300,
      updatedAt: '2026-09-13 10:20:01',
      ingestedAt: '2026-09-13 10:21',
    },
    {
      eventId: 'EVT-1002-B',
      orderId: 'O1002',
      userId: 'U002',
      orderTime: '2026-09-13 10:20',
      status: 'PAID',
      orderAmount: 300,
      updatedAt: '2026-09-13 10:20:05',
      ingestedAt: '2026-09-13 10:20:06',
    },
    {
      eventId: 'EVT-1003',
      orderId: 'O1003',
      userId: 'U404',
      orderTime: '2026-09-13 23:59',
      status: 'PAID',
      orderAmount: 80,
      updatedAt: '2026-09-13 23:59:03',
      ingestedAt: '2026-09-13 23:59:10',
    },
    {
      eventId: 'EVT-1004',
      orderId: 'O1004',
      userId: 'U003',
      orderTime: '2026-09-13 16:00',
      status: 'PENDING',
      orderAmount: 60,
      updatedAt: '2026-09-13 16:00:02',
      ingestedAt: '2026-09-13 16:01',
    },
  ],
  orderItems: [
    {
      itemId: 'I1001-1',
      orderId: 'O1001',
      product: '保温杯',
      quantity: 1,
      unitPrice: 100,
      itemAmount: 100,
    },
    {
      itemId: 'I1002-1',
      orderId: 'O1002',
      product: '帆布袋',
      quantity: 1,
      unitPrice: 100,
      itemAmount: 100,
    },
    {
      itemId: 'I1002-2',
      orderId: 'O1002',
      product: '跑鞋',
      quantity: 1,
      unitPrice: 200,
      itemAmount: 200,
    },
    {
      itemId: 'I1003-1',
      orderId: 'O1003',
      product: '雨伞',
      quantity: 1,
      unitPrice: 80,
      itemAmount: 80,
    },
    {
      itemId: 'I1004-1',
      orderId: 'O1004',
      product: '笔记本',
      quantity: 1,
      unitPrice: 60,
      itemAmount: 60,
    },
  ],
  users: [
    { userId: 'U001', userName: '林夏', city: '杭州' },
    { userId: 'U002', userName: '周野', city: '上海' },
    { userId: 'U003', userName: '方宁', city: '深圳' },
  ],
  payments: [
    {
      paymentId: 'PAY-1001',
      orderId: 'O1001',
      transactionKey: 'TX-O1001',
      paidAt: '2026-09-13 09:12',
      amount: 100,
      status: 'SUCCESS',
      updatedAt: '2026-09-13 09:12:02',
      ingestedAt: '2026-09-13 09:13',
    },
    {
      paymentId: 'PAY-1002-A',
      orderId: 'O1002',
      transactionKey: 'TX-O1002',
      paidAt: '2026-09-13 10:25',
      amount: 300,
      status: 'SUCCESS',
      updatedAt: '2026-09-13 10:25:02',
      ingestedAt: '2026-09-13 10:26',
    },
    {
      paymentId: 'PAY-1002-B',
      orderId: 'O1002',
      transactionKey: 'TX-O1002',
      paidAt: '2026-09-13 10:25',
      amount: 300,
      status: 'SUCCESS',
      updatedAt: '2026-09-13 10:25:05',
      ingestedAt: '2026-09-13 10:26:02',
    },
    {
      paymentId: 'PAY-1003',
      orderId: 'O1003',
      transactionKey: 'TX-O1003',
      paidAt: '2026-09-14 00:03',
      amount: 80,
      status: 'SUCCESS',
      updatedAt: '2026-09-14 00:03:02',
      ingestedAt: '2026-09-14 00:04',
    },
  ],
  refunds: [
    {
      refundId: 'REF-1002-1',
      orderId: 'O1002',
      refundedAt: '2026-09-13 13:00',
      amount: 10,
      status: 'SUCCESS',
    },
    {
      refundId: 'REF-1002-2',
      orderId: 'O1002',
      refundedAt: '2026-09-13 13:05',
      amount: 20,
      status: 'SUCCESS',
    },
  ],
  lateOrder: {
    order: {
      eventId: 'EVT-1005-LATE',
      orderId: 'O1005',
      userId: 'U001',
      orderTime: '2026-09-13 18:00',
      status: 'PAID',
      orderAmount: 50,
      updatedAt: '2026-09-13 18:02:02',
      ingestedAt: '2026-09-14 02:00',
    },
    item: {
      itemId: 'I1005-1',
      orderId: 'O1005',
      product: '数据手册',
      quantity: 1,
      unitPrice: 50,
      itemAmount: 50,
    },
    payment: {
      paymentId: 'PAY-1005-LATE',
      orderId: 'O1005',
      transactionKey: 'TX-O1005',
      paidAt: '2026-09-13 18:02',
      amount: 50,
      status: 'SUCCESS',
      updatedAt: '2026-09-14 02:00:02',
      ingestedAt: '2026-09-14 02:00',
    },
  },
}

export const sqlTransformationTaskContract: TransformationTaskContract = {
  taskId: 'transform.sales.daily.v1',
  inputTables: ['dws_sales_daily'],
  outputTable: 'ads_yesterday_sales',
  partition: {
    column: 'dt',
    value: sqlTransformationDataset.targetDate,
  },
  dependencies: [
    'dwd_order_item',
    'ods_order_event',
    'ods_order_item',
    'ods_payment_event',
    'ods_refund_event',
    'ods_user',
  ],
  isIdempotent: true,
  supportsPartialRerun: true,
  rerunHint: '按业务数据日期重跑 dt = 2026-09-13；迟到数据到达日不是目标分区。',
}

export const sqlTransformationVisualization: SqlTransformationVisualization = {
  kind: 'sql-transformation',
  targetDate: sqlTransformationDataset.targetDate,
  dataset: sqlTransformationDataset,
  taskContract: sqlTransformationTaskContract,
}
export const sqlAndTransformationContent: LessonContent = {
  eyebrow: '第 05 课 · SQL 工作台',
  opening: {
    eyebrow: '先制造一个冲突',
    title: '昨天的销售额到底是多少？',
    intro:
      '同一批订单，错误查询给出一个看起来很完整的数字。先猜，再让每一步表快照告诉你它为什么错。',
    cards: [
      { label: '错误 JOIN', value: '1,180 元', detail: '支付与退款事件被重复组合' },
      { label: '修正后', value: '370 元', detail: '支付日期 · 扣除退款' },
      { label: '迟到数据后', value: '420 元', detail: '需要重跑 09-13 分区' },
    ],
    question: '问题不在 SUM 写错，而在 SUM 之前，数据已经被加工成了错误的粒度。',
  },
  subtitle: 'SQL 不是背语法，而是用来控制一次可观察的数据加工实验。',
  quickSummary:
    '先选定“一行代表什么”，再逐步去重、补维度、暴露错误 JOIN、修正聚合顺序，最后把 ODS 变成 DWD、DWS 和 ADS。',
  concept: {
    term: '目标粒度',
    definition:
      '目标表的一行代表什么业务对象。订单、订单商品和支付日不是同一个粒度；JOIN 和聚合只有在粒度对齐后，金额才有可加总的意义。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '先写清楚一行是什么，再写 SQL',
      paragraphs: [
        '本实验围绕 2026-09-13 的支付销售额展开。订单明细保留商品事实，支付事件和退款事件则先回到订单粒度；如果跳过这一步，最终数字可能“有小数、有明细、有 SQL”，却仍然不可信。',
      ],
      bullets: [
        '重复订单事件：同一个 order_id 在 ODS 出现两次，必须确定保留规则。',
        'NULL：O1003 找不到用户，O1004 没有支付时间，不能用 INNER JOIN 或默认日期悄悄丢掉。',
        '时间边界：2026-09-14 00:00 以后不属于 9 月 13 日的半开区间。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'SQL WORKBENCH · 表快照差异实验',
      title: '让每一行的变化成为证据',
      description:
        '先选择目标粒度，再选择一个预测：行数和金额会增加、减少还是保持不变。执行后对照输入/输出表，定位重复、合并、NULL、聚合和迟到分区。',
      visualization: sqlTransformationVisualization,
    },
    {
      kind: 'narrative',
      title: 'DWD、DWS、ADS 不是三张更大的表',
      paragraphs: [
        'DWD 把字段和明细粒度整理清楚，DWS 把可复用的销售主题汇总到支付日，ADS 才为“昨天的销售额”这个应用问题挑出一个分区。每层都应该能说清楚一行代表什么，以及哪些信息在这一层被有意聚合。',
        '完成实验后，迟到的 O1005 会让 9 月 13 日从 370 元变成 420 元。这个变化不是让本章实现调度器，而是把需要按业务日期重跑的输入交给下一章。',
      ],
    },
    {
      kind: 'takeaway',
      title: '把 SQL 加工交给下一章之前，先留下六件事',
      text: '任务必须能被另一个人复述：输入是什么、输出是什么、按哪个分区运行、依赖谁、重复运行是否安全、迟到数据要重跑哪里。',
      bullets: [
        '粒度先于 JOIN：先决定一行代表订单、订单商品还是支付日。',
        '事件先聚合：支付去重、退款按订单汇总后，才连接到事实。',
        '日期用半开区间；NULL 保留并显式处理，不让默认值伪造销售额。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '给第 06 章的稳定输出',
      text: '本实验暴露 taskId、inputTables、outputTable、partition、dependencies、isIdempotent、supportsPartialRerun 和 rerunHint。它是一个简单任务描述，不是调度器或 DAG SDK。',
    },
    {
      kind: 'pitfall',
      title: '不要把“金额能加起来”当成粒度正确',
      text: '错误 GROUP BY 可能仍然得到同一个总金额，但输出行已经不是一天一行；多对多 JOIN 则可能同时改变行数和金额。每次加工都要同时检查行数、粒度、NULL 和金额。',
    },
  ],
}
