import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Locale } from '../../i18n/locale'
import { getMessage } from '../../i18n/messages'
import type { SearchHit, SearchIndex } from './types'
import { searchKnowledge } from './match'
import { loadSearchIndex } from './load-index'
import '../../styles/components/search-dialog.css'

interface SearchDialogProps {
  locale: Locale
  onClose: () => void
  onNavigate: () => void
}

type LoadState = 'loading' | 'ready' | 'error'

const SEARCH_EXAMPLES = ['拉链表', '幂等', '数据倾斜', 'first_seen']
const SEARCH_RESULTS_ID = 'learn-search-results'

function renderSnippet(hit: SearchHit) {
  return hit.snippet.segments.map((segment, index) =>
    segment.match ? (
      <mark key={index}>{segment.text}</mark>
    ) : (
      <span key={index}>{segment.text}</span>
    ),
  )
}

export function SearchDialog({ locale, onClose, onNavigate }: SearchDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const resultsRef = useRef<HTMLDivElement | null>(null)
  const optionRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const [searchIndex, setSearchIndex] = useState<SearchIndex | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const hasQuery = query.trim().length > 0
  const result = useMemo(
    () => (searchIndex && hasQuery ? searchKnowledge(searchIndex, query) : null),
    [hasQuery, query, searchIndex],
  )
  const hits = result?.hits ?? []

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (!dialog.open) dialog.showModal()
    inputRef.current?.focus({ preventScroll: true })

    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  useEffect(() => {
    let isCurrent = true

    loadSearchIndex().then(
      (index) => {
        if (!isCurrent) return
        setSearchIndex(index)
        setLoadState('ready')
      },
      () => {
        if (isCurrent) setLoadState('error')
      },
    )

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    if (activeIndex < 0) return
    const list = resultsRef.current
    const option = optionRefs.current[activeIndex]
    if (!list || !option) return

    const listRect = list.getBoundingClientRect()
    const optionRect = option.getBoundingClientRect()
    if (optionRect.top < listRect.top) {
      list.scrollTop -= listRect.top - optionRect.top
    } else if (optionRect.bottom > listRect.bottom) {
      list.scrollTop += optionRect.bottom - listRect.bottom
    }
  }, [activeIndex])

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return

    const dialog = dialogRef.current
    if (!dialog) return

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.getClientRects().length > 0)
    const first = focusableElements[0]
    const last = focusableElements[focusableElements.length - 1]
    if (!first || !last) return

    const focusIsOutside = !dialog.contains(document.activeElement)
    if (event.shiftKey && (document.activeElement === first || focusIsOutside)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || focusIsOutside)) {
      event.preventDefault()
      first.focus()
    }
  }

  function moveActiveOption(direction: -1 | 1) {
    if (hits.length === 0) return
    setActiveIndex((current) => {
      if (current < 0) return direction > 0 ? 0 : hits.length - 1
      return (current + direction + hits.length) % hits.length
    })
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveActiveOption(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveActiveOption(-1)
    } else if (event.key === 'Home' && hits.length > 0) {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End' && hits.length > 0) {
      event.preventDefault()
      setActiveIndex(hits.length - 1)
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      optionRefs.current[activeIndex]?.click()
    }
  }

  function setSearchQuery(nextQuery: string) {
    setQuery(nextQuery)
    setActiveIndex(-1)
    inputRef.current?.focus({ preventScroll: true })
  }

  function retryLoading() {
    setLoadState('loading')
    loadSearchIndex().then(
      (index) => {
        setSearchIndex(index)
        setLoadState('ready')
      },
      () => setLoadState('error'),
    )
  }

  let liveMessage = ''
  if (loadState === 'loading') {
    liveMessage = getMessage('searchLoading', locale)
  } else if (loadState === 'error') {
    liveMessage = getMessage('searchLoadError', locale)
  } else if (hasQuery && hits.length === 0) {
    liveMessage = getMessage('searchNoResultsCount', locale)
  } else if (hasQuery) {
    liveMessage = `${hits.length} ${getMessage('searchResultCount', locale)}`
  }

  return (
    <dialog
      ref={dialogRef}
      id="learn-search-dialog"
      className="learn-search-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="learn-search-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onKeyDown={handleDialogKeyDown}
    >
      <div className="learn-search-dialog__panel">
        <header className="learn-search-dialog__header">
          <div>
            <p className="learn-search-dialog__eyebrow">{getMessage('courseLearning', locale)}</p>
            <h2 id="learn-search-title">{getMessage('searchContent', locale)}</h2>
          </div>
          <button
            className="learn-search-dialog__close"
            type="button"
            aria-label={getMessage('closeSearch', locale)}
            onClick={onClose}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="learn-search-dialog__input-wrap">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <circle cx="10.8" cy="10.8" r="6.3" />
            <path d="m15.5 15.5 4.2 4.2" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label={getMessage('searchContent', locale)}
            aria-autocomplete="list"
            aria-expanded={hasQuery && loadState === 'ready'}
            aria-controls={SEARCH_RESULTS_ID}
            aria-activedescendant={
              activeIndex >= 0 ? `learn-search-option-${activeIndex}` : undefined
            }
            autoComplete="off"
            placeholder={getMessage('searchPlaceholder', locale)}
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value)
              setActiveIndex(-1)
            }}
            onKeyDown={handleInputKeyDown}
          />
          <kbd className="learn-search-dialog__escape-hint" aria-hidden="true">
            Esc
          </kbd>
        </div>

        <div
          className="learn-search-dialog__status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {liveMessage}
        </div>

        {!hasQuery && (
          <div className="learn-search-dialog__suggestions">
            <p>{getMessage('searchInitialHint', locale)}</p>
            <div>
              {SEARCH_EXAMPLES.map((example) => (
                <button key={example} type="button" onClick={() => setSearchQuery(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {loadState === 'error' && (
          <div className="learn-search-dialog__error" role="alert">
            <p>{getMessage('searchLoadError', locale)}</p>
            <button type="button" onClick={retryLoading}>
              {getMessage('retrySearch', locale)}
            </button>
          </div>
        )}

        {hasQuery && loadState === 'ready' && hits.length === 0 && (
          <div className="learn-search-dialog__empty">
            <p>{getMessage('searchNoResults', locale)}</p>
            <p>{getMessage('searchNoResultsHint', locale)}</p>
            <div>
              {SEARCH_EXAMPLES.slice(0, 3).map((example) => (
                <button key={example} type="button" onClick={() => setSearchQuery(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          ref={resultsRef}
          className="learn-search-dialog__results"
          id={SEARCH_RESULTS_ID}
          role="listbox"
          aria-label={getMessage('searchContent', locale)}
          hidden={!hasQuery || loadState !== 'ready' || hits.length === 0}
        >
          {hits.map((hit, index) => (
            <a
              ref={(element) => {
                optionRefs.current[index] = element
              }}
              className={`learn-search-result${activeIndex === index ? ' is-active' : ''}`}
              id={`learn-search-option-${index}`}
              key={hit.docId}
              role="option"
              aria-selected={activeIndex === index}
              href={hit.href}
              onClick={onNavigate}
            >
              {activeIndex === index && (
                <span className="learn-search-result__selected-mark" aria-hidden="true">
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="m3 8 3 3 7-7" />
                  </svg>
                </span>
              )}
              <span className="learn-search-result__chapter">{hit.chapterTitle}</span>
              <strong className="learn-search-result__lesson">{hit.lessonTitle}</strong>
              <span className="learn-search-result__heading">
                <span>{getMessage('searchSectionLabel', locale)} · </span>
                {hit.heading || getMessage('searchLessonOverview', locale)}
              </span>
              <span className="learn-search-result__snippet">{renderSnippet(hit)}</span>
            </a>
          ))}
        </div>

        <footer className="learn-search-dialog__footer">
          <span>↑ ↓ {locale === 'en' ? 'Navigate' : '移动选择'}</span>
          <span>Enter {locale === 'en' ? 'Open' : '打开'}</span>
          <span>Esc {locale === 'en' ? 'Close' : '关闭'}</span>
        </footer>
      </div>
    </dialog>
  )
}

export default SearchDialog
