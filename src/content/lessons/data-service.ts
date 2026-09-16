import type { LessonContent } from '../types'
import { createDataServiceVisualization } from '../../features/data-service/banking'

export const dataServiceOverviewVisualization = createDataServiceVisualization('overview')
export const dataServiceReportVisualization = createDataServiceVisualization('report')
export const dataServiceFileVisualization = createDataServiceVisualization('file')
export const dataServiceApiVisualization = createDataServiceVisualization('api')
export const dataServiceDecisionVisualization = createDataServiceVisualization('decision')

export const dataServiceContent: LessonContent = {
  eyebrow: '第 10 章 · 数据服务',
  opening: {
    eyebrow: '存款余额已经发布',
    title: '数据做好了，怎么交给别人用？',
    intro:
      '2026-09-30 的存款余额已经加工完成、通过质量检查并正式发布。接下来面对的是经营人员、下游系统和业务应用：他们需要的数据相同，使用方式却不同。',
    cards: [
      { label: '数据状态', value: '已发布', detail: '质量检查通过 · 业务日期 2026-09-30' },
      { label: '数据资产', value: '存款余额', detail: '同一份结果，面向不同消费者' },
      { label: '本章主线', value: '交付方式', detail: '查看 · 批量接收 · 按需获取' },
    ],
    question: '如果只把数仓内部表名和账号交给每个使用者，谁来承担表结构变化和访问边界？',
  },
  subtitle: '加工完成只是数据生产阶段的终点；面向人、系统和业务应用，还要选择合适的消费方式。',
  quickSummary:
    '从一份已经发布的存款余额出发，区分人查看、系统批量接收和系统按需获取三类消费模式。',
  concept: {
    term: '数据服务：把已发布结果交给消费者',
    definition:
      '数据服务关注数据如何被交付和使用。它在已经发布的数据资产与消费者之间约定边界、方式和基本契约，不重新计算指标。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '数据生产完成，不等于数据已经被使用',
      paragraphs: [
        '前面的加工链路已经把 2026-09-30 的存款余额做完，质量检查也通过了。此时数据生产阶段告一段落，但经营人员想看趋势，下游系统要接收一整批记录，业务页面只想查某个机构的一条记录。',
        '这三个请求都指向同一份已发布结果。差别在于消费者是谁、一次要多少、由谁触发，以及它是查看、批量交换还是按条件获取。',
      ],
      bullets: [
        '数据生产回答“结果是否加工完成并可以发布”。',
        '数据消费回答“谁以什么方式拿到已经发布的结果”。',
        '普通业务系统不直接连接数仓；受控的报表 / BI 平台才可以查询指定数据表或 View。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '数据消费工作台 · 总览',
      title: '同一份已发布数据，面对三类消费者',
      description:
        '点击经营 / 分析人员、下游系统或业务应用，观察同一份存款余额在不同消费场景中的交付方式。',
      visualization: dataServiceOverviewVisualization,
    },
    {
      kind: 'narrative',
      title: '本章先建立选择框架',
      paragraphs: [
        '人通常需要页面、表格和趋势；系统批量接收时更在意一批数据何时完整；业务应用按条件获取时，更在意请求参数和返回字段是否稳定。报表 / BI、文件接口和 API 是这些典型消费模式的常见实现。',
        '这不是三种必须背下来的技术清单。先看消费需求，再决定交付方式，才能避免让业务系统依赖数仓内部结构。',
      ],
    },
    {
      kind: 'takeaway',
      title: '数据没有变，变化的是消费者和消费方式',
      text: '从已发布存款余额到最终使用，中间需要一条清楚的交付边界。人查看、系统批量接收、系统按需获取，分别对应报表 / BI、文件接口和 API 这三种典型路径。',
      bullets: [
        '先识别消费者，再判断查看、批量还是按需。',
        '发布状态是消费的前提，消费方式不会改变数据本身。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要把数仓表直连当成通用数据服务',
      text: '把 ADS 表名和数据库账号交给普通业务系统，会让表结构、权限和性能直接暴露给业务应用。课程只把受控报表 / BI 查询视为分析消费场景，业务系统使用文件或 API 等交付边界。',
    },
  ],
}

export const dataServiceReportContent: LessonContent = {
  eyebrow: '第 10 章 · 报表与 BI',
  subtitle: '经营人员需要的是可查看、可筛选、可比较的结果，而不是数仓内部的加工过程。',
  quickSummary:
    '以 2026-09-30 各机构存款余额为例，使用表格、机构筛选和趋势查看理解报表 / BI 的典型消费语义。',
  concept: {
    term: '报表 / BI：给人看的数据',
    definition:
      '报表 / BI 面向人的主动查看和分析，在权限控制下查询指定数据表或 View，并把已发布结果组织为表格、趋势和筛选视图。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '经营人员先看到的是一张结果表',
      paragraphs: [
        '今天要看的问题很具体：2026-09-30，杭州分行、宁波分行和温州分行各有多少存款余额？报表把已经发布的结果整理成“机构、业务日期、存款余额、币种”这些人能直接阅读的列。',
        '当经营人员筛选杭州分行，或把视图切到趋势，数据服务并没有重新计算存款余额，只是在改变查看结果的组织方式。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '报表 / BI 模式 · 人主动查看',
      title: '筛选机构，再决定看表格还是趋势',
      description:
        '选择业务日期和机构，切换表格 / 趋势视图，观察固定报表、查询、筛选和简单比较如何服务人的判断。',
      visualization: dataServiceReportVisualization,
    },
    {
      kind: 'narrative',
      title: '受控查询和直接连接不是一回事',
      paragraphs: [
        '报表 / BI 平台可以在权限控制下查询指定数据表或 View。平台拿到的是被允许使用的数据资产，业务人员通过页面完成查看；普通业务系统不应拿着 ADS 表名和数据库账号来走同一条路。',
        '固定报表适合每天重复查看，筛选和简单钻取适合临时比较，趋势适合观察相邻业务日的变化。它们都属于“人查看”这一消费模式。',
      ],
      bullets: [
        '报表 / BI 是受控的分析消费者。',
        '本节关注数据交付给人的语义，不教授任何具体 BI 产品的 Dashboard 搭建。',
      ],
    },
    {
      kind: 'takeaway',
      title: '给人看的数据，要让问题容易被看懂',
      text: '日期、机构、数值和趋势是经营查看时最常用的入口。报表 / BI 组织已发布结果，帮助人发现变化并继续提问。',
    },
    {
      kind: 'pitfall',
      title: '不要把“能查到”误认为“谁都能直连”',
      text: '报表 / BI 的查询权限、可见资产和展示方式都需要受控。课程中的查询入口不代表普通业务系统可以绕过服务边界读取数仓内部表。',
    },
  ],
}

export const dataServiceFileContent: LessonContent = {
  eyebrow: '第 10 章 · 文件接口',
  subtitle: '批量交付最重要的信号不是文件刚出现，而是这一批数据已经完整可读。',
  quickSummary:
    '通过 TXT 数据文件和 FLAG 完成标志，观察为什么下游必须等待完成信号，再开始消费上一业务日的批量数据。',
  concept: {
    term: '文件接口：给系统批量交付数据',
    definition:
      '文件接口用双方约定的文件名、字段布局和完成信号交付一批数据。TXT 负责承载内容，FLAG 负责说明这一批内容已经完成。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '文件出现的那一刻，数据可能还没写完',
      paragraphs: [
        '银行批量交换中，常见做法是先创建 `deposit_balance_20260930.txt`，再持续写入各机构的存款余额。下游如果看到文件名就立刻读取，可能读到半批数据。',
        '所以交付过程要把“文件已经出现”和“下游可以消费”分开。只有同一批次的 `deposit_balance_20260930.flag` 出现，才表示写入方已经完成交付。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '文件接口模式 · 完成标志',
      title: 'TXT 出现之后，还要等 FLAG',
      description:
        '点击两个阶段，观察只有 TXT 时的未完成状态，以及 FLAG 出现后下游按钮才被放行的状态变化。',
      visualization: dataServiceFileVisualization,
    },
    {
      kind: 'narrative',
      title: '文件接口的约定要能让双方复述',
      paragraphs: [
        '这批文件至少要说清楚业务日期、字段顺序、分隔符和编码。双方还要约定交付的是全量还是增量；这里的全量 / 增量只是交付范围的概念，不继续展开 CDC 或水位线。',
        '文件可以通过约定目录、FTP 或 SFTP 等方式交换。本节关注的是批次完成边界，不展开服务器配置和上传脚本。',
      ],
      bullets: [
        'TXT 文件出现：数据载体已经创建，但可能仍在写入。',
        'FLAG 文件出现：这批数据完成交付，下游才开始消费。',
        '文件名中的业务日期要和批次内容保持一致。',
      ],
    },
    {
      kind: 'engineering-note',
      title: '完成信号是批量消费的边界',
      text: '下游不应通过猜测文件大小或轮询写入过程来判断完成。双方约定同批次 FLAG 后，读取动作才有明确的启动条件。',
    },
    {
      kind: 'pitfall',
      title: '不要把“有文件”当成“文件可读”',
      text: '数据文件存在只能证明写入方开始交付。没有 FLAG 时，先等待；出现 FLAG 后再消费，才能避免读取半批数据。',
    },
  ],
}

export const dataServiceApiContent: LessonContent = {
  eyebrow: '第 10 章 · API',
  subtitle: '系统只需要一条或少量结果时，可以按条件请求已发布数据，不必每天搬运整批文件。',
  quickSummary:
    '用一个极简 GET 请求展示参数和 JSON 响应，并把 API 的访问方式与数据的业务日期、离线新鲜度分开。',
  concept: {
    term: 'API：让系统按需获取数据',
    definition:
      'API 用稳定的输入参数和输出字段，让系统按条件获取已发布结果。它描述的是访问方式，不自动承诺实时数据。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '只查一个机构，不必搬运整批文件',
      paragraphs: [
        '业务页面只想显示杭州分行在 2026-09-30 的存款余额。它可以发送一个带有机构和业务日期的请求：',
        '`GET /api/deposit-balances?branch_id=HZ01&business_date=2026-09-30`。',
        '服务返回这一条已发布记录，调用方只需要理解请求参数和响应字段，不需要知道余额在数仓里经历了哪些加工步骤。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: 'API 模式 · 请求与响应',
      title: '请求 → 参数 → JSON 响应',
      description: '选择机构和业务日期后发送请求，观察同一份已发布存款余额如何按条件返回为 JSON。',
      visualization: dataServiceApiVisualization,
    },
    {
      kind: 'narrative',
      title: 'API 的关键是输入和输出契约',
      paragraphs: [
        '调用方需要知道 `branch_id` 和 `business_date` 的含义，服务方需要稳定返回 `branch_id`、`business_date`、`deposit_balance` 和 `currency`。字段名、类型和日期语义一旦随意变化，调用方就无法可靠消费。',
        '鉴权、错误码、分页等是真实 API 通常还会考虑的内容。这里把范围收在最小的请求与响应契约内。',
      ],
    },
    {
      kind: 'takeaway',
      title: 'API 不等于实时数据',
      text: 'API ≠ 实时数据。这个 API 完全可以返回 business_date = 2026-09-30 的日终离线存款余额。API 说明怎样访问，业务日期说明结果属于哪一天；两者是不同维度。',
      bullets: [
        'API 是按需获取的访问方式。',
        '数据是否实时，要看生产、发布和新鲜度约定。',
        '文件也可能高频产生，API 也可以返回离线结果。',
      ],
    },
    {
      kind: 'pitfall',
      title: '不要把访问方式当成新鲜度标签',
      text: '“文件 = 离线、API = 实时”是一个常见但错误的映射。判断数据新鲜度时，要看业务日期和发布时点，而不是只看传输形式。',
    },
  ],
}

export const dataServiceDecisionContent: LessonContent = {
  eyebrow: '第 10 章 · 消费方式选择',
  subtitle: '面对同一份已发布数据，先读清消费者和使用方式，再选择交付路径。',
  quickSummary:
    '通过三个真实消费需求选择报表 / BI、TXT + FLAG 文件接口或 API，并用数据量、频率和触发方式复盘判断。',
  concept: {
    term: '消费方式选择',
    definition:
      '交付方式应匹配消费者、数据量、频率、触发方式以及批量或按需的需求。报表 / BI、文件接口和 API 是典型模式，不是互斥的绝对规则。',
  },
  sections: [
    {
      kind: 'narrative',
      title: '同一份数据，三个请求完全不同',
      paragraphs: [
        '经营人员每天看各机构余额和趋势，关心的是人能否快速比较；下游系统每天等上一业务日的几十万或上百万行，关心的是一批数据何时完整；业务页面每次只查一个机构，关心的是参数和返回结果。',
        '把这三个请求都做成同一种交付，会让使用者承担不必要的等待、解析或查询成本。',
      ],
    },
    {
      kind: 'visualization',
      eyebrow: '消费决策练习 · 需求驱动',
      title: '你会选择哪种数据交付？',
      description:
        '选择一个场景，再选择报表 / BI、文件接口或 API。系统会说明匹配原因，并给出典型模式对照。',
      visualization: dataServiceDecisionVisualization,
    },
    {
      kind: 'narrative',
      title: '判断时抓住五个问题',
      paragraphs: [
        '先问消费者是谁，再看一次数据量和消费频率；接着判断是人主动查看，还是系统交互；最后区分批量交换还是按请求获取。答案组合起来，通常就能缩小交付方式的范围。',
        '这些维度描述常见模式，不是硬性技术边界。API 可以分页，BI 可能查询大量数据，文件也可以高频产生；具体设计仍要结合数据资产和消费者约定。',
      ],
      bullets: [
        '消费者是谁：人还是系统。',
        '一次数据量和消费频率：少量查询还是批量接收。',
        '触发方式：主动查看、定时批次还是请求触发。',
        '消费形态：批量还是按需。',
      ],
    },
    {
      kind: 'takeaway',
      title: '先判断需求，再选择交付方式',
      text: '报表 / BI 适合人查看，TXT + FLAG 适合系统批量接收，API 适合系统按条件获取少量结果。它们共同消费的是已经发布的那份数据。',
    },
    {
      kind: 'pitfall',
      title: '不要把典型模式写成绝对规则',
      text: '表格只是常见倾向，不是容量和频率的硬阈值。真正的判断仍要回到消费者、数据量、频率、触发方式和批量 / 按需这五个问题。',
    },
  ],
}
