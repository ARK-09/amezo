import { Navigate } from 'react-router'

import { Avatar } from '@/components/Avatar'
import { displayNameFor } from '@/lib/displayName'
import { Button } from '@/components/ui/button'
import { useBuyerSignOut } from '@/features/session/api/useBuyerAuth'
import { useSession } from '@/features/session/api/useSession'

/**
 * Where the header's avatar goes. Small on purpose - there is no buyer order history
 * API, so this is the identity and a way out, not a dashboard pretending to more.
 */
export function Account() {
  const session = useSession()
  const signOut = useBuyerSignOut()

  if (session.isPending) {
    return <p className="mx-auto px-7 py-16 text-sm text-muted-foreground">Loading…</p>
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

      {identity.identityType === 'SELLER' && (
        <p className="mt-4 text-sm text-muted-foreground">
          You're signed in as a seller. Your listings live in the seller portal.
        </p>
      )}
    </div>
  )
}
