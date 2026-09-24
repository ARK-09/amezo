import { useMutation } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

import type { CheckoutFormValues } from '../schema/types'

export type OrderResponse = components['schemas']['OrderResponse']
type CheckoutLine = components['schemas']['CheckoutLine']

function toAddressPayload(address: CheckoutFormValues['shippingAddress']) {
  return {
    fullName: address.fullName,
    line1: address.line1,
    line2: address.line2 || undefined,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
  }
}

export function useCheckout() {
  return useMutation<OrderResponse, ProblemDetail, { values: CheckoutFormValues; lines: CheckoutLine[] }>({
    mutationFn: async ({ values, lines }) => {
      const { data, error } = await apiClient.POST('/orders', {
        body: {
          email: values.email,
          phone: values.phone,
          shippingAddress: toAddressPayload(values.shippingAddress),
          sameAsShipping: values.sameAsShipping,
          billingAddress: values.sameAsShipping ? undefined : toAddressPayload(values.billingAddress),
          lines,
        },
      })
      if (error) throw error
      return data
    },
  })
}
