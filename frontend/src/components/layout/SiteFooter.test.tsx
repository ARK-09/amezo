import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { SiteFooter } from '@/components/layout/SiteFooter'

function renderFooter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SiteFooter', () => {
  it('links to the browse, category and seller surfaces', async () => {
    renderFooter()

    expect(screen.getByRole('link', { name: 'All products' })).toHaveAttribute('href', '/search')
    expect(screen.getByRole('link', { name: 'New arrivals' })).toHaveAttribute(
      'href',
      '/search?sort=newest',
    )
    expect(screen.getByRole('link', { name: 'Start selling' })).toHaveAttribute(
      'href',
      '/seller/sign-in',
    )
    expect(await screen.findByRole('link', { name: 'Kitchen' })).toHaveAttribute(
      'href',
      '/search?category=Kitchen',
    )
  })

  it('shows the current year in the copyright line', () => {
    renderFooter()
    expect(
      screen.getByText(`© ${new Date().getFullYear()} Amezo. All rights reserved.`),
    ).toBeInTheDocument()
  })
})
