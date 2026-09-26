import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { useId, useState } from 'react'

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * A select you can type into - shadcn's Combobox pattern (Popover + Command), with a
 * caller-supplied filter.
 *
 * Not a component the registry ships: shadcn documents the combobox as a pattern
 * composed from Popover and Command, which is what this is. Everything underneath it
 * is the official implementation, so focus handling, dismissal, roving selection,
 * the ARIA wiring and the check mark on the chosen item all come from there rather
 * than from a hand-written effect.
 *
 * Filtering stays here rather than using cmdk's built-in scorer, and that is
 * deliberate: the country list needs the short-query rule ("in" must not match
 * United K-in-gdom) that filterCountries implements, and categories match on slug as
 * well as name. cmdk's `shouldFilter={false}` is the documented way to keep its
 * keyboard and selection behaviour while owning which items are shown.
 *
 * The className overrides exist to hold the app's existing look - the registry's
 * own padding, widths and alignment differ. They live here, at the call site,
 * rather than in the registry files, so `shadcn add` can overwrite those cleanly.
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
  triggerClassName,
  renderTrigger,
  panelClassName,
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
  /**
   * Replaces the default bordered-field trigger styling. The header's delivery
   * picker is a two-line label in a nav bar, not a form field.
   */
  triggerClassName?: string
  /** Replaces the trigger's contents. Receives the selected label, or null. */
  renderTrigger?: (selectedLabel: string | null) => ReactNode
  /** Extra classes for the dropdown panel, for when it shouldn't match the trigger's width. */
  panelClassName?: string
}) {
  const generatedId = useId()
  const controlId = id ?? generatedId

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const matches = filter(items, query)
  const selected = items.find((item) => getKey(item) === value)

  function choose(key: string) {
    onChange(key)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger
        id={controlId}
        role="combobox"
        aria-label={label}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        // Popover opens on Enter and Space by itself. The combobox pattern also
        // expects the arrows to open it, and that is how the keyboard reaches this
        // control without a mouse.
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
        className={cn(
          'outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
          triggerClassName ??
            cn(
              'flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-left text-sm',
              invalid && 'border-destructive',
            ),
        )}
      >
        {renderTrigger ? (
          renderTrigger(selected ? getLabel(selected) : null)
        ) : (
          <>
            <span className={cn('truncate', !selected && !fallbackLabel && 'text-muted-foreground')}>
              {selected ? getLabel(selected) : (fallbackLabel ?? placeholder)}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className={cn('gap-0 p-0', panelClassName ?? 'w-(--radix-popover-trigger-width)')}
      >
        {/* Our own filter runs above; cmdk keeps the keyboard and selection
            behaviour but does not second-guess which items are shown. cmdk names
            its input from the Command's own label, which is why the search label
            sits here rather than on the input. */}
        <Command shouldFilter={false} label={`Search ${label.toLowerCase()}`} loop>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={searchPlaceholder}
          />
          {/* The registry's list is max-h-72; this keeps the app's existing height. */}
          <CommandList label={label} className="max-h-60 p-1">
            {/* Left-aligned like every other row in the panel, not centred. */}
            <CommandEmpty className="px-2.5 py-2 text-left text-muted-foreground">
              {emptyMessage}
            </CommandEmpty>
            {matches.map((item) => {
              const key = getKey(item)
              const isSelected = key === value
              return (
                <CommandItem
                  key={key}
                  value={key}
                  onSelect={choose}
                  // The check mark is CommandItem's own, driven by this attribute -
                  // there is no second tick rendered here.
                  data-checked={isSelected}
                  // data-[selected=false]:bg-transparent is a fix, not a style
                  // preference. The registry's CommandItem highlights on
                  // `data-selected:bg-muted`, which Tailwind compiles to attribute
                  // PRESENCE - and cmdk writes data-selected="false" on every
                  // unhighlighted row, so all of them render highlighted and the
                  // active one cannot be told apart. Corrected here rather than in
                  // the registry file so `shadcn add` can still overwrite that
                  // cleanly.
                  className={cn(
                    'rounded-md px-2.5 data-[selected=false]:bg-transparent',
                    isSelected && 'font-semibold',
                  )}
                >
                  <span className="truncate">{getLabel(item)}</span>
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
