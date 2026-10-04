import { getRoute } from '../utils/routes'

const REPOSITORY_URL = 'https://github.com/0verme/data-warehouse-visualized'

export type PrimaryNavId = 'home' | 'learn' | 'lab' | 'case' | 'about'

export interface PrimaryNavItem {
  id: PrimaryNavId
  label: string
  href: string
  external?: boolean
}

/**
 * Homepage primary navigation contract.
 *
 * Content entries stay separate from utility controls: locale / theme remain in
 * `GlobalHeaderActions` and GitHub / license links stay in the footer. Every
 * target points at a real, stable surface — there is no `/labs/` or `/about/`
 * placeholder page. The lab entry reuses the existing `#data-lesson` anchor of
 * the homepage data-flow area, and all internal hrefs go through `getRoute()`
 * so the `BASE_PATH` build contract cannot drift.
 *
 * Rendered server-side only (no `client:*` directive), so the navigation ships
 * no client JavaScript.
 */
export function getPrimaryNavItems(): readonly PrimaryNavItem[] {
  return [
    { id: 'home', label: '首页', href: getRoute('/') },
    { id: 'learn', label: '学习', href: getRoute('/learn/') },
    { id: 'lab', label: '实验', href: `${getRoute('/')}#data-lesson` },
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
