import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { SellerAuthProvider } from '@/features/seller-portal/context/SellerAuthProvider'
import { signInSellerSession } from '@/test/msw/fixtures/sellerAuth'

import { SellerPortalLayout } from './SellerPortalLayout'

function renderLayout(initialEntry = '/seller/products') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <SellerAuthProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/seller/sign-in" element={<div>Sign in page</div>} />
            <Route path="/seller" element={<SellerPortalLayout />}>
              <Route path="products" element={<div>Products content</div>} />
              <Route path="orders" element={<div>Orders content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </SellerAuthProvider>
    </QueryClientProvider>,
  )
}

describe('SellerPortalLayout', () => {
  beforeEach(() => localStorage.clear())

  it('redirects to sign-in when no seller session is stored', async () => {
    renderLayout()
    expect(await screen.findByText('Sign in page')).toBeInTheDocument()
  })

  it('renders the sidebar and the active page when signed in', async () => {
    localStorage.setItem('seller:session', JSON.stringify({ sellerId: 's1', email: 'seller@example.com' }))
    signInSellerSession({ sellerId: 's1', email: 'seller@example.com' })

    renderLayout('/seller/products')

    expect(await screen.findByText('Products content')).toBeInTheDocument()
    expect(screen.getByText('seller@example.com')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Products/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Orders/ })).not.toHaveAttribute('aria-current')
  })

  /**
   * Structural, not cosmetic: the page used to scroll as a whole document, so
   * the sidebar and the demo banner scrolled away with a long table. Asserted
   * on the tree rather than by eye because jsdom does not lay anything out -
   * what this can check is that the outlet sits inside a scroll container the
   * sidebar is outside of, which is the property the fix turns on.
   */
  it('puts the routed page in a scroll container the chrome sits outside of', async () => {
    localStorage.setItem('seller:session', JSON.stringify({ sellerId: 's1', email: 'seller@example.com' }))
    signInSellerSession({ sellerId: 's1', email: 'seller@example.com' })

    const { container } = renderLayout('/seller/products')
    const page = await screen.findByText('Products content')

    const well = page.parentElement!
    expect(well.className).toContain('overflow-y-auto')
    // Without `relative` the portal's many sr-only spans (position: absolute)
    // resolve against the initial containing block, escape this container
    // entirely, and give the document a scrollHeight taller than the viewport.
    expect(well.className).toContain('relative')

    // The shell clips, so nothing outside the well can scroll the page.
    const shell = container.firstElementChild!
    expect(shell.className).toContain('h-screen')
    expect(shell.className).toContain('overflow-hidden')

    // The sidebar is a sibling of the scrolling region, not inside it.
    const sidebar = container.querySelector('aside')!
    expect(well.contains(sidebar)).toBe(false)
    expect(screen.getByText('seller@example.com')).not.toBe(null)
  })

  it('gives the routed page the portal gutter, so no page has to add its own', async () => {
    localStorage.setItem('seller:session', JSON.stringify({ sellerId: 's1', email: 'seller@example.com' }))
    signInSellerSession({ sellerId: 's1', email: 'seller@example.com' })

    renderLayout('/seller/products')
    const well = (await screen.findByText('Products content')).parentElement!
    expect(well.className).toContain('p-6')
  })
})
