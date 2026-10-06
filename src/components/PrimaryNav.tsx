import { getRoute } from '../utils/routes'

const REPOSITORY_URL = 'https://github.com/0verme/data-warehouse-visualized'

export type PrimaryNavId = 'home' | 'learn' | 'roadmap' | 'case' | 'about'

export interface PrimaryNavItem {
  id: PrimaryNavId
  label: string
  href: string
  external?: boolean
}

/**
 * Primary navigation contract shared by the homepage and Roadmap header.
 *
 * Content entries stay separate from utility controls: locale / theme remain in
 * `GlobalHeaderActions` and GitHub / license links stay in the footer. Every
 * target points at a real, stable surface — there is no `/cases/` or `/about/`
 * placeholder page. All internal hrefs go through `getRoute()` so the
 * `BASE_PATH` build contract cannot drift.
 *
 * Rendered server-side only (no `client:*` directive), so the navigation ships
 * no client JavaScript.
 */
export function getPrimaryNavItems(): readonly PrimaryNavItem[] {
  return [
    { id: 'home', label: '首页', href: getRoute('/') },
    { id: 'learn', label: '学习', href: getRoute('/learn/') },
    { id: 'roadmap', label: '路线', href: getRoute('/roadmap/') },
    { id: 'case', label: '案例', href: getRoute('/learn/lifecycle-path-failure/') },
    { id: 'about', label: '关于', href: REPOSITORY_URL, external: true },
  ]
}

interface PrimaryNavProps {
  current: PrimaryNavId
}

export function PrimaryNav({ current }: PrimaryNavProps) {
  return (
    <nav className="site-header__nav" aria-label="主导航">
      {getPrimaryNavItems().map((item) => (
        <a
          key={item.id}
          href={item.href}
          aria-current={item.id === current ? 'page' : undefined}
          {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {item.label}
          {item.external ? (
            <>
              <span className="site-header__nav-external" aria-hidden="true">
                {' '}
                ↗
              </span>
              <span className="sr-only">（GitHub 项目介绍，新窗口打开）</span>
            </>
          ) : null}
        </a>
      ))}
    </nav>
  )
}
