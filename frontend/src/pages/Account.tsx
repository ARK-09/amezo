import { ChevronRight, Package } from 'lucide-react'
import { Link, Navigate } from 'react-router'

import { Avatar } from '@/components/Avatar'
import { displayNameFor } from '@/lib/displayName'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useBuyerSignOut } from '@/features/session/api/useBuyerAuth'
import { useSession } from '@/features/session/api/useSession'

/**
 * Where the header's avatar goes. The identity, a way out, and the entry point
 * to order history.
 */
export function Account() {
  const session = useSession()
  const signOut = useBuyerSignOut()

  // Checked before the signed-out redirect below, and that order matters. Signing
  // out empties the cached identity, so without this the page would fall through to
  // "not signed in" and bounce to the sign-in form - sending someone who just left
  // straight back to a login screen. Home is where signing out should land.
  if (signOut.isSuccess) {
    return <Navigate to="/" replace />
  }
  if (session.isPending) {
    // Centred in the space the page will fill, so the spinner does not sit at
    // the top of an empty screen and then jump when the account loads under it.
    return (
      <div className="flex flex-1 items-center justify-center px-7 py-16">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }
  if (!session.data) {
    return <Navigate to="/sign-in" replace />
  }

  const identity = session.data

  return (
    <div className="mx-auto w-full max-w-[640px] flex-1 px-7 py-10">
      <h1 className="mb-6 text-xl font-bold">Your account</h1>

      <div className="flex items-center gap-4 rounded-xl border p-5">
        <Avatar name={identity.fullName ?? identity.email} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{displayNameFor(identity.fullName ?? identity.email)}</p>
          <p className="truncate text-sm text-muted-foreground">{identity.email}</p>
        </div>
        <Button variant="outline" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
          {signOut.isPending ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>

      <Link
        to="/orders"
        className="mt-4 flex items-center gap-4 rounded-xl border p-5 transition-colors hover:border-primary/50 hover:bg-accent"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Package className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Your orders</span>
          <span className="block text-sm text-muted-foreground">
            Track deliveries, request a refund and buy again
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>

      {/* Sign-out used to fail silently here: the page is reachable by a seller
          session, the endpoint it called was buyer-only, and a rejected mutation
          showed nothing at all. The route is role-agnostic now, and a failure says
          so rather than looking like a dead button. */}
      {signOut.isError && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {signOut.error?.detail ?? "We couldn't sign you out. Please try again."}
        </p>
      )}

      {identity.identityType === 'SELLER' && (
        <p className="mt-4 text-sm text-muted-foreground">
          You're signed in as a seller. Your listings live in the seller portal.
        </p>
      )}
    </div>
  )
}
