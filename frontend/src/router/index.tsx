import { createBrowserRouter } from 'react-router'

import { SearchResults } from '@/pages/SearchResults'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <SearchResults />,
  },
])
