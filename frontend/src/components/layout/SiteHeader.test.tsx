import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'

import { SiteHeader } from '@/components/layout/SiteHeader'
import { CartProvider } from '@/features/cart/context/CartContext'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderHeader(initialEntry = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <SiteHeader />
          <LocationProbe />
        </MemoryRouter>
      </CartProvider>
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

  it('lists the catalog categories as nav links', async () => {
    renderHeader()

    expect(await screen.findByRole('link', { name: 'Electronics' })).toHaveAttribute(
      'href',
      '/search?category=Electronics',
    )
    expect(screen.getByRole('link', { name: /All categories/ })).toHaveAttribute('href', '/search')
  })

  it('remembers the delivery city across visits', async () => {
    renderHeader()

    await userEvent.click(screen.getByRole('button', { name: /Deliver to Dubai/ }))
    await userEvent.click(screen.getByRole('option', { name: 'Sharjah' }))

    expect(screen.getByRole('button', { name: /Deliver to Sharjah/ })).toBeInTheDocument()
    expect(localStorage.getItem('delivery-city:v1')).toBe('Sharjah')
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
