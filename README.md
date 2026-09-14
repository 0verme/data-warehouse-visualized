# 数据仓库图解

> 从一张表开始，看懂数据仓库。

数据仓库图解是一套面向中文学习者的交互式数据仓库可视化教材。

不只是解释“是什么”，更希望通过图解、动画和模拟器解释：

**数据为什么这样流动，系统为什么这样设计。**

## 项目介绍

这里的“一节课”不是一页普通 Markdown，而是一个可以阅读、观察、操作、理解的交互式知识页面。你可以点击节点、播放加工过程、模拟依赖影响，在数据状态变化中建立数据仓库的整体认识。

项目参考了交互式教学和“一节课一个可视化实验”的产品理念，但没有复制任何源码、课程文本、图片、SVG、品牌元素或页面代码。本项目使用自己的视觉设计、内容和组件体系。

## 项目截图

> 截图占位：后续补充首页和现有交互 Demo 的实际截图。

## 为什么做这个项目

很多数据仓库资料从缩写和定义开始，却很少把数据从哪里来、为什么要加工、修改一张表会影响哪里讲清楚。这个项目希望优先把结构和流动展示出来，再用简短文字补足工程语境：

- 用图解代替不必要的长篇概念堆叠
- 用交互观察状态变化，而不只是看静态图片
- 用工程提示解释常见方案的边界，而不是把实践写成唯一标准

## 当前能力

- 首页产品介绍与完整课程路线骨架
- 统一 `Lesson` Schema 驱动课程目录和页面
- `/learn/` 学习 Shell：课程目录、当前课程、上一节 / 下一节
- `localStorage` 学习进度：完成课程、当前课程和完成数量
- 业务系统到数据仓库的数据流 Demo
- ODS / DWD / DWS / ADS 分层加工 Demo
- 可点击的数据血缘图与 Impact Analysis 模拟
- 数据建模导入课：原始订单数据、Grain 声明与四步建模思路
- 星型模型与粒度交互实验：大宽表拆分、粒度切换与重复计算修复
- SCD Type 2 维度历史实验：直接 UPDATE 冲突、版本区间与时间点查询
- Desktop、Tablet、Mobile 响应式布局
- `prefers-reduced-motion` 降级支持
- 基础 title、description、canonical 和 Open Graph 元数据

## 课程路线

1. 数据仓库是什么
2. 数据仓库分层
3. 数据建模（导入课 → 星型模型与粒度 → SCD Type 2）
4. 指标体系
5. SQL 与数据加工
6. 调度系统
7. 数据质量
8. 数据血缘
9. 数据治理
10. 湖仓
11. 性能与工程实践
12. 从 0 搭一套数据仓库

当前已完成 5 个真实交互 Demo，分别对应第 1、2、4、5、10 课；数据建模导入课也已开放，其余课程先保留在完整路线中。

## 本地开发

要求：Node.js 22.12+、npm（Astro 7 的运行要求）。

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run test         # 运行 Vitest
npm run lint         # 运行 ESLint
npm run build        # 构建静态站点
npm run preview      # 预览生产构建
npm run format:check # 检查 Prettier 格式
```

构建产物位于 `dist/`，不依赖服务端运行时，可部署到 GitHub Pages、Cloudflare Pages 或 Vercel。部署到 GitHub Pages 的项目子路径时，可设置 `BASE_PATH=/data-warehouse-visualized/` 后再运行 `npm run build`；默认值 `/` 适合域名根路径部署。若需要生成绝对 canonical，可额外设置 `PUBLIC_SITE_URL=https://你的域名`。

## 项目结构

```text
src/
├── components/
│   ├── course/          # 学习 Shell、目录和进度交互
│   ├── lesson/          # LessonHeader、卡片、代码块、课程导航
│   └── visualizations/  # 数据驱动的交互可视化
├── content/             # 每节课的文案和实验输入数据
├── data/                # Lesson Schema、课程元数据和章节路线
├── layouts/             # 网站级 Astro Layout 与 SEO
├── pages/               # 首页、学习入口和动态 Lesson 路由
├── styles/              # CSS Variables、组件样式和响应式规则
├── types.ts             # 可视化通用数据类型
└── utils/               # 课程导航、进度持久化、血缘计算
```

新增课程通常只需要在 `src/data/course.ts` 添加元数据，并在 `src/content/lessons/` 添加内容；新增可视化组件后，可通过 `LessonVisualization` 数据类型复用到不同 Lesson。

## Roadmap

### Phase 1

- [x] 课程框架
- [x] 学习进度
- [x] 基础教学组件
- [x] 数仓分层交互 Demo
- [x] 血缘交互 Demo

### Phase 2

- [x] 星型模型可视化
- [x] 粒度变化模拟
- [x] SCD2 拉链表时间轴
- [ ] Partition Pruning 模拟
- [ ] Shuffle / 数据倾斜模拟

### Phase 3

- [ ] DAG 调度模拟器
- [ ] 补数与重跑模拟
- [ ] 数据质量实验
- [ ] SQL 血缘演示
- [ ] 爆炸半径高级模式

## Contributing

欢迎围绕课程内容、可视化交互、无障碍、响应式体验和工程实践提交 Issue 或 Pull Request。

建议新增内容时：

1. 保持课程文案与组件代码分离
2. 优先复用数据驱动的教学组件
3. 为计算逻辑补充有价值的 Vitest 测试
4. 避免加入与教学无关的重量级依赖

## License

License：待确定。

当前仓库未选择 License；在正式确定前，请不要默认将项目内容视为可自由复制、修改或分发。
