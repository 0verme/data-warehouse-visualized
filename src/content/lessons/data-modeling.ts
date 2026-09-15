import type { LessonContent } from '../types'

export const dataModelingContent: LessonContent = {
  eyebrow: '第 03 课 · 把一张业务表拆开',
  subtitle: '面对一团杂乱的订单字段，按“业务发生时的一行记录”把事实与维度拆解清楚。',
  quickSummary:
    '以一份混杂了订单、用户、商品和店铺的宽表为起点，明确事实表的行粒度；字段据此分别归入维度表和事实表。',
  concept: {
    term: 'Grain（粒度）',
    definition:
      '粒度是对“事实表中的一行代表什么”的明确声明。它决定事实字段如何计算、维度如何关联，以及一张表能回答什么问题。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '为什么不能直接拿一张大宽表做统计？',
      paragraphs: [
        '下面的 order_raw 把订单、用户、商品和店铺信息全堆在了一起。看似查起来方便，却隐藏着一个容易漏掉的陷阱：order_amount 是整笔订单金额，还是单个商品行的金额？如果“一行代表什么”没有定义清楚，求和时就很容易把整笔订单金额重复计算。',
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
      title: '将宽表字段拆解到事实表与维度表',
      description:
        '实验把一条订单记录拆成四个判断：业务过程、粒度、字段角色和输出表。点击字段，可以查看它为什么属于维度或事实。',
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
      title: '业务含义决定表的边界',
      paragraphs: [
        '字段归类不能只按文字或数字区分。判断依据是：这个字段是在描述交易的上下文（谁、什么、在哪），还是记录这次业务事件中可加总的度量值？',
        '同一个字段名在不同粒度下含义可能完全不同。只有先定好一行代表什么，表结构的边界才不会混乱。',
      ],
    },
    {
      kind: 'takeaway',
      title: '建表顺序决定了是否会频繁返工',
      text: '业务过程和行粒度明确后，字段归属才有依据；事实表和维度表是这些判断落到表结构后的结果。',
      bullets: [
        '看一张表的设计，首先要能说出它的一行代表什么。',
        '度量金额必须与事实表的行粒度保持一致。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '在表设计中必须明确写清粒度',
      text: '“这一行到底代表什么”必须明确写进建表注释和设计文档中，不能靠后续开发人员猜测。未来每次新增字段，首先要确认：它是否与当前行的粒度一致？',
    },
  ],
}
