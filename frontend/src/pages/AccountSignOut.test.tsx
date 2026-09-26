import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'

import { Account } from '@/pages/Account'
import { SellerAuthProvider } from '@/features/seller-portal/context/SellerAuthContext'
import { createAppQueryClient } from '@/lib/api/queryClient'
import { currentSessionIdentity, signInBuyerSession, signInSellerSession } from '@/test/msw/fixtures/sellerAuth'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

/**
 * SellerAuthProvider wraps the real app, so it wraps this too - it is what evicts
 * the persisted seller flag when the session query resolves to null, and leaving it
 * out would test a tree the app never renders.
 */
function renderAccount() {
  const queryClient = createAppQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/account']}>
        <SellerAuthProvider>
          <Routes>
            <Route path="/account" element={<Account />} />
            <Route path="*" element={<p>elsewhere</p>} />
          </Routes>
          <LocationProbe />
        </SellerAuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function location() {
  return screen.getByTestId('location').textContent
}

describe('buyer sign-out', () => {
  it('revokes the session, clears client state, and lands on the home page', async () => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'ada@example.com' })
    renderAccount()

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(location()).toBe('/'))
    // The session is revoked server-side, not just forgotten by the client. This is
    // what makes a reload stay signed out.
    expect(currentSessionIdentity()).toBeNull()
  })

  /**
   * The bug this endpoint exists for. /account is reachable by a seller session, but
   * sign-out called the buyer-scoped DELETE /auth/buyer/session, which is
   * hasRole("BUYER") - so a seller got a 403, the mutation rejected, and the click
   * did nothing at all. It must work for both identity types.
   */
  it('works for a seller signed in on the buyer account page', async () => {
    signInSellerSession({ sellerId: 'seller-1', email: 'seller@example.com' })
    localStorage.setItem(
      'seller:session',
      JSON.stringify({ sellerId: 'seller-1', email: 'seller@example.com' }),
    )
    renderAccount()

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(location()).toBe('/'))
    expect(currentSessionIdentity()).toBeNull()
    // The persisted flag has to go with it: left behind, the next page load reads it
    // and renders as signed in again - which is exactly the "refresh brings me back"
    // half of the report.
    await waitFor(() => expect(localStorage.getItem('seller:session')).toBeNull())
  })

  it('does not bounce the signed-out user to the sign-in page', async () => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'ada@example.com' })
    renderAccount()

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(location()).toBe('/'))
    expect(location()).not.toBe('/sign-in')
  })
})
