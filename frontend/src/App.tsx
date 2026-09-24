import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'

import { CartDrawer } from '@/features/cart/components/CartDrawer'
import { CartProvider } from '@/features/cart/context/CartContext'
import { router } from '@/router'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <RouterProvider router={router} />
        <CartDrawer />
      </CartProvider>
    </QueryClientProvider>
  )
}

export default App
