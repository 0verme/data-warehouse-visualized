const REPOSITORY_URL = 'https://github.com/0verme/data-warehouse-visualized'
const LICENSE_URL = `${REPOSITORY_URL}/blob/main/LICENSE`

interface SiteFooterProps {
  variant?: 'home' | 'learn'
}

export function SiteFooter({ variant = 'learn' }: SiteFooterProps) {
  const isHome = variant === 'home'

  return (
    <footer className={`site-footer${isHome ? ' home-footer' : ' learn-footer'}`}>
      <div className={`brand brand--footer${isHome ? ' home-brand' : ''}`}>
        <span className="brand__mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="brand__text">
          <strong>数据仓库图解</strong>
          <small>从一张表开始，看懂数据仓库。</small>
        </span>
      </div>
      <div className="site-footer__meta">
        <span>
          <code>sql.sb</code>
        </span>
        <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
          GitHub ↗
        </a>
        <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">
          Apache-2.0
        </a>
        <a href="https://x.com/0verme8" target="_blank" rel="noopener noreferrer">
          X / @0verme8
        </a>
      </div>
    </footer>
  )
}
