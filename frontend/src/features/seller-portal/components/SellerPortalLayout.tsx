import { LogOut, Package, ShoppingBag, ShoppingCart } from 'lucide-react'
import { Navigate, NavLink, Outlet } from 'react-router'

import { Button } from '@/components/ui/button'
import { useSellerSignOut } from '@/features/seller-portal/api/useSellerAuth'
import { useSellerAuth } from '@/features/seller-portal/context/SellerAuthContext'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/seller/products', label: 'Products', icon: Package },
  { to: '/seller/orders', label: 'Orders', icon: ShoppingCart },
]

// Same flag SellerSignIn uses to bypass the real magic-link flow - see its
// comment. Banner makes the bypass visible rather than silent.
const DEMO_AUTH = import.meta.env.VITE_DEMO_SELLER_AUTH === 'true'

export function SellerPortalLayout() {
  const { seller, signOut } = useSellerAuth()
  const { mutate: signOutRequest } = useSellerSignOut()

  if (!seller) {
    return <Navigate to="/seller/sign-in" replace />
  }

  function handleSignOut() {
    signOutRequest(undefined, { onSettled: signOut })
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r">
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

      <main className="min-w-0 flex-1">
        {DEMO_AUTH && (
          <div
            role="status"
            className="border-b border-primary/50 bg-primary/5 px-4 py-2 text-center text-sm font-medium text-primary"
          >
            Demo mode — authentication is mocked.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}
