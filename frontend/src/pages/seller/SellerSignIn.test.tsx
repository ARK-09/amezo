import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { server } from '@/test/msw/server'

import { SellerSignIn } from './SellerSignIn'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SellerSignIn />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SellerSignIn', () => {
  it('sends a magic link and shows a confirmation message', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText('Email'), 'seller@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(await screen.findByText('Check your email')).toBeInTheDocument()
    expect(screen.getByText(/seller@example\.com/)).toBeInTheDocument()
  })

  it('shows an error and stays on the form when the request fails', async () => {
    server.use(
      http.post(
        'http://localhost:8080/auth/seller/magic-link',
        () => HttpResponse.json({ type: 'about:blank', title: 'Error', status: 500 }, { status: 500 }),
        { once: true },
      ),
    )
    renderPage()

    await userEvent.type(screen.getByLabelText('Email'), 'seller@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument()
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument()
  })
})
