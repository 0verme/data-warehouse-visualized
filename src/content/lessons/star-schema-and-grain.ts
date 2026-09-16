import type { LessonContent } from '../types'

export const starSchemaAndGrainContent: LessonContent = {
  eyebrow: '第 02 章 · 事实、维度与星型模型',
  subtitle: '一笔账户交易记录发生了什么，又应该从哪些角度观察？从问题出发推导事实表和维度表。',
  quickSummary:
    '使用 Transaction、Customer、Account、Branch 和 Product 的最小账户交易样本，先归位字段，再逐步形成以 fact_transaction 为中心的星型模型。',
  concept: {
    term: 'Fact / Dimension（事实 / 维度）',
    definition:
      '事实记录发生了什么，维度提供观察事实的角度。星型模型把事实放在中心，通过连接键关联客户、账户、机构、产品和日期等维度。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '先问：这条记录里发生了什么？',
      paragraphs: [
        '账户 A001 在 2026-09-15 14:20 发生了一笔 5,000 元的转账。记录 T10001 带着客户、账户、机构、产品、渠道和交易类型等信息，但这些字段回答的不是同一个问题。',
        '先把事件说清楚：发生的是一笔账户交易，分析对象是 Transaction，交易金额是这次事件的度量。接下来才需要问，业务人员想从什么角度观察它。',
      ],
      bullets: [
        '发生了什么：一笔 Transaction。',
        '这次事件的度量：transaction_amount = 5,000。',
        '观察角度：客户、账户、机构、产品和日期。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '账户交易实验 · 从问题推导模型',
      title: '字段归位，星型模型逐步形成',
      description:
        '先查看一条交易记录，再把字段放回事件、观察角度和事实度量，最后观察事实表如何连接五个维度并切换分析视角。',
      visualization: {
        kind: 'banking-star-schema',
        rawTable: {
          columns: [
            'transaction_id',
            'customer_id',
            'account_id',
            'branch_id',
            'product_id',
            'channel',
            'transaction_type',
            'transaction_amount',
            'event_time',
            'event_date',
          ],
          rows: [
            {
              transaction_id: 'T10001',
              customer_id: 'C001',
              account_id: 'A001',
              branch_id: 'B01',
              product_id: 'P01',
              channel: '手机银行',
              transaction_type: '转账',
              transaction_amount: 5000,
              event_time: '2026-09-15 14:20',
              event_date: '2026-09-15',
            },
          ],
        },
        fieldGroups: [
          {
            id: 'event',
            label: '交易事件信息',
            role: 'event',
            tone: 'blue',
            fields: ['transaction_id', 'transaction_type', 'channel', 'event_time', 'event_date'],
            explanation:
              'transaction_id 标识这次事件；交易类型、渠道和时间说明事件如何发生。channel 是教学属性，本例不为它单独建立一张表。',
          },
          {
            id: 'angle',
            label: '观察角度',
            role: 'angle',
            tone: 'teal',
            fields: ['customer_id', 'account_id', 'branch_id', 'product_id'],
            explanation:
              '这些标识把同一笔交易连接到客户、账户、机构和产品维度，换一个连接对象就能换一个分析角度。',
          },
          {
            id: 'measure',
            label: '事实度量',
            role: 'measure',
            tone: 'navy',
            fields: ['transaction_amount'],
            explanation:
              'transaction_amount 与“一笔账户交易”的事件 Grain 对齐，记录这次交易发生了多少金额。',
          },
        ],
        tables: [
          {
            id: 'dim-customer',
            name: 'dim_customer',
            type: 'dimension',
            rowMeaning: '一行代表一个客户的分析属性',
            key: { label: '业务键', value: 'customer_id' },
            fields: [
              { name: 'customer_id', label: '客户标识', role: 'key' },
              { name: 'customer_name', label: '客户名称', role: 'attribute' },
              { name: 'customer_level', label: '客户等级', role: 'attribute' },
            ],
            responsibility: '回答“哪位客户发生了这笔交易”。',
          },
          {
            id: 'dim-account',
            name: 'dim_account',
            type: 'dimension',
            rowMeaning: '一行代表一个账户的分析属性',
            key: { label: '业务键', value: 'account_id' },
            fields: [
              { name: 'account_id', label: '账户标识', role: 'key' },
              { name: 'account_type', label: '账户类型', role: 'attribute' },
            ],
            responsibility: '回答“哪一个账户承载了这笔交易”。',
          },
          {
            id: 'dim-branch',
            name: 'dim_branch',
            type: 'dimension',
            rowMeaning: '一行代表一个机构节点的属性',
            key: { label: '业务键', value: 'branch_id' },
            fields: [
              { name: 'branch_id', label: '机构标识', role: 'key' },
              { name: 'branch_name', label: '机构名称', role: 'attribute' },
            ],
            responsibility: '回答“哪家机构发生了这笔交易”。',
          },
          {
            id: 'dim-product',
            name: 'dim_product',
            type: 'dimension',
            rowMeaning: '一行代表一个产品定义',
            key: { label: '业务键', value: 'product_id' },
            fields: [
              { name: 'product_id', label: '产品标识', role: 'key' },
              { name: 'product_name', label: '产品名称', role: 'attribute' },
            ],
            responsibility: '回答“这笔交易发生在哪个产品上”。',
          },
          {
            id: 'dim-date',
            name: 'dim_date',
            type: 'dimension',
            rowMeaning: '一行代表一个日历日期的属性',
            key: { label: '日期键', value: 'event_date' },
            fields: [
              { name: 'event_date', label: '事件日期', role: 'key' },
              { name: 'year', label: '年份', role: 'attribute' },
              { name: 'month', label: '月份', role: 'attribute' },
            ],
            responsibility: '回答“哪一天发生了这笔交易”。',
          },
          {
            id: 'fact-transaction',
            name: 'fact_transaction',
            type: 'fact',
            rowMeaning: '一行代表一笔账户交易',
            key: { label: '业务键', value: 'transaction_id' },
            fields: [
              { name: 'transaction_id', label: '交易标识', role: 'key' },
              { name: 'customer_id', label: '客户外键', role: 'key' },
              { name: 'account_id', label: '账户外键', role: 'key' },
              { name: 'branch_id', label: '机构外键', role: 'key' },
              { name: 'product_id', label: '产品外键', role: 'key' },
              { name: 'event_date', label: '日期外键', role: 'key' },
              { name: 'transaction_type', label: '交易类型', role: 'attribute' },
              { name: 'channel', label: '渠道属性', role: 'attribute' },
              { name: 'event_time', label: '事件时间', role: 'attribute' },
              { name: 'transaction_amount', label: '交易金额', role: 'measure' },
            ],
            responsibility: '记录账户交易事件，并通过外键连接不同观察角度。',
          },
        ],
        observations: [
          {
            id: 'customer',
            label: '按客户看',
            dimensionId: 'dim-customer',
            question: '哪位客户发起了这笔交易？',
            answer: '张三 · C001',
            detail: 'Fact 仍是 T10001，观察角度切换到 Customer。',
          },
          {
            id: 'account',
            label: '按账户看',
            dimensionId: 'dim-account',
            question: '哪个账户承载了这笔交易？',
            answer: 'A001 · 活期账户',
            detail: 'Fact 仍是 T10001，观察角度切换到 Account。',
          },
          {
            id: 'branch',
            label: '按机构看',
            dimensionId: 'dim-branch',
            question: '哪家机构发生了这笔交易？',
            answer: '杭州支行 · B01',
            detail: 'Fact 仍是 T10001，观察角度切换到 Branch。',
          },
          {
            id: 'product',
            label: '按产品看',
            dimensionId: 'dim-product',
            question: '这笔交易属于哪个产品？',
            answer: '活期存款 · P01',
            detail: 'Fact 仍是 T10001，观察角度切换到 Product。',
          },
          {
            id: 'date',
            label: '按日期看',
            dimensionId: 'dim-date',
            question: '哪一天发生了这笔交易？',
            answer: '2026-09-15',
            detail: 'Fact 仍是 T10001，观察角度切换到 Date。',
          },
        ],
        snowflake: {
          starLabel: 'fact_transaction → dim_product',
          starDetail: '产品名称直接放在 dim_product，查询路径短，分析时更容易找到。',
          snowflakeLabel: 'fact_transaction → dim_product → product_category',
          snowflakeDetail: '把产品分类再拆一层，减少重复属性，但查询和维护多一个连接。',
          decision:
            '本例只用 Product → Product Category 做小型对照：选择哪种组织方式，要看查询直接性和维护成本。',
        },
      },
    },
    {
      kind: 'narrative',
      title: '事实不变，观察角度可以变化',
      paragraphs: [
        '同一条 fact_transaction 记录，可以沿 customer_id 看客户，沿 branch_id 看机构，沿 product_id 看产品，也可以沿 event_date 看日期。观察角度变化了，事实事件和 transaction_amount 没有被改写。',
        '本例里的 customer_id、account_id 等是业务键，负责把事实连接到稳定的业务对象。需要保留客户属性历史时，代理键会在下一节的版本问题中出现；这里不把键设计单独拆成一门课。',
      ],
    },
    {
      kind: 'takeaway',
      title: '从问题推导星型模型',
      text: '先识别发生的事件，再列出要观察的角度，事实表和维度表就有了业务上的来源。星型模型的价值在于让同一事实沿多条清楚的连接路径被分析。',
      bullets: [
        'Fact：发生了什么——一笔账户交易。',
        'Dimension：从什么角度观察——客户、账户、机构、产品、日期。',
        'channel 是本例的交易属性，不因为它出现就额外创造一张大型维度表。',
        '星型和雪花是设计取舍，不能只按图形好不好看判断。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要按字段类型机械归类',
      text: '数字不一定是事实，文字也不一定是维度。transaction_id 是事件 identity，transaction_amount 才是这次交易的度量；字段角色要由业务含义和 Grain 决定。',
    },
  ],
}
