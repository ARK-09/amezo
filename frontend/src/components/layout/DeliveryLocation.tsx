import { Check, MapPin } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

const STORAGE_KEY = 'delivery-city:v1'
const DEFAULT_CITY = 'Dubai'

// No delivery-zone service exists yet, so the choice is a local preference
// rather than something the catalog reacts to. Kept real (it persists, and
// it is the only thing the header claims) instead of a dead control.
const CITIES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Riyadh', 'Doha']

function readCity(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_CITY
  } catch {
    return DEFAULT_CITY
  }
}

export function DeliveryLocation() {
  // Lazy initializer rather than an effect: this is a client-only app, so the
  // stored city is readable on the first render and the header never paints
  // the default city before flipping to the real one.
  const [city, setCity] = useState(readCity)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function choose(next: string) {
    setCity(next)
    setOpen(false)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // A rejected write just means the choice lasts for this page only.
    }
  }

  return (
    <div ref={containerRef} className="relative hidden lg:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-[7px] rounded-md px-1.5 py-1 text-left hover:bg-accent"
      >
        <MapPin className="size-[15px] shrink-0 text-muted-foreground" aria-hidden />
        <span className="leading-[1.25]">
          <span className="block text-[11px] text-muted-foreground">Deliver to {city}</span>
          <span className="block text-xs font-semibold">Update location</span>
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Delivery city"
          className="absolute top-full left-0 z-30 mt-1 w-48 rounded-lg border bg-popover p-1 shadow-md"
        >
          {CITIES.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={option === city}
                onClick={() => choose(option)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-accent',
                  option === city && 'font-semibold',
                )}
              >
                {option}
                {option === city && <Check className="size-3.5 text-primary" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
