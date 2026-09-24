import createClient from 'openapi-fetch'

import type { paths } from './schema'

export interface ProblemDetail {
  type: string
  title: string
  status: number
  detail?: string
  errors?: { field: string; reason: string }[]
}

export const apiClient = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8080',
  credentials: 'include',
  // resolve fetch per-call, not at client-creation time — otherwise this
  // captures the pre-MSW global fetch and test mocking silently no-ops
  fetch: (...args: Parameters<typeof globalThis.fetch>) =>
    globalThis.fetch(...args),
})

apiClient.use({
  onResponse({ response }) {
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('api:unauthorized'))
    }
    return response
  },
})
