import { QueryClient } from '@tanstack/react-query'

import { retryTransientQuery, transientRetryDelay } from './transient'

/**
 * The app's real React Query configuration, as a factory so tests can exercise
 * the same retry behaviour production has instead of a hand-written copy of it.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Replaces React Query's default `retry: 3`, which retries everything -
        // including a 404 and a 401 - three times. This retries only failures
        // that infrastructure caused, and still only three times.
        retry: retryTransientQuery,
        retryDelay: transientRetryDelay,
        // A free Render instance sleeps after 15 minutes idle. Refetching every
        // query on every window focus means tabbing back to an idle tab wakes
        // the instance and puts the page into a "starting up" state that nobody
        // asked for; an explicit navigation or action will refetch anyway.
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Explicit, because the temptation is to retry these too: a checkout
        // POST that timed out may have been committed before the response was
        // lost, and a retry would place a second order. Mutations surface the
        // failure instead, and their callers offer a retry the user chooses.
        retry: 0,
      },
    },
  })
}
