import { resolvePathRecovery } from '../../utils/path-recovery'

declare global {
  interface Window {
    __DWV_404_RECOVERY_INSTALLED__?: boolean
  }
}

function readJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/**
 * Enhance the static 404 document with verified suggestions.
 *
 * Only `location.pathname` is read; query strings and hashes are never read or
 * rendered. Suggestions are built with DOM APIs from the trusted build-time
 * manifest, never with `innerHTML`, and the page never navigates on its own.
 * Without JavaScript the section stays hidden and the plain HTTP 404 document
 * remains unchanged.
 */
export function installNotFoundRecovery(): void {
  const root = document.querySelector<HTMLElement>('[data-404-recovery]')
  if (!root || window.__DWV_404_RECOVERY_INSTALLED__) return
  window.__DWV_404_RECOVERY_INSTALLED__ = true

  const routes = readJson<string[]>(root.dataset.routes, [])
  const aliases = readJson<Record<string, string>>(root.dataset.aliases, {})
  const basePath = root.dataset.basePath ?? ''
  if (routes.length === 0) return

  const result = resolvePathRecovery(window.location.pathname, { routes, aliases, basePath })
  if (!result.suggestion) return

  const list = root.querySelector<HTMLElement>('[data-404-suggestion-list]')
  if (!list) return

  const href = `${basePath}${result.suggestion}`
  const item = document.createElement('li')
  item.className = 'not-found__recovery-item'
  const link = document.createElement('a')
  link.className = 'not-found__recovery-link'
  link.setAttribute('href', href)
  link.textContent = href
  item.append(link)
  list.append(item)
  root.hidden = false
}
