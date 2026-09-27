import { useQueries } from '@tanstack/react-query'
import type { QueryFunctionContext } from '@tanstack/react-query'

import { refundKeys, type RefundStatus } from '@/features/refunds/api/useRefundRequests'
import { apiClient } from '@/lib/api/client'

/**
 * How many of the buyer's refund requests are still running, for the "· 2 refunds
 * in progress" half of the My Orders header.
 *
 * One request per open status rather than one request for the lot, because
 * GET /api/v1/refund-requests filters by a single status and reports the matching
 * `totalElements`. Asking for every request and counting the open ones in the
 * browser would be a guess above the first page - the endpoint offers no aggregate
 * and no "open" filter - so this asks the four questions it can get exact answers
 * to and adds them up. `size: 1` because only the count is wanted; the rows are
 * thrown away.
 */
const OPEN_STATUSES: RefundStatus[] = ['REQUESTED', 'APPROVED', 'AWAITING_RETURN', 'RETURN_RECEIVED']

export function useOpenRefundCount({ enabled = true }: { enabled?: boolean } = {}) {
  const queries = useQueries({
    queries: OPEN_STATUSES.map((status) => {
      const filters = { status, size: 1 } as const
      return {
        queryKey: refundKeys.buyerList(filters),
        enabled,
        queryFn: async ({ signal }: QueryFunctionContext) => {
          const { data, error } = await apiClient.GET('/api/v1/refund-requests', {
            signal,
            params: { query: filters },
          })
          if (error) throw error
          return data
        },
      }
    }),
  })

  // Undefined until every bucket has answered: a partial sum would print a
  // number that then grew, and "1 refund in progress" turning into "3" reads as
  // a bug rather than as loading.
  const answered = queries.every((query) => query.data !== undefined)
  return {
    count: answered ? queries.reduce((sum, query) => sum + (query.data?.totalElements ?? 0), 0) : undefined,
    isPending: queries.some((query) => query.isPending),
    isError: queries.some((query) => query.isError),
  }
}
