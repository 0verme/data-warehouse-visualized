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
    eyebrow: '这段 SQL 看起来没毛病，为什么算出来的金额翻了一倍？',
    title: '昨天的销售额到底是多少？',
    intro:
      '同一批订单，一段看似写得挑不出毛病的 SQL，却算出了翻倍的错误金额。对比每一步的表快照，找出它错在哪里。',
    cards: [
      { label: '错误 JOIN', value: '1,180 元', detail: '支付与退款事件被重复组合' },
      { label: '修正后', value: '370 元', detail: '支付日期 · 扣除退款' },
      { label: '迟到数据后', value: '420 元', detail: '需要重跑 09-13 分区' },
    ],
    question: '问题不在 SUM 写错，而在 SUM 之前，数据已经被加工成了错误的粒度。',
  },
  subtitle: '一段 SQL 结果翻倍时，沿着表快照检查脏数据、重复事件和多对多关联。',
  quickSummary:
    '选定目标粒度，逐步排查重复事件、补齐维度关联、纠正错误 JOIN 与聚合顺序，完整走完 ODS → ADS 的加工链路。',
  concept: {
    term: '目标粒度',
    definition:
      '目标表的一行代表什么业务对象。订单、订单商品和支付日不是同一个粒度；JOIN 和聚合只有在粒度对齐后，金额才有可加总的意义。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '输出表的一行代表什么？',
      paragraphs: [
        '本实验围绕 2026-09-13 的支付销售额展开。订单明细保留商品事实，支付事件和退款事件回到订单粒度后再参与关联；如果跳过这一步，最终数字可能“有小数、有明细、有 SQL”，却仍然不可信。',
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
        '确定目标粒度后，选择一个预测：行数和金额会增加、减少还是保持不变。执行后对照输入/输出表，定位重复、合并、NULL、聚合和迟到分区。',
      visualization: sqlTransformationVisualization,
    },
    {
      kind: 'narrative',
      title: '不同层级解决不同的复用与提速问题',
      paragraphs: [
        'DWD 把字段和明细粒度整理清楚，DWS 把可复用的销售主题汇总到支付日，ADS 才为“昨天的销售额”这个应用问题挑出一个分区。每层都应该能说清楚一行代表什么，以及哪些信息在这一层被有意聚合。',
        '完成实验后，迟到的 O1005 会让 9 月 13 日从 370 元变成 420 元。这种迟到数据要求数据工程必须支持按原始业务日期进行重跑，而不是简单追加到今天的报表里。',
      ],
    },
    {
      kind: 'takeaway',
      title: '一项数据任务必须说清的六个要素',
      text: '任务必须能被另一个人复述：输入是什么、输出是什么、按哪个分区运行、依赖谁、重复运行是否安全、迟到数据要重跑哪里。',
      bullets: [
        'JOIN 之前确认粒度：明确一行代表订单、订单商品还是支付日。',
        '支付去重、退款按订单汇总后，再连接到事实。',
        '日期用半开区间；NULL 保留并显式处理，不让默认值伪造销售额。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '数据任务交付必须说清的六个工程要素',
      text: '写完一段 SQL 只是加工逻辑的第一步。在交给调度系统排期前，必须明确六件事：输入表、产出表、分区键、上游依赖、是否支持幂等重跑、以及数据迟到时重跑哪个业务分区。这些边界如果不写清楚，线上调度一旦失败，值班运维根本不敢随便重跑。',
    },
    {
      kind: 'pitfall',
      title: '不要把“金额能加起来”当成粒度正确',
      text: '错误 GROUP BY 可能仍然得到同一个总金额，但输出行已经不是一天一行；多对多 JOIN 则可能同时改变行数和金额。每次加工都要同时检查行数、粒度、NULL 和金额。',
    },
  ],
}
