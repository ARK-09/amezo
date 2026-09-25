/**
 * Telling "the backend is asleep" apart from "the backend said no".
 *
 * The API runs on a Render free instance, which spins down after 15 minutes of
 * inactivity; the first request after that waits on a cold start, and can come
 * back as a gateway error instead of a slow success. None of that means the
 * request was wrong, so those failures are retried. A 401, a 404, a validation
 * 422 - anything the application itself decided - is an answer, and retrying it
 * would only delay showing it.
 */

/**
 * Long enough for a documented Render cold start (Render says up to a minute)
 * to land inside one or two attempts, short enough that a request which will
 * never answer doesn't hold the UI for a minute on its own. A retry after this
 * costs nothing on Render's side: the instance is already booting, and a new
 * request joins the same wait rather than restarting it.
 */
export const REQUEST_TIMEOUT_MS = 20_000

/**
 * Four attempts in total. With the delays below that is at most
 * 4 x 20s + 1s + 2s + 4s, so a backend that is genuinely down produces an error
 * in about a minute and a half instead of retrying forever.
 */
export const MAX_TRANSIENT_RETRIES = 3

/**
 * Statuses that mean "infrastructure", not "your request".
 *
 * 502/503/504 are what a proxy returns while the thing behind it is starting,
 * restarting, or overloaded - Render's router included. 408 and 425 are
 * timeouts by definition, and 429 is a rate limit that clears on its own.
 *
 * 500 is deliberately NOT here. A 500 carries a ProblemDetail from the
 * application, which means the request reached it and something in the code
 * failed; three more attempts produce three more of the same failure and hide
 * the bug behind a spinner.
 */
const RETRYABLE_STATUS = new Set([408, 425, 429, 502, 503, 504])

/** Thrown by the API client when one attempt outlives REQUEST_TIMEOUT_MS. */
export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`)
    this.name = 'RequestTimeoutError'
  }
}

function statusOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : null
}

/**
 * True for a failure worth trying again: our own request timeout, a fetch that
 * never reached a server (DNS, connection refused, TLS, the instance still
 * booting - all a TypeError from fetch), or a gateway-shaped status.
 *
 * Note what is excluded: an AbortError. React Query aborts in-flight queries
 * when a component unmounts or a key changes, and that is a cancellation, not a
 * failure to recover from.
 */
export function isTransientFailure(error: unknown): boolean {
  if (error instanceof RequestTimeoutError) return true
  // Network-level failure. Browsers and undici both surface these as a
  // TypeError from fetch ("Failed to fetch" / "fetch failed").
  if (error instanceof TypeError) return true

  const status = statusOf(error)
  if (status !== null) return RETRYABLE_STATUS.has(status)

  return false
}

/**
 * React Query's `retry` for queries. Bounded, and only for transient failures -
 * a 4xx stops on the first attempt so the UI can show what the API said.
 */
export function retryTransientQuery(failureCount: number, error: unknown): boolean {
  // failureCount is 0 on the decision after the first failure, so `<` gives
  // MAX_TRANSIENT_RETRIES retries - the same arithmetic as React Query's own
  // numeric `retry`.
  return failureCount < MAX_TRANSIENT_RETRIES && isTransientFailure(error)
}

/**
 * 1s, 2s, 4s. Backed off so a waking instance gets progressively more room,
 * capped so the total stays inside the budget documented above.
 */
export function transientRetryDelay(failureCount: number): number {
  return Math.min(1000 * 2 ** failureCount, 4000)
}

/**
 * The sentence to show a user for a failed request. Transient failures get the
 * cold-start wording rather than the raw status, because "502 Bad Gateway" or a
 * bare "Something went wrong" is a worse description of a sleeping instance than
 * "it's starting up". Anything the API itself said keeps its own detail - that
 * text was written for the user and is more specific than anything here.
 */
export function apiErrorMessage(error: unknown): string {
  if (isTransientFailure(error)) {
    return "The server isn't responding yet — it may still be starting up. Try again in a moment."
  }
  if (typeof error === 'object' && error !== null) {
    const { detail, title } = error as { detail?: unknown; title?: unknown }
    if (typeof detail === 'string' && detail) return detail
    if (typeof title === 'string' && title) return title
  }
  return 'Something went wrong. Try again.'
}
