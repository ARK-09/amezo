import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

import { isTransientFailure } from './transient'

function anyQueryWaitingOnTheBackend(client: QueryClient): boolean {
  return client
    .getQueryCache()
    .getAll()
    .some(
      (query) =>
        // Still in flight (React Query keeps fetchStatus 'fetching' across the
        // retry delays), and already failed at least once for a reason that
        // means the backend isn't answering yet.
        query.state.fetchStatus === 'fetching' &&
        query.state.fetchFailureCount > 0 &&
        isTransientFailure(query.state.fetchFailureReason),
    )
}

/**
 * True while at least one query is retrying because the API didn't answer -
 * the honest signal for "the server is waking up", as opposed to a plain
 * first-load spinner (no failure yet) or an error (retries exhausted).
 */
export function useBackendWaking(): boolean {
  const client = useQueryClient()
  return useSyncExternalStore(
    (onChange) => client.getQueryCache().subscribe(onChange),
    () => anyQueryWaitingOnTheBackend(client),
    // No backend on the server-rendering pass, so nothing can be waking on it.
    () => false,
  )
}
