import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import { apiClient } from '@/lib/api/client'
import { server } from '@/test/msw/server'

import { SprinterLoader } from './sprinter-loader'

/**
 * What the loader is allowed to say, and when.
 *
 * The rule under test is that it never claims progress it cannot see: no
 * percentage, no bar, and no "the server is asleep" until a request has actually
 * failed and is being retried. What it does claim is elapsed time, which it can
 * measure, and that is all.
 */

function renderLoader(client = createAppQueryClient(), label?: string) {
  return render(
    <QueryClientProvider client={client}>
      <SprinterLoader label={label} />
    </QueryClientProvider>,
  )
}

describe('SprinterLoader', () => {
  it('shows the mark and the label, and says nothing else at first', () => {
    renderLoader(undefined, 'Opening your portal')

    const loader = screen.getByRole('status', { name: 'Opening your portal' })
    expect(loader).toBeInTheDocument()
    expect(screen.getByText('Opening your portal')).toBeInTheDocument()
    // The running mark itself, drawn in the brand accent by the class that
    // colours every stroke of it.
    expect(loader.querySelector('[data-slot="sprinter"]')).toHaveClass('text-primary')
    // A fast load ends here and never shows a second line, which is the whole
    // reason the second line waits.
    expect(screen.queryByText(/Still fetching/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Waking the server/)).not.toBeInTheDocument()
  })

  it('admits it is taking a moment once it has been a moment', async () => {
    renderLoader()

    expect(await screen.findByText(/Still fetching/, {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('names the cold start only once a request is actually being retried', async () => {
    // A 502 with an HTML body: a sleeping instance answering through its proxy,
    // which is what the retry policy treats as infrastructure rather than as an
    // API error.
    server.use(
      http.get('http://localhost:8080/categories', () =>
        new HttpResponse('<html>Bad gateway</html>', {
          status: 502,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    )
    const client = createAppQueryClient()
    // A real query, failing the way a cold start fails - not a flag set by hand.
    void client.fetchQuery({
      queryKey: ['categories'],
      queryFn: async () => {
        const { data, error } = await apiClient.GET('/categories')
        if (error) throw error
        return data
      },
    })

    renderLoader(client)

    expect(
      await screen.findByText(/Waking the server up/, {}, { timeout: 5000 }),
    ).toBeInTheDocument()
    // The wait is described, never measured: a request has no percentage to report.
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument())
  })
})
