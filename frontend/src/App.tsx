import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'

import { CartProvider } from '@/features/cart/context/CartContext'
import { SellerAuthProvider } from '@/features/seller-portal/context/SellerAuthContext'
import { router } from '@/router'

const queryClient = new QueryClient()

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
