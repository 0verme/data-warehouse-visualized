import { skewData } from '../performance/banking'

export type DataSkewPlan = 'unsplit' | 'salted'

export interface DataSkewWorkerSnapshot {
  workerId: string
  routineInputGb: number
  hotKeyInputGb: number
  totalInputGb: number
}

export interface DataSkewSnapshot {
  plan: DataSkewPlan
  workers: DataSkewWorkerSnapshot[]
  totalInputGb: number
  averageInputGb: number
  maximumInputGb: number
  maximumToAverageRatio: number
  longestWorkerId: string
}

const shuffleScenario = skewData.scenarios.find((scenario) => scenario.id === 'shuffle-key')

if (!shuffleScenario || shuffleScenario.workerLoads.length < 2) {
  throw new Error('The English data-skew lab requires the existing shuffle-key teaching fixture.')
}

const fixtureWorkers = shuffleScenario.workerLoads
const hotKeyWorkerIndex = fixtureWorkers.reduce(
  (longestIndex, worker, index, workers) =>
    worker.loadGb > workers[longestIndex]!.loadGb ? index : longestIndex,
  0,
)

/**
 * Derive a deterministic teaching comparison from the existing shuffle-skew fixture.
 * The salted case divides the fixture's hot-key work evenly across its workers while
 * preserving total input. It is an idealized shape, not a prediction or benchmark.
 */
export function getDataSkewSnapshot(plan: DataSkewPlan): DataSkewSnapshot {
  const hotKeyLoadGb = fixtureWorkers[hotKeyWorkerIndex]!.loadGb
  const hotKeyShareGb = plan === 'salted' ? hotKeyLoadGb / fixtureWorkers.length : 0
  const workers = fixtureWorkers.map((worker, index) => {
    const isHotKeyWorker = index === hotKeyWorkerIndex
    const routineInputGb = isHotKeyWorker ? 0 : worker.loadGb
    const hotKeyInputGb = plan === 'salted' ? hotKeyShareGb : isHotKeyWorker ? hotKeyLoadGb : 0

    return {
      workerId: worker.workerId,
      routineInputGb,
      hotKeyInputGb,
      totalInputGb: routineInputGb + hotKeyInputGb,
    }
  })
  const totalInputGb = workers.reduce((total, worker) => total + worker.totalInputGb, 0)
  const averageInputGb = totalInputGb / workers.length
  const longestWorker = workers.reduce((longest, worker) =>
    worker.totalInputGb > longest.totalInputGb ? worker : longest,
  )
  const maximumInputGb = longestWorker.totalInputGb

  return {
    plan,
    workers,
    totalInputGb,
    averageInputGb,
    maximumInputGb,
    maximumToAverageRatio: Math.round((maximumInputGb / averageInputGb) * 100) / 100,
    longestWorkerId: longestWorker.workerId,
  }
}
