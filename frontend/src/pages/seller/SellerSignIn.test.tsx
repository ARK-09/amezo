import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { SellerAuthProvider } from '@/features/seller-portal/context/SellerAuthProvider'
import { clearSellerSession, setDemoEmail, signInSellerSession } from '@/test/msw/fixtures/sellerAuth'
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
  afterEach(() => {
    localStorage.clear()
    clearSellerSession()
  })

  it('sends a magic link and shows a confirmation message', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText('Email'), 'seller@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(await screen.findByText('Check your email')).toBeInTheDocument()
    expect(screen.getByText(/seller@example\.com/)).toBeInTheDocument()
  })

  /**
   * An application failure: the API reached its own code and answered. Its
   * ProblemDetail detail is more specific than any wording this page could
   * invent, so that is what the seller reads.
   */
  it('shows an error and stays on the form when the request fails', async () => {
    server.use(
      http.post(
        'http://localhost:8080/auth/seller/magic-link',
        () =>
          HttpResponse.json(
            {
              type: 'https://api/errors/email-delivery',
              title: 'Bad Gateway',
              status: 500,
              detail: "Couldn't send the sign-in email",
            },
            { status: 500 },
          ),
        { once: true },
      ),
    )
    renderPage()

    await userEvent.type(screen.getByLabelText('Email'), 'seller@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(await screen.findByText("Couldn't send the sign-in email")).toBeInTheDocument()
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument()
  })

  /**
   * The same form against a sleeping Render instance. Mutations deliberately
   * don't retry (a resent magic link is a second email), so the page has to say
   * what happened well enough that pressing the button again is the obvious next
   * move - not "Something went wrong", and not a raw 502.
   */
  it('explains a cold start rather than reporting a generic failure', async () => {
    server.use(
      http.post(
        'http://localhost:8080/auth/seller/magic-link',
        () => new HttpResponse('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }),
        { once: true },
      ),
    )
    renderPage()

    await userEvent.type(screen.getByLabelText('Email'), 'seller@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send magic link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/still be starting up/)
    expect(screen.getByLabelText('Email')).toHaveValue('seller@example.com')
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
    // The cookie behind the flag, so the boot-time check confirms the session
    // instead of answering 401 and signing this seller out again.
    signInSellerSession({ sellerId: 'seller-1', email: 'seller@example.com' })

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

  /**
   * The demo account. An instance with no working email provider cannot let anybody
   * in - every sign-in here is a magic link - so the ONE configured address gets its
   * token in the response instead, and this walks it through the same /verify route an
   * emailed link opens. See the backend's identity/DemoAccount for why that is narrow
   * enough to be safe.
   */
  describe('the demo address', () => {
    it('redeems the token it is handed instead of naming an inbox', async () => {
      setDemoEmail('demo@amezo.com')
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={queryClient}>
          <SellerAuthProvider>
            <MemoryRouter initialEntries={['/seller/sign-in']}>
              <Routes>
                <Route path="/seller/sign-in" element={<SellerSignIn />} />
                {/* Stands in for SellerVerify, asserting only that the token arrived
                    here - that screen's own test covers what it does with one. */}
                <Route
                  path="/seller/verify"
                  element={<VerifyProbe />}
                />
              </Routes>
            </MemoryRouter>
          </SellerAuthProvider>
        </QueryClientProvider>,
      )

      await userEvent.type(screen.getByLabelText('Email'), 'demo@amezo.com')
      await userEvent.click(screen.getByRole('button', { name: 'Send magic link' }))

      // Straight to verify with a token, rather than "Check your email" for a mail
      // that was deliberately never sent.
      expect(await screen.findByTestId('verify-token')).toHaveTextContent(/^mock-token-/)
      expect(screen.queryByText('Check your email')).not.toBeInTheDocument()
    })

    it('leaves every other address on the emailed path', async () => {
      setDemoEmail('demo@amezo.com')
      renderPage()

      // One character different, and it is not the demo address: the match is on the
      // whole address, never a domain or a pattern that could admit a second one.
      await userEvent.type(screen.getByLabelText('Email'), 'demo2@amezo.com')
      await userEvent.click(screen.getByRole('button', { name: 'Send magic link' }))

      expect(await screen.findByText('Check your email')).toBeInTheDocument()
    })

    it('does nothing special when no demo address is configured', async () => {
      renderPage()

      await userEvent.type(screen.getByLabelText('Email'), 'demo@amezo.com')
      await userEvent.click(screen.getByRole('button', { name: 'Send magic link' }))

      // Unset by default, so there is no demo address at all - not even this one.
      expect(await screen.findByText('Check your email')).toBeInTheDocument()
    })
  })
})

/** Reads the token out of the verify URL, so the test can assert one arrived. */
function VerifyProbe() {
  const [params] = useSearchParams()
  return <p data-testid="verify-token">{params.get('token')}</p>
}
