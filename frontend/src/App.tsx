import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'

import { CartProvider } from '@/features/cart/context/CartContext'
import { SellerAuthProvider } from '@/features/seller-portal/context/SellerAuthProvider'
import { createAppQueryClient } from '@/lib/api/queryClient'
import { router } from '@/router'

const queryClient = createAppQueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SellerAuthProvider>
        <CartProvider>
          <RouterProvider router={router} />
        </CartProvider>
      </SellerAuthProvider>
    </QueryClientProvider>
  )
}

export default App
