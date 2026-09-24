import { ShoppingBag } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRequestMagicLink } from '@/features/seller-portal/api/useSellerAuth'

export function SellerSignIn() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const { mutate, isPending, isError } = useRequestMagicLink()

  function submit(e: FormEvent) {
    e.preventDefault()
    mutate(email, { onSuccess: () => setSent(true) })
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
              {isError && (
                <p className="text-sm text-destructive">Something went wrong. Try again.</p>
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
