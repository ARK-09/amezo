import { createBrowserRouter, Outlet } from 'react-router'

import { CartDrawer } from '@/features/cart/components/CartDrawer'
import { Checkout } from '@/pages/Checkout'
import { OrderConfirmation } from '@/pages/OrderConfirmation'
import { ProductDetail } from '@/pages/ProductDetail'
import { SearchResults } from '@/pages/SearchResults'

// CartDrawer needs useNavigate() (checkout button) and must persist across
// route changes rather than remounting per-page - a layout route gives it
// both, which rendering it as App.tsx's sibling to <RouterProvider> can't:
// that placement has no Router context at all.
function RootLayout() {
  return (
    <>
      <Outlet />
      <CartDrawer />
    </>
  )
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <SearchResults /> },
      { path: '/products/:productId', element: <ProductDetail /> },
      { path: '/checkout', element: <Checkout /> },
      { path: '/orders/:orderId/confirmation', element: <OrderConfirmation /> },
    ],
  },
])
