import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { SellerAuthProvider } from '@/features/seller-portal/context/SellerAuthProvider'
import { signInSellerSession } from '@/test/msw/fixtures/sellerAuth'

import { SellerPortalLayout } from './SellerPortalLayout'

function renderLayout(initialEntry = '/seller/products') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <SellerAuthProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/seller/sign-in" element={<div>Sign in page</div>} />
            <Route path="/seller" element={<SellerPortalLayout />}>
              <Route path="products" element={<div>Products content</div>} />
              <Route path="orders" element={<div>Orders content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </SellerAuthProvider>
    </QueryClientProvider>,
  )
}

describe('SellerPortalLayout', () => {
  beforeEach(() => localStorage.clear())

  it('redirects to sign-in when no seller session is stored', async () => {
    renderLayout()
    expect(await screen.findByText('Sign in page')).toBeInTheDocument()
  })

  it('renders the sidebar and the active page when signed in', async () => {
    localStorage.setItem('seller:session', JSON.stringify({ sellerId: 's1', email: 'seller@example.com' }))
    signInSellerSession({ sellerId: 's1', email: 'seller@example.com' })

    renderLayout('/seller/products')

    expect(await screen.findByText('Products content')).toBeInTheDocument()
    expect(screen.getByText('seller@example.com')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Products/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Orders/ })).not.toHaveAttribute('aria-current')
  })
})
