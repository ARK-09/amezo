import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { CartProvider } from '@/features/cart/context/CartProvider'
import { STORAGE_KEY } from '@/features/cart/storage'
import { createAppQueryClient } from '@/lib/api/queryClient'
import { setDeliveryCountry } from '@/features/reference/deliveryCountry'
import { Checkout } from '@/pages/Checkout'
import {
  PREVIOUS_ORDER_DETAILS,
  setLastCheckoutDetails,
} from '@/test/msw/fixtures/checkoutDetails'
import { signInBuyerSession } from '@/test/msw/fixtures/sellerAuth'

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

describe('checkout autofill', () => {
  beforeEach(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ variantId: HEADPHONES_VARIANT_ID, quantity: 1, priceWhenAdded: 129.99 }]),
    )
  })

  it('prefills the last delivery details for a signed-in buyer', async () => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'ada@example.com' })
    setLastCheckoutDetails(PREVIOUS_ORDER_DETAILS)
    renderCheckout()

    await waitFor(() => expect(screen.getByLabelText('Full name')).toHaveValue('Ada Lovelace'))
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com')
    expect(screen.getByLabelText('Phone')).toHaveValue('+44 20 7946 0958')
    expect(screen.getByLabelText('Address line 1')).toHaveValue('12 Marylebone Road')
    expect(screen.getByLabelText('City')).toHaveValue('London')
    expect(screen.getByLabelText('Postal code')).toHaveValue('NW1 5JD')
    // Through the selector, showing the country's name - not a raw code typed into
    // a text box.
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveTextContent('United Kingdom')
  })

  it('leaves the form empty for a buyer who has never ordered', async () => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'ada@example.com' })
    renderCheckout()

    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com'))
    expect(screen.getByLabelText('Full name')).toHaveValue('')
    expect(screen.getByLabelText('Phone')).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveTextContent('Select a country')
  })

  it('prefills nothing for a guest', async () => {
    renderCheckout()

    expect(await screen.findByLabelText('Email')).toHaveValue('')
    expect(screen.getByLabelText('Full name')).toHaveValue('')
  })

  /**
   * The details arrive asynchronously, so the risk is real: a slow response landing
   * on top of an address someone had already started correcting.
   */
  it('never overwrites a field the buyer has already changed', async () => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'ada@example.com' })
    setLastCheckoutDetails(PREVIOUS_ORDER_DETAILS)
    renderCheckout()

    const fullName = await screen.findByLabelText('Full name')
    await waitFor(() => expect(fullName).toHaveValue('Ada Lovelace'))

    await userEvent.clear(fullName)
    await userEvent.type(fullName, 'Grace Hopper')

    // Re-running the prefill (a refetch, a re-render) must not undo the edit.
    await waitFor(() => expect(fullName).toHaveValue('Grace Hopper'))
    expect(fullName).toHaveValue('Grace Hopper')
  })

  it('uses the header delivery country in preference to the last order country', async () => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'ada@example.com' })
    setLastCheckoutDetails(PREVIOUS_ORDER_DETAILS) // country GB
    setDeliveryCountry('JP')
    renderCheckout()

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Country' })).toHaveTextContent('Japan'),
    )
  })

  it('prefills the country from the header choice alone, with no previous order', async () => {
    setDeliveryCountry('JP')
    renderCheckout()

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Country' })).toHaveTextContent('Japan'),
    )
  })

  /** The other half of the two-way binding: checkout writes back to the header. */
  it('updates the persisted delivery country when changed in checkout', async () => {
    renderCheckout()

    await userEvent.click(await screen.findByRole('combobox', { name: 'Country' }))
    await userEvent.click(await screen.findByRole('option', { name: 'United Kingdom' }))

    expect(localStorage.getItem('delivery-country:v1')).toBe('GB')
  })

  /**
   * The flag, not a copy of the shipping address, is what says whether billing was
   * separate - the API sends null for billingAddress when it was not.
   */
  it('reopens the billing box when the last order billed elsewhere', async () => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'ada@example.com' })
    setLastCheckoutDetails({
      ...PREVIOUS_ORDER_DETAILS,
      billingSameAsShipping: false,
      billingAddress: {
        fullName: 'Ada Lovelace',
        line1: '5 Finance Street',
        line2: null,
        city: 'Manchester',
        state: 'Greater Manchester',
        postalCode: 'M1 2AB',
        country: 'GB',
      },
    })
    renderCheckout()

    await waitFor(() => expect(screen.getByLabelText('Same as shipping')).not.toBeChecked())
    const [, billingLine1] = screen.getAllByLabelText('Address line 1')
    expect(billingLine1).toHaveValue('5 Finance Street')
  })

  it('leaves billing ticked when the last order billed to the shipping address', async () => {
    signInBuyerSession({ buyerIdentityId: 'buyer-1', email: 'ada@example.com' })
    setLastCheckoutDetails(PREVIOUS_ORDER_DETAILS) // billingSameAsShipping: true
    renderCheckout()

    await waitFor(() => expect(screen.getByLabelText('Full name')).toHaveValue('Ada Lovelace'))
    expect(screen.getByLabelText('Same as shipping')).toBeChecked()
  })

  /** Billing is a different question from where the parcel goes. */
  it('does not apply the delivery country to the billing address', async () => {
    setDeliveryCountry('JP')
    renderCheckout()

    await userEvent.click(await screen.findByLabelText('Same as shipping'))

    // Shipping first, then billing - the order they appear in the form.
    const [shippingCountry, billingCountry] = screen.getAllByRole('combobox', { name: 'Country' })
    expect(shippingCountry).toHaveTextContent('Japan')
    expect(billingCountry).toHaveTextContent('Select a country')
  })
})
