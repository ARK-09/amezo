import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { SellerAuthProvider } from '@/features/seller-portal/context/SellerAuthProvider'
import { issueMagicLinkToken } from '@/test/msw/fixtures/sellerAuth'

import { SellerVerify } from './SellerVerify'

function renderPage(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <SellerAuthProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/seller/verify" element={<SellerVerify />} />
            <Route path="/seller/products" element={<div>Products page</div>} />
            <Route path="/seller/sign-in" element={<div>Sign in page</div>} />
          </Routes>
        </MemoryRouter>
      </SellerAuthProvider>
    </QueryClientProvider>,
  )
}

describe('SellerVerify', () => {
  it('signs in and redirects to the portal for a valid token', async () => {
    const token = issueMagicLinkToken('seller@example.com')

    renderPage(`/seller/verify?token=${token}`)

    expect(await screen.findByText('Products page')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('seller:session')!)).toEqual(
      expect.objectContaining({ email: 'seller@example.com' }),
    )
  })

  it('shows an error and a way back to sign-in for an invalid token', async () => {
    renderPage('/seller/verify?token=not-a-real-token')

    expect(await screen.findByText('This link is invalid or expired')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'Back to sign in' }))
    expect(await screen.findByText('Sign in page')).toBeInTheDocument()
  })

  it('shows an error when the link has no token', async () => {
    renderPage('/seller/verify')
    expect(await screen.findByText('This link is missing a token.')).toBeInTheDocument()
  })
})
