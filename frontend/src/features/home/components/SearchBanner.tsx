import { Search } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import type { ProductSummary } from '@/features/search/schema/types'

const MOSAIC_TILES = 27

/**
 * The design labels this band "Amezo AI — AI-powered shopping experience".
 * Nothing behind it is AI: the box runs the same keyword search as the
 * header, so it is labelled for what it does. Swap the copy back the day an
 * AI search endpoint exists.
 */
export function SearchBanner({ products }: { products: ProductSummary[] }) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    const term = value.trim()
    navigate(term ? `/search?q=${encodeURIComponent(term)}` : '/search')
  }

  // Real thumbnails where the catalog has them, striped placeholders where it
  // doesn't - the band reads as the marketplace rather than as stock art.
  const thumbnails = products.map((p) => p.thumbnailUrl).filter(Boolean)

  return (
    <section aria-labelledby="search-banner">
      <div className="relative flex min-h-[220px] items-center justify-center overflow-hidden rounded-lg border bg-muted/40 [aspect-ratio:64/17]">
        <div className="absolute inset-0 grid grid-cols-9 grid-rows-3 gap-1 p-1" aria-hidden>
          {Array.from({ length: MOSAIC_TILES }, (_, i) => {
            const src = thumbnails[i % (thumbnails.length || 1)]
            return src ? (
              <img key={i} src={src} alt="" className="size-full rounded-[3px] object-cover" />
            ) : (
              <div
                key={i}
                className="rounded-[3px]"
                style={{
                  background:
                    'repeating-linear-gradient(45deg,#ececec 0 7px,#f6f6f6 7px 14px)',
                }}
              />
            )
          })}
        </div>

        <div className="relative w-[min(520px,76%)] rounded-xl border bg-background/95 px-[26px] py-6 text-center">
          <div id="search-banner" className="text-2xl font-extrabold tracking-[-0.01em]">
            Find it <span className="text-primary">faster</span>
          </div>
          <div className="mt-1 text-[13px] text-muted-foreground">
            Search every seller in one place
          </div>
          <form
            onSubmit={submit}
            role="search"
            aria-label="Catalog search"
            className="mt-4 flex items-center gap-2.5 rounded-full border-[1.5px] border-primary bg-background py-[9px] pr-2 pl-4"
          >
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Describe what you need..."
              aria-label="Search every seller"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              aria-label="Search"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Search className="size-4" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}
