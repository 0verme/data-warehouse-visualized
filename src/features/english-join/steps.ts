import {
  createStepKernel,
  type StepKernel,
  type VisualizationStep,
} from '../../utils/visualization-steps'
import { createJoinDemoState } from './model'
import type { JoinDemoState, JoinHighlight } from './types'

export type JoinDuplicatesStep = VisualizationStep<JoinDemoState, JoinHighlight>

const state = {
  none: createJoinDemoState('none'),
  payments: createJoinDemoState('payments'),
  bothChildren: createJoinDemoState('payments-shipments'),
  aggregated: createJoinDemoState('aggregated'),
  exists: createJoinDemoState('exists'),
} as const

const paymentRowIds = state.payments.resultRows.map((row) => row.id)
const bothChildrenRowIds = state.bothChildren.resultRows.map((row) => row.id)
const aggregatedRowIds = state.aggregated.resultRows.map((row) => row.id)
const existsRowIds = state.exists.resultRows.map((row) => row.id)

/**
 * Seven deterministic steps: observe the keys, watch 1:N fan-out, watch M:N
 * fan-out, read the broken metrics, try DISTINCT, then apply two real fixes.
 */
export function buildJoinDuplicatesSteps(): readonly JoinDuplicatesStep[] {
  return [
    {
      id: 'observe-keys',
      title: 'Start with the key, not the query',
      description:
        'orders has one row per order, so order_id is unique there. payments and shipments both repeat order_id: O-1001 appears twice in each child table. That is the precondition for duplication.',
      state: state.none,
      highlight: {
        kind: 'observe',
        activeTables: ['orders', 'payments', 'shipments'],
        orderIds: ['O-1001', 'O-1002'],
        paymentIds: ['P-01', 'P-02', 'P-03'],
        shipmentIds: ['S-01', 'S-02', 'S-03'],
        resultRowIds: [],
        risk: false,
      },
    },
    {
      id: 'one-to-many-fanout',
      title: '1:N already duplicates the order',
      description:
        'Joining payments on order_id matches O-1001 twice, so its order_amount 300 is copied into two rows. The query returns 3 rows, and SUM(order_amount) becomes 1,100 instead of the real 800.',
      state: state.payments,
      highlight: {
        kind: 'expand',
        activeTables: ['orders', 'payments'],
        orderIds: ['O-1001'],
        paymentIds: ['P-01', 'P-02'],
        shipmentIds: [],
        resultRowIds: paymentRowIds,
        risk: true,
      },
    },
    {
      id: 'many-to-many-fanout',
      title: 'A second 1:N join makes it M:N',
      description:
        'Adding shipments on the same order_id multiplies the two payments by two shipments. O-1001 now produces 2 × 2 = 4 rows, and its order_amount is copied four times.',
      state: state.bothChildren,
      highlight: {
        kind: 'expand',
        activeTables: ['orders', 'payments', 'shipments'],
        orderIds: ['O-1001'],
        paymentIds: ['P-01', 'P-02'],
        shipmentIds: ['S-01', 'S-02'],
        resultRowIds: state.bothChildren.resultRows
          .filter((row) => row.orderId === 'O-1001')
          .map((row) => row.id),
        risk: true,
      },
    },
    {
      id: 'metrics-lie',
      title: 'COUNT and SUM disagree with the business fact',
      description:
        'The result has 5 rows but only 2 distinct orders, and SUM(order_amount) is 1,700 while the two orders are worth 800. SQL reports no error; the aggregate is simply computed over duplicated rows.',
      state: state.bothChildren,
      highlight: {
        kind: 'diagnose',
        activeTables: ['orders', 'payments', 'shipments'],
        orderIds: ['O-1001', 'O-1002'],
        paymentIds: ['P-01', 'P-02', 'P-03'],
        shipmentIds: ['S-01', 'S-02', 'S-03'],
        resultRowIds: bothChildrenRowIds,
        risk: true,
      },
    },
    {
      id: 'distinct-trap',
      title: 'DISTINCT usually hides the symptom',
      description:
        'SELECT DISTINCT * still returns 3 rows, because payment_id differs between the two O-1001 payments. Removing columns until DISTINCT collapses rows changes the query and can drop a genuine duplicate payment.',
      state: state.payments,
      highlight: {
        kind: 'distinct',
        activeTables: ['orders', 'payments'],
        orderIds: ['O-1001'],
        paymentIds: ['P-01', 'P-02'],
        shipmentIds: [],
        resultRowIds: paymentRowIds,
        risk: true,
      },
    },
    {
      id: 'fix-preaggregate',
      title: 'Fix 1: aggregate the child table first',
      description:
        'Aggregate payments and shipments to one row per order, then join. The result returns to the order grain: 2 rows, SUM(order_amount) = 800, and the payment total stays a separate measure.',
      state: state.aggregated,
      highlight: {
        kind: 'fix',
        activeTables: ['orders', 'payments', 'shipments'],
        orderIds: ['O-1001', 'O-1002'],
        paymentIds: ['PAY-O-1001', 'PAY-O-1002'],
        shipmentIds: ['SHIP-O-1001', 'SHIP-O-1002'],
        resultRowIds: aggregatedRowIds,
        risk: false,
      },
    },
    {
      id: 'fix-exists',
      title: 'Fix 2: use EXISTS when you only filter',
      description:
        'If the child table is only used to filter orders, EXISTS tests it without adding columns. The order grain never changes, so every measure stays safe.',
      state: state.exists,
      highlight: {
        kind: 'fix',
        activeTables: ['orders', 'payments'],
        orderIds: ['O-1001', 'O-1002'],
        paymentIds: ['P-01', 'P-02', 'P-03'],
        shipmentIds: [],
        resultRowIds: existsRowIds,
        risk: false,
      },
    },
  ]
}

export function createJoinDuplicatesKernel(): StepKernel<JoinDemoState, JoinHighlight> {
  return createStepKernel(buildJoinDuplicatesSteps())
}
