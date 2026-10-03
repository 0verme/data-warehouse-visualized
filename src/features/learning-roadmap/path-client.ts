import { getLearningPathPresentation } from './path-presentation'
import { getLearningPath } from './paths'
import { getLearningTopicTitle } from './presentation'

/** The selector's neutral option is a view state, never a fourth LearningPath object. */
export const ALL_PATH_ID = 'all'

declare global {
  interface Window {
    __DWV_ROADMAP_PATHS_INSTALLED__?: boolean
  }
}

/** In-memory browsing state for this tab; never persisted to storage or the URL. */
let activePathId = ALL_PATH_ID

function getPathsRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.roadmap-main[data-roadmap-paths]')
}

function topicCards(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.roadmap-topic[data-topic-id]'))
}

function ensureBadges(card: HTMLElement): HTMLElement {
  const existing = card.querySelector<HTMLElement>('.roadmap-topic__badges')
  if (existing) return existing

  const doc = card.ownerDocument
  const badges = doc.createElement('div')
  badges.className = 'roadmap-topic__badges'
  const title = card.querySelector('h3')
  if (title) title.after(badges)
  else card.prepend(badges)
  return badges
}

function applyEntryBadge(card: HTMLElement, isEntry: boolean): void {
  const existing = card.querySelector<HTMLElement>('[data-topic-entry]')
  if (!isEntry) {
    existing?.remove()
    delete card.dataset.pathEntry
    return
  }

  card.dataset.pathEntry = 'true'
  if (existing) return

  const doc = card.ownerDocument
  const badge = doc.createElement('span')
  badge.className = 'roadmap-entry'
  badge.setAttribute('data-topic-entry', '')
  badge.textContent = '建议入口'
  ensureBadges(card).prepend(badge)
}

function buildStatusText(root: HTMLElement): string {
  if (activePathId === ALL_PATH_ID) {
    const topicCount = root.querySelectorAll('.roadmap-topic[data-topic-id]').length
    const stageCount = root.querySelectorAll('.roadmap-stage[data-stage-id]').length
    return `当前显示全部知识：${topicCount} 个主题、${stageCount} 个 Stage。选择路线可查看建议入口与重点主题。`
  }

  const path = getLearningPath(activePathId)
  if (!path) return ''

  const presentation = getLearningPathPresentation(path.id)
  const entryTitles = path.entryTopicIds.map((topicId) => getLearningTopicTitle(topicId)).join('、')
  return `${presentation.description} 适合${presentation.audience}。建议入口：${entryTitles}。本路线重点 ${path.highlightTopicIds.length} 个主题；未列出的主题仍然保留，可直接浏览与进入课程。`
}

function syncPathOptions(root: HTMLElement): void {
  root.querySelectorAll<HTMLInputElement>('input[data-roadmap-path-option]').forEach((input) => {
    input.checked = input.value === activePathId
  })
}

/**
 * Applies the active Path as an overlay on the existing Topic DOM.
 *
 * Only `data-path-state` / `data-path-entry` are written. Progress, current,
 * kind and optional state keep their own attributes and are never rewritten.
 */
export function applyRoadmapPathView(root: HTMLElement): void {
  const path = activePathId === ALL_PATH_ID ? undefined : getLearningPath(activePathId)
  const highlightTopicIds = new Set(path?.highlightTopicIds ?? [])
  const entryTopicIds = new Set(path?.entryTopicIds ?? [])

  root.dataset.activePath = path ? path.id : ALL_PATH_ID

  for (const card of topicCards(root)) {
    const topicId = card.dataset.topicId
    if (!topicId) continue

    if (!path) {
      delete card.dataset.pathState
      applyEntryBadge(card, false)
      continue
    }

    card.dataset.pathState = highlightTopicIds.has(topicId) ? 'highlighted' : 'dimmed'
    applyEntryBadge(card, entryTopicIds.has(topicId))
  }

  const status = root.querySelector<HTMLElement>('[data-roadmap-path-status]')
  if (status) status.textContent = buildStatusText(root)
}

/** Re-applies the tab's browsing state to the current Roadmap DOM. */
export function refreshRoadmapPaths(): void {
  const root = getPathsRoot()
  if (!root) return

  if (activePathId !== ALL_PATH_ID && !getLearningPath(activePathId)) {
    activePathId = ALL_PATH_ID
  }

  syncPathOptions(root)
  applyRoadmapPathView(root)
  root.dataset.roadmapPaths = 'ready'
}

/**
 * Roadmap-only Path enhancement.
 *
 * A single delegated `change` listener covers SSR-rendered radios and survives
 * `astro:after-swap` DOM replacement. No React, no storage, no URL state.
 */
export function installRoadmapPaths(): void {
  if (!window.__DWV_ROADMAP_PATHS_INSTALLED__) {
    window.__DWV_ROADMAP_PATHS_INSTALLED__ = true
    document.addEventListener('change', (event) => {
      const target = event.target
      if (!(target instanceof HTMLInputElement)) return
      if (!target.matches('input[data-roadmap-path-option]')) return

      const root = target.closest<HTMLElement>('.roadmap-main[data-roadmap-paths]')
      if (!root) return

      activePathId = target.value || ALL_PATH_ID
      applyRoadmapPathView(root)
    })
    document.addEventListener('astro:after-swap', refreshRoadmapPaths)
    window.addEventListener('pageshow', refreshRoadmapPaths)
  }

  refreshRoadmapPaths()
}
