import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

type SellerProductSummaryPage = components['schemas']['SellerProductSummaryPage']
type CreateProductRequest = components['schemas']['CreateProductRequest']

export const sellerProductKeys = {
  all: ['seller', 'products'] as const,
}

export function useSellerProducts() {
  return useQuery<SellerProductSummaryPage, ProblemDetail>({
    queryKey: sellerProductKeys.all,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/sellers/me/products', {
        signal,
        params: { query: { size: 100 } },
      })
      if (error) throw error
      return data
    },
  })
}

export function useCreateProduct() {
  const queryClient = useQueryClient()
  return useMutation<{ id: string }, ProblemDetail, CreateProductRequest>({
    mutationFn: async (body) => {
      const { data, error } = await apiClient.POST('/sellers/me/products', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sellerProductKeys.all }),
  })
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()
  return useMutation<void, ProblemDetail, string>({
    mutationFn: async (productId) => {
      const { error } = await apiClient.DELETE('/products/{productId}', {
        params: { path: { productId } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sellerProductKeys.all }),
  })
}

export interface StagedImageUpload {
  file: File
  position: number
}

export async function uploadProductImage(productId: string, staged: StagedImageUpload) {
  const { data: uploadUrlData, error: uploadUrlError } = await apiClient.POST(
    '/products/{productId}/images/upload-url',
    {
      params: { path: { productId } },
      body: {
        contentType: staged.file.type,
        fileSizeBytes: staged.file.size,
        position: staged.position,
      },
    },
  )
  if (uploadUrlError) throw uploadUrlError

  const putResponse = await fetch(uploadUrlData.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': staged.file.type },
    body: staged.file,
  })
  if (!putResponse.ok) {
    throw new Error(`Image upload to storage failed (${putResponse.status})`)
  }

  const { error: confirmError } = await apiClient.POST('/products/{productId}/images/confirm', {
    params: { path: { productId } },
    body: { imageId: uploadUrlData.id },
  })
  if (confirmError) throw confirmError
}
