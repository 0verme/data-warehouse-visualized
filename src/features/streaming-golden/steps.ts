import {
  applyVisualizationPlayerAction,
  createStepKernel,
  createVisualizationPlayer,
  type VisualizationPlayerState,
} from '../../utils/visualization-steps'
import {
  STREAMING_FINAL_WATERMARK,
  STREAMING_GOLDEN_DELIVERIES,
  STREAMING_ON_TIME_WATERMARK,
} from './fixture'
import {
  advanceEventTimeWatermark,
  buildStreamingRecoveryEvidence,
  createInitialStreamingState,
  processStreamingDelivery,
} from './model'
import type {
  StreamingClockBasis,
  StreamingGoldenKernel,
  StreamingGoldenLessonAction,
  StreamingGoldenLessonSession,
  StreamingGoldenStep,
  StreamingGoldenStepId,
  StreamingGoldenStepState,
} from './types'

const STEP_DEFINITIONS: readonly {
  id: StreamingGoldenStepId
  title: string
  description: string
  focusOffset?: number
}[] = [
  {
    id: 'bounded-input',
    title: '同一输入，三种完成边界',
    description: 'T+1 batch 有 cutoff；微批仍有 run boundary；continuous stream 没有天然最后一条。',
  },
  {
    id: 'three-clocks',
    title: '先分清三只钟',
    description: '同一条 Transaction 的 event、arrival、processing 时刻决定不同观察问题。',
    focusOffset: 5,
  },
  {
    id: 'window-state',
    title: '窗口从边界进入生命周期',
    description: 'offset 1–4 到达后，watermark 10:05 让旧窗口 emit；状态仍保留以接受迟到修订。',
    focusOffset: 4,
  },
  {
    id: 'late-watermark',
    title: '已 emit 的结果何时 final？',
    description:
      '注入 offset 5 将 300 修订为 450，再按固定策略推进 watermark、处理重复 TX-006 并将 TX-008 送入 side output。',
    focusOffset: 5,
  },
  {
    id: 'stream-state',
    title: 'Processor 必须保留哪些 state？',
    description:
      '按 branch × window 查看 aggregate、去重 identity 与生命周期；final online 结果供最后对账。',
    focusOffset: 7,
  },
  {
    id: 'checkpoint-replay',
    title: 'Checkpoint 不替 Sink 作保证',
    description:
      '分别观察 source / operator state 不一致时的漏数，以及一致恢复后的 append replay 重复写入。',
    focusOffset: 7,
  },
  {
    id: 'reconciliation',
    title: '对齐 Grain 与 cutoff 再解释差异',
    description:
      'online final 450 与 cutoff reference 510 相差 +60；证据是 final 后到达的 TX-008。',
    focusOffset: 8,
  },
]

export function buildStreamingGoldenSteps(): readonly StreamingGoldenStep[] {
  return STEP_DEFINITIONS.map(({ id, title, description, focusOffset }) => ({
    id,
    title,
    description,
    state: { stage: id, focusOffset } satisfies StreamingGoldenStepState,
  }))
}

export function createStreamingGoldenKernel(): StreamingGoldenKernel {
  return createStepKernel(buildStreamingGoldenSteps())
}

export function createStreamingGoldenLessonSession(
  stepCount: number,
): StreamingGoldenLessonSession {
  return {
    player: createVisualizationPlayer(stepCount),
    stream: createInitialStreamingState(),
    selectedClock: 'event_time',
    recovery: null,
  }
}

export function canAdvanceStreamingGoldenLesson(state: StreamingGoldenLessonSession): boolean {
  const { currentIndex, stepCount } = state.player
  if (currentIndex >= stepCount - 1) return false
  if (currentIndex === 3) {
    return state.stream.sourcePosition === 8 && state.stream.watermark === STREAMING_FINAL_WATERMARK
  }
  if (currentIndex === 5) return state.recovery !== null
  return true
}

function processRange(
  state: StreamingGoldenLessonSession['stream'],
  firstOffset: number,
  lastOffset: number,
) {
  let next = state
  for (let offset = firstOffset; offset <= lastOffset; offset += 1) {
    const delivery = STREAMING_GOLDEN_DELIVERIES.find((item) => item.offset === offset)
    if (!delivery) throw new Error(`Missing frozen delivery offset ${offset}`)
    next = processStreamingDelivery(next, delivery)
  }
  return next
}

function setClock(
  state: StreamingGoldenLessonSession,
  clock: StreamingClockBasis,
): StreamingGoldenLessonSession {
  return { ...state, selectedClock: clock }
}

function advance(state: StreamingGoldenLessonSession): StreamingGoldenLessonSession {
  if (!canAdvanceStreamingGoldenLesson(state)) return state

  let stream = state.stream
  if (state.player.currentIndex === 1) {
    stream = processRange(stream, 1, 4)
    stream = advanceEventTimeWatermark(stream, STREAMING_ON_TIME_WATERMARK)
  }

  const player: VisualizationPlayerState = applyVisualizationPlayerAction(state.player, 'next')
  return { ...state, player, stream }
}

export function reduceStreamingGoldenLessonSession(
  state: StreamingGoldenLessonSession,
  action: StreamingGoldenLessonAction,
): StreamingGoldenLessonSession {
  switch (action.type) {
    case 'next':
      return advance(state)
    case 'select-clock':
      return setClock(state, action.clock)
    case 'inject-late-event': {
      if (state.player.currentIndex !== 3 || state.stream.sourcePosition !== 4) return state
      return {
        ...state,
        stream: processStreamingDelivery(state.stream, STREAMING_GOLDEN_DELIVERIES[4]!),
      }
    }
    case 'advance-watermark': {
      if (state.player.currentIndex !== 3 || state.stream.sourcePosition !== 5) return state
      let stream = processRange(state.stream, 6, 7)
      stream = advanceEventTimeWatermark(stream, STREAMING_FINAL_WATERMARK)
      stream = processStreamingDelivery(stream, STREAMING_GOLDEN_DELIVERIES[7]!)
      return { ...state, stream }
    }
    case 'restore-replay':
      if (state.player.currentIndex !== 5) return state
      return { ...state, recovery: buildStreamingRecoveryEvidence() }
  }
}
