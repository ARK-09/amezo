import { useQuery } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router'

import { StoreFront } from '@/pages/StoreFront'
import { apiClient, type ProblemDetail } from '@/lib/api/client'

/**
 * A handle, exactly as the contract constrains it: lowercase, 2-39 characters, no
 * dash at either end. Nothing in that shape needs URL encoding, so a segment that
 * fails it is not a handle - it is the display name a pre-handle link carried.
 */
const STORE_HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{0,37}[a-z0-9]$/

/**
 * How far into the catalogue a legacy name is looked up. The storefront used to find
 * a store by scanning one page of /products and matching brandName, so this reaches
 * exactly as far as the links it has to keep alive - and only ever on the old shape.
 */
const LEGACY_SCAN_SIZE = 100

/**
 * The handle of the store listing under this display name, or null when nothing
 * lists under it. Read off a listing rather than slugified from the name: the handle
 * is the server's to mint, and a guessed one is a dead link.
 */
function useHandleForDisplayName(brandName: string) {
  return useQuery<string | null, ProblemDetail>({
    // Under the ['store'] root the storefront's own queries use, so a renamed handle
    // drops this lookup with them.
    queryKey: ['store', 'legacy-name', brandName.toLowerCase()],
    enabled: brandName.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/products', {
        signal,
        params: { query: { page: 0, size: LEGACY_SCAN_SIZE } },
      })
      if (error) throw error
      const listing = data.content.find(
        (product) => product.brandName.toLowerCase() === brandName.toLowerCase(),
      )
      return listing?.store?.handle ?? null
    },
  })
}

/**
 * The storefront, addressed by handle. `/stores/Aurora%20Audio` is still in the wild
 * and the backend handoff commits to it for a release, so a segment that isn't a
 * handle is resolved by display name and the reader is moved to the store's own URL -
 * the same trade ProductDetail makes for a legacy product id. `replace` so Back
 * doesn't bounce between the two URLs.
 */
export function StoreFrontRoute() {
  // Already decoded by the router, so this is the display name itself.
  const { handle = '' } = useParams<{ handle: string }>()
  const legacyName = STORE_HANDLE_PATTERN.test(handle) ? '' : handle
  const resolved = useHandleForDisplayName(legacyName)

  if (legacyName) {
    if (resolved.data) return <Navigate to={`/stores/${resolved.data}`} replace />
    if (resolved.isLoading) {
      return (
        <div className="mx-auto w-full max-w-[1320px] flex-1 px-7 py-5">
          <p className="text-sm text-muted-foreground">Loading store…</p>
        </div>
      )
    }
    // Nothing lists under that name, or the lookup failed: fall through to the
    // storefront's own couldn't-load state rather than a second, different one.
  }

  return <StoreFront />
}

/**
 * The route table on its own, so a test can mount a single URL against the real
 * routes rather than a hand-copied stand-in for them.
 */
