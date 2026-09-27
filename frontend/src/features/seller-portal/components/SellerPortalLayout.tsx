import { LayoutDashboard, LogOut, Package, RotateCcw, ShoppingBag, ShoppingCart, Store } from 'lucide-react'
import { Navigate, NavLink, Outlet } from 'react-router'

import { BackendWakingBanner } from '@/components/layout/BackendWakingBanner'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useSellerSignOut } from '@/features/seller-portal/api/useSellerAuth'
import { useSellerAuth } from '@/features/seller-portal/context/SellerAuthContext'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/seller/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/seller/products', label: 'Products', icon: Package },
  { to: '/seller/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/seller/refunds', label: 'Refunds', icon: RotateCcw },
  { to: '/seller/store', label: 'Store settings', icon: Store },
]

export function SellerPortalLayout() {
  const { seller, isUnknown, signOut } = useSellerAuth()
  const { mutate: signOutRequest } = useSellerSignOut()

  // Nobody has said yet whether this cookie is any good. Waiting rather than
  // redirecting: the local flag that used to answer instantly is gone (it was half
  // of the demo session), and treating "not answered yet" as "not signed in" would
  // bounce every seller to the sign-in page on every cold load - and keep them there
  // for as long as a sleeping instance took to wake up, which is the case this state
  // exists for. The banner is inside it so that wait explains itself.
  if (isUnknown) {
    return (
      <div className="flex h-screen flex-col">
        <BackendWakingBanner />
        <div className="flex flex-1 items-center justify-center" role="status" aria-label="Loading">
          <Spinner className="size-6 text-primary" />
        </div>
      </div>
    )
  }

  if (!seller) {
    return <Navigate to="/seller/sign-in" replace />
  }

  function handleSignOut() {
    signOutRequest(undefined, { onSettled: signOut })
  }

  return (
    // h-screen + overflow-hidden, not min-h-screen: the page itself must not
    // scroll, or the sidebar and the banners scroll away with the table. The
    // only scroll container is the content well below.
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ShoppingBag className="size-4" />
          </span>
          <span className="text-base font-bold">Amezo Seller</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t px-3 py-3">
          <p className="truncate px-3 text-xs text-muted-foreground">{seller.email}</p>
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start gap-2" onClick={handleSignOut}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Outside the scroll well, so both banners stay put while the page
            under them scrolls. */}
        <BackendWakingBanner />
        {/* The one scrolling region, and the one place the portal's gutter is
            set. Every page under this outlet rendered flush against the
            sidebar and the window edge because each was a bare flex column
            with no padding of its own. */}
        {/* `relative` is load-bearing. Tailwind's sr-only is position:absolute,
            and the portal is full of it - every row action carries one naming
            what it acts on. With no positioned ancestor those spans resolve
            against the initial containing block, which an unpositioned
            overflow-hidden does not clip: the document kept a 1403px
            scrollHeight and scrolled the sidebar away even though every visible
            element fitted. */}
        <div className="relative flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
