import { ShieldCheck, ShoppingBag, Truck, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { useCategoryOptions } from '@/features/search/api/useSearchProducts'

// Every entry here resolves to a route this app actually serves - no
// placeholder hrefs waiting on content pages that don't exist yet.
const SHOP_LINKS = [
  { to: '/search', label: 'All products' },
  { to: '/search?sort=newest', label: 'New arrivals' },
  { to: '/search?sort=price_asc', label: 'Lowest price first' },
  { to: '/search?inStockOnly=true', label: 'In stock now' },
]

const SELL_LINKS = [
  { to: '/seller/sign-in', label: 'Start selling' },
  { to: '/seller/products', label: 'Seller portal' },
]

const GUARANTEES = [
  { icon: Truck, label: 'Tracked delivery' },
  { icon: Undo2, label: '30-day returns' },
  { icon: ShieldCheck, label: 'Buyer protection' },
]

const MAX_FOOTER_CATEGORIES = 5

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="text-xs font-semibold tracking-wide uppercase">{title}</h2>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  )
}

function FooterLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <li>
      <Link to={to} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
        {children}
      </Link>
    </li>
  )
}

export function SiteFooter() {
  const categories = useCategoryOptions()
  const footerCategories = (categories.data ?? []).slice(0, MAX_FOOTER_CATEGORIES)

  return (
    <footer className="mt-16 border-t bg-muted/40">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-7 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <Link to="/" className="flex w-fit items-center gap-2.5" aria-label="Amezo home">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ShoppingBag className="size-4" />
            </span>
            <span className="text-lg font-bold">Amezo</span>
          </Link>
          <p className="max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
            A marketplace of independent sellers. Compare thousands of products, check real stock
            before you buy, and check out in a couple of taps.
          </p>
          <ul className="flex flex-col gap-2">
            {GUARANTEES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="size-4 shrink-0 text-primary" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <FooterColumn title="Shop">
          {SHOP_LINKS.map(({ to, label }) => (
            <FooterLink key={to} to={to}>
              {label}
            </FooterLink>
          ))}
        </FooterColumn>

        <FooterColumn title="Categories">
          {footerCategories.length > 0 ? (
            footerCategories.map((category) => (
              <FooterLink key={category} to={`/search?category=${encodeURIComponent(category)}`}>
                {category}
              </FooterLink>
            ))
          ) : (
            <FooterLink to="/search">Browse the catalog</FooterLink>
          )}
        </FooterColumn>

        <FooterColumn title="Sell">
          {SELL_LINKS.map(({ to, label }) => (
            <FooterLink key={to} to={to}>
              {label}
            </FooterLink>
          ))}
        </FooterColumn>
      </div>

      <div className="border-t">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-1 px-7 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Amezo. All rights reserved.</p>
          <p>Prices and availability are set by independent sellers.</p>
        </div>
      </div>
    </footer>
  )
}
