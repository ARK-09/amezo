import { Search, ShoppingBag, Store } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CartTrigger } from '@/features/cart/components/CartTrigger'
import { useCategoryOptions } from '@/features/search/api/useSearchProducts'
import { cn } from '@/lib/utils'

// Enough to fill the nav row on a laptop without wrapping it to two lines.
const MAX_NAV_CATEGORIES = 6

export function SiteHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  // Shared (staleTime'd) with the landing page's category tiles, so the nav
  // costs one request per session rather than one per page view.
  const categories = useCategoryOptions()

  const onSearchPage = location.pathname === '/search'
  // Every buyer page now renders this header from the layout route, so none
  // of them can pass the current query down as a prop - the header reads it
  // off the URL itself and owns the whole term <-> URL round trip.
  const urlQ = onSearchPage ? (searchParams.get('q') ?? '') : ''
  const [value, setValue] = useState(urlQ)
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ)
  if (urlQ !== prevUrlQ) {
    setPrevUrlQ(urlQ)
    setValue(urlQ)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    // Searching from /search keeps whatever filters are already applied and
    // only swaps the term; searching from anywhere else starts clean.
    const next = new URLSearchParams(onSearchPage ? searchParams : undefined)
    const term = value.trim()
    if (term) next.set('q', term)
    else next.delete('q')
    next.delete('page')
    const qs = next.toString()
    navigate(qs ? `/search?${qs}` : '/search')
  }

  const activeCategory = onSearchPage ? searchParams.get('category') : null
  const navCategories = (categories.data ?? []).slice(0, MAX_NAV_CATEGORIES)

  return (
    <header className="sticky top-0 z-20 border-b bg-background">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-6 gap-y-3 px-7 py-3">
        <Link to="/" className="flex items-center gap-2.5 whitespace-nowrap" aria-label="Amezo home">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ShoppingBag className="size-4" />
          </span>
          <span className="text-lg font-bold">Amezo</span>
        </Link>

        {/* Drops to its own full-width row below the logo/cart on phones,
            sits between them from md up. */}
        <form
          onSubmit={submit}
          role="search"
          aria-label="Site search"
          className="order-last flex w-full items-center gap-1 rounded-full border-[1.5px] border-primary py-0.5 pr-0.5 pl-4 md:order-none md:mx-auto md:w-auto md:max-w-xl md:flex-1"
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Search products"
            aria-label="Search products"
            className="h-8 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
          <Button type="submit" size="sm" className="gap-1.5 rounded-full">
            <Search className="size-3.5" />
            Search
          </Button>
        </form>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link
            to="/seller/sign-in"
            className="hidden items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground whitespace-nowrap hover:bg-accent hover:text-accent-foreground sm:inline-flex"
          >
            <Store className="size-4" />
            Sell on Amezo
          </Link>
          <CartTrigger />
        </div>
      </div>

      {navCategories.length > 0 && (
        <nav aria-label="Product categories" className="border-t bg-muted/40">
          <div className="mx-auto flex max-w-[1320px] items-center gap-1 overflow-x-auto px-7 py-1.5">
            <Link
              to="/search"
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors',
                onSearchPage && !activeCategory
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              All products
            </Link>
            {navCategories.map((category) => (
              <Link
                key={category}
                to={`/search?category=${encodeURIComponent(category)}`}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                  activeCategory === category
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {category}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  )
}
