import type { LessonContent } from '../types'

export const starSchemaAndGrainContent: LessonContent = {
  eyebrow: '第 04 课 · 从一行数据开始',
  subtitle: '先确定粒度，再确定事实和维度；一行数据的含义，决定每个指标能不能被正确计算。',
  quickSummary:
    '把订单大宽表拆成事实表和维度表之前，先用一句话声明“事实表中的一行代表什么”。粒度清楚，星型模型和指标口径才有稳定的基础。',
  concept: {
    term: '星型模型与粒度',
    definition:
      '星型模型以事实表为中心、维度表为周边；粒度则定义事实表每一行代表的业务事件。粒度是事实字段设计和指标计算的起点。',
  },
  sections: [
    {
      title: '先看一张混在一起的大宽表',
      paragraphs: [
        '订单、用户、商品和店铺的信息都挤在 order_raw 里，读取起来直观，却会把同一个用户、商品和店铺属性重复写进每一条明细。数据量越大，重复越明显，属性变更也越难保持一致。',
      ],
      bullets: [
        '用户属性：user_id、user_name、user_city',
        '商品属性：product_id、product_name、category',
        '店铺属性：shop_id、shop_name',
        '交易事实：quantity、unit_price、amount',
      ],
    },
    {
      title: '先声明一行，再拆事实和维度',
      paragraphs: [
        '本例把业务过程定义为“商品被加入订单”。因此推荐的基础事实粒度是：一行代表一个订单中的一个商品。订单、用户、商品和店铺是观察这条交易的不同角度，适合放进维度表。',
        '点击“开始建模”，观察同一批字段如何从大宽表移动到中央事实表和周围的维度表。因为结构像一颗星，这种组织方式叫作星型模型。',
      ],
    },
    {
      title: '粒度不是标签，而是可观察的数据形状',
      paragraphs: [
        '把事实表切换到订单、订单明细或用户日，不只是换一句描述，表的列和每一行数据都会随之改变。订单明细保留了最底层的交易细节；用户日则已经是面向汇总的结果。',
      ],
    },
    {
      title: '让错误模型自己暴露',
      paragraphs: [
        '如果一行是一个商品，却把整笔订单的 order_total_amount 重复放到每一行，SUM 得到的就不再是订单金额。问题不在 SUM，而在字段的含义和表的粒度没有对齐。',
      ],
    },
  ],
  visualization: {
    kind: 'star-schema',
    rawTable: {
      columns: [
        'order_id',
        'order_time',
        'user_id',
        'user_name',
        'user_city',
        'product_id',
        'product_name',
        'category',
        'shop_id',
        'shop_name',
        'quantity',
        'unit_price',
        'amount',
      ],
      rows: [
        {
          order_id: '1001',
          order_time: '2026-09-13 10:20',
          user_id: 'U01',
          user_name: '林夏',
          user_city: '杭州',
          product_id: 'P01',
          product_name: '保温杯',
          category: '家居',
          shop_id: 'S01',
          shop_name: '日常好物',
          quantity: 1,
          unit_price: 100,
          amount: 100,
        },
        {
          order_id: '1001',
          order_time: '2026-09-13 10:20',
          user_id: 'U01',
          user_name: '林夏',
          user_city: '杭州',
          product_id: 'P02',
          product_name: '帆布袋',
          category: '家居',
          shop_id: 'S01',
          shop_name: '日常好物',
          quantity: 2,
          unit_price: 100,
          amount: 200,
        },
        {
          order_id: '1002',
          order_time: '2026-09-13 11:05',
          user_id: 'U02',
          user_name: '周野',
          user_city: '上海',
          product_id: 'P03',
          product_name: '跑鞋',
          category: '运动',
          shop_id: 'S02',
          shop_name: '城市运动',
          quantity: 1,
          unit_price: 180,
          amount: 180,
        },
      ],
    },
    rawFieldGroups: [
      { id: 'order', label: '订单属性', tone: 'blue', fields: ['order_id', 'order_time'] },
      {
        id: 'user',
        label: '用户属性',
        tone: 'teal',
        fields: ['user_id', 'user_name', 'user_city'],
      },
      {
        id: 'product',
        label: '商品属性',
        tone: 'violet',
        fields: ['product_id', 'product_name', 'category'],
      },
      { id: 'shop', label: '店铺属性', tone: 'amber', fields: ['shop_id', 'shop_name'] },
      {
        id: 'measure',
        label: '交易事实',
        tone: 'navy',
        fields: ['quantity', 'unit_price', 'amount'],
      },
    ],
    tables: [
      {
        id: 'dim-user',
        name: 'dim_user',
        type: 'dimension',
        rowMeaning: '一个用户的当前属性记录',
        key: { label: '业务键', value: 'user_id' },
        fields: [
          { name: 'user_id', label: '用户标识', role: 'key' },
          { name: 'user_name', label: '用户名称', role: 'attribute' },
          { name: 'user_city', label: '用户城市', role: 'attribute' },
        ],
        responsibility: '描述“谁”参与了这笔交易，让事实可以按用户属性切分。',
      },
      {
        id: 'dim-product',
        name: 'dim_product',
        type: 'dimension',
        rowMeaning: '一个商品的描述属性记录',
        key: { label: '业务键', value: 'product_id' },
        fields: [
          { name: 'product_id', label: '商品标识', role: 'key' },
          { name: 'product_name', label: '商品名称', role: 'attribute' },
          { name: 'category', label: '商品分类', role: 'attribute' },
        ],
        responsibility: '描述“买了什么”，让销售额可以按商品和分类分析。',
      },
      {
        id: 'dim-shop',
        name: 'dim_shop',
        type: 'dimension',
        rowMeaning: '一个店铺的描述属性记录',
        key: { label: '业务键', value: 'shop_id' },
        fields: [
          { name: 'shop_id', label: '店铺标识', role: 'key' },
          { name: 'shop_name', label: '店铺名称', role: 'attribute' },
        ],
        responsibility: '描述“在哪个店铺发生”，让事实可以按店铺观察经营情况。',
      },
      {
        id: 'fact-order-item',
        name: 'fact_order_item',
        type: 'fact',
        rowMeaning: '一个订单中的一个商品',
        key: { label: '业务键', value: 'order_id + product_id（本例）' },
        fields: [
          { name: 'order_id', label: '订单标识', role: 'key' },
          { name: 'product_id', label: '商品标识', role: 'key' },
          { name: 'user_id', label: '用户外键', role: 'key' },
          { name: 'shop_id', label: '店铺外键', role: 'key' },
          { name: 'order_time', label: '下单时间', role: 'attribute' },
          { name: 'quantity', label: '购买数量', role: 'measure' },
          { name: 'unit_price', label: '商品单价', role: 'measure' },
          { name: 'amount', label: '商品金额', role: 'measure' },
        ],
        responsibility: '记录可加总的交易事实，并用外键连接用户、商品和店铺维度。',
      },
    ],
    grains: [
      {
        id: 'order',
        label: '订单粒度',
        statement: '一行 = 一个订单',
        description: '每一行已经把订单中的商品合并，amount 表示整笔订单金额。',
        columns: ['order_id', 'user_id', 'amount'],
        rows: [
          { order_id: '1001', user_id: 'U01', amount: 300 },
          { order_id: '1002', user_id: 'U02', amount: 180 },
        ],
        useCase: '适合回答订单数、订单金额、客单价等订单级问题。',
        boundary: '无法直接回答一个订单中分别购买了哪些商品。',
        recommended: false,
      },
      {
        id: 'order-item',
        label: '订单明细粒度',
        statement: '一行 = 一个订单中的一个商品',
        description: '每一行保留一个商品的数量和金额，是本案例推荐的基础事实粒度。',
        columns: ['order_id', 'product_id', 'quantity', 'amount'],
        rows: [
          { order_id: '1001', product_id: 'P01', quantity: 1, amount: 100 },
          { order_id: '1001', product_id: 'P02', quantity: 2, amount: 200 },
          { order_id: '1002', product_id: 'P03', quantity: 1, amount: 180 },
        ],
        useCase: '适合同时按订单、商品、用户和店铺拆解销售额。',
        boundary: '查询订单级指标时，要明确使用明细金额聚合，不能重复带入订单总额。',
        recommended: true,
      },
      {
        id: 'user-day',
        label: '用户日粒度',
        statement: '一行 = 一个用户一天的汇总',
        description: '每一行已经跨订单聚合，保留的是一天的订单数和金额。',
        columns: ['dt', 'user_id', 'order_count', 'amount'],
        rows: [{ dt: '2026-09-13', user_id: 'U01', order_count: 3, amount: 560 }],
        useCase: '适合用户日活跃、用户日消费和留存等上层汇总分析。',
        boundary: '已经丢失订单和商品明细，不适合作为最底层交易事实。',
        recommended: false,
      },
    ],
    errorDemo: {
      wrongColumns: ['order_id', 'product_id', 'order_total_amount'],
      wrongRows: [
        { order_id: '1001', product_id: 'A', order_total_amount: 300 },
        { order_id: '1001', product_id: 'B', order_total_amount: 300 },
      ],
      fixedColumns: ['order_id', 'product_id', 'item_amount'],
      fixedRows: [
        { order_id: '1001', product_id: 'A', item_amount: 100 },
        { order_id: '1001', product_id: 'B', item_amount: 200 },
      ],
      actualAmount: 300,
      wrongMeasure: 'order_total_amount',
      fixedMeasure: 'item_amount',
      wrongSql: 'SUM(order_total_amount)',
      fixedSql: 'SUM(item_amount)',
    },
  },
  code: {
    label: '与粒度一致的指标计算',
    language: 'sql',
    code: `-- fact_order_item 的一行 = 一个订单中的一个商品
SELECT
  product_id,
  SUM(amount) AS sales_amount
FROM fact_order_item
GROUP BY product_id;`,
  },
  engineeringTip:
    '星型模型不是把所有表固定成同一种模板，而是先围绕业务过程声明粒度，再决定哪些字段是维度键、哪些字段是可加总事实。',
  pitfalls: [
    '事实表中的 amount 必须和粒度一致：订单明细粒度应使用 item_amount，而不是在每行重复 order_total_amount。',
    '粒度越细不代表永远越好；如果问题只关心用户日汇总，直接使用对应汇总粒度可以减少扫描和重复聚合。',
  ],
}
