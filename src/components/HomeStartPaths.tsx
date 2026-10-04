import { getRoute } from '../utils/routes'

export interface HomeStartPath {
  audience: string
  description: string
  cta: string
  href: string
}

/**
 * Lightweight "where to start" routing shown between the hero and the homepage
 * data flow. It is an onboarding router, not a second course map: three user
 * situations, three existing lessons. Rendered server-side only so the copy and
 * links are visible in the static HTML (no client JavaScript).
 */
export function getHomeStartPaths(): readonly HomeStartPath[] {
  return [
    {
      audience: '第一次学数据仓库',
      description: '从数据如何进入仓库、经过加工，再变成指标开始。',
      cta: '从基础开始',
      href: getRoute('/learn/'),
    },
    {
      audience: '已经会 SQL，想系统理解数仓',
      description: '继续学习建模、指标、调度与数据质量。',
      cta: '进入进阶路线',
      href: getRoute('/learn/data-modeling/'),
    },
    {
      audience: '已经在做数据工程',
      description: '直接看血缘、质量、性能与生产实践。',
      cta: '看生产实践',
      href: getRoute('/learn/lifecycle-path-failure/'),
    },
  ]
}

export function HomeStartPaths() {
  return (
    <section className="home-start" aria-labelledby="home-start-title">
      <div className="home-section-heading">
        <span className="home-section-kicker">START HERE</span>
        <h2 id="home-start-title">从哪里开始？</h2>
        <p>先选一条更接近你现在位置的路径，再回到课程本身。</p>
      </div>
      <ol className="home-start__paths">
        {getHomeStartPaths().map((path) => (
          <li key={path.audience}>
            <a className="home-start-path" href={path.href}>
              <strong className="home-start-path__audience">{path.audience}</strong>
              <span className="home-start-path__description">{path.description}</span>
              <span className="home-start-path__cta">
                {path.cta}
                <span aria-hidden="true"> →</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}
