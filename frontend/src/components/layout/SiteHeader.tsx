import { Search, ShoppingBag, Store, Tag } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'

import { Avatar } from '@/components/Avatar'
import { AllCategoriesMenu } from '@/components/layout/AllCategoriesMenu'
import { DeliveryLocation } from '@/components/layout/DeliveryLocation'
import { CartTrigger } from '@/features/cart/components/CartTrigger'
import { useCategories } from '@/features/reference/api/useCategories'
import { useSellerAuth } from '@/features/seller-portal/context/SellerAuthContext'
import { useSession } from '@/features/session/api/useSession'
import { cn } from '@/lib/utils'

// Enough to fill the nav row on a laptop without wrapping it to two lines.
const MAX_NAV_CATEGORIES = 8

export function SiteHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  // The system category list, shared (and staleTime'd) with the landing page's
  // rail and the search filter, so the whole app costs one request for it. It used
  // to be guessed by sampling a page of products, which meant the nav could only
  // ever show categories that happened to have something listed in them.
  const categories = useCategories()
  const session = useSession()
  // Two sources, because a seller can be signed in without a server session:
  // in demo mode the portal keeps its own local flag and never sets a cookie.
  // A real cookie wins over that flag, so a buyer cookie beside a stale seller
  // flag is treated as the buyer it is.
  const { seller } = useSellerAuth()
  const identity = session.data?.identityType
  const isSeller = identity === 'SELLER' || (identity == null && Boolean(seller))
  const isBuyer = identity === 'BUYER'

  const onSearchPage = location.pathname === '/search'
  // Every buyer page renders this header from the layout route, so none of
  // them can pass the current query down as a prop - the header reads it off
  // the URL itself and owns the whole term <-> URL round trip.
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
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-7 gap-y-3 px-7 py-3">
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
          className="order-last flex w-full items-center gap-1 rounded-full border-[1.5px] border-primary py-0.5 pr-0.5 pl-4 md:order-none md:mx-auto md:w-auto md:max-w-[576px] md:flex-1"
        >
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Search products"
            aria-label="Search products"
            className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Search className="size-3.5" aria-hidden />
            Search
          </button>
        </form>

        <div className="ml-auto flex items-center gap-3 md:ml-0 md:gap-5">
          <DeliveryLocation />
          <CartTrigger />
          {/* The avatar alone. The label beside it used to print a name derived from
              the email when no real name was on record, which for a magic-link buyer
              is always - so "someone@example.com" showed up as "Someone" in the
              header of a shared screen. The identity is still reachable: the avatar
              is the link to /account, which is where the address belongs. */}
          {/* A seller is not a buyer. Sending them to /account showed them the
              buyer account page, and in demo mode - where the portal signs in
              locally with no cookie - they were pitched "Sell on Amezo" while
              already selling. Either way the portal is where they meant to go. */}
          {isSeller ? (
            <Link
              to="/seller/dashboard"
              className="hidden items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap hover:text-primary sm:inline-flex"
            >
              <Store className="size-4" aria-hidden />
              Seller dashboard
            </Link>
          ) : isBuyer ? (
            <Link
              to="/account"
              className="flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Your account"
            >
              <Avatar name={session.data!.fullName ?? session.data!.email} size="sm" />
            </Link>
          ) : (
            <Link
              to="/seller/sign-in"
              className="hidden items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap hover:text-primary sm:inline-flex"
            >
              <Store className="size-4" aria-hidden />
              Sell on Amezo
            </Link>
          )}
        </div>
      </div>

      <div className="border-t">
        <div className="mx-auto flex max-w-[1320px] items-center gap-6 overflow-x-auto px-7 py-[9px]">
          <AllCategoriesMenu activeCategory={activeCategory} />

          <nav aria-label="Product categories" className="flex flex-1 items-center gap-5">
            {navCategories.map((category) => (
              <Link
                key={category.slug}
                // The slug is what the filter matches on; the name is what is shown.
                to={`/search?category=${encodeURIComponent(category.slug)}`}
                className={cn(
                  'text-[13px] whitespace-nowrap hover:text-primary',
                  activeCategory === category.slug
                    ? 'font-semibold text-primary'
                    : 'text-muted-foreground',
                )}
              >
                {category.name}
              </Link>
            ))}
          </nav>

          <Link
            to="/search?sort=price_asc"
            className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-bold text-primary"
          >
            <Tag className="size-3.5" aria-hidden />
            Best deals
          </Link>
        </div>
      </div>
    </header>
  )
}
