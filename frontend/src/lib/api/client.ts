import createClient from 'openapi-fetch'

import type { paths } from './schema'
import { REQUEST_TIMEOUT_MS, RequestTimeoutError } from './transient'

export interface ProblemDetail {
  type: string
  title: string
  status: number
  detail?: string
  errors?: { field: string; reason: string }[]
}

/**
 * One attempt, with a deadline. Without this a request to a sleeping Render
 * instance can hang for as long as the browser is willing to wait, which is
 * minutes - long enough to look like a frozen page, and long enough that
 * React Query never gets the failure it would have retried.
 *
 * The caller's signal (React Query's, for unmount/key-change cancellation) is
 * chained in rather than replaced, so cancelling still works and still arrives
 * as an AbortError - which transient.ts deliberately does not treat as a
 * failure to retry.
 */
async function fetchWithTimeout(
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new RequestTimeoutError(REQUEST_TIMEOUT_MS)), REQUEST_TIMEOUT_MS)

  // openapi-fetch builds a Request and calls fetch(request, extraInit), so the
  // caller's signal arrives ON THE REQUEST, not in init - and the init we pass
  // below overrides whatever the Request carried. Read it from both, or
  // cancellation is silently dropped.
  const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : null)
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort(callerSignal.reason)
    else
      callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason), {
        once: true,
      })
  }

  try {
    // Resolved per-call, not captured at module load: otherwise this holds the
    // pre-MSW global fetch and test/browser mocking silently no-ops.
    return await globalThis.fetch(input, { ...init, signal: controller.signal })
  } finally {
    // Always, including on a thrown network error - a live timer would keep
    // firing an abort at a request that has already settled.
    clearTimeout(timer)
  }
}

export const apiClient = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8080',
  credentials: 'include',
  fetch: fetchWithTimeout,
})

const GATEWAY_TITLE: Record<number, string> = {
  408: 'Request Timeout',
  429: 'Too Many Requests',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
}

apiClient.use({
  onResponse({ response }) {
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('api:unauthorized'))
    }
    if (response.ok) return response

    // Every error this API raises itself is a ProblemDetail, so anything else on
    // a failure came from in front of it: Render's own gateway page while the
    // instance boots (text/html), or an empty body from a dropped connection.
    // openapi-fetch hands those back as a string - or as '', which is falsy, so
    // `if (error) throw error` in a queryFn would treat a failed request as a
    // success with undefined data. Normalising here means every non-ok response
    // reaches the caller as a truthy ProblemDetail carrying the real status,
    // which is also what transient.ts needs to decide whether to retry.
    if (response.headers.get('content-type')?.includes('json')) return response

    const problem: ProblemDetail = {
      type: 'about:blank',
      title: GATEWAY_TITLE[response.status] ?? 'Request failed',
      status: response.status,
      detail:
        response.status >= 500
          ? "The server didn't respond properly. It may still be starting up."
          : `The request failed with status ${response.status}.`,
    }
    return new Response(JSON.stringify(problem), {
      status: response.status,
      statusText: response.statusText,
      headers: { 'content-type': 'application/problem+json' },
    })
  },
})
