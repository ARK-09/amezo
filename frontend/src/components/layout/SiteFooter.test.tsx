import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { SiteFooter } from '@/components/layout/SiteFooter'

function renderFooter() {
  return render(
    <MemoryRouter>
      <SiteFooter />
    </MemoryRouter>,
  )
}

describe('SiteFooter', () => {
  it('links to the browse and seller surfaces', () => {
    renderFooter()

    expect(screen.getByRole('link', { name: 'All products' })).toHaveAttribute('href', '/search')
    expect(screen.getByRole('link', { name: 'New arrivals' })).toHaveAttribute(
      'href',
      '/search?sort=newest',
    )
    expect(screen.getByRole('link', { name: 'Sell on Amezo' })).toHaveAttribute(
      'href',
      '/seller/sign-in',
    )
  })

  it('shows the current year alongside the wordmark', () => {
    renderFooter()
    expect(screen.getByText(`© ${new Date().getFullYear()} Amezo`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Amezo home' })).toHaveAttribute('href', '/')
  })
})
