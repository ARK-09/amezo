import { Navigate, createBrowserRouter } from 'react-router'

import { BuyerLayout } from '@/components/layout/BuyerLayout'
import { Account } from '@/pages/Account'
import { BuyerSignIn } from '@/pages/BuyerSignIn'
import { BuyerVerify } from '@/pages/BuyerVerify'
import { Checkout } from '@/pages/Checkout'
import { OrderConfirmation } from '@/pages/OrderConfirmation'
import { SellerPortalLayout } from '@/features/seller-portal/components/SellerPortalLayout'
import { Landing } from '@/pages/Landing'
import { MyOrders } from '@/pages/MyOrders'
import { ProductDetail } from '@/pages/ProductDetail'
import { RefundRequest } from '@/pages/RefundRequest'
import { SearchResults } from '@/pages/SearchResults'
import { StoreFront } from '@/pages/StoreFront'
import { SellerAddProduct } from '@/pages/seller/SellerAddProduct'
import { SellerOrderDetail } from '@/pages/seller/SellerOrderDetail'
import { SellerOrders } from '@/pages/seller/SellerOrders'
import { SellerProductDetail } from '@/pages/seller/SellerProductDetail'
import { SellerProducts } from '@/pages/seller/SellerProducts'
import { SellerRefundDetail } from '@/pages/seller/SellerRefundDetail'
import { SellerRefunds } from '@/pages/seller/SellerRefunds'
import { SellerSignIn } from '@/pages/seller/SellerSignIn'
import { SellerVerify } from '@/pages/seller/SellerVerify'

export const router = createBrowserRouter([
  {
    element: <BuyerLayout />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/search', element: <SearchResults /> },
      // The segment is a slug. A legacy id still resolves and the page redirects to
      // the slug URL, so old links land on the product instead of an error.
      { path: '/products/:productRef', element: <ProductDetail /> },
      { path: '/stores/:brand', element: <StoreFront /> },
      { path: '/checkout', element: <Checkout /> },
      { path: '/sign-in', element: <BuyerSignIn /> },
      // Where the buyer magic-link email points - see BuyerAuthService.
      { path: '/verify', element: <BuyerVerify /> },
      { path: '/account', element: <Account /> },
      { path: '/orders', element: <MyOrders /> },
      { path: '/orders/:orderId/confirmation', element: <OrderConfirmation /> },
    ],
  },
  {
    path: '/orders/:orderId/refund',
    element: <RefundRequest />,
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
      { path: 'refunds', element: <SellerRefunds /> },
      { path: 'refunds/:refundRequestId', element: <SellerRefundDetail /> },
    ],
  },
])
