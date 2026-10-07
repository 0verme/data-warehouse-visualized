import type { LessonContent } from '../types'
import type { StreamingGoldenVisualization } from '../../features/streaming-golden/types'

export const streamingGoldenVisualization: StreamingGoldenVisualization = {
  kind: 'streaming-golden',
}

export const streamingWarehouseGoldenContent: LessonContent = {
  eyebrow: '进阶专题 · Advanced Golden Lesson',
  opening: {
    eyebrow: '同一批交易，为什么会得到不同的“当前答案”？',
    title: '同一批交易，为什么批处理、微批和流处理会得到不同的当前答案？',
    intro:
      '固定复用同一组 Banking Transaction delivery：先在 T+1 cutoff 后完成 batch，再按分钟触发 microbatch，最后让事件连续进入窗口。全程只看 branch × 5-minute window × currency 的交易笔数和金额；新增差异来自输入边界、时间语义、窗口完整性与恢复，不是换了业务问题。',
    cards: [
      {
        label: '同一输入',
        value: '8 次 delivery',
        detail: '7 笔唯一业务交易；offset 7 是重复投递',
      },
      { label: '同一指标', value: 'count + CNY', detail: 'branch × 5-minute window × currency' },
      { label: '在线 final', value: '450 元', detail: 'HZ001 · [10:00, 10:05)' },
      { label: 'cutoff reference', value: '510 元', detail: '差异 +60 = TX-008' },
    ],
    question: '为什么同一组交易在不同计算边界下，会有不同的“当前答案”？',
  },
  subtitle:
    '从 bounded input 推进到 unbounded input，观察事件时间窗口如何持续维护、修订、恢复并与离线 cutoff reference 对齐。',
  quickSummary:
    '批次可以在声明的 cutoff 后完成；持续流没有天然最后一条。Event Time 决定窗口归属，Arrival / Processing Time 描述何时可见和处理；Watermark 是 event-time completeness 的策略性估计，不是 source cursor 或不迟到保证。',
  concept: {
    term: 'Continuous completeness（持续完整性）',
    definition:
      '无界输入没有天然的最后一条记录。系统只能按 event-time watermark、允许迟到策略与窗口生命周期，持续发布一个可修订、最终化且可对账的结果。',
  },
  sections: [
    {
      kind: 'visualization',
      eyebrow: 'Golden Scenario · 一条事件流，一份共享状态',
      title: '同一输入，三种完成边界',
      description:
        'T+1 batch 在固定 cutoff 后完成，minute-level microbatch 仍有 run boundary，continuous stream 没有天然最后一条。沿固定 offset 时间线推进，不编辑事件或参数；再追踪 clocks、window、late revision、watermark、state、recovery 与 cutoff reconciliation。CDC 是可选 source adapter，Kafka 可承载 event stream，Flink 可运行 stateful processing，Lakehouse 提供存储 / table 能力；CDC != Streaming；Kafka != Streaming Warehouse；Flink != Streaming Warehouse；Lakehouse != Streaming Warehouse。',
      visualization: streamingGoldenVisualization,
    },
    {
      kind: 'narrative',
      title: '02 · 一笔交易应该按哪一个时间进入窗口？',
      paragraphs: [
        'offset 5 / TX-005 的 event_time 是 10:04，arrival_time 是 10:06，processing_time 是 10:06:02。按 event time，它属于 [10:00, 10:05)；按 arrival 或 processing clock 切桶，则会落入 [10:05, 10:10)。业务归属使用交易发生时间；另外两只钟解释何时可见、何时被 runtime 处理。',
        'Source offset 描述 delivery 顺序，不会替代 event_time。offset 3 的事件时间 10:04 先于 offset 4 到达；offset 4 的 event_time 反而是 10:03。事件序列按 source / arrival 推进，不会自动按业务发生时间排序。',
      ],
      bullets: [
        'Event Time 决定本课的业务窗口成员关系。',
        'Arrival Time 描述 delivery 何时对 source 可见。',
        'Processing Time 描述 runtime 何时处理；replay 会产生新的处理观测。',
      ],
    },
    {
      kind: 'narrative',
      title: '03 · [10:00,10:05) 到边界后，结果会怎样？',
      paragraphs: [
        '本课 Grain 固定为 branch_id × window_start × window_end × currency，窗口为 5-minute tumbling [start, end)。offset 6 的 event_time 正好是 10:05:00，因此属于 [10:05, 10:10)，不是前一个窗口。',
        '半开范围决定 event membership，但窗口边界本身不代表所有事件已到，也不决定何时可以清理。这一节只建立固定 window 的连续处理生命周期入口，不重讲 11-5 的固定窗口筛选或 source cursor 操作。',
      ],
      bullets: [
        '10:00–10:05 的 HZ001 首次输出为 2 笔 / 300 元。',
        '10:05:00 按左闭右开边界进入下一窗口。',
        '半开范围决定成员归属，但不单独定义窗口完整性。',
      ],
    },
    {
      kind: 'narrative',
      title: '04 · 结果已经显示，旧 event time 又到了怎么办？',
      paragraphs: [
        'offset 3 的 event_time=10:04 先于 offset 4 的 10:03 到达。watermark 到 10:05 后，旧窗口已 emit，但仍有两分钟允许迟到；offset 5 在 10:06 到达，event_time 仍是 10:04。它被接受后，把 HZ001 同一窗口从 300 修订为 450，而不是创建一笔“今天”的交易。',
        '本例在 event-time watermark=10:05 时 emit [10:00,10:05)；10:08 将 watermark 推到 10:07 后，该窗 final。TX-008 的 event_time 是 10:03，却在 10:09 才到，因此进入 side / late evidence，不改变在线 450。Watermark 是对 event-time completeness 的策略性估计，不是绝无迟到承诺。',
        '特别区分术语：11-5 的 Source Cursor / Checkpoint 指 source-visible high-water cursor（按可见时间 + 唯一 change ID 前进），回答 source 读到哪里；本课 Watermark 用于 emit、revision 与 finalization。Source High-water Cursor != Event-time Watermark。',
        'offset 7 与 offset 6 的 transaction_id 都是 TX-006：这是无故障时也可能发生的业务重复投递，按稳定 transaction identity 去重；它不同于稍后 checkpoint recovery 造成的 replay。',
      ],
      bullets: [
        'Allowed lateness 内接受旧 event time，并 revision 已 emit 的 aggregate。',
        '同一 transaction_id 的重复 delivery 不增加 count 或 amount。',
        'Final 后 late evidence 不会静默改写 online final；Watermark != “之后绝不会再迟到”。',
      ],
    },
    {
      kind: 'narrative',
      title: '05 · 为了更新下一条事件，系统必须记住什么？',
      paragraphs: [
        '流处理需要跨 delivery 保留未来正确计算所需的 keyed/window state。本例最小 key 是 branch_id × window，值包括 count、amount、已见 transaction_id 和 lifecycle；HZ001 的旧窗 state 从 2 / 300 更新到 3 / 450，新窗记住 TX-006 的 1 / 70。',
        '窗口到 end 可以先 emit；allowed-lateness 内仍保留状态接受 revision；final 后才按策略 cleanup。这个长期驻留状态不同于 11-4 的 first_seen 批间增量状态，也不重做 11-5 的窗口筛选 / source cursor 操作。',
      ],
      bullets: [
        'Key：branch × window；币种是指标 Grain 的组成部分。',
        'Value：aggregate、去重 identity 与窗口生命周期。',
        '保留和清理时机由窗口 lifecycle / late policy 决定。',
      ],
    },
    {
      kind: 'narrative',
      title: '06 · 任务处理到 offset 6 后失败，恢复从哪继续？',
      paragraphs: [
        '端到端结果至少同时考虑 Source Position + Operator State + Replay + Sink Write + Idempotency / Transaction。Checkpoint 不会自动涵盖外部 sink 的可见提交，也不等于 Exactly-once。',
        'Case A：source position 已到 offset 6，operator state 仍停在 offset 4；若恢复从 7 继续，TX-005 与 TX-006 可能漏掉。Case B：source 与 state 一致地从 offset 4 恢复，offset 5 / 6 会 replay，并产生新的 processing_time 运行观测；append sink 可能再次追加相同结果写入，需要 sink 幂等键、upsert 或事务边界约束外部效果。',
        'offset 7 的业务重复 delivery 即使没有故障仍要按 transaction_id 去重；recovery replay 是另一种重复来源。这里复用 11-5 的 checkpoint / 幂等概念，只展示长驻任务 source、operator state 与 sink 的端到端边界。',
      ],
      bullets: [
        'Case A：source position 与 operator state 不一致 → 可能漏数据。',
        'Case B：source / state 一致恢复 + replay → append sink 仍可能重复。',
        'Checkpoint success != Exactly-once achieved。',
      ],
    },
    {
      kind: 'narrative',
      title: '07 · 为什么 final online 450 与 offline 510 都可能合理？流值得吗？',
      paragraphs: [
        '对账 Grain 固定为 branch_id × window_start × window_end × currency，成员按 event_time 落入 5-minute tumbling [start, end)。Online snapshot 是 watermark 10:07 后的 final；offline reference 是 arrival_time < 2026-05-13 02:00（+08:00）的有界 batch，并按 transaction_id 去重。',
        'HZ001 的 [10:00, 10:05) online final = 3 笔 / 450 元；offline reference as of cutoff = 4 笔 / 510 元；difference = +1 笔 / +60 元 = TX-008。HZ002 旧窗口为 100 元，两侧一致；HZ001 下一窗口为 70 元，offset 7 不重复计数。',
        'Offline reference 只是在声明 cutoff、Grain 与 late policy 下的可复核参考，不是无条件绝对真值；差异也不表示 realtime wrong / offline right。若 minute-level freshness 已满足业务 SLA，microbatch 可能比长期 state、recovery 与 sink 协调更简单。Realtime != Always Correct。',
      ],
      bullets: [
        'Online Final = 450。',
        'Offline Reference as of Cutoff = 510。',
        'Difference +60 = TX-008 = late-policy / cutoff difference。',
      ],
    },
  ],
}
