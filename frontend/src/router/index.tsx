import { createBrowserRouter } from 'react-router'

import { SellerPortalLayout } from '@/features/seller-portal/components/SellerPortalLayout'
import { ProductDetail } from '@/pages/ProductDetail'
import { SearchResults } from '@/pages/SearchResults'
import { SellerAddProduct } from '@/pages/seller/SellerAddProduct'
import { SellerOrders } from '@/pages/seller/SellerOrders'
import { SellerProducts } from '@/pages/seller/SellerProducts'
import { SellerSignIn } from '@/pages/seller/SellerSignIn'
import { SellerVerify } from '@/pages/seller/SellerVerify'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <SearchResults />,
  },
  {
    path: '/products/:productId',
    element: <ProductDetail />,
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
      { path: 'products/new', element: <SellerAddProduct /> },
      { path: 'orders', element: <SellerOrders /> },
    ],
  },
])
