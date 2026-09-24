import { createBrowserRouter } from 'react-router'

import { ProductDetail } from '@/pages/ProductDetail'
import { SearchResults } from '@/pages/SearchResults'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <SearchResults />,
  },
  {
    path: '/products/:productId',
    element: <ProductDetail />,
  },
])
