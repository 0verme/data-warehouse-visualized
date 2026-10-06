import { type ReactNode, useSyncExternalStore } from 'react'
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale'
import { getLocaleSnapshot, setLocale, subscribeToLocaleChanges } from '../utils/locale'
import { getRoute } from '../utils/routes'
import { LocaleSwitcher } from './course/LocaleSwitcher'
import { ThemeToggle } from './course/ThemeToggle'

interface GlobalHeaderActionsProps {
  locale?: Locale
  leadingAction?: ReactNode
  children?: ReactNode
}

export function GlobalHeaderActions({
  locale = DEFAULT_LOCALE,
  leadingAction,
  children,
}: GlobalHeaderActionsProps) {
  const activeLocale = useSyncExternalStore(
    subscribeToLocaleChanges,
    () => getLocaleSnapshot(locale),
    () => locale,
  )

  return (
    <div className="learn-topbar__actions">
      {leadingAction}
      <a className="english-entry-link" href={getRoute('/en/')} aria-label="English resources">
        EN
      </a>
      <LocaleSwitcher locale={activeLocale} onLocaleChange={setLocale} />
      <ThemeToggle locale={activeLocale} />
      {children}
    </div>
  )
}
