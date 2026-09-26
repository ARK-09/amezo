import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * A select you can type into. Both system lists need one - categories so a seller
 * doesn't scroll a dozen options, countries because there are 249 of them - and
 * neither should be a free-text field, which is the whole point of the change.
 *
 * Filtering happens here, over a list the caller already holds, rather than through
 * a request per keystroke: both lists are fetched once per session and are small
 * enough to search in memory.
 *
 * Deliberately not the radix Select this codebase uses elsewhere: that one has no
 * search affordance, and bolting a text input inside its listbox fights its focus
 * management. The keyboard contract here is the one people expect from a combobox -
 * arrows to move, Enter to choose, Escape to dismiss, and the closed control is
 * reachable by tab.
 */
export function SearchableSelect<T>({
  items,
  value,
  onChange,
  getKey,
  getLabel,
  filter,
  label,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches',
  disabled = false,
  invalid = false,
  fallbackLabel,
  id,
}: {
  items: T[]
  /** The selected key, or null for nothing selected. */
  value: string | null
  onChange: (key: string) => void
  getKey: (item: T) => string
  getLabel: (item: T) => string
  filter: (items: T[], query: string) => T[]
  /** Accessible name for the control. */
  label: string
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  invalid?: boolean
  /**
   * What to show for the current value before `items` has loaded. An edit form
   * already knows the name of the thing it is editing; without this it would flash a
   * loading placeholder over a value the user can see is set.
   */
  fallbackLabel?: string
  id?: string
}) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  const listboxId = `${controlId}-listbox`

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => filter(items, query), [items, query, filter])
  const selected = items.find((item) => getKey(item) === value)

  useEffect(() => {
    if (!open) return
    // Focus the search box on open, so typing works immediately rather than after a
    // click nobody knows to make.
    inputRef.current?.focus()
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  /**
   * A filtered list can be shorter than the highlighted position, which would
   * otherwise leave Enter pointing at nothing. Adjusted during render rather than in
   * an effect - the same pattern SiteHeader uses to follow the URL's query - so the
   * highlight is already correct on the pass that shows the filtered list, instead of
   * being fixed up by a second render.
   */
  const [previousQuery, setPreviousQuery] = useState(query)
  if (query !== previousQuery) {
    setPreviousQuery(query)
    setActiveIndex(0)
  }

  function choose(item: T) {
    onChange(getKey(item))
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      setOpen(false)
      setQuery('')
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => {
        if (matches.length === 0) return 0
        return (current + delta + matches.length) % matches.length
      })
      return
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault()
      const item = matches[activeIndex]
      if (item) choose(item)
    }
  }

  return (
    <div ref={containerRef} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        id={controlId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-label={label}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-left text-sm',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
          invalid && 'border-destructive',
        )}
      >
        <span className={cn('truncate', !selected && !fallbackLabel && 'text-muted-foreground')}>
          {selected ? getLabel(selected) : (fallbackLabel ?? placeholder)}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 w-full rounded-lg border bg-popover shadow-md">
          <div className="flex items-center gap-2 border-b px-2.5 py-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={`Search ${label.toLowerCase()}`}
              className="h-5 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <ul id={listboxId} role="listbox" aria-label={label} className="max-h-60 overflow-y-auto p-1">
            {matches.length === 0 && (
              <li className="px-2.5 py-2 text-sm text-muted-foreground">{emptyMessage}</li>
            )}
            {matches.map((item, index) => {
              const key = getKey(item)
              const isSelected = key === value
              return (
                <li key={key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => choose(item)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm',
                      index === activeIndex && 'bg-accent',
                      isSelected && 'font-semibold',
                    )}
                  >
                    <span className="truncate">{getLabel(item)}</span>
                    {isSelected && <Check className="size-3.5 shrink-0 text-primary" aria-hidden />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
