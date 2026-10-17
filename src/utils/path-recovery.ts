/**
 * Deterministic Smart 404 path recovery (#215 Phase 2).
 *
 * The resolver never guesses: a suggestion is only returned when the requested
 * path is an exact route (modulo trailing slash), an exact route with different
 * letter casing, or an explicitly mapped evidence-backed alias. Every candidate
 * target comes from the supplied manifest, never from the request path itself;
 * there is no fuzzy/edit-distance matching and no external target. Nothing in
 * this module performs I/O, navigation or redirects.
 */

export type PathRecoveryKind = 'exact' | 'case-insensitive' | 'alias' | 'none'

export interface PathRecoveryResult {
  kind: PathRecoveryKind
  /** Manifest route to suggest, or null when there is nothing verified to show. */
  suggestion: string | null
}

export interface PathRecoveryOptions {
  /** Canonical app routes without BASE_PATH, e.g. `/learn/grain/`. */
  routes: readonly string[]
  /** Evidence-gated legacy aliases: requested app path -> canonical app route. */
  aliases?: Readonly<Record<string, string>>
  /** Deployed BASE_PATH; empty or `/` for the site root. */
  basePath?: string
  /** Guard against absurdly long crawler URLs. */
  maxPathLength?: number
}

const DEFAULT_MAX_PATH_LENGTH = 512

const NONE: PathRecoveryResult = { kind: 'none', suggestion: null }

function stripTrailingSlashes(value: string): string {
  return value.length <= 1 ? value : value.replace(/\/+$/, '')
}

function normalizeBasePath(basePath: string): string {
  if (!basePath || basePath === '/') return ''
  const withLeadingSlash = basePath.startsWith('/') ? basePath : `/${basePath}`
  return stripTrailingSlashes(withLeadingSlash)
}

function decodePathname(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname)
  } catch {
    // Malformed percent-encoding is not recoverable; keep the normal 404.
    return null
  }
}

export function resolvePathRecovery(
  requestedPathname: string,
  options: PathRecoveryOptions,
): PathRecoveryResult {
  if (typeof requestedPathname !== 'string' || requestedPathname.length === 0) return NONE
  if (requestedPathname.length > (options.maxPathLength ?? DEFAULT_MAX_PATH_LENGTH)) return NONE

  const decoded = decodePathname(requestedPathname)
  if (decoded === null) return NONE

  const basePath = normalizeBasePath(options.basePath ?? '')
  let relative = decoded
  if (basePath) {
    if (decoded === basePath) relative = '/'
    else if (decoded.startsWith(`${basePath}/`)) relative = decoded.slice(basePath.length)
  }
  if (!relative.startsWith('/')) return NONE
  const requestKey = stripTrailingSlashes(relative)

  const canonicalByKey = new Map<string, string>()
  const canonicalByLowerKey = new Map<string, string>()
  for (const route of options.routes) {
    if (typeof route !== 'string' || !route.startsWith('/')) continue
    const key = stripTrailingSlashes(route)
    if (!canonicalByKey.has(key)) canonicalByKey.set(key, route)
    const lowerKey = key.toLowerCase()
    if (!canonicalByLowerKey.has(lowerKey)) canonicalByLowerKey.set(lowerKey, route)
  }

  if (canonicalByKey.has(requestKey)) return { kind: 'exact', suggestion: null }

  const caseMatch = canonicalByLowerKey.get(requestKey.toLowerCase())
  if (caseMatch) return { kind: 'case-insensitive', suggestion: caseMatch }

  for (const [aliasKey, target] of Object.entries(options.aliases ?? {})) {
    if (typeof target !== 'string' || !target.startsWith('/')) continue
    if (stripTrailingSlashes(aliasKey) !== requestKey) continue
    const resolved = canonicalByKey.get(stripTrailingSlashes(target))
    if (resolved) return { kind: 'alias', suggestion: resolved }
  }

  return NONE
}
