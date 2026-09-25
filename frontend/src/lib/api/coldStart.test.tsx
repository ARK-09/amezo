import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { BackendWakingBanner } from '@/components/layout/BackendWakingBanner'
import { server } from '@/test/msw/server'

import { apiClient, type ProblemDetail } from './client'
import { createAppQueryClient } from './queryClient'
import { MAX_TRANSIENT_RETRIES, apiErrorMessage } from './transient'

const URL = 'http://localhost:8080/variants'

/**
 * Stands in for any page-level query. /variants is the cart's batch lookup - a
 * real endpoint with a real generated type, so nothing here depends on a route
 * invented for the test.
 */
function Page() {
  const query = useQuery<unknown[], ProblemDetail>({
    queryKey: ['cold-start-probe'],
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/variants', {
        signal,
        params: { query: { ids: 'v-1' } },
      })
      if (error) throw error
      return data
    },
  })

  return (
    <div>
      <BackendWakingBanner />
      {query.isPending && <p>Loading…</p>}
      {query.isSuccess && <p>Loaded {query.data.length} offers</p>}
      {query.isError && <p data-testid="error">{apiErrorMessage(query.error)}</p>}
    </div>
  )
}

function renderPage() {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <Page />
    </QueryClientProvider>,
  )
}

/** The offers body /variants really returns, shape-wise. */
const OFFERS = [{ variantId: 'v-1', label: 'One', price: 10, stockQty: 3, productId: 'p-1', productTitle: 'One' }]

describe('cold start', () => {
  /**
   * Render's gateway page while the instance boots, then the instance answering.
   * The page has to end up showing data - and must never show an error panel on
   * the way there.
   */
  it('rides out a gateway error and renders the data once the instance is up', async () => {
    let attempt = 0
    server.use(
      http.get(URL, () => {
        attempt++
        if (attempt === 1) {
          return new HttpResponse('<html>Bad gateway</html>', {
            status: 502,
            headers: { 'content-type': 'text/html' },
          })
        }
        return HttpResponse.json(OFFERS)
      }),
    )

    renderPage()

    // While retrying, the user is told the server is starting - not that
    // something went wrong.
    expect(await screen.findByRole('status')).toHaveTextContent(/Waking the server up/)
    expect(screen.queryByTestId('error')).not.toBeInTheDocument()

    expect(await screen.findByText('Loaded 1 offers', undefined, { timeout: 10_000 })).toBeInTheDocument()
    // And the banner goes away again once it answered.
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(attempt).toBe(2)
  }, 20_000)

  /** A connection that never answers: the deadline turns it into a retry. */
  it('recovers from a connection that never answers', async () => {
    let attempt = 0
    server.use(
      http.get(URL, () => {
        attempt++
        if (attempt === 1) return HttpResponse.error() // fetch-level failure, as a refused connection is
        return HttpResponse.json(OFFERS)
      }),
    )

    renderPage()

    expect(await screen.findByText('Loaded 1 offers', undefined, { timeout: 10_000 })).toBeInTheDocument()
    expect(attempt).toBe(2)
  }, 20_000)

  it('recovers from a temporary 503', async () => {
    let attempt = 0
    server.use(
      http.get(URL, () => {
        attempt++
        if (attempt === 1) {
          return HttpResponse.json(
            { type: 'about:blank', title: 'Service Unavailable', status: 503 },
            { status: 503 },
          )
        }
        return HttpResponse.json(OFFERS)
      }),
    )

    renderPage()

    expect(await screen.findByText('Loaded 1 offers', undefined, { timeout: 10_000 })).toBeInTheDocument()
    expect(attempt).toBe(2)
  }, 20_000)

  /**
   * The other half of the promise: retries are bounded. A backend that is down
   * for good produces an error that says so, after a fixed number of attempts -
   * not a spinner that never ends.
   */
  it('gives up after a bounded number of attempts and explains why', async () => {
    let attempt = 0
    server.use(
      http.get(URL, () => {
        attempt++
        return HttpResponse.json({ type: 'about:blank', title: 'Bad Gateway', status: 502 }, { status: 502 })
      }),
    )

    renderPage()

    expect(await screen.findByTestId('error', undefined, { timeout: 20_000 })).toHaveTextContent(
      /still be starting up/,
    )
    expect(attempt).toBe(MAX_TRANSIENT_RETRIES + 1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  }, 30_000)

  /**
   * A genuine application error must not be dressed up as a cold start, retried,
   * or delayed behind three backoffs.
   */
  it('shows a 404 immediately, once, with the API wording', async () => {
    let attempt = 0
    server.use(
      http.get(URL, () => {
        attempt++
        return HttpResponse.json(
          { type: 'https://api/errors/not-found', title: 'Not found', status: 404, detail: 'No such variant' },
          { status: 404 },
        )
      }),
    )

    renderPage()

    expect(await screen.findByTestId('error')).toHaveTextContent('No such variant')
    expect(attempt).toBe(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  /** Same for a 500: the application answered, and its answer is the truth. */
  it('does not retry a 500 from the application', async () => {
    let attempt = 0
    server.use(
      http.get(URL, () => {
        attempt++
        return HttpResponse.json(
          { type: 'about:blank', title: 'Internal Server Error', status: 500, detail: 'Null somewhere' },
          { status: 500 },
        )
      }),
    )

    renderPage()

    expect(await screen.findByTestId('error')).toHaveTextContent('Null somewhere')
    expect(attempt).toBe(1)
  })
})
