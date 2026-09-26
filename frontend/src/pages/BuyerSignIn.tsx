import { ShoppingBag } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Navigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRequestBuyerMagicLink } from '@/features/session/api/useBuyerAuth'
import { useViewerRole } from '@/features/session/api/useViewerRole'
import { apiErrorMessage } from '@/lib/api/transient'

/**
 * Buyer sign-in. The same magic-link flow the seller portal uses, on the buyer side,
 * because reviewing something requires the server to know who is reviewing it.
 */
export function BuyerSignIn() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const { mutate, isPending, isError, error } = useRequestBuyerMagicLink()
  const viewer = useViewerRole()

  // Already signed in as a buyer: nobody needs to be asked for an address
  // they've just used. A seller is a different matter - they hold a seller
  // session, not a buyer one, so this form is exactly what they came for, and
  // bouncing them to the buyer account page answered a question they hadn't
  // asked.
  if (viewer.role === 'buyer') {
    return <Navigate to="/account" replace />
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    mutate(email, { onSuccess: () => setSent(true) })
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <div className="mb-8 flex items-center justify-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <ShoppingBag className="size-4" />
        </span>
        <span className="text-lg font-bold">Amezo</span>
      </div>

      <div className="rounded-xl border p-6">
        {sent ? (
          <div className="text-center">
            <p className="font-medium">Check your email</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              We sent a sign-in link to {email}. It expires in 15 minutes.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {viewer.role === 'seller'
                ? "You're signed in as a seller. Signing in here gives you a separate buyer account."
                : "No password. We'll email you a link that signs you in."}
            </p>
            {isError && (
              <p role="alert" className="text-sm text-destructive">
                {apiErrorMessage(error)}
              </p>
            )}
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? 'Sending…' : 'Email me a link'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
