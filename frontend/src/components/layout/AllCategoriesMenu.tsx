import { ChevronDown, LayoutGrid } from 'lucide-react'
import { Link } from 'react-router'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { categoryImage } from '@/features/reference/categoryImage'
import { useCategories } from '@/features/reference/api/useCategories'
import { cn } from '@/lib/utils'

/**
 * The header's "All categories" menu.
 *
 * It was a plain link with a chevron drawn next to it and no menu behind it, which is
 * why it read as broken: the affordance promised a dropdown that did not exist.
 *
 * Built on shadcn's DropdownMenu, so the parts that are easy to get subtly wrong -
 * roving focus through the items, typeahead, Escape and outside-pointer dismissal,
 * returning focus to the trigger on close, aria-expanded/aria-controls wiring - come
 * from the primitive rather than from a hand-written effect.
 *
 * Every entry comes from GET /categories through the shared, hour-long cached query -
 * the same one the nav row, the landing rail, the search filter and the seller form
 * read. Opening this costs no request, and there is no second list here that could
 * disagree with the rest of the app about which categories exist. Slugs drive the
 * links, names are what's shown.
 */
export function AllCategoriesMenu({ activeCategory }: { activeCategory: string | null }) {
  const categories = useCategories()
  const items = categories.data ?? []

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex shrink-0 items-center gap-2 text-[13px] font-bold whitespace-nowrap outline-none',
          'hover:text-primary focus-visible:ring-2 focus-visible:ring-ring',
          'data-[state=open]:text-primary [&[data-state=open]_svg:last-child]:rotate-180',
        )}
      >
        <LayoutGrid className="size-3.5" aria-hidden />
        All categories
        <ChevronDown className="size-[11px] transition-transform" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-[320px]">
        {categories.isPending && (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">Loading categories…</p>
        )}
        {!categories.isPending && items.length === 0 && (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">No categories yet</p>
        )}

        {items.length > 0 && (
          <>
            <div className="max-h-[60vh] overflow-y-auto">
              {items.map((category) => {
                const image = categoryImage(category.slug)
                return (
                  <DropdownMenuItem key={category.slug} asChild>
                    <Link
                      to={`/search?category=${encodeURIComponent(category.slug)}`}
                      className={cn(
                        'text-[13px]',
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
                  </DropdownMenuItem>
                )
              })}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/search" className="text-[13px] font-semibold">
                Browse everything
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
