<div align="center">

# 数据仓库图解（sql.sb）

> **从一张表开始，看懂数据仓库。**
>
> 真实银行案例、交互实验，以及一条从业务数据到数据服务的学习路径。

[![在线学习](https://img.shields.io/badge/在线学习-sql.sb-0070f3?style=for-the-badge&logo=googlechrome&logoColor=white)](https://sql.sb)
[![GitHub Stars](https://img.shields.io/github/stars/0verme/data-warehouse-visualized?style=for-the-badge&logo=github&color=yellow)](https://github.com/0verme/data-warehouse-visualized)
[![源代码许可证](https://img.shields.io/badge/源代码-Apache_2.0-blue?style=for-the-badge)](LICENSE)
[![课程内容许可证](https://img.shields.io/badge/课程内容-CC_BY--NC--SA_4.0-lightgrey?style=for-the-badge)](CONTENT_LICENSE.md)

**[在线学习 / 在线体验](https://sql.sb)** · **[GitHub Star](https://github.com/0verme/data-warehouse-visualized)** · **[查看开源协议](#开源协议)**

</div>

---

![数据仓库图解首页与数据流交互](docs/images/home.png)

## 这套课程能帮你理解什么

课程以银行业务数据为主要案例，也保留少量适合解释通用概念的示例。沿着已上线课程学习，你会逐步遇到这些工程问题：

- 一个经营指标为什么需要来自核心系统、信贷系统等多个业务系统？
- 一笔业务数据如何从源系统进入数仓，经过清洗、建模和聚合，最后进入报表？
- 建模时为什么必须先确定业务过程，以及一行到底代表什么？
- 同一个“存款余额”为什么可能算出不同答案？差异来自统计对象、时间语义还是过滤范围？
- 调度任务为什么会延迟、阻塞，甚至把问题传给下游？Retry、Rerun 和 Backfill 分别解决什么问题？
- 数据出了问题，如何结合规则、证据和业务重要性判断还能不能发布？
- 修改一张表或一个字段以后，哪些任务、指标和消费者会受到影响？
- 一份已发布数据应该通过报表 / BI、TXT + FLAG 还是 API 交付？SQL 变慢时，又该从哪里开始定位？

课程不要求你先背下所有术语。每个实验都提供一小段可操作的数据或状态，让你看到判断依据如何改变结果。

## 为什么做这个项目

传统数仓资料常从 ODS / DWD / DWS / ADS、Kimball 维度建模、SCD 等定义开始。这些概念有用，但实际工作中的困难往往出现在定义之后：一行数据的含义改变了，指标口径没有同步；上游晚到了一小时，依赖链开始等待；一张表的字段变更，影响范围却没有被发现。

数据仓库图解把这些问题放回数据变化、任务状态和业务决策中。课程会让学习者切换 Grain、观察指标时间语义、推进 DAG Run、注入质量异常、追踪血缘，并比较湖仓和数据消费方式的工程取舍。

ODS、DWD、DWS、ADS 是常见的分层叫法，不是所有团队都必须照用的唯一标准。课程更关心每一层承担什么职责、数据为什么在这里加工，以及出现异常时如何调查和处理。

## 精选交互实验

首页只展示几组最能代表课程方法的实验，其余内容从[在线学习空间](https://sql.sb/learn/)进入。

| 实验                                                              | 你会观察到什么                                                                               |
| :---------------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| [银行星型模型实验台](https://sql.sb/learn/star-schema-and-grain/) | 从一笔账户交易给字段归位，切换客户、账户、机构、产品和日期等观察角度，理解事实与维度的关系。 |
| [Grain / Join 放大实验](https://sql.sb/learn/grain/)              | 在合同、借据和还款三种粒度之间切换，看到一对多 Join 如何复制金额并改变结果。                 |
| [存款余额指标实验台](https://sql.sb/learn/metric-system/)         | 对比不同统计集合、时间语义和业务范围，定位同名指标出现差异的原因。                           |
| [调度 DAG Run 模拟器](https://sql.sb/learn/scheduling-system/)    | 推进业务日期和到达时间，观察延迟、失败传播、重试、补数与下游阻断。                           |
| [血缘追踪与爆炸半径](https://sql.sb/learn/data-lineage-impact/)   | 从表或字段出发，区分直接下游、传递影响和最终消费者，确定一次变更的检查范围。                 |
| [数据消费工作台](https://sql.sb/learn/data-service/)              | 用同一份已发布存款余额比较报表 / BI、TXT + FLAG 文件接口和 API 的交付边界。                  |

## 课程学习路线

不同背景可以从不同位置进入。章节编号以当前课程定义为准。

### 第一次系统学习数据仓库

按主课程顺序学习第 **01 章** 到第 **11 章**。这条路线从业务系统和一张报表开始，经过建模、指标、SQL 加工、调度、质量、血缘、治理、湖仓、数据服务和性能；第 **12 章** 跨系统分行经营分析数据产品是综合实战 Capstone，第 **13 章** 生产实践案例可以在完成主课程后按需进入。

### 已经会 SQL / ETL

可以从 **02 数据建模 → 03 指标体系 → 04 SQL 与数据加工** 进入，再沿着 **05 调度系统 → 06 数据质量 → 07 数据血缘 → 08 数据治理 → 11 性能与工程实践** 补齐生产链路。需要了解存储架构或交付方式时，再加入 **09 湖仓** 和 **10 数据服务**。

### 已有数据仓库工作经验

按问题进入：指标口径看 **03**，调度和日批看 **05**，质量发布看 **06**，影响分析看 **07**，资产与责任看 **08**，性能诊断看 **11**；湖仓取舍和数据交付分别对应 **09**、**10**。

## 完整课程体系

当前课程定义包含 **13 个章节、54 节课程**：其中 **54 节已上线，0 节规划中**。按已上线课程的实验入口计，当前有 **54 个交互实验入口**，对应 **23 类实验工作台**。各章课程数量和状态如下：

| 章节                                                       | 主题                       | 课程数 | 状态   |
| :--------------------------------------------------------- | :------------------------- | -----: | :----- |
| [第 01 章](https://sql.sb/learn/why-data-warehouse/)       | 认识数据仓库               |      4 | 已上线 |
| [第 02 章](https://sql.sb/learn/data-modeling/)            | 数据建模                   |      5 | 已上线 |
| [第 03 章](https://sql.sb/learn/metric-system/)            | 指标体系                   |      4 | 已上线 |
| [第 04 章](https://sql.sb/learn/sql-and-transformation/)   | SQL 与数据加工             |      5 | 已上线 |
| [第 05 章](https://sql.sb/learn/scheduling-system/)        | 调度系统                   |      5 | 已上线 |
| [第 06 章](https://sql.sb/learn/data-quality/)             | 数据质量                   |      5 | 已上线 |
| [第 07 章](https://sql.sb/learn/data-lineage/)             | 数据血缘                   |      5 | 已上线 |
| [第 08 章](https://sql.sb/learn/data-governance/)          | 数据治理                   |      5 | 已上线 |
| [第 09 章](https://sql.sb/learn/lakehouse/)                | 湖仓                       |      4 | 已上线 |
| [第 10 章](https://sql.sb/learn/data-service/)             | 数据服务                   |      5 | 已上线 |
| [第 11 章](https://sql.sb/learn/performance-and-practice/) | 性能与工程实践             |      5 | 已上线 |
| 第 12 章                                                   | 跨系统分行经营分析数据产品 |      1 | 已上线 |
| 第 13 章                                                   | 生产实践案例               |      1 | 已上线 |

## 视觉预览

课程页面把表格、状态、依赖和判断过程放在同一个操作界面中。下面保留几张代表性截图，帮助第一次打开仓库的人快速了解课程形态。

### 字段归位与数据建模

![数据建模交互课程](docs/images/data-modeling.png)

### 血缘追踪与影响分析

![数据血缘交互课程](docs/images/lineage.png)

## 适合谁

- 数据仓库、ETL 和大数据开发工程师
- 数据分析与 BI 工程师
- 后端与数据平台工程师
- 想系统理解数据仓库工程的学习者

## 参与共建

数据仓库没有脱离业务背景的唯一标准答案，不同行业和公司会在模型、调度、质量和服务方式上做出不同选择。如果课程里的判断与真实生产环境存在差异，欢迎通过 [Issue](https://github.com/0verme/data-warehouse-visualized/issues) 提出具体场景和依据。

项目欢迎这些贡献：

- 补充真实但已脱敏的数据仓库工程案例
- 纠正课程中的术语或工程细节
- 提供不同公司、行业或技术栈下的实践差异
- 设计新的交互实验
- 改善课程学习体验
- 修正文案、无障碍或工程问题

提交代码或课程修改前，请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和[统一银行教学业务域说明](docs/BANKING_TEACHING_DOMAIN.md)。

## 本地运行

本项目是一个静态站点，本地无需安装数据库或大数据集群。需要 Node.js `>= 22.12`：

```bash
git clone https://github.com/0verme/data-warehouse-visualized.git
cd data-warehouse-visualized
npm install
npm run dev
```

然后打开 <http://localhost:4321>。

<details>
<summary><b>常用命令与项目结构</b></summary>

```bash
npm run test         # 运行 Vitest 单元测试
npm run check        # 运行 Astro / TypeScript 类型检查
npm run lint         # 运行 ESLint 静态代码检查
npm run format:check # 检查 Prettier 格式
npm run build        # 构建静态站点产物 (dist/)
npm run preview      # 本地预览生产构建
```

发布门禁还包含一个 Chromium 浏览器 smoke（`/learn` 加载、切课、无双滚动条 / 无横向溢出、Step Player 与 Capstone 交互），需要先安装浏览器：

```bash
npx playwright install chromium
npm run test:e2e:smoke # 构建 + 启动 preview + 检查桌面 1280×800 / 移动 390×844
```

```text
src/
├── components/
│   ├── course/          # 学习 Shell、目录与进度交互
│   ├── lesson/          # LessonHeader、卡片、代码块与课程导航
│   └── visualizations/  # 数据驱动的交互可视化组件
├── content/             # 每节课的文案与实验输入数据
├── data/                # Lesson Schema、课程元数据与章节路线
├── i18n/                # Locale 定义与公共 UI 文案
├── layouts/             # 网站级 Astro Layout 与 SEO 配置
├── pages/               # 首页、学习入口与动态 Lesson 路由
├── styles/              # 全局样式、CSS Variables 与响应式规则
├── types.ts             # 可视化通用数据模型类型定义
└── utils/               # 课程导航、进度持久化、血缘与调度计算
docs/
├── images/              # README 与项目文档截图
└── DEPLOYMENT.md        # 生产构建与部署说明
```

</details>

生产构建、GitHub Actions 和 Cloudflare Workers 部署请参阅[部署指南](docs/DEPLOYMENT.md)。

## 开源协议

本项目明确区分源代码和课程内容两类材料：

| 范围                                           | 协议                                  | 说明                                                                                               |
| :--------------------------------------------- | :------------------------------------ | :------------------------------------------------------------------------------------------------- |
| 网站源代码、组件、样式、配置、测试和构建脚本   | [Apache License 2.0](LICENSE)         | `LICENSE` 是源代码许可。                                                                           |
| 课程文案、教学图解、课程案例及其他原创教学材料 | [CC BY-NC-SA 4.0](CONTENT_LICENSE.md) | 允许学习、分享、转载、翻译和改编，但须署名、不得用于商业用途；对外分享衍生作品时继续采用同一许可。 |

课程内容许可的完整范围说明见 [CONTENT_LICENSE.md](CONTENT_LICENSE.md)，官方协议页面见 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)。第三方依赖、图片或其他材料仍以其各自许可为准。

课程内容可以用于学习、分享、转载、翻译、改编，也可以在非商业条件下 Fork 后进行二次创作。以下场景不在公共 CC 许可范围内：将课程内容换 Logo、换 UI 或轻微修改后收费出售，或将其大幅改编成收费课程、商业培训等。

如需将课程内容用于商业培训、付费课程、出版、企业内部商业使用或其他商业场景，请联系项目作者单独获得商业授权。CC 许可对商业使用的限制，不影响版权方另行授权。

项目名称、`sql.sb` 品牌、Logo 及其他品牌标识不包含在课程内容的 CC 授权范围内；使用这些标识需要另行取得许可。

## 写在最后

数据仓库真正难的，不是记住 ODS / DWD / DWS 等缩写，而是理解为什么这样建模、为什么这样加工、为什么这样调度，数字不一致以后如何调查，以及一次变更究竟会影响谁。

“数据仓库图解”希望把原本藏在代码、生产系统和工程经验里的知识，变成可观察、可操作、可验证的学习过程。

👉 [从第一课开始](https://sql.sb)：<https://sql.sb>

如果这个项目对你的学习或工作有帮助，欢迎在 [GitHub](https://github.com/0verme/data-warehouse-visualized) 留下一个 Star。
