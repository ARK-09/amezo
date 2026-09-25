import { createBrowserRouter, Outlet } from 'react-router'

import { CartDrawer } from '@/features/cart/components/CartDrawer'
import { Checkout } from '@/pages/Checkout'
import { OrderConfirmation } from '@/pages/OrderConfirmation'
import { SellerPortalLayout } from '@/features/seller-portal/components/SellerPortalLayout'
import { ProductDetail } from '@/pages/ProductDetail'
import { SearchResults } from '@/pages/SearchResults'
import { SellerAddProduct } from '@/pages/seller/SellerAddProduct'
import { SellerOrderDetail } from '@/pages/seller/SellerOrderDetail'
import { SellerOrders } from '@/pages/seller/SellerOrders'
import { SellerProductDetail } from '@/pages/seller/SellerProductDetail'
import { SellerProducts } from '@/pages/seller/SellerProducts'
import { SellerSignIn } from '@/pages/seller/SellerSignIn'
import { SellerVerify } from '@/pages/seller/SellerVerify'

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
  {
    path: '/seller/sign-in',
    element: <SellerSignIn />,
  },
  {
    path: '/seller/verify',
    element: <SellerVerify />,
  },
  {
    path: '/seller',
    element: <SellerPortalLayout />,
    children: [
      { path: 'products', element: <SellerProducts /> },
      // 'new' before ':productId' for the reader's sake - React Router ranks a
      // static segment above a dynamic one whatever the order here, but nobody
      // should have to know that to be sure /seller/products/new still works.
      { path: 'products/new', element: <SellerAddProduct /> },
      { path: 'products/:productId', element: <SellerProductDetail /> },
      { path: 'orders', element: <SellerOrders /> },
      { path: 'orders/:orderId', element: <SellerOrderDetail /> },
    ],
  },
])
