import type { components } from '@/lib/api/schema'

export type LastCheckoutDetails = components['schemas']['LastCheckoutDetails']

/**
 * What GET /checkout/last-details answers for the signed-in buyer.
 *
 * Null by default, which is the first-time buyer the checkout form has to handle
 * gracefully. A test that wants the autofill path opts into it explicitly, so no
 * unrelated checkout test silently gains a prefilled form.
 */
let lastDetails: LastCheckoutDetails | null = null

export function currentLastCheckoutDetails(): LastCheckoutDetails | null {
  return lastDetails
}

export function setLastCheckoutDetails(details: LastCheckoutDetails | null) {
  lastDetails = details
}

export function clearLastCheckoutDetails() {
  lastDetails = null
}

/** A complete previous order, for the autofill tests. */
export const PREVIOUS_ORDER_DETAILS: LastCheckoutDetails = {
  phone: '+44 20 7946 0958',
  shippingAddress: {
    fullName: 'Ada Lovelace',
    line1: '12 Marylebone Road',
    line2: 'Flat 3',
    city: 'London',
    state: 'Greater London',
    postalCode: 'NW1 5JD',
    country: 'GB',
  },
  billingSameAsShipping: true,
  billingAddress: null,
}
