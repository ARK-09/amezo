import { Outlet } from 'react-router'

import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { CartDrawer } from '@/features/cart/components/CartDrawer'

// The shared chrome for every buyer-facing route. The CartDrawer lives here
// for the same reason it lived in the old RootLayout: it needs Router context
// for its checkout button and must survive route changes instead of
// remounting per page.
export function BuyerLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      <SiteFooter />
      <CartDrawer />
    </div>
  )
}
