import type { AddressFormValues, CheckoutFormValues, FieldErrors } from './types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateCheckout(values: CheckoutFormValues): FieldErrors {
  const errors: FieldErrors = {}

  if (!values.email.trim()) errors.email = 'Email is required'
  else if (!EMAIL_RE.test(values.email)) errors.email = 'Enter a valid email address'

  if (!values.phone.trim()) errors.phone = 'Phone number is required'

  validateAddress(values.shippingAddress, 'shippingAddress', errors)
  if (!values.sameAsShipping) {
    validateAddress(values.billingAddress, 'billingAddress', errors)
  }

  return errors
}

// line2 is the one optional field, matching the backend's Bean Validation
// on CheckoutAddressRequest exactly.
function validateAddress(address: AddressFormValues, prefix: string, errors: FieldErrors) {
  if (!address.fullName.trim()) errors[`${prefix}.fullName`] = 'Required'
  if (!address.line1.trim()) errors[`${prefix}.line1`] = 'Required'
  if (!address.city.trim()) errors[`${prefix}.city`] = 'Required'
  if (!address.state.trim()) errors[`${prefix}.state`] = 'Required'
  if (!address.postalCode.trim()) errors[`${prefix}.postalCode`] = 'Required'
  // The value comes from a selector fed by GET /countries, so the only failure left
  // to catch here is not having chosen one. Whether a chosen code is real is the
  // server's call, and the selector cannot offer one that isn't.
  // Worded so it doesn't read identically to the selector's own placeholder, which
  // sits a few pixels above it.
  if (!address.country.trim()) errors[`${prefix}.country`] = 'Choose a delivery country'
}
