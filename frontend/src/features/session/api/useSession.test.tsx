import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import { signInSellerSession } from '@/test/msw/fixtures/sellerAuth'
import { server } from '@/test/msw/server'

import { useSession } from './useSession'

const URL = 'http://localhost:8080/sessions/current'

function Probe() {
  const session = useSession()
  return (
    <div>
      <span data-testid="status">{session.status}</span>
      <span data-testid="email">{session.data?.email ?? '(none)'}</span>
      <span data-testid="signed-in">{String(session.data !== null && session.data !== undefined)}</span>
    </div>
  )
}

/** The app's real retry configuration, not a test-only one. */
function renderProbe(children: ReactNode = <Probe />) {
  return render(<QueryClientProvider client={createAppQueryClient()}>{children}</QueryClientProvider>)
}

describe('useSession', () => {
  /**
   * 401 is the documented answer for "nobody is signed in". It has to resolve as
   * data, not fail: a header that renders an error for every anonymous visitor is
   * worse than the 404 this replaced.
   */
  it('treats a 401 as "not signed in" rather than an error', async () => {
    let requests = 0
    server.use(http.get(URL, () => { requests++; return HttpResponse.json({ status: 401 }, { status: 401 }) }))

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('success'))
    expect(screen.getByTestId('signed-in')).toHaveTextContent('false')
    // And it is not retried: an answer is an answer.
    expect(requests).toBe(1)
  })

  it('reports the signed-in identity', async () => {
    signInSellerSession({ sellerId: 'seller-9', email: 'seller@example.com' })

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent('seller@example.com'))
    expect(screen.getByTestId('signed-in')).toHaveTextContent('true')
  })

  /**
   * The production bug itself. A missing route is a 404, and a 404 is not a
   * session answer - so it surfaces as an error instead of being laundered into
   * "not signed in", and it is not retried either.
   */
  it('surfaces a 404 as an error instead of silently reporting no session', async () => {
    let requests = 0
    server.use(http.get(URL, () => { requests++; return HttpResponse.json({ type: 'about:blank', title: 'Not Found', status: 404 }, { status: 404 }) }))

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'))
    expect(requests).toBe(1)
  })

  /**
   * Session initialisation across a cold start: the instance is asleep for the
   * first two attempts and awake for the third. The session has to resolve on its
   * own, with no reload and no user action.
   */
  it('resolves the session once the backend wakes up', async () => {
    let attempt = 0
    server.use(
      http.get(URL, () => {
        attempt++
        if (attempt <= 2) {
          return new HttpResponse('<html>Bad gateway</html>', {
            status: 502,
            headers: { 'content-type': 'text/html' },
          })
        }
        return HttpResponse.json({
          identityType: 'SELLER',
          identityId: 'seller-9',
          email: 'awake@example.com',
          fullName: null,
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        })
      }),
    )

    renderProbe()

    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent('awake@example.com'), {
      timeout: 15_000,
    })
    expect(screen.getByTestId('status')).toHaveTextContent('success')
    expect(attempt).toBe(3)
  }, 20_000)
})
