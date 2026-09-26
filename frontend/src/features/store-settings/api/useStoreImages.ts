import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'

import { storeKeys, type StoreProfile } from './useStoreProfile'

export type StoreImageSlot = 'COVER' | 'LOGO'

export interface StoreImageUpload {
  slot: StoreImageSlot
  file: File
}

/**
 * Three steps, mirroring the product-image flow: reserve a slot, PUT the bytes
 * straight to storage, then confirm. Nothing is live on the storefront until
 * confirm runs, so a PUT that never lands leaves the profile as it was rather
 * than pointing at bytes that were never written.
 */
async function uploadStoreImage({ slot, file }: StoreImageUpload): Promise<StoreProfile> {
  const { data: reserved, error: reserveError } = await apiClient.POST(
    '/api/v1/sellers/me/store/images',
    { body: { slot, contentType: file.type, fileSizeBytes: file.size } },
  )
  if (reserveError) throw reserveError

  const stored = await fetch(reserved.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!stored.ok) {
    throw new Error(`Upload to storage failed (${stored.status}).`)
  }

  // The slot is named again on purpose: the server refuses a cover confirmed as
  // a logo, which is the check that keeps a 1600x400 banner out of an 88px circle.
  const { data, error } = await apiClient.POST('/api/v1/sellers/me/store/images/confirm', {
    body: { id: reserved.id, slot },
  })
  if (error) throw error
  return data
}

export function useUploadStoreImage() {
  const queryClient = useQueryClient()
  // ProblemDetail from the two API calls, Error from the direct-to-storage PUT.
  return useMutation<StoreProfile, ProblemDetail | Error, StoreImageUpload>({
    mutationFn: uploadStoreImage,
    // Confirm answers with the whole updated profile, so there is nothing to
    // refetch - and writing it rather than invalidating keeps an in-progress
    // edit of the form's other fields on screen.
    onSuccess: (updated) => queryClient.setQueryData(storeKeys.mine, updated),
  })
}

/**
 * Removing is not an upload. Both fields are nullable on UpdateStoreProfile, so
 * clearing one is an ordinary PATCH with null.
 */
export function useRemoveStoreImage() {
  const queryClient = useQueryClient()
  return useMutation<StoreProfile, ProblemDetail, StoreImageSlot>({
    mutationFn: async (slot) => {
      const { data, error } = await apiClient.PATCH('/api/v1/sellers/me/store', {
        body: slot === 'COVER' ? { coverUrl: null } : { logoUrl: null },
      })
      if (error) throw error
      return data
    },
    onSuccess: (updated) => queryClient.setQueryData(storeKeys.mine, updated),
  })
}
