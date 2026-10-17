/**
 * Evidence-gated legacy path aliases for the Smart 404 recovery (#215 Phase 2).
 *
 * Every entry must be a request path that was actually observed (GSC or
 * Cloudflare analytics record, or a confirmed user report) and must resolve to
 * an existing built route. Guessed, fuzzy or title-derived mappings are not
 * allowed; `tests/not-found-recovery-routes.test.ts` rejects targets that are
 * not part of the route manifest.
 *
 * Audit 2026-10-13 (base `67c27bb`, #215 Phase 2 evidence):
 * - the route tree and all 56 lesson slugs have been stable since the first
 *   commit (`git log --diff-filter=R` empty; no slug was ever removed);
 * - the static build has 0 broken internal links out of 3,718;
 * - no issue, PR or comment contains a confirmed dead `sql.sb` path;
 * - GSC and Cloudflare Analytics access is unavailable (#179 / #205 record
 *   `DATA UNAVAILABLE`, not zero).
 *
 * No confirmed old path exists, so this table intentionally starts empty: the
 * site keeps the normal HTTP 404 instead of guessing. Add an entry here only
 * together with the evidence that justifies it.
 */
export const LEGACY_PATH_ALIASES: Readonly<Record<string, string>> = {}
