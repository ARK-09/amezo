import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartContext'
import { STORAGE_KEY } from '@/features/cart/storage'
import { createAppQueryClient } from '@/lib/api/queryClient'
import { Checkout } from '@/pages/Checkout'

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

/** The field's own wrapper, so an assertion can't pick up a neighbour's error text. */
function fieldGroup(label: string) {
  return screen.getByLabelText(label).closest('div')!
}

describe('checkout required fields', () => {
  beforeEach(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ variantId: HEADPHONES_VARIANT_ID, quantity: 1, priceWhenAdded: 129.99 }]),
    )
  })

  it('marks every required field and leaves the optional one unmarked', async () => {
    renderCheckout()
    await screen.findByLabelText('Email')

    for (const label of ['Email', 'Phone', 'Full name', 'Address line 1', 'City', 'State', 'Postal code']) {
      expect(screen.getByLabelText(label), `${label} should be required`).toHaveAttribute(
        'aria-required',
        'true',
      )
    }
    // line2 is the only field CheckoutAddressRequest leaves off its @NotBlank list,
    // and the form must not claim otherwise.
    expect(screen.getByLabelText('Address line 2')).not.toHaveAttribute('aria-required')
  })

  it('explains the asterisk rather than leaving it to be guessed', async () => {
    renderCheckout()
    expect(await screen.findByText(/Fields marked/)).toBeInTheDocument()
  })

  it('shows an error next to each missing field, not only at the top', async () => {
    renderCheckout()
    await screen.findByLabelText('Email')

    await userEvent.click(screen.getByRole('button', { name: 'Place order' }))

    // Beside the field itself...
    expect(within(fieldGroup('Email')).getByText('Email is required')).toBeInTheDocument()
    expect(within(fieldGroup('Phone')).getByText('Phone number is required')).toBeInTheDocument()
    expect(within(fieldGroup('Full name')).getByText('Required')).toBeInTheDocument()
    // ...and wired to it, so a screen reader reads the reason with the control.
    const email = screen.getByLabelText('Email')
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAccessibleDescription('Email is required')
  })

  it('refuses to submit while a required field is missing', async () => {
    renderCheckout()
    await screen.findByLabelText('Email')

    await userEvent.click(screen.getByRole('button', { name: 'Place order' }))

    // Still on the form: no navigation, no order placed.
    expect(screen.getByRole('button', { name: 'Place order' })).toBeInTheDocument()
    expect(screen.getByText('Email is required')).toBeInTheDocument()
  })

  it('rejects a malformed email with its own message', async () => {
    renderCheckout()
    await userEvent.type(await screen.findByLabelText('Email'), 'not-an-email')

    await userEvent.click(screen.getByRole('button', { name: 'Place order' }))

    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
  })

  /** Errors that only refresh on the next submit are how a form feels broken. */
  it('clears a field error as soon as it is corrected', async () => {
    renderCheckout()
    await screen.findByLabelText('Email')

    await userEvent.click(screen.getByRole('button', { name: 'Place order' }))
    expect(screen.getByText('Email is required')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com')

    await waitFor(() => expect(screen.queryByText('Email is required')).not.toBeInTheDocument())
  })

  it('does not mark anything invalid before the first submit', async () => {
    renderCheckout()

    expect(await screen.findByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText('Email is required')).not.toBeInTheDocument()
  })
})
