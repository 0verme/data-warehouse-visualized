#!/usr/bin/env node
/**
 * Executes the exact SQL rendered on /en/data-warehouse/scd-type-2/ in PostgreSQL.
 * Requires psql and an explicit connection to a scratch database (TEMP objects only):
 * SCD_POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run test:scd-postgres
 * PSQL may point to an absolute psql binary. No JS SQL emulator or production runtime.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import console from 'node:console'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { URL } from 'node:url'

const connection = process.env.SCD_POSTGRES_URL
assert.ok(
  connection,
  'Set SCD_POSTGRES_URL to a scratch PostgreSQL 15+ database; psql is required.',
)
const sqlFile = (name) =>
  readFileSync(new URL(`../src/features/english-scd/sql/${name}.sql`, import.meta.url), 'utf8')
const setup = sqlFile('setup')
const load = sqlFile('load')
const history = sqlFile('history')
let checks = 0

function check(condition, label) {
  checks += 1
  return `DO $$ BEGIN
    IF (${condition}) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: ${label}'; END IF;
  END $$;
  \\echo PASS: ${label}\n`
}

const snapshot = `CREATE TEMP TABLE before_retry AS TABLE customer;`
const identical = `NOT EXISTS (
  (TABLE customer EXCEPT ALL TABLE before_retry)
  UNION ALL
  (TABLE before_retry EXCEPT ALL TABLE customer)
)`
const allRows = `(SELECT jsonb_agg(to_jsonb(c) ORDER BY effective_from) FROM customer c)`
const expectedHistory = JSON.stringify([
  {
    customer_sk: 1001,
    customer_id: 'C-100',
    level: 'Standard',
    branch: 'Austin',
    effective_from: '2025-01-01',
    effective_to: '2026-03-01',
    is_current: false,
  },
  {
    customer_sk: 1002,
    customer_id: 'C-100',
    level: 'Premium',
    branch: 'Denver',
    effective_from: '2026-03-01',
    effective_to: '9999-12-31',
    is_current: true,
  },
])
const versionGuard = `DO $$ BEGIN
  IF current_setting('server_version_num')::int < 150000 THEN
    RAISE EXCEPTION 'PostgreSQL 15+ required';
  END IF;
END $$;
SELECT version();`

function run(sql, expectedError) {
  const result = spawnSync(
    process.env.PSQL || 'psql',
    [
      '--no-psqlrc',
      '--no-password',
      '--quiet',
      '--set=ON_ERROR_STOP=1',
      `--dbname=${connection}`,
      '--file=-',
    ],
    {
      input: `${versionGuard}\n${sql}`,
      encoding: 'utf8',
      env: { ...process.env, PGCONNECT_TIMEOUT: '10' },
      timeout: 60000,
    },
  )
  assert.ifError(result.error)
  process.stdout.write(result.stdout)
  assert.equal(result.status, 0, result.stderr)
  if (expectedError) {
    assert.match(result.stderr, expectedError)
    // All other errors must be the expected fallout of the aborted transaction.
    const unexpectedErrors = result.stderr
      .split('\n')
      .filter((line) => line.includes('ERROR:'))
      .filter(
        (line) => !expectedError.test(line) && !line.includes('current transaction is aborted'),
      )
    assert.deepEqual(unexpectedErrors, [])
  } else {
    assert.doesNotMatch(result.stderr, /ERROR:/)
  }
}

run(`
${setup}
${load}
${history}
${check(`${allRows} = '${expectedHistory}'::jsonb`, 'complete example matches documented history')}
${check(
  `(SELECT count(*) = 1 AND min(level) = 'Premium' FROM customer
  WHERE DATE '2026-03-01' >= effective_from AND DATE '2026-03-01' < effective_to)`,
  'inclusive change boundary selects only new version',
)}
${check(
  `(SELECT count(*) = 1 AND min(level) = 'Standard' FROM customer
  WHERE DATE '2026-02-28' >= effective_from AND DATE '2026-02-28' < effective_to)`,
  'day before change selects only old version',
)}
${check(
  `(SELECT count(*) = 1 AND min(customer_sk) = 1001 FROM customer
  WHERE customer_id = 'C-100' AND DATE '2025-11-15' >= effective_from
  AND DATE '2025-11-15' < effective_to)`,
  'LN-77 historical disbursement resolves original version',
)}
${snapshot}
${load}
${check(identical, 'same batch retry preserves every row and surrogate key')}
UPDATE customer_stage SET effective_from = DATE '2026-04-01';
${load}
${check(identical, 'later unchanged snapshot adds no version')}
INSERT INTO customer_stage VALUES ('C-200', 'Standard', 'Boston', DATE '2026-04-01');
${load}
${check(
  `(SELECT count(*) = 3 FROM customer) AND
  (SELECT count(*) = 1 FROM customer WHERE customer_id = 'C-200' AND is_current)`,
  'mixed batch inserts new customer but skips unchanged customer',
)}
UPDATE customer_stage SET level = NULL, effective_from = DATE '2026-05-01'
WHERE customer_id = 'C-100';
${load}
${check(
  `(SELECT count(*) = 4 FROM customer) AND
  (SELECT count(*) = 1 FROM customer WHERE customer_id = 'C-100' AND is_current AND level IS NULL)`,
  'NULL-safe comparison detects value to NULL',
)}
TRUNCATE before_retry;
INSERT INTO before_retry TABLE customer;
${load}
${check(identical, 'NULL to NULL retry adds no version')}
UPDATE customer_stage SET level = 'Premium', effective_from = DATE '2026-06-01'
WHERE customer_id = 'C-100';
${load}
${check(
  `(SELECT count(*) = 5 FROM customer) AND
  (SELECT count(*) = 1 FROM customer WHERE customer_id = 'C-100' AND is_current AND level = 'Premium')`,
  'NULL to value creates a new version even for a previously seen value',
)}
${check(
  `NOT EXISTS (SELECT customer_id FROM customer GROUP BY customer_id
  HAVING count(*) FILTER (WHERE is_current) <> 1) AND
  NOT EXISTS (SELECT 1 FROM customer a JOIN customer b
    ON a.customer_id = b.customer_id AND a.customer_sk < b.customer_sk
    AND a.effective_from < b.effective_to AND b.effective_from < a.effective_to)`,
  'one current version per customer and no overlapping ranges',
)}
TRUNCATE customer RESTART IDENTITY;
TRUNCATE customer_stage;
INSERT INTO customer_stage VALUES ('C-100', 'Standard', 'Austin', DATE '2025-01-01');
${load}
${check(
  `(SELECT count(*) = 1 AND bool_and(is_current) AND min(customer_sk) = 1001
  AND min(effective_from) = DATE '2025-01-01' FROM customer)`,
  'empty dimension first load inserts one current version',
)}
TRUNCATE before_retry;
INSERT INTO before_retry TABLE customer;
${load}
${check(identical, 'first load retry preserves the original version')}
UPDATE customer_stage SET branch = 'Denver', effective_from = DATE '2026-03-01';
${load}
${check(
  `(SELECT count(*) = 2 FROM customer) AND
  (SELECT effective_to = DATE '2026-03-01' AND NOT is_current FROM customer WHERE customer_sk = 1001)
  AND (SELECT level = 'Standard' AND branch = 'Denver' AND is_current FROM customer WHERE customer_sk = 1002)`,
  'single-attribute change closes old version and inserts new one',
)}
`)

// Keep the session open after an expected error, let COMMIT roll back the failed
// transaction, then compare every row. The tested loader itself is not rewritten.
for (const date of ['2026-03-01', '2025-12-01']) {
  run(
    `${setup}\n${load}\n${snapshot}
    UPDATE customer_stage SET level = 'Gold', effective_from = DATE '${date}';
    \\set ON_ERROR_STOP off
    ${load}
    \\set ON_ERROR_STOP on
    ${check(identical, `reject and roll back changed payload dated ${date}`)}`,
    /Changed attributes require a later effective_from/,
  )
}

run(
  `${setup}\n${snapshot}
  CREATE FUNCTION pg_temp.reject_insert() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN RAISE EXCEPTION 'test insert failure'; END $$;
  CREATE TRIGGER reject_insert BEFORE INSERT ON customer
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_insert();
  \\set ON_ERROR_STOP off
  ${load}
  \\set ON_ERROR_STOP on
  ${check(identical, 'insert failure rolls back the preceding close update')}`,
  /test insert failure/,
)

console.log(`[scd-type-2-postgres] PASS · ${checks} checks · exact published PostgreSQL SQL`)
