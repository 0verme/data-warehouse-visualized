import { type ReactNode, useSyncExternalStore } from 'react'
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale'
import { getLocaleSnapshot, setLocale, subscribeToLocaleChanges } from '../utils/locale'
import { LocaleSwitcher } from './course/LocaleSwitcher'
import { ThemeToggle } from './course/ThemeToggle'

interface GlobalHeaderActionsProps {
  locale?: Locale
  children?: ReactNode
}

export function GlobalHeaderActions({
  locale = DEFAULT_LOCALE,
  children,
}: GlobalHeaderActionsProps) {
  const activeLocale = useSyncExternalStore(
    subscribeToLocaleChanges,
    () => getLocaleSnapshot(locale),
    () => locale,
  )

  return (
    <div className="learn-topbar__actions">
      <LocaleSwitcher locale={activeLocale} onLocaleChange={setLocale} />
      <ThemeToggle locale={activeLocale} />
      {children}
    </div>
  )
}
