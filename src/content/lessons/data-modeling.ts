import type { LessonContent } from '../types'

export const dataModelingContent: LessonContent = {
  eyebrow: '第 03 课 · 把一张业务表拆开',
  subtitle: '建模不是先画一张漂亮的 ER 图，而是让每个字段找到与业务含义相符的位置。',
  quickSummary:
    '从一份混合了订单、用户、商品和店铺字段的原始记录开始，先声明 Grain（粒度），再让字段按角色移动到事实表和维度表。',
  concept: {
    term: 'Grain（粒度）',
    definition:
      '粒度是对“事实表中的一行代表什么”的明确声明。它决定事实字段如何计算、维度如何关联，以及一张表能回答什么问题。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '先把混合记录当成一张待拆解的业务地图',
      paragraphs: [
        '下面的 order_raw 把订单、用户、商品和店铺信息放在了一起。它看起来方便，却掩盖了一个关键问题：order_amount 是整笔订单金额，还是商品行金额？拆表之前，先让“一行代表什么”变得可见。',
      ],
      bullets: [
        '订单属性说明业务过程发生在什么时候。',
        '用户、商品和店铺属性提供观察交易的角度。',
        '数量、单价和金额才是与明细粒度对齐的可度量事实。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '拆解实验 · 字段归位',
      title: '让字段从大宽表中各归其位',
      description:
        '按顺序推进四个判断：业务过程 → 粒度 → 字段角色 → 输出表。点击字段，还可以查看它为什么属于维度或事实。',
      visualization: {
        kind: 'modeling-intro',
        rawTable: {
          columns: [
            'order_id',
            'user_id',
            'user_name',
            'product_id',
            'product_name',
            'shop_id',
            'shop_name',
            'quantity',
            'unit_price',
            'order_amount',
            'order_time',
          ],
          rows: [
            {
              order_id: '1001',
              user_id: 'U1001',
              user_name: '林夏',
              product_id: 'P2001',
              product_name: '保温杯',
              shop_id: 'S01',
              shop_name: '日常好物',
              quantity: 1,
              unit_price: 100,
              order_amount: 300,
              order_time: '2026-09-13 10:20',
            },
            {
              order_id: '1001',
              user_id: 'U1001',
              user_name: '林夏',
              product_id: 'P2002',
              product_name: '帆布袋',
              shop_id: 'S01',
              shop_name: '日常好物',
              quantity: 2,
              unit_price: 100,
              order_amount: 300,
              order_time: '2026-09-13 10:20',
            },
            {
              order_id: '1002',
              user_id: 'U1002',
              user_name: '周野',
              product_id: 'P2003',
              product_name: '跑鞋',
              shop_id: 'S02',
              shop_name: '城市运动',
              quantity: 1,
              unit_price: 180,
              order_amount: 180,
              order_time: '2026-09-13 11:05',
            },
          ],
        },
        steps: [
          {
            id: 'process',
            title: '选择业务过程',
            description: '先说清楚要记录哪一类正在发生的业务。',
            example: '商品销售',
          },
          {
            id: 'grain',
            title: '声明粒度',
            description: '用一句话定义事实表中的一行代表什么。',
            example: '一个订单中的一个商品明细',
          },
          {
            id: 'dimensions',
            title: '确定字段角色',
            description: '把标识、描述属性和可度量事实分开。',
            example: '订单上下文 · 用户 · 商品 · 店铺 · 交易事实',
          },
          {
            id: 'facts',
            title: '输出表结构',
            description: '让字段从原始记录移动到事实表和维度表。',
            example: 'fact_order_item + dim_user + dim_product + dim_shop',
          },
        ],
        fieldGroups: [
          {
            id: 'process',
            label: '订单上下文',
            role: 'process-key',
            tone: 'blue',
            fields: ['order_id', 'order_time'],
            explanation:
              'order_id 和 order_time 描述商品销售这件业务何时发生；order_id 会作为事实表中的业务过程标识保留下来。',
          },
          {
            id: 'user',
            label: '用户属性',
            role: 'dimension',
            tone: 'teal',
            fields: ['user_id', 'user_name'],
            explanation:
              'user_name 描述“谁”，同一个用户会参与多笔交易；把它放进 dim_user，可以避免每条明细重复保存用户描述。',
          },
          {
            id: 'product',
            label: '商品属性',
            role: 'dimension',
            tone: 'violet',
            fields: ['product_id', 'product_name'],
            explanation:
              'product_name 描述“卖了什么”，属于观察角度；事实表只需要保存 product_id 外键来连接商品维度。',
          },
          {
            id: 'shop',
            label: '店铺属性',
            role: 'dimension',
            tone: 'amber',
            fields: ['shop_id', 'shop_name'],
            explanation:
              'shop_name 描述“在哪个店铺发生”，是店铺维度的属性；交易事实通过 shop_id 找到它。',
          },
          {
            id: 'measure',
            label: '交易事实',
            role: 'fact',
            tone: 'navy',
            fields: ['quantity', 'unit_price', 'order_amount'],
            explanation:
              '数量、单价和金额需要与“一行一个商品明细”的 Grain 对齐；重复保存订单总额会让 SUM 产生错误。',
          },
        ],
        outputTables: [
          {
            id: 'fact-order-item',
            name: 'fact_order_item',
            type: 'fact',
            rowMeaning: '一行代表一个订单中的一个商品明细',
            fields: [
              'order_id',
              'user_id',
              'product_id',
              'shop_id',
              'quantity',
              'unit_price',
              'amount',
            ],
          },
          {
            id: 'dim-user',
            name: 'dim_user',
            type: 'dimension',
            rowMeaning: '一行代表一个用户的描述属性',
            fields: ['user_id', 'user_name'],
          },
          {
            id: 'dim-product',
            name: 'dim_product',
            type: 'dimension',
            rowMeaning: '一行代表一个商品的描述属性',
            fields: ['product_id', 'product_name'],
          },
          {
            id: 'dim-shop',
            name: 'dim_shop',
            type: 'dimension',
            rowMeaning: '一行代表一个店铺的描述属性',
            fields: ['shop_id', 'shop_name'],
          },
        ],
      },
    },
    {
      kind: 'narrative',
      title: '表的边界来自业务问题，不来自字段数量',
      paragraphs: [
        '字段归类不是把所有文本列都塞进维度、把所有数字列都塞进事实。真正的判断标准是：它描述谁、什么、哪里，还是记录这次业务过程可被度量的数值？',
        '同一个字段名在不同 Grain 下也可能有不同含义。模型先声明一行，表结构才有边界。',
      ],
    },
    {
      kind: 'takeaway',
      title: '建模的顺序，就是避免返工的顺序',
      text: '先定义业务过程和 Grain，再让字段归位；事实表和维度表只是这些判断的结果。',
      bullets: ['看到拆表过程，就要能说出每张表的一行代表什么。', '金额必须和事实表 Grain 对齐。'],
    },
    {
      kind: 'engineering-note',
      title: '把 Grain 写进模型契约',
      text: '粒度声明应该出现在表设计、模型文档和评审中，而不是只存在于建模者的脑中。后续新增字段都要回答：它是否和这一行的业务含义一致？',
    },
  ],
}
