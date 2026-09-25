import { Loader2 } from 'lucide-react'

import { useBackendWaking } from '@/lib/api/useBackendWaking'

/**
 * What a Render cold start looks like to the user: a line saying the server is
 * starting, instead of a page of "Couldn't load" panels. Only shown once a
 * request has actually failed for an infrastructure reason and is being retried,
 * so an ordinary slow first load stays a plain spinner and a real API error
 * still reads as an error.
 */
export function BackendWakingBanner() {
  const waking = useBackendWaking()
  if (!waking) return null

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900"
    >
      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
      Waking the server up — the free instance sleeps when idle, so this can take up to a minute.
    </div>
  )
}
