import { useState } from 'react'

import { apiClient } from '@/lib/api/client'

import { useCart } from '../context/CartContext'

export function useAddToCartFromProduct() {
  const { addLine, open } = useCart()
  const [isPending, setIsPending] = useState(false)

  async function addDefaultVariant(productId: string) {
    setIsPending(true)
    try {
      const { data, error } = await apiClient.GET('/products/{productId}', {
        params: { path: { productId } },
      })
      if (error || !data) return
      const variant = data.variants.find((v) => v.stockQty > 0) ?? data.variants[0]
      if (!variant) return
      addLine(variant.id, 1, variant.price)
      open()
    } finally {
      setIsPending(false)
    }
  }

  return { addDefaultVariant, isPending }
}
