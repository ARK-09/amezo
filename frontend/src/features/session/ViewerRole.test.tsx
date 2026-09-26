import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { SellerAuthProvider } from '@/features/seller-portal/context/SellerAuthContext'
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
 * Amezo signs sellers and buyers in separately, and the buyer-facing screens
 * used to assume anyone signed in was a buyer. The worst of it was My Orders:
 * it fired the buyer-only `GET /api/v1/orders` on a seller's behalf and then
 * printed the resulting 401 as "Session is missing, expired, or invalid" about
 * a session that was perfectly valid.
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
  it('sends a seller to the portal instead of a buyer order history', async () => {
    signInSellerSession({ sellerId: 'seller-1', email: 'shop@example.com' })
    renderAt('/account', <Account />)

    expect(await screen.findByRole('link', { name: /Seller dashboard/ })).toHaveAttribute(
      'href',
      '/seller/dashboard',
    )
    // The card that used to be here led to a page that reported their valid
    // session as expired.
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
  it('explains itself to a seller rather than asking for buyer orders', async () => {
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
    signInSellerSession({ sellerId: 'seller-1', email: 'shop@example.com' })
    renderAt('/orders', <MyOrders />)

    expect(await screen.findByText('This page is for buyer orders')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Go to seller orders/ })).toHaveAttribute(
      'href',
      '/seller/orders',
    )
    // The false report, and the request that produced it, are both gone.
    expect(screen.queryByText("Couldn't load your orders")).not.toBeInTheDocument()
    expect(asked).toBe(false)
  })

  it('still loads a buyer their orders', async () => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'ada@example.com' })
    renderAt('/orders', <MyOrders />)

    expect(await screen.findByText('Signed in as ada@example.com')).toBeInTheDocument()
    expect(screen.queryByText('This page is for buyer orders')).not.toBeInTheDocument()
  })
})

describe('buyer sign-in', () => {
  it('lets a seller sign in as a buyer instead of bouncing them', async () => {
    signInSellerSession({ sellerId: 'seller-1', email: 'shop@example.com' })
    renderAt('/sign-in', <BuyerSignIn />)

    // The form renders straight away; the hint follows the session answer.
    expect(
      await screen.findByText(
        /signed in as a seller. Signing in here gives you a separate buyer account/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(location()).toBe('/sign-in')
  })

  it('still sends a signed-in buyer to their account', async () => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'ada@example.com' })
    renderAt('/sign-in', <BuyerSignIn />)

    await waitFor(() => expect(location()).toBe('/account'))
  })
})
