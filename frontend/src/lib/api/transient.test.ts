import { describe, expect, it } from 'vitest'

import {
  apiErrorMessage,
  isTransientFailure,
  MAX_TRANSIENT_RETRIES,
  RequestTimeoutError,
  retryTransientQuery,
  transientRetryDelay,
} from './transient'

/** A ProblemDetail as the client hands it to a queryFn. */
function problem(status: number, extra: Record<string, unknown> = {}) {
  return { type: 'about:blank', title: 'x', status, ...extra }
}

describe('isTransientFailure', () => {
  it('treats gateway and timeout statuses as transient', () => {
    for (const status of [408, 425, 429, 502, 503, 504]) {
      expect(isTransientFailure(problem(status)), `status ${status}`).toBe(true)
    }
  })

  /**
   * The line the whole feature turns on. A 401 is a session answer, a 404 is a
   * missing thing, a 422 is bad input - retrying any of them delays the truth
   * and, for 401, keeps the user staring at a spinner instead of a sign-in page.
   */
  it('never treats a 4xx the application decided as transient', () => {
    for (const status of [400, 401, 403, 404, 409, 410, 413, 422]) {
      expect(isTransientFailure(problem(status)), `status ${status}`).toBe(false)
    }
  })

  /**
   * 500 means the request reached the application and its code failed. Three
   * more attempts produce three more of the same failure, with the bug hidden
   * behind a "starting up" message.
   */
  it('does not treat a 500 as transient', () => {
    expect(isTransientFailure(problem(500))).toBe(false)
  })

  it('treats our own request timeout as transient', () => {
    expect(isTransientFailure(new RequestTimeoutError(20_000))).toBe(true)
  })

  /** What fetch throws when it never reached a server at all. */
  it('treats a network-level fetch failure as transient', () => {
    expect(isTransientFailure(new TypeError('Failed to fetch'))).toBe(true)
    expect(isTransientFailure(new TypeError('fetch failed'))).toBe(true)
  })

  /**
   * React Query aborts in-flight queries on unmount and on key changes. That is
   * a cancellation, and retrying it would resurrect a query nobody is watching.
   */
  it('does not treat an abort as transient', () => {
    expect(isTransientFailure(new DOMException('The user aborted a request.', 'AbortError'))).toBe(false)
  })

  it('does not treat an unrecognised value as transient', () => {
    expect(isTransientFailure(new Error('boom'))).toBe(false)
    expect(isTransientFailure(null)).toBe(false)
    expect(isTransientFailure('502')).toBe(false)
    expect(isTransientFailure({ status: '502' })).toBe(false)
  })
})

describe('retryTransientQuery', () => {
  it('retries a transient failure exactly MAX_TRANSIENT_RETRIES times', () => {
    // failureCount is 0 on the decision after the first failure, so the last
    // retry is granted at MAX_TRANSIENT_RETRIES - 1 and refused at the cap.
    for (let failureCount = 0; failureCount < MAX_TRANSIENT_RETRIES; failureCount++) {
      expect(retryTransientQuery(failureCount, problem(503)), `failureCount ${failureCount}`).toBe(true)
    }
    expect(retryTransientQuery(MAX_TRANSIENT_RETRIES, problem(503))).toBe(false)
    expect(retryTransientQuery(MAX_TRANSIENT_RETRIES + 7, problem(503))).toBe(false)
  })

  it('never retries a non-transient failure, not even once', () => {
    expect(retryTransientQuery(0, problem(404))).toBe(false)
    expect(retryTransientQuery(0, problem(401))).toBe(false)
  })
})

describe('transientRetryDelay', () => {
  it('backs off and then caps', () => {
    expect(transientRetryDelay(0)).toBe(1000)
    expect(transientRetryDelay(1)).toBe(2000)
    expect(transientRetryDelay(2)).toBe(4000)
    expect(transientRetryDelay(9)).toBe(4000)
  })

  /**
   * The bound the user is promised: a backend that is down produces an error,
   * not an indefinite wait. Four attempts of at most 20s plus the delays.
   */
  it('keeps the worst case under two minutes', () => {
    let total = 20_000
    for (let i = 0; i < MAX_TRANSIENT_RETRIES; i++) total += transientRetryDelay(i) + 20_000
    expect(total).toBeLessThan(120_000)
  })
})

describe('apiErrorMessage', () => {
  it('describes a cold start for transient failures', () => {
    expect(apiErrorMessage(problem(502))).toMatch(/still be starting up/)
    expect(apiErrorMessage(new RequestTimeoutError(20_000))).toMatch(/still be starting up/)
    expect(apiErrorMessage(new TypeError('Failed to fetch'))).toMatch(/still be starting up/)
  })

  it("prefers the API's own detail, then its title", () => {
    expect(apiErrorMessage(problem(409, { detail: 'SKU TB-1 belongs to another variant' }))).toBe(
      'SKU TB-1 belongs to another variant',
    )
    expect(apiErrorMessage({ title: 'Not Found', status: 404 })).toBe('Not Found')
  })

  it('falls back to a generic sentence', () => {
    expect(apiErrorMessage(null)).toBe('Something went wrong. Try again.')
    expect(apiErrorMessage(new Error('boom'))).toBe('Something went wrong. Try again.')
  })
})
