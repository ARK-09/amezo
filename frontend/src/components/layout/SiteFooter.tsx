import { ShoppingBag } from 'lucide-react'
import { Link } from 'react-router'

import { useViewerRole } from '@/features/session/api/useViewerRole'

// The design's footer also lists Help centre, Returns and Track order. Those
// pages don't exist in this app yet, and a footer full of dead links is worse
// than a short honest one - they go back in the moment the routes land.
const FOOTER_LINKS = [
  { to: '/search', label: 'All products' },
  { to: '/search?sort=newest', label: 'New arrivals' },
]

export function SiteFooter() {
  // The same entry point the header carries, and for the same reason: a seller
  // browsing the buyer side was still being pitched "Sell on Amezo" down here
  // after the header had stopped doing it.
  const { role } = useViewerRole()
  const sellerLink =
    role === 'seller'
      ? { to: '/seller/dashboard', label: 'Seller dashboard' }
      : { to: '/seller/sign-in', label: 'Sell on Amezo' }

  return (
    <footer className="border-t bg-muted/50">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-5 p-7">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Amezo home">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ShoppingBag className="size-3.5" />
          </span>
          <span className="text-[15px] font-bold">Amezo</span>
        </Link>

        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-[22px] gap-y-2">
          {[sellerLink, ...FOOTER_LINKS].map(({ to, label }) => (
            <Link key={to} to={to} className="text-[13px] text-muted-foreground hover:text-primary">
              {label}
            </Link>
          ))}
          <span className="text-[13px] text-muted-foreground">
            © {new Date().getFullYear()} Amezo
          </span>
        </nav>
      </div>
    </footer>
  )
}
