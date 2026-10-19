-- LOAD START: rerun this entire transaction with the same staged batch.
BEGIN;

-- Serialize dimension writers before reading current rows.
-- TEMP tables are session-local; retain this lock if adapting to shared tables.
LOCK TABLE customer IN SHARE ROW EXCLUSIVE MODE;

-- Freeze new/changed candidates BEFORE closing any current version.
CREATE TEMP TABLE customer_changes ON COMMIT DROP AS
SELECT s.*
FROM customer_stage AS s
LEFT JOIN customer AS c
  ON c.customer_id = s.customer_id AND c.is_current
WHERE c.customer_sk IS NULL
   OR ROW(c.level, c.branch) IS DISTINCT FROM ROW(s.level, s.branch);

-- Forward-only loader: reject changed payloads at the same/earlier start date.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM customer_changes AS s
        JOIN customer AS c ON c.customer_id = s.customer_id AND c.is_current
        WHERE s.effective_from <= c.effective_from
    ) THEN
        RAISE EXCEPTION 'Changed attributes require a later effective_from';
    END IF;
END;
$$;

-- 1. Close the old current version at the incoming version's start.
UPDATE customer AS c
SET effective_to = s.effective_from,
    is_current = false
FROM customer_changes AS s
WHERE c.customer_id = s.customer_id AND c.is_current;

-- 2. Insert a version for each new or changed customer (not unchanged ones).
INSERT INTO customer (customer_id, level, branch, effective_from)
SELECT customer_id, level, branch, effective_from
FROM customer_changes
ORDER BY customer_id;

COMMIT;
-- LOAD END: a retry now finds no changed attributes and writes no versions.
