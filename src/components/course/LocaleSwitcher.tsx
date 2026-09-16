import { useEffect, useRef, useState } from 'react'
import { LOCALE_OPTIONS, type Locale } from '../../i18n/locale'
import { getMessage } from '../../i18n/messages'

interface LocaleSwitcherProps {
  locale: Locale
  onLocaleChange: (locale: Locale) => void
}

export function LocaleSwitcher({ locale, onLocaleChange }: LocaleSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const switcherRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      if (!switcherRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  function selectLocale(nextLocale: Locale) {
    onLocaleChange(nextLocale)
    setIsOpen(false)
  }

  return (
    <div className={`locale-switcher${isOpen ? ' is-open' : ''}`} ref={switcherRef}>
      <button
        className="locale-switcher__trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="learn-locale-menu"
        aria-label={getMessage('toggleLanguage', locale)}
        title={getMessage('toggleLanguage', locale)}
        onClick={() => setIsOpen((open) => !open)}
      >
        <svg
          className="locale-switcher__globe"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="9.5" />
          <path d="M2.5 12h19M12 2.5a15 15 0 0 1 0 19M12 2.5a15 15 0 0 0 0 19" />
        </svg>
        <span className="locale-switcher__label">{locale === 'zh-CN' ? '中' : 'EN'}</span>
      </button>
      <div
        className="locale-switcher__menu"
        id="learn-locale-menu"
        role="menu"
        aria-label={getMessage('language', locale)}
      >
        {LOCALE_OPTIONS.map((option) => {
          const isSelected = option.locale === locale

          return (
            <button
              className={`locale-switcher__option${isSelected ? ' is-selected' : ''}`}
              key={option.locale}
              type="button"
              role="menuitemradio"
              aria-checked={isSelected}
              onClick={() => selectLocale(option.locale)}
            >
              <span>
                {option.locale === 'zh-CN'
                  ? getMessage('simplifiedChinese', locale)
                  : getMessage('englishPreview', locale)}
              </span>
              {isSelected && (
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
