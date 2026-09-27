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

function Probe() {
  const { seller, isUnknown, signOut } = useSellerAuth()
  return (
    <div>
      <span data-testid="seller">{seller?.email ?? '(signed out)'}</span>
      {/* The third state, and the whole point of it: not signed in is not the same
          answer as nobody has said yet. */}
      <span data-testid="known">{isUnknown ? 'unknown' : 'known'}</span>
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
   * instance is asleep, and every retry comes back 502.
   *
   * Failing to reach the server is NOT the server saying "you are not signed in", so
   * the answer stays unknown rather than becoming signed-out - which is what stops
   * SellerPortalLayout bouncing them to the sign-in page while the instance wakes.
   * This used to be held up by a localStorage copy of the session; there is no second
   * copy any more, so the distinction has to live in the state itself.
   */
  it('reports the session as unknown, not gone, when the backend never answers', async () => {
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
    await waitFor(() => expect(screen.getByTestId('known')).toHaveTextContent('unknown'))
  }, 30_000)

  /**
   * The opposite case, and the reason the check is worth making at all: the
   * cookie really is gone. A 401 is definitive, so the stale flag goes and the
   * route guard can send them to sign-in.
   */
  it('signs the seller out when the server says the session is gone', async () => {
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
    // Answered, and the answer is nobody - which IS a redirect to sign-in.
    expect(screen.getByTestId('known')).toHaveTextContent('known')
  })

  /**
   * A live cookie in a browser this app has never run in - cleared site data, a new
   * profile, a second device. There is nothing to restore and nothing to sign in to
   * again: the cookie is the session.
   */
  it('reports the seller behind a live cookie', async () => {
    signInSellerSession({ sellerId: 'seller-7', email: 'cookie@example.com' })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('seller')).toHaveTextContent('cookie@example.com'))
    // Nothing is written anywhere else. The session query is the only copy.
    expect(localStorage.getItem('seller:session')).toBeNull()
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
