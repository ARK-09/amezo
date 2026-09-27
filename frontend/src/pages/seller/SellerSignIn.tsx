import { ShoppingBag } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Navigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRequestMagicLink } from '@/features/seller-portal/api/useSellerAuth'
import { useSellerAuth } from '@/features/seller-portal/context/SellerAuthContext'
import { apiErrorMessage } from '@/lib/api/transient'

export function SellerSignIn() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const { mutate, isPending, isError, error } = useRequestMagicLink()
  const { seller } = useSellerAuth()

  // One path, the real one: ask for a link, then say so. The bypass that used to
  // sit here signed the seller in on the spot with a fabricated session
  // (crypto.randomUUID and the typed email, no cookie), which the rest of the app -
  // the landing page included - then read as a signed-in seller.
  function submit(e: FormEvent) {
    e.preventDefault()
    mutate(email, { onSuccess: () => setSent(true) })
  }

  // Already signed in: nobody needs to be asked for an email they've already
  // used. replace, not push, so Back doesn't land them here again.
  if (seller) {
    return <Navigate to="/seller/products" replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ShoppingBag className="size-4" />
          </span>
          <span className="text-lg font-bold">Amezo Seller</span>
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
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              {/* Often the first request of the visit, so it is the one most
                  likely to hit a sleeping instance. Mutations don't retry (see
                  createAppQueryClient), so the message has to say what happened
                  and that pressing the button again is the right move. */}
              {isError && (
                <p role="alert" className="text-sm text-destructive">
                  {apiErrorMessage(error)}
                </p>
              )}
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? 'Sending…' : 'Send magic link'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
