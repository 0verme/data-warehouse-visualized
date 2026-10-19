-- All historical versions, not just the current one.
SELECT customer_sk, customer_id, level, branch,
       effective_from, effective_to, is_current
FROM customer
ORDER BY customer_id, effective_from;

-- As-of query: the change date belongs ONLY to the new version.
SELECT customer_id, level, branch
FROM customer
WHERE customer_id = 'C-100'
  AND DATE '2026-03-01' >= effective_from
  AND DATE '2026-03-01' < effective_to;
