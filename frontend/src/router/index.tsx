import { Navigate, createBrowserRouter } from 'react-router'

import { BuyerLayout } from '@/components/layout/BuyerLayout'
import { Checkout } from '@/pages/Checkout'
import { OrderConfirmation } from '@/pages/OrderConfirmation'
import { SellerPortalLayout } from '@/features/seller-portal/components/SellerPortalLayout'
import { Landing } from '@/pages/Landing'
import { ProductDetail } from '@/pages/ProductDetail'
import { SearchResults } from '@/pages/SearchResults'
import { StoreFront } from '@/pages/StoreFront'
import { SellerAddProduct } from '@/pages/seller/SellerAddProduct'
import { SellerOrderDetail } from '@/pages/seller/SellerOrderDetail'
import { SellerOrders } from '@/pages/seller/SellerOrders'
import { SellerProductDetail } from '@/pages/seller/SellerProductDetail'
import { SellerProducts } from '@/pages/seller/SellerProducts'
import { SellerSignIn } from '@/pages/seller/SellerSignIn'
import { SellerVerify } from '@/pages/seller/SellerVerify'

export const router = createBrowserRouter([
  {
    element: <BuyerLayout />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/search', element: <SearchResults /> },
      { path: '/products/:productId', element: <ProductDetail /> },
      { path: '/stores/:brand', element: <StoreFront /> },
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
      // /seller on its own rendered the portal shell around an empty outlet.
      { index: true, element: <Navigate to="/seller/products" replace /> },
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
