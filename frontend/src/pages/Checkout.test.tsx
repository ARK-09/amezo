import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartContext'
import type { CartLine } from '@/features/cart/schema/types'

import { Checkout } from './Checkout'
import { OrderConfirmation } from './OrderConfirmation'

const HEADPHONES_VARIANT_ID = '11111111-1111-1111-1111-111111111111-v1' // price 129.99, stockQty 8
const SHOES_VARIANT_ID = '44444444-4444-4444-4444-444444444444-v1' // price 64, stockQty 0

function seedCart(lines: CartLine[]) {
  localStorage.setItem('cart:v1', JSON.stringify(lines))
}

function renderCheckout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <Routes>
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/orders/:orderId/confirmation" element={<OrderConfirmation />} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), 'buyer@example.com')
  await user.type(screen.getByLabelText('Phone'), '+15551234567')
  await user.type(screen.getByLabelText('Full name'), 'Jamie Buyer')
  await user.type(screen.getByLabelText('Address line 1'), '1 Main St')
  await user.type(screen.getByLabelText('City'), 'Springfield')
  await user.type(screen.getByLabelText('State'), 'IL')
  await user.type(screen.getByLabelText('Postal code'), '62704')
  await user.type(screen.getByLabelText('Country (2-letter code)'), 'US')
}

describe('Checkout', () => {
  it('shows the empty-cart state when there is nothing to check out', async () => {
    seedCart([])
    renderCheckout()
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument()
  })

  it('places the order, clears the cart, and redirects to the confirmation page', async () => {
    seedCart([{ variantId: HEADPHONES_VARIANT_ID, quantity: 1, priceWhenAdded: 129.99 }])
    const user = userEvent.setup()
    renderCheckout()

    expect(await screen.findByText('Wireless Noise-Cancelling Headphones')).toBeInTheDocument()
    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Place order' }))

    expect(await screen.findByText('Order confirmed')).toBeInTheDocument()
    expect(screen.getByText('Total: $129.99')).toBeInTheDocument()
    expect(localStorage.getItem('cart:v1')).toBe('[]')
  })

  it('shows the out-of-stock failure itemized, and does not clear the cart', async () => {
    seedCart([{ variantId: SHOES_VARIANT_ID, quantity: 1, priceWhenAdded: 64 }])
    const user = userEvent.setup()
    renderCheckout()

    await screen.findByText('Trail Running Shoes')
    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Place order' }))

    expect(await screen.findByText('Some items are no longer available')).toBeInTheDocument()
    expect(screen.getByText('requested 1, available 0')).toBeInTheDocument()
    expect(localStorage.getItem('cart:v1')).not.toBe('[]')
  })

  it('shows the price-drift failure with old vs new price', async () => {
    seedCart([{ variantId: HEADPHONES_VARIANT_ID, quantity: 1, priceWhenAdded: 100 }])
    const user = userEvent.setup()
    renderCheckout()

    await screen.findByText('Wireless Noise-Cancelling Headphones')
    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: 'Place order' }))

    expect(await screen.findByText('Prices have changed')).toBeInTheDocument()
    expect(screen.getByText('expected 100.00, now 129.99')).toBeInTheDocument()
  })
})
