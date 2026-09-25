import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { SellerAuthProvider } from '@/features/seller-portal/context/SellerAuthContext'
import { server } from '@/test/msw/server'

import { SellerSignIn } from './SellerSignIn'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <SellerAuthProvider>
        <MemoryRouter>
          <SellerSignIn />
        </MemoryRouter>
      </SellerAuthProvider>
    </QueryClientProvider>,
  )
}

describe('SellerSignIn', () => {
  afterEach(() => localStorage.clear())

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
  /**
   * Nobody should be asked for an email they've already signed in with. The
   * session flag is the same localStorage one SellerPortalLayout guards on.
   */
  it('redirects to the product list when already signed in', async () => {
    localStorage.setItem(
      'seller:session',
      JSON.stringify({ sellerId: 'seller-1', email: 'seller@example.com' }),
    )

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <SellerAuthProvider>
          <MemoryRouter initialEntries={['/seller/sign-in']}>
            <Routes>
              <Route path="/seller/sign-in" element={<SellerSignIn />} />
              <Route path="/seller/products" element={<h1>Your products</h1>} />
            </Routes>
          </MemoryRouter>
        </SellerAuthProvider>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'Your products' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })

  it('still shows the form when not signed in', () => {
    renderPage()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })
})
