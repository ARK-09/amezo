import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { SiteFooter } from '@/components/layout/SiteFooter'
import { SellerAuthProvider } from '@/features/seller-portal/context/SellerAuthContext'
import { clearSellerSession, signInSellerSession } from '@/test/msw/fixtures/sellerAuth'

function renderFooter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      {/* The real app wraps the footer in this, and the footer reads the seller
          flag through it. */}
      <SellerAuthProvider>
        <MemoryRouter>
          <SiteFooter />
        </MemoryRouter>
      </SellerAuthProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => clearSellerSession())

describe('SiteFooter', () => {
  it('links to the browse and seller surfaces', async () => {
    renderFooter()

    expect(screen.getByRole('link', { name: 'All products' })).toHaveAttribute('href', '/search')
    expect(screen.getByRole('link', { name: 'New arrivals' })).toHaveAttribute(
      'href',
      '/search?sort=newest',
    )
    expect(await screen.findByRole('link', { name: 'Sell on Amezo' })).toHaveAttribute(
      'href',
      '/seller/sign-in',
    )
  })

  it('offers the portal, not a sales pitch, to a signed-in seller', async () => {
    signInSellerSession({ sellerId: crypto.randomUUID(), email: 'shop@example.com' })
    renderFooter()

    expect(await screen.findByRole('link', { name: 'Seller dashboard' })).toHaveAttribute(
      'href',
      '/seller/dashboard',
    )
    expect(screen.queryByRole('link', { name: 'Sell on Amezo' })).not.toBeInTheDocument()
  })

  it('shows the current year alongside the wordmark', () => {
    renderFooter()
    expect(screen.getByText(`© ${new Date().getFullYear()} Amezo`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Amezo home' })).toHaveAttribute('href', '/')
  })
})
