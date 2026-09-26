import { ChevronDown, LayoutGrid } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import { categoryImage } from '@/features/reference/categoryImage'
import { useCategories } from '@/features/reference/api/useCategories'
import { cn } from '@/lib/utils'

/**
 * The header's "All categories" menu.
 *
 * It was a plain link with a chevron drawn next to it and no menu behind it, which is
 * why it read as broken: the affordance promised a dropdown that did not exist.
 *
 * Every entry comes from GET /categories through the shared, hour-long cached query -
 * the same one the nav row, the landing rail, the search filter and the seller form
 * read. Opening this costs no request, and there is no second list here that could
 * disagree with the rest of the app about which categories exist. Slugs drive the
 * links, names are what's shown.
 */
export function AllCategoriesMenu({ activeCategory }: { activeCategory: string | null }) {
  const categories = useCategories()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const items = categories.data ?? []

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="all-categories-menu"
        className="inline-flex shrink-0 items-center gap-2 text-[13px] font-bold whitespace-nowrap hover:text-primary"
      >
        <LayoutGrid className="size-3.5" aria-hidden />
        All categories
        <ChevronDown className={cn('size-[11px] transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div
          id="all-categories-menu"
          className="absolute top-full left-0 z-30 mt-2 w-[320px] rounded-lg border bg-popover p-1.5 shadow-md"
        >
          {categories.isPending && (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">Loading categories…</p>
          )}
          {!categories.isPending && items.length === 0 && (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">No categories yet</p>
          )}

          {items.length > 0 && (
            <>
              <ul className="max-h-[60vh] overflow-y-auto">
                {items.map((category) => {
                  const image = categoryImage(category.slug)
                  return (
                    <li key={category.slug}>
                      <Link
                        to={`/search?category=${encodeURIComponent(category.slug)}`}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] hover:bg-accent',
                          activeCategory === category.slug && 'font-semibold text-primary',
                        )}
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                          {image ? (
                            <img src={image} alt="" loading="lazy" className="size-full object-cover" />
                          ) : (
                            <span className="text-[11px] font-bold text-muted-foreground" aria-hidden>
                              {category.name.trim().charAt(0).toUpperCase() || '?'}
                            </span>
                          )}
                        </span>
                        <span className="truncate">{category.name}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-1 border-t pt-1">
                <Link
                  to="/search"
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-2.5 py-1.5 text-[13px] font-semibold hover:bg-accent"
                >
                  Browse everything
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
