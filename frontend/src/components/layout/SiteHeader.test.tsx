import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'

import { SiteHeader } from '@/components/layout/SiteHeader'
import { CartProvider } from '@/features/cart/context/CartContext'
import { SellerAuthProvider } from '@/features/seller-portal/context/SellerAuthProvider'
import { signInBuyerSession, signInSellerSession } from '@/test/msw/fixtures/sellerAuth'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderHeader(initialEntry = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      {/* The real app wraps the header in this; leaving it out would test a tree
          the app never renders, and the header reads the seller flag from it. */}
      <SellerAuthProvider>
      <CartProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <SiteHeader />
          <LocationProbe />
        </MemoryRouter>
      </CartProvider>
      </SellerAuthProvider>
    </QueryClientProvider>,
  )
}

function location() {
  return screen.getByTestId('location').textContent
}

describe('SiteHeader', () => {
  it('sends a search from any page to /search', async () => {
    renderHeader('/products/11111111-1111-1111-1111-111111111111')

    await userEvent.type(screen.getByLabelText('Search products'), 'laptop')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(location()).toBe('/search?q=laptop')
  })

  it('keeps the filters already applied when searching from /search', async () => {
    renderHeader('/search?category=Electronics&page=2&q=laptop')

    const input = screen.getByLabelText('Search products')
    expect(input).toHaveValue('laptop')

    await userEvent.clear(input)
    await userEvent.type(input, 'keyboard')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    // filters survive, paging restarts
    expect(location()).toBe('/search?category=Electronics&q=keyboard')
  })

  it('drops the term but keeps the other filters when the box is cleared', async () => {
    renderHeader('/search?q=laptop&inStockOnly=true')

    await userEvent.clear(screen.getByLabelText('Search products'))
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect(location()).toBe('/search?inStockOnly=true')
  })

  /** The system list, linked by slug - not a guess derived from search results. */
  it('lists the system categories as nav links', async () => {
    renderHeader()

    expect(await screen.findByRole('link', { name: 'Electronics' })).toHaveAttribute(
      'href',
      '/search?category=electronics',
    )
    expect(screen.getByRole('link', { name: 'Apparel' })).toHaveAttribute(
      'href',
      '/search?category=apparel',
    )
  })

  /**
   * The chevron used to sit on a plain link with no menu behind it, which is the
   * whole reason the control read as broken.
   */
  it('opens the All categories menu and links each one by slug', async () => {
    renderHeader()

    const trigger = screen.getByRole('button', { name: /All categories/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger)

    // The menu is portaled out of the header and is modal, so the rest of the page
    // leaves the accessibility tree while it is open - it is found through the menu
    // role, not by looking inside the trigger's parent.
    const menu = within(await screen.findByRole('menu'))
    expect(await menu.findByRole('menuitem', { name: 'Kitchen' })).toHaveAttribute(
      'href',
      '/search?category=kitchen',
    )
    expect(menu.getByRole('menuitem', { name: 'Clothing' })).toHaveAttribute(
      'href',
      '/search?category=clothing',
    )
    expect(menu.getByRole('menuitem', { name: 'Browse everything' })).toHaveAttribute(
      'href',
      '/search',
    )
  })

  it('closes the All categories menu on Escape', async () => {
    renderHeader()

    const trigger = screen.getByRole('button', { name: /All categories/ })
    await userEvent.click(trigger)
    expect(await screen.findByRole('menu')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    // Focus comes back to the trigger, which is the part a hand-rolled menu missed.
    expect(screen.getByRole('button', { name: /All categories/ })).toHaveFocus()
  })

  /**
   * It used to offer five hardcoded Gulf cities defaulting to Dubai. It is a country
   * now, from the same list checkout validates against, and what is stored is the ISO
   * code - a city name in that slot would have become "Du" in an address.
   */
  it('picks a delivery country from the server list and persists the ISO code', async () => {
    renderHeader()

    await userEvent.click(await screen.findByRole('combobox', { name: 'Delivery country' }))
    await userEvent.click(await screen.findByRole('option', { name: 'United Kingdom' }))

    expect(screen.getByRole('combobox', { name: 'Delivery country' })).toHaveTextContent(
      'Deliver to United Kingdom',
    )
    expect(localStorage.getItem('delivery-country:v1')).toBe('GB')
  })

  it('does not default to any country before one is chosen', async () => {
    renderHeader()

    expect(await screen.findByRole('combobox', { name: 'Delivery country' })).toHaveTextContent(
      'Select a country',
    )
    expect(localStorage.getItem('delivery-country:v1')).toBeNull()
  })

  /** The email used to be printed beside the avatar, derived from the address itself. */
  it('shows only the avatar for a signed-in buyer, never their email', async () => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'ada.lovelace@example.com' })
    renderHeader()

    const account = await screen.findByRole('link', { name: 'Your account' })
    expect(account).toHaveAttribute('href', '/account')
    expect(screen.queryByText(/ada\.lovelace@example\.com/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ada Lovelace/)).not.toBeInTheDocument()
  })

  it('links the wordmark home and offers the seller entry point', () => {
    renderHeader('/checkout')

    expect(screen.getByRole('link', { name: 'Amezo home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Sell on Amezo' })).toHaveAttribute(
      'href',
      '/seller/sign-in',
    )
  })
})

describe('SiteHeader seller entry point', () => {
  it('sends a signed-in seller to their portal, not to a pitch to become one', async () => {
    signInSellerSession({ sellerId: 'seller-1', email: 'shop@example.com' })
    renderHeader()

    expect(await screen.findByRole('link', { name: /Seller dashboard/ })).toHaveAttribute(
      'href',
      '/seller/dashboard',
    )
    expect(screen.queryByRole('link', { name: 'Sell on Amezo' })).not.toBeInTheDocument()
  })

  /**
   * The header falls back to the portal's local flag when the server reports no
   * session, which is what makes demo mode work - there the portal signs in
   * locally and never sets a cookie. That fallback must not let a leftover flag
   * claim sellerhood for real: with a live backend the provider evicts it, and
   * the header goes back to pitching.
   */
  it('stops treating a leftover local flag as a seller once the server denies it', async () => {
    localStorage.setItem(
      'seller:session',
      JSON.stringify({ sellerId: 'seller-1', email: 'shop@example.com' }),
    )
    renderHeader()

    expect(await screen.findByRole('link', { name: 'Sell on Amezo' })).toHaveAttribute(
      'href',
      '/seller/sign-in',
    )
  })

  // A real cookie is the better answer than a flag left in localStorage.
  it('treats a buyer cookie as a buyer even with a stale seller flag', async () => {
    localStorage.setItem(
      'seller:session',
      JSON.stringify({ sellerId: 'seller-1', email: 'shop@example.com' }),
    )
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'ada@example.com' })
    renderHeader()

    expect(await screen.findByRole('link', { name: 'Your account' })).toHaveAttribute(
      'href',
      '/account',
    )
    expect(screen.queryByRole('link', { name: /Seller dashboard/ })).not.toBeInTheDocument()
  })

  it('does not offer a seller the buyer account page', async () => {
    signInSellerSession({ sellerId: 'seller-1', email: 'shop@example.com' })
    renderHeader()

    await screen.findByRole('link', { name: /Seller dashboard/ })
    expect(screen.queryByRole('link', { name: 'Your account' })).not.toBeInTheDocument()
  })
})
