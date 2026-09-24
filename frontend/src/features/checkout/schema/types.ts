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
