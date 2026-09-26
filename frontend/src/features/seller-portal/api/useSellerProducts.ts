import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

type SellerProductSummaryPage = components['schemas']['SellerProductSummaryPage']
type CreateProductRequest = components['schemas']['CreateProductRequest']
export type SellerProductDetail = components['schemas']['SellerProductDetail']
export type SellerVariant = components['schemas']['SellerVariant']
type UpdateProductRequest = components['schemas']['UpdateProductRequest']
type UpdateVariantRequest = components['schemas']['UpdateVariantRequest']
type CreateVariantRequest = components['schemas']['CreateVariantRequest']

export const sellerProductKeys = {
  all: ['seller', 'products'] as const,
  detail: (productId: string) => ['seller', 'products', productId] as const,
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
      const { error } = await apiClient.DELETE('/products/{productRef}', {
        params: { path: { productRef: productId } },
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

export function useSellerProduct(productId: string) {
  return useQuery<SellerProductDetail, ProblemDetail>({
    queryKey: sellerProductKeys.detail(productId),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/sellers/me/products/{productId}', {
        signal,
        params: { path: { productId } },
      })
      if (error) throw error
      return data
    },
  })
}

export function useUpdateProduct(productId: string) {
  const queryClient = useQueryClient()
  return useMutation<SellerProductDetail, ProblemDetail, UpdateProductRequest>({
    mutationFn: async (body) => {
      // Writes address the product by id, not by slug: a slug is for links, and a
      // rename must not be able to retarget an edit.
      const { data, error } = await apiClient.PATCH('/products/{productRef}', {
        params: { path: { productRef: productId } },
        body,
      })
      if (error) throw error
      return data
    },
    // The response is the whole product, so seed the detail cache from it rather
    // than refetching; the list still needs invalidating because a title or
    // category change shows up there too.
    onSuccess: (updated) => {
      queryClient.setQueryData(sellerProductKeys.detail(productId), updated)
      void queryClient.invalidateQueries({ queryKey: sellerProductKeys.all })
    },
  })
}

export function useUpdateVariant(productId: string) {
  const queryClient = useQueryClient()
  return useMutation<SellerVariant, ProblemDetail, { variantId: string; body: UpdateVariantRequest }>({
    mutationFn: async ({ variantId, body }) => {
      const { data, error } = await apiClient.PATCH('/variants/{variantId}', {
        params: { path: { variantId } },
        body,
      })
      if (error) throw error
      return data
    },
    // One variant came back, so patch it into the cached product in place - a
    // whole-product refetch would wipe the other rows' unsaved edits.
    onSuccess: (updated) => {
      queryClient.setQueryData<SellerProductDetail>(sellerProductKeys.detail(productId), (current) =>
        current
          ? { ...current, variants: current.variants.map((v) => (v.id === updated.id ? updated : v)) }
          : current,
      )
      void queryClient.invalidateQueries({ queryKey: sellerProductKeys.all })
    },
  })
}

export function useAddVariant(productId: string) {
  const queryClient = useQueryClient()
  return useMutation<SellerVariant, ProblemDetail, CreateVariantRequest>({
    mutationFn: async (body) => {
      const { data, error } = await apiClient.POST('/products/{productId}/variants', {
        params: { path: { productId } },
        body,
      })
      if (error) throw error
      return data
    },
    // Append rather than refetch, so the other rows' unsaved edits survive.
    onSuccess: (created) => {
      queryClient.setQueryData<SellerProductDetail>(sellerProductKeys.detail(productId), (current) =>
        current ? { ...current, variants: [...current.variants, created] } : current,
      )
      void queryClient.invalidateQueries({ queryKey: sellerProductKeys.all })
    },
  })
}

export function useDeleteVariant(productId: string) {
  const queryClient = useQueryClient()
  return useMutation<void, ProblemDetail, string>({
    mutationFn: async (variantId) => {
      const { error } = await apiClient.DELETE('/variants/{variantId}', {
        params: { path: { variantId } },
      })
      if (error) throw error
    },
    onSuccess: (_void, variantId) => {
      queryClient.setQueryData<SellerProductDetail>(sellerProductKeys.detail(productId), (current) =>
        current ? { ...current, variants: current.variants.filter((v) => v.id !== variantId) } : current,
      )
      void queryClient.invalidateQueries({ queryKey: sellerProductKeys.all })
    },
  })
}

export function useDeleteImage(productId: string) {
  const queryClient = useQueryClient()
  return useMutation<void, ProblemDetail, string>({
    mutationFn: async (imageId) => {
      const { error } = await apiClient.DELETE('/images/{imageId}', {
        params: { path: { imageId } },
      })
      if (error) throw error
    },
    onSuccess: (_void, imageId) => {
      queryClient.setQueryData<SellerProductDetail>(sellerProductKeys.detail(productId), (current) =>
        current ? { ...current, images: current.images.filter((i) => i.id !== imageId) } : current,
      )
      // The list's thumbnail is the product's first image, so removing one can
      // change the row too.
      void queryClient.invalidateQueries({ queryKey: sellerProductKeys.all })
    },
  })
}

export interface ImageUploadFailure {
  fileName: string
  error: ProblemDetail | Error
}

export interface ImageBatchUploadResult {
  uploaded: number
  failed: ImageUploadFailure[]
}

/**
 * Upload a batch of images to an existing product. Each file is the create page's
 * same three steps - presign, PUT straight to storage, confirm - and the detail
 * query is refetched afterwards because only the server knows the rows the
 * confirms created.
 *
 * Sequential on purpose. Every presign both reserves a row against the product's
 * 7-image cap and charges the deployment's storage budget, and the server checks
 * those per request; firing six presigns at once would race both checks. It also
 * keeps one slow file from stalling the others' progress reporting.
 *
 * Resolves even when some files fail, rather than throwing on the first one: five
 * pictures where the third is a 40 MB raw file should upload four, not zero, and
 * the caller needs to know which one to fix. A rejection here means the batch
 * itself could not be attempted.
 */
export function useUploadImages(productId: string) {
  const queryClient = useQueryClient()
  return useMutation<
    ImageBatchUploadResult,
    ProblemDetail | Error,
    { files: File[]; startPosition: number; onProgress?: (done: number, total: number) => void }
  >({
    mutationFn: async ({ files, startPosition, onProgress }) => {
      const failed: ImageUploadFailure[] = []
      let uploaded = 0

      for (const file of files) {
        try {
          // Positions stay contiguous by counting successes, not attempts, so a
          // file that fails doesn't leave a gap in the gallery ordering.
          await uploadProductImage(productId, { file, position: startPosition + uploaded })
          uploaded++
        } catch (error) {
          failed.push({ fileName: file.name, error: error as ProblemDetail | Error })
        }
        onProgress?.(uploaded + failed.length, files.length)
      }

      return { uploaded, failed }
    },
    onSuccess: ({ uploaded }) => {
      // Nothing landed, so nothing to refetch - and refetching would only make
      // the failure message flicker behind a reload of unchanged data.
      if (uploaded === 0) return
      void queryClient.invalidateQueries({ queryKey: sellerProductKeys.detail(productId) })
      void queryClient.invalidateQueries({ queryKey: sellerProductKeys.all })
    },
  })
}
