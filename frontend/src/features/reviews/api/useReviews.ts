import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { QueryFunctionContext } from '@tanstack/react-query'

import { REVIEWS_PAGE_SIZE } from '@/features/catalog/schema/types'
import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

export type Review = components['schemas']['Review']
export type ReviewPage = components['schemas']['ReviewPage']
export type ReviewEligibility = components['schemas']['ReviewEligibility']

/**
 * ONE key namespace for everything review-shaped. The list used to live in catalog
 * under ['catalog','reviews'] while the write invalidated ['reviews'] - so publishing
 * a review left the list showing "No reviews yet". Two namespaces for one thing is
 * how that happens, so there is now one.
 */
export const reviewKeys = {
  all: ['reviews'] as const,
  list: (productRef: string, page: number) => [...reviewKeys.all, 'list', productRef, page] as const,
  eligibility: (productRef: string) => [...reviewKeys.all, 'eligibility', productRef] as const,
}

/** A page of a product's reviews. Addressed by slug, like the product itself. */
export function useProductReviews(productRef: string, page: number, enabled: boolean) {
  return useQuery<ReviewPage, ProblemDetail>({
    queryKey: reviewKeys.list(productRef, page),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/products/{productRef}/reviews', {
        signal,
        params: { path: { productRef }, query: { page, size: REVIEWS_PAGE_SIZE } },
      })
      if (error) throw error
      return data
    },
    enabled,
    placeholderData: keepPreviousData,
  })
}

/**
 * A 401 here resolves as "not eligible" rather than throwing - a visitor who isn't
 * signed in hasn't hit an error, they just aren't a buyer yet. Written once because
 * two callers ask the question: the product page, about one product, and My Orders,
 * about every product in an expanded order.
 */
async function fetchEligibility(
  productRef: string,
  signal: AbortSignal,
): Promise<ReviewEligibility> {
  const { data, error, response } = await apiClient.GET(
    '/products/{productRef}/reviews/eligibility',
    { signal, params: { path: { productRef } } },
  )
  if (response.status === 401) {
    return { eligible: false, reason: 'NOT_PURCHASED', orderLineId: null, existingReview: null }
  }
  if (error) throw error
  return data
}

/**
 * Whether the signed-in buyer may review this product.
 *
 * `enabled` is the caller's business: this only runs for a signed-in buyer, because
 * for anyone else the endpoint answers 401 and there is no form to offer.
 */
export function useReviewEligibility(productRef: string, enabled: boolean) {
  return useQuery<ReviewEligibility, ProblemDetail>({
    queryKey: reviewKeys.eligibility(productRef),
    queryFn: ({ signal }) => fetchEligibility(productRef, signal),
    enabled,
  })
}

/**
 * The same question for several products at once, for the Reviews block inside an
 * expanded order. It has to be a request per product: an order line carries no
 * review of its own, so this endpoint's `existingReview` is the only thing that
 * tells a line already reviewed from one still waiting - and it is also where the
 * review id for an edit comes from. Same key as the single-product hook, so the
 * product page and the order share one cached answer.
 */
export function useReviewEligibilities(productRefs: string[]) {
  return useQueries({
    queries: productRefs.map((productRef) => ({
      queryKey: reviewKeys.eligibility(productRef),
      queryFn: ({ signal }: QueryFunctionContext) => fetchEligibility(productRef, signal),
    })),
  })
}

/**
 * Writing a review. The order line is what proves the purchase; the server checks
 * that it is the caller's, so this hook carries no authorisation logic of its own.
 *
 * On success every review query, the product itself and the search results are
 * invalidated. The product's rating summary and the listing card's average are both
 * derived from reviews, so leaving either cached would show a new review under an
 * old average. Invalidating the whole review key rather than one product's is
 * deliberate: the eligibility answer for this product has changed too, and it is
 * cheaper to re-ask than to enumerate which keys moved.
 */
export function useCreateReview() {
  const queryClient = useQueryClient()

  return useMutation<Review, ProblemDetail, { orderLineId: string; rating: number; body: string }>({
    mutationFn: async ({ orderLineId, rating, body }) => {
      const { data, error } = await apiClient.POST('/reviews', {
        body: { orderLineId, rating, body: body.trim() || null },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reviewKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'product'] })
      // The listing card shows the average too.
      void queryClient.invalidateQueries({ queryKey: ['search'] })
    },
  })
}

/**
 * Editing a review already written. Author-only on the server, so this carries no
 * authorisation of its own. Only the rating and the body go in the body: the
 * purchase a review belongs to is not editable, or a review could be moved onto a
 * different product after the fact.
 *
 * Invalidates exactly what writing one does - the same averages and the same
 * eligibility answer are derived from it, and an edited rating moves both.
 */
export function useUpdateReview() {
  const queryClient = useQueryClient()

  return useMutation<Review, ProblemDetail, { reviewId: string; rating: number; body: string }>({
    mutationFn: async ({ reviewId, rating, body }) => {
      const { data, error } = await apiClient.PATCH('/api/v1/reviews/{reviewId}', {
        params: { path: { reviewId } },
        body: { rating, body: body.trim() || null },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: reviewKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'product'] })
      void queryClient.invalidateQueries({ queryKey: ['search'] })
    },
  })
}
