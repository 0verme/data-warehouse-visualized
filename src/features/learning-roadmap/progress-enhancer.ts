import type {
  RoadmapProgressView,
  RoadmapStageProgressView,
  RoadmapTopicProgressView,
} from './progress-view'

const TOPIC_STATE_ICONS: Record<RoadmapTopicProgressView['state'], string> = {
  not_started: '○',
  in_progress: '◐',
  completed: '✓',
}

/**
 * Client-only enhancement of the static Roadmap DOM.
 *
 * The server never renders progress; this layer only adds/updates progress text
 * for the existing `data-topic-id` / `data-stage-id` / `data-lesson-id` identity
 * that Phase 1 already ships. Re-applying with a new view updates in place, so
 * `pageshow` / storage refresh never duplicates nodes.
 */
export function applyRoadmapProgressView(root: HTMLElement, view: RoadmapProgressView): void {
  const topicsById = new Map(view.topics.map((topic) => [topic.topicId, topic]))
  const stagesById = new Map(view.stages.map((stage) => [stage.stageId, stage]))

  root.querySelectorAll<HTMLElement>('.roadmap-topic[data-topic-id]').forEach((card) => {
    const topicId = card.dataset.topicId
    const topic = topicId ? topicsById.get(topicId) : undefined
    if (topic) applyTopicProgress(card, topic)
  })

  root.querySelectorAll<HTMLElement>('.roadmap-stage[data-stage-id]').forEach((section) => {
    const stageId = section.dataset.stageId
    const stage = stageId ? stagesById.get(stageId) : undefined
    if (stage) applyStageProgress(section, stage)
  })

  applyCurrentLessonLink(root, view)

  const hasProgress =
    view.current !== null || view.topics.some((topic) => topic.completedLessons > 0)
  applyProgressNote(root, hasProgress)
}

function applyTopicProgress(card: HTMLElement, topic: RoadmapTopicProgressView): void {
  const row = ensureTopicProgressRow(card)
  row.dataset.progressState = topic.state

  const icon = row.querySelector<HTMLElement>('.roadmap-topic__progress-icon')
  if (icon) icon.textContent = TOPIC_STATE_ICONS[topic.state]

  const label = row.querySelector<HTMLElement>('.roadmap-topic__progress-text')
  if (label) label.textContent = topic.label

  const current = row.querySelector<HTMLElement>('[data-current-topic]')
  if (current) current.hidden = !topic.isCurrent

  card.classList.toggle('is-current', topic.isCurrent)
}

function applyStageProgress(section: HTMLElement, stage: RoadmapStageProgressView): void {
  const row = ensureStageProgressRow(section)

  const bar = row.querySelector<HTMLProgressElement>('progress')
  if (bar) {
    bar.value = stage.percent
    bar.setAttribute(
      'aria-label',
      `本 Stage 已完成 ${stage.completedLessons} / ${stage.totalLessons} 节，${stage.percent}%`,
    )
  }

  const label = row.querySelector<HTMLElement>('[data-stage-progress-text]')
  if (label) label.textContent = stage.label

  const current = row.querySelector<HTMLElement>('[data-current-stage]')
  if (current) current.hidden = !stage.isCurrent
}

function applyCurrentLessonLink(root: HTMLElement, view: RoadmapProgressView): void {
  const intro = root.querySelector<HTMLElement>('.roadmap-intro')
  if (!intro) return

  const container = ensureContinueContainer(intro)
  const link = container.querySelector<HTMLAnchorElement>('[data-roadmap-continue-link]')
  if (!link) return

  const current = view.current
  const lessonLink = current
    ? Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-lesson-id]')).find(
        (anchor) => anchor.dataset.lessonId === current.lessonId,
      )
    : undefined
  const href = lessonLink?.getAttribute('href')

  if (!current || !lessonLink || !href) {
    link.removeAttribute('href')
    link.textContent = ''
    container.hidden = true
    return
  }

  const title = lessonLink.querySelector('span')?.textContent?.trim() || '当前课程'
  link.setAttribute('href', href)
  link.textContent = `继续学习 · ${title}`
  container.hidden = false
}

function applyProgressNote(root: HTMLElement, visible: boolean): void {
  const intro = root.querySelector<HTMLElement>('.roadmap-intro')
  if (!intro) return

  let note = intro.querySelector<HTMLElement>('[data-roadmap-progress-note]')
  if (!note) {
    note = intro.ownerDocument.createElement('p')
    note.className = 'roadmap-progress-note'
    note.setAttribute('data-roadmap-progress-note', '')
    note.textContent = '学习进度读取自本机浏览器记录，仅保存在本机。'
    intro.append(note)
  }

  note.hidden = !visible
}

function ensureTopicProgressRow(card: HTMLElement): HTMLElement {
  const existing = card.querySelector<HTMLElement>('[data-topic-progress]')
  if (existing) return existing

  const doc = card.ownerDocument
  const row = doc.createElement('p')
  row.className = 'roadmap-topic__progress'
  row.setAttribute('data-topic-progress', '')

  const icon = doc.createElement('span')
  icon.className = 'roadmap-topic__progress-icon'
  icon.setAttribute('aria-hidden', 'true')

  const label = doc.createElement('span')
  label.className = 'roadmap-topic__progress-text'

  const current = doc.createElement('span')
  current.className = 'roadmap-topic__current'
  current.setAttribute('data-current-topic', '')
  current.textContent = '当前学习'
  current.hidden = true

  row.append(icon, label, current)

  const header = card.querySelector<HTMLElement>('.roadmap-topic__header') ?? card
  header.append(row)
  return row
}

function ensureStageProgressRow(section: HTMLElement): HTMLElement {
  const existing = section.querySelector<HTMLElement>('[data-stage-progress]')
  if (existing) return existing

  const doc = section.ownerDocument
  const row = doc.createElement('div')
  row.className = 'roadmap-stage__progress'
  row.setAttribute('data-stage-progress', '')

  const bar = doc.createElement('progress')
  bar.className = 'roadmap-stage__progress-bar'
  bar.max = 100
  bar.value = 0

  const label = doc.createElement('span')
  label.className = 'roadmap-stage__progress-text'
  label.setAttribute('data-stage-progress-text', '')

  const current = doc.createElement('span')
  current.className = 'roadmap-stage__current'
  current.setAttribute('data-current-stage', '')
  current.textContent = '当前 Stage'
  current.hidden = true

  row.append(bar, label, current)

  const heading = section.querySelector<HTMLElement>('.roadmap-stage__heading')
  if (heading) heading.after(row)
  else section.prepend(row)
  return row
}

function ensureContinueContainer(intro: HTMLElement): HTMLElement {
  const existing = intro.querySelector<HTMLElement>('[data-roadmap-continue]')
  if (existing) return existing

  const doc = intro.ownerDocument
  const container = doc.createElement('p')
  container.className = 'roadmap-continue'
  container.setAttribute('data-roadmap-continue', '')
  container.hidden = true

  const link = doc.createElement('a')
  link.className = 'roadmap-continue__link'
  link.setAttribute('data-roadmap-continue-link', '')

  container.append(link)
  intro.append(container)
  return container
}
