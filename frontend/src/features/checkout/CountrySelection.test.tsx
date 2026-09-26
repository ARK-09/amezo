import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartContext'
import { createAppQueryClient } from '@/lib/api/queryClient'
import { STORAGE_KEY } from '@/features/cart/storage'
import { Checkout } from '@/pages/Checkout'
import { server } from '@/test/msw/server'

const HEADPHONES_VARIANT_ID = '11111111-1111-1111-1111-111111111111-v1'

function renderCheckout() {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <CartProvider>
        <MemoryRouter initialEntries={['/checkout']}>
          <Checkout />
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

describe('delivery country', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ variantId: HEADPHONES_VARIANT_ID, quantity: 1, priceWhenAdded: 129.99 }]),
    )
  })

  /** There is no field to type a country code into any more. */
  it('offers a selector rather than a text field', async () => {
    renderCheckout()

    const control = await screen.findByRole('combobox', { name: 'Country' })
    expect(control).toBeInTheDocument()
    expect(control.tagName).toBe('BUTTON')
    expect(screen.queryByLabelText('Country (2-letter code)')).not.toBeInTheDocument()
  })

  it('lists countries by name and is searchable', async () => {
    renderCheckout()
    await userEvent.click(await screen.findByRole('combobox', { name: 'Country' }))

    await userEvent.type(screen.getByRole('textbox', { name: 'Search country' }), 'united')

    expect(screen.getByRole('option', { name: 'United Arab Emirates' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'United Kingdom' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'United States' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Japan' })).not.toBeInTheDocument()
  })

  /**
   * "UK" is the code people type and it is not the ISO one. The selector simply has
   * no such entry, so the mistake can't be made here at all.
   */
  it('has no entry for UK, because the ISO code is GB', async () => {
    renderCheckout()
    await userEvent.click(await screen.findByRole('combobox', { name: 'Country' }))

    await userEvent.type(screen.getByRole('textbox', { name: 'Search country' }), 'UK')

    expect(screen.getByText('No country matches that')).toBeInTheDocument()
  })

  it('shows the chosen country by name', async () => {
    renderCheckout()
    await userEvent.click(await screen.findByRole('combobox', { name: 'Country' }))
    await userEvent.click(await screen.findByRole('option', { name: 'United Kingdom' }))

    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveTextContent('United Kingdom')
  })

  /** The stored value is the standardised code, not the display name. */
  it('submits the ISO code, not the country name', async () => {
    let submitted: unknown = null
    server.use(
      http.post('http://localhost:8080/orders', async ({ request }) => {
        submitted = await request.json()
        return HttpResponse.json(
          { id: 'order-1', placedAt: new Date().toISOString(), lines: [], total: 129.99 },
          { status: 201 },
        )
      }),
    )

    renderCheckout()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Email'), 'buyer@example.com')
    await user.type(screen.getByLabelText('Phone'), '+15551234567')
    await user.type(screen.getByLabelText('Full name'), 'Jamie Buyer')
    await user.type(screen.getByLabelText('Address line 1'), '1 Main St')
    await user.type(screen.getByLabelText('City'), 'Dubai')
    await user.type(screen.getByLabelText('State'), 'DU')
    await user.type(screen.getByLabelText('Postal code'), '00000')
    await user.click(screen.getByRole('combobox', { name: 'Country' }))
    await user.click(await screen.findByRole('option', { name: 'United Arab Emirates' }))
    await user.click(screen.getByRole('button', { name: /Place order/ }))

    await waitFor(() => expect(submitted).not.toBeNull())
    expect((submitted as { shippingAddress: { country: string } }).shippingAddress.country).toBe('AE')
  })

  /** Nothing chosen is the only failure the form itself can still catch. */
  it('refuses to submit without a country', async () => {
    let posted = 0
    server.use(
      http.post('http://localhost:8080/orders', () => {
        posted++
        return HttpResponse.json({ id: 'x', placedAt: '', lines: [], total: 0 }, { status: 201 })
      }),
    )

    renderCheckout()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Email'), 'buyer@example.com')
    await user.type(screen.getByLabelText('Phone'), '+15551234567')
    await user.type(screen.getByLabelText('Full name'), 'Jamie Buyer')
    await user.type(screen.getByLabelText('Address line 1'), '1 Main St')
    await user.type(screen.getByLabelText('City'), 'Springfield')
    await user.type(screen.getByLabelText('State'), 'IL')
    await user.type(screen.getByLabelText('Postal code'), '62704')
    await user.click(screen.getByRole('button', { name: /Place order/ }))

    expect(await screen.findByText('Choose a delivery country')).toBeInTheDocument()
    expect(posted).toBe(0)
  })

  /** Billing gets the same selector when it differs from shipping. */
  it('offers the same selector for a separate billing address', async () => {
    renderCheckout()
    await screen.findByRole('combobox', { name: 'Country' })
    await userEvent.click(screen.getByLabelText('Same as shipping'))

    expect(screen.getAllByRole('combobox', { name: 'Country' })).toHaveLength(2)
  })
})
