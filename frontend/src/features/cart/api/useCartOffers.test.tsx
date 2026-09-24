import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { server } from '@/test/msw/server'

import { useCartOffers } from './useCartOffers'

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

const HEADPHONES_V1 = '11111111-1111-1111-1111-111111111111-v1'
const COOKWARE_V1 = '33333333-3333-3333-3333-333333333333-v1'

describe('useCartOffers', () => {
  it('fetches offers for the given ids in a single call', async () => {
    const { result } = renderHook(() => useCartOffers([HEADPHONES_V1, COOKWARE_V1], true), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((o) => o.id).sort()).toEqual([COOKWARE_V1, HEADPHONES_V1].sort())
  })

  it('omits ids that no longer exist instead of erroring', async () => {
    const { result } = renderHook(() => useCartOffers([HEADPHONES_V1, 'ghost-id'], true), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((o) => o.id)).toEqual([HEADPHONES_V1])
  })

  it('does not fetch when disabled', () => {
    let calls = 0
    server.use(
      http.get('http://localhost:8080/variants', () => {
        calls += 1
        return HttpResponse.json([])
      }),
    )
    renderHook(() => useCartOffers([HEADPHONES_V1], false), { wrapper })
    expect(calls).toBe(0)
  })

  it('does not fetch with an empty id list', () => {
    let calls = 0
    server.use(
      http.get('http://localhost:8080/variants', () => {
        calls += 1
        return HttpResponse.json([])
      }),
    )
    renderHook(() => useCartOffers([], true), { wrapper })
    expect(calls).toBe(0)
  })
})
