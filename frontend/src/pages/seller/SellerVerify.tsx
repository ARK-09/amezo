import { useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { useVerifyMagicLink } from '@/features/seller-portal/api/useSellerAuth'
import { useSellerAuth } from '@/features/seller-portal/context/SellerAuthContext'

export function SellerVerify() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()
  const { signIn } = useSellerAuth()
  const { mutate, isPending, isError } = useVerifyMagicLink()
  const attempted = useRef(false)

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true
    mutate(token, {
      onSuccess: (session) => {
        signIn({ sellerId: session.sellerId, email: session.email })
        navigate('/seller/products', { replace: true })
      },
    })
  }, [token, mutate, signIn, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border p-6 text-center">
        {!token && <p className="text-sm text-destructive">This link is missing a token.</p>}
        {token && isPending && <p className="text-sm text-muted-foreground">Signing you in…</p>}
        {token && isError && (
          <>
            <p className="font-medium">This link is invalid or expired</p>
            <p className="mt-1.5 mb-4 text-sm text-muted-foreground">
              Request a new one to sign in.
            </p>
            <Button asChild>
              <Link to="/seller/sign-in">Back to sign in</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
