import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { server } from '@/test/msw/server'

import { apiClient } from './client'
import { REQUEST_TIMEOUT_MS, RequestTimeoutError, isTransientFailure } from './transient'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/**
 * A fetch that never answers, with real abort semantics: it rejects with
 * signal.reason, and rejects immediately if the signal is already aborted by the
 * time it is called. The second half matters - a caller that cancels before the
 * request goes out hands us a pre-aborted signal.
 */
function hangingFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init!.signal!
        if (signal.aborted) {
          reject(signal.reason)
          return
        }
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      }),
  )
}

describe('apiClient error normalisation', () => {
  /**
   * The failure that started this: Render answers for a sleeping instance with
   * its own HTML page, not a ProblemDetail. openapi-fetch hands that back as a
   * string, which carries no status - so the retry policy could not tell a cold
   * start from a 404. Normalising means the status always survives.
   */
  it("turns a gateway's HTML error page into a ProblemDetail carrying the status", async () => {
    server.use(
      http.get(
        'http://localhost:8080/sessions/current',
        () =>
          new HttpResponse('<html><body>Bad gateway</body></html>', {
            status: 502,
            headers: { 'content-type': 'text/html' },
          }),
        { once: true },
      ),
    )

    const { error } = await apiClient.GET('/sessions/current')

    expect(error).toMatchObject({ status: 502, title: 'Bad Gateway' })
    expect(isTransientFailure(error)).toBe(true)
  })

  /**
   * A dropped connection can also arrive as a status with no body at all. Left
   * alone, openapi-fetch reports that as the empty string, and `if (error) throw
   * error` in a queryFn does not throw - so a failed request looked like a
   * success with undefined data.
   */
  it('turns an empty-bodied 503 into a truthy error', async () => {
    server.use(
      http.get('http://localhost:8080/sessions/current', () => new HttpResponse(null, { status: 503 }), {
        once: true,
      }),
    )

    const { data, error } = await apiClient.GET('/sessions/current')

    expect(data).toBeUndefined()
    expect(error).toBeTruthy()
    expect(error).toMatchObject({ status: 503, title: 'Service Unavailable' })
  })

  /** The API's own errors are already ProblemDetails and must not be rewritten. */
  it("passes the API's own ProblemDetail through untouched", async () => {
    server.use(
      http.get(
        'http://localhost:8080/sessions/current',
        () =>
          HttpResponse.json(
            {
              type: 'https://api/errors/unauthorized',
              title: 'Unauthorized',
              status: 401,
              detail: 'Session is missing, expired, or invalid',
            },
            { status: 401, headers: { 'content-type': 'application/problem+json' } },
          ),
        { once: true },
      ),
    )

    const { error } = await apiClient.GET('/sessions/current')

    expect(error).toEqual({
      type: 'https://api/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: 'Session is missing, expired, or invalid',
    })
  })

  it('still announces a 401 so a stale local session can be dropped', async () => {
    const onUnauthorized = vi.fn()
    window.addEventListener('api:unauthorized', onUnauthorized)

    await apiClient.GET('/sessions/current') // the default handler answers 401

    expect(onUnauthorized).toHaveBeenCalledOnce()
    window.removeEventListener('api:unauthorized', onUnauthorized)
  })
})

describe('apiClient request timeout', () => {
  /**
   * A request to a sleeping instance can hang for minutes. Without a deadline
   * React Query never sees a failure, so it never retries and the page sits on a
   * spinner - the "broken UI" this is here to prevent.
   *
   * fetch is stubbed rather than mocked through MSW so the hang is exact, and
   * rejects with signal.reason the way a real fetch does on abort.
   */
  it('aborts an attempt that outlives the timeout, with a retryable error', async () => {
    vi.useFakeTimers()
    hangingFetch()

    const pending = apiClient.GET('/sessions/current')
    const settled = pending.then(
      () => 'resolved',
      (error: unknown) => error,
    )

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1)
    // Nothing yet: the deadline is a deadline, not an eager give-up.
    await expect(Promise.race([settled, Promise.resolve('still waiting')])).resolves.toBe('still waiting')

    await vi.advanceTimersByTimeAsync(1)
    const outcome = await settled

    expect(outcome).toBeInstanceOf(RequestTimeoutError)
    expect(isTransientFailure(outcome)).toBe(true)
  })

  /**
   * React Query's own cancellation still has to work, and must stay
   * distinguishable from a timeout - otherwise unmounting a component would look
   * like a backend failure and be retried.
   */
  it("passes the caller's cancellation through as an abort, not a timeout", async () => {
    hangingFetch()

    const controller = new AbortController()
    const pending = apiClient.GET('/sessions/current', { signal: controller.signal })
    controller.abort()

    const outcome = await pending.then(
      () => null,
      (error: unknown) => error,
    )

    expect(outcome).not.toBeInstanceOf(RequestTimeoutError)
    expect((outcome as Error).name).toBe('AbortError')
    expect(isTransientFailure(outcome)).toBe(false)
  })

  /** A settled request must not leave a timer behind that fires an abort later. */
  it('clears its timer once the response arrives', async () => {
    vi.useFakeTimers()

    await apiClient.GET('/sessions/current')

    expect(vi.getTimerCount()).toBe(0)
  })
})
