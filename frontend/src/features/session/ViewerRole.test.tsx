import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { SellerAuthProvider } from '@/features/seller-portal/context/SellerAuthProvider'
import { createAppQueryClient } from '@/lib/api/queryClient'
import { Account } from '@/pages/Account'
import { BuyerSignIn } from '@/pages/BuyerSignIn'
import { MyOrders } from '@/pages/MyOrders'
import {
  clearSellerSession,
  signInBuyerSession,
  signInSellerSession,
} from '@/test/msw/fixtures/sellerAuth'
import { server } from '@/test/msw/server'

/**
 * Who the buyer-facing screens think is looking, now that one email address is ONE
 * ACCOUNT that may buy and sell.
 *
 * Two bugs bracket these tests. The first was assuming anyone signed in was a buyer:
 * My Orders fired the buyer-only `GET /api/v1/orders` on a seller's behalf and printed
 * the resulting 401 as "Session is missing, expired, or invalid" about a session that
 * was perfectly valid. The fix for it was a single `role`, and that became the second
 * bug - a seller who also bought things was told this page was not for them, over the
 * orders they had actually placed.
 *
 * So the question every screen here asks is "does this session identify a buyer /  a
 * seller", not "which of the two is it", and both can be yes.
 */

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderAt(path: string, element: React.ReactNode) {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        {/* The real app wraps every route in this. */}
        <SellerAuthProvider>
          <Routes>
            <Route path={path} element={element} />
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

afterEach(() => clearSellerSession())

describe('the account page', () => {
  it('offers both halves to someone who buys and sells on one address', async () => {
    signInSellerSession({ sellerId: 'seller-1', email: 'shop@example.com' })
    renderAt('/account', <Account />)

    expect(await screen.findByRole('link', { name: /Seller dashboard/ })).toHaveAttribute(
      'href',
      '/seller/dashboard',
    )
    // And their own purchases, which an either/or used to hide from them.
    expect(screen.getByRole('link', { name: /Your orders/ })).toHaveAttribute('href', '/orders')
  })

  it('withholds the order history from a seller-only session', async () => {
    signInSellerSession({ sellerId: 'seller-1', email: 'shop@example.com', withBuyerIdentity: false })
    renderAt('/account', <Account />)

    expect(await screen.findByRole('link', { name: /Seller dashboard/ })).toBeInTheDocument()
    // /orders is buyer-only on the server, so offering it here is what sent them to a
    // page that reported their valid session as expired.
    expect(screen.queryByRole('link', { name: /Your orders/ })).not.toBeInTheDocument()
  })

  it('still offers a buyer their orders', async () => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'ada@example.com' })
    renderAt('/account', <Account />)

    expect(await screen.findByRole('link', { name: /Your orders/ })).toHaveAttribute(
      'href',
      '/orders',
    )
    expect(screen.queryByRole('link', { name: /Seller dashboard/ })).not.toBeInTheDocument()
  })
})

describe('my orders', () => {
  it('asks nothing and explains itself when the session is not a buyer at all', async () => {
    let asked = false
    server.use(
      http.get('http://localhost:8080/api/v1/orders', () => {
        asked = true
        return HttpResponse.json(
          { title: 'Unauthorized', detail: 'Session is missing, expired, or invalid' },
          { status: 401 },
        )
      }),
    )
    signInSellerSession({ sellerId: 'seller-1', email: 'shop@example.com', withBuyerIdentity: false })
    renderAt('/orders', <MyOrders />)

    expect(await screen.findByText('Nothing bought on this account yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Go to seller orders/ })).toHaveAttribute(
      'href',
      '/seller/orders',
    )
    // The false report, and the request that produced it, are both gone.
    expect(screen.queryByText("Couldn't load your orders")).not.toBeInTheDocument()
    expect(asked).toBe(false)
  })

  it('loads a seller their own purchases, because one address is one account', async () => {
    signInSellerSession({ sellerId: 'seller-1', email: 'shop@example.com' })
    renderAt('/orders', <MyOrders />)

    // The list, not the "this page is not for you" panel - which is what a single
    // seller-or-buyer role showed them over the orders they had placed.
    expect(await screen.findByText(/orders on file/)).toBeInTheDocument()
    expect(screen.queryByText('Nothing bought on this account yet')).not.toBeInTheDocument()
  })

  it('still loads a buyer their orders', async () => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'ada@example.com' })
    renderAt('/orders', <MyOrders />)

    // The header counts the buyer's own history, which only a buyer request answers.
    expect(await screen.findByText(/orders on file/)).toBeInTheDocument()
    expect(screen.queryByText('Nothing bought on this account yet')).not.toBeInTheDocument()
  })

  it('sends a visitor to sign in rather than reporting a failed request', async () => {
    renderAt('/orders', <MyOrders />)

    expect(await screen.findByText('Sign in to see your orders')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
  })
})

describe('buyer sign-in', () => {
  it('offers the form to a seller-only session, and says the address is what joins them', async () => {
    signInSellerSession({ sellerId: 'seller-1', email: 'shop@example.com', withBuyerIdentity: false })
    renderAt('/sign-in', <BuyerSignIn />)

    // The form renders straight away; the hint follows the session answer.
    expect(
      await screen.findByText(/same email you sell with and it stays one account/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(location()).toBe('/sign-in')
  })

  it('sends a seller who already buys to their account instead of asking again', async () => {
    signInSellerSession({ sellerId: 'seller-1', email: 'shop@example.com' })
    renderAt('/sign-in', <BuyerSignIn />)

    // They can already buy, so there is nothing to sign in to. Reading the role here -
    // which prefers seller - left them on this form forever.
    await waitFor(() => expect(location()).toBe('/account'))
  })

  it('still sends a signed-in buyer to their account', async () => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'ada@example.com' })
    renderAt('/sign-in', <BuyerSignIn />)

    await waitFor(() => expect(location()).toBe('/account'))
  })
})
