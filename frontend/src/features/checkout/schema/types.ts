import type { LastCheckoutDetails } from '../api/useLastCheckoutDetails'

export interface AddressFormValues {
  fullName: string
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
  country: string
}

export const EMPTY_ADDRESS: AddressFormValues = {
  fullName: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
}

export interface CheckoutFormValues {
  email: string
  phone: string
  shippingAddress: AddressFormValues
  sameAsShipping: boolean
  billingAddress: AddressFormValues
}

export type FieldErrors = Record<string, string>

/**
 * Fills blanks without ever clobbering what the buyer typed.
 *
 * Three sources, in priority order for the country: the explicit "Deliver to" choice
 * from the header, then the country of the last order. An explicit choice wins
 * because it is the more recent statement of intent - picking a country in the header
 * and then having checkout quietly replace it with last year's would make the picker
 * look broken.
 *
 * Two rules keep it honest:
 *   - a field the buyer has touched is never written, however late the data lands;
 *   - a field that already holds something is never overwritten either.
 * So this only ever turns blanks into values, which is what makes it safe to re-run
 * whenever any of the three sources resolve.
 *
 * Returns the SAME object when there is nothing to fill. The caller runs it from an
 * effect, and a fresh object every time would re-render on a loop.
 */
export function prefilledValues(
  current: CheckoutFormValues,
  touched: ReadonlySet<string>,
  sources: {
    email?: string
    details: LastCheckoutDetails | null
    deliveryCountry: string | null
  },
): CheckoutFormValues {
  const { email, details, deliveryCountry } = sources
  let changed = false
  const next: CheckoutFormValues = { ...current }

  function fill<K extends keyof CheckoutFormValues>(key: K, value: string | undefined | null, path: string) {
    if (!value) return
    if (touched.has(path)) return
    if (next[key]) return
    next[key] = value as CheckoutFormValues[K]
    changed = true
  }

  function fillAddress(
    key: 'shippingAddress' | 'billingAddress',
    source: AddressSource | null | undefined,
    country: string | null,
  ) {
    const address = next[key]
    const patch: Partial<AddressFormValues> = {}
    const candidates: [keyof AddressFormValues, string | null | undefined][] = [
      ['fullName', source?.fullName],
      ['line1', source?.line1],
      ['line2', source?.line2],
      ['city', source?.city],
      ['state', source?.state],
      ['postalCode', source?.postalCode],
      ['country', country ?? source?.country],
    ]
    for (const [field, value] of candidates) {
      if (!value) continue
      if (touched.has(`${key}.${field}`)) continue
      if (address[field]) continue
      patch[field] = value
    }
    if (Object.keys(patch).length === 0) return
    next[key] = { ...address, ...patch }
    changed = true
  }

  fill('email', email, 'email')
  fill('phone', details?.phone, 'phone')
  fillAddress('shippingAddress', details?.shippingAddress, deliveryCountry)
  // The billing country deliberately does not take the delivery preference: where a
  // card is billed is not where the parcel is going.
  fillAddress('billingAddress', details?.billingAddress, null)

  return changed ? next : current
}

/** The address shape both the API response and the form can be read through. */
interface AddressSource {
  fullName?: string
  line1?: string
  line2?: string | null
  city?: string
  state?: string
  postalCode?: string
  country?: string
}
