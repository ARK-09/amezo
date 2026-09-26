import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import { signInSellerSession } from '@/test/msw/fixtures/sellerAuth'
import { server } from '@/test/msw/server'

import { useSellerAuth } from './SellerAuthContext'
import { SellerAuthProvider } from './SellerAuthProvider'

const URL = 'http://localhost:8080/sessions/current'
const STORED = { sellerId: 'seller-1', email: 'stored@example.com' }

function Probe() {
  const { seller, signOut } = useSellerAuth()
  return (
    <div>
      <span data-testid="seller">{seller?.email ?? '(signed out)'}</span>
      <button onClick={signOut}>Sign out</button>
    </div>
  )
}

function renderProvider() {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <SellerAuthProvider>
        <Probe />
      </SellerAuthProvider>
    </QueryClientProvider>,
  )
}

describe('SellerAuthProvider session verification', () => {
  /**
   * The cold-start case that would look broken: a seller opens the portal, the
   * instance is asleep, and the boot-time check fails. Failing to reach the
   * server is not the server saying "you are not signed in", so the stored
   * session stands and the portal keeps rendering - including after the retries
   * are spent.
   */
  it('keeps the stored session when the backend never answers', async () => {
    localStorage.setItem('seller:session', JSON.stringify(STORED))
    let attempts = 0
    server.use(
      http.get(URL, () => {
        attempts++
        return new HttpResponse('<html>Bad gateway</html>', {
          status: 502,
          headers: { 'content-type': 'text/html' },
        })
      }),
    )

    renderProvider()

    // Every attempt spent, so this is the terminal state, not a lucky snapshot
    // taken mid-retry.
    await waitFor(() => expect(attempts).toBe(4), { timeout: 25_000 })
    await waitFor(() => expect(screen.getByTestId('seller')).toHaveTextContent('stored@example.com'))
    expect(localStorage.getItem('seller:session')).not.toBeNull()
  }, 30_000)

  /**
   * The opposite case, and the reason the check is worth making at all: the
   * cookie really is gone. A 401 is definitive, so the stale flag goes and the
   * route guard can send them to sign-in.
   */
  it('signs the seller out when the server says the session is gone', async () => {
    localStorage.setItem('seller:session', JSON.stringify(STORED))
    server.use(
      http.get(URL, () =>
        HttpResponse.json(
          { type: 'https://api/errors/unauthorized', title: 'Unauthorized', status: 401 },
          { status: 401 },
        ),
      ),
    )

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('seller')).toHaveTextContent('(signed out)'))
    expect(localStorage.getItem('seller:session')).toBeNull()
  })

  /**
   * A valid cookie with no local flag - a cleared site-data, a new tab in a
   * different profile. The session is live, so there is nothing to sign in to
   * again.
   */
  it('adopts a live server session when nothing is stored locally', async () => {
    signInSellerSession({ sellerId: 'seller-7', email: 'cookie@example.com' })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('seller')).toHaveTextContent('cookie@example.com'))
    expect(JSON.parse(localStorage.getItem('seller:session')!)).toEqual({
      sellerId: 'seller-7',
      email: 'cookie@example.com',
    })
  })

  /**
   * Signing out has to invalidate the cached identity as well, or the next thing
   * that reads it adopts the session that was just revoked.
   */
  it('does not resurrect the session from cache after signing out', async () => {
    signInSellerSession({ sellerId: 'seller-7', email: 'cookie@example.com' })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('seller')).toHaveTextContent('cookie@example.com'))

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(screen.getByTestId('seller')).toHaveTextContent('(signed out)')
    // Give the effect every chance to run again off the cached value.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByTestId('seller')).toHaveTextContent('(signed out)')
  })
})
