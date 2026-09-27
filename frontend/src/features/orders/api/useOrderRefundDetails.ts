import { useQueries } from '@tanstack/react-query'
import type { QueryFunctionContext } from '@tanstack/react-query'

import { refundKeys, type RefundRequestDetail } from '@/features/refunds/api/useRefundRequests'
import { apiClient } from '@/lib/api/client'

/**
 * The full record behind each refund an expanded order carries.
 *
 * An order's `refundRequests` are summaries, and three things the design prints
 * are not on a summary: which order lines the request covers (so a settled refund
 * can still tag its lines - the line's own `refundStatus` is cleared once the
 * request closes), the seller's decline reason, and the day the money moved. Only
 * fetched for an order the buyer has actually opened, and keyed the same way
 * useRefundRequest keys it, so the seller's panel and this share one cached copy.
 */
export function useOrderRefundDetails(refundRequestIds: string[]) {
  const queries = useQueries({
    queries: refundRequestIds.map((refundRequestId) => ({
      queryKey: refundKeys.detail(refundRequestId),
      queryFn: async ({ signal }: QueryFunctionContext) => {
        const { data, error } = await apiClient.GET('/api/v1/refund-requests/{refundRequestId}', {
          signal,
          params: { path: { refundRequestId } },
        })
        if (error) throw error
        return data
      },
    })),
  })

  const byId = new Map<string, RefundRequestDetail>()
  for (const query of queries) {
    if (query.data) byId.set(query.data.id, query.data)
  }
  return byId
}
