import { useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { useVerifyBuyerMagicLink } from '@/features/session/api/useBuyerAuth'

/**
 * Where the emailed link lands (the backend builds it as <frontend>/verify?token=…).
 * Consumes the token once and hands the buyer back to browsing.
 */
export function BuyerVerify() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()
  const { mutate, isPending, isError } = useVerifyBuyerMagicLink()
  // Tokens are single-use, so a second attempt would fail on a link that worked.
  // StrictMode double-invokes effects in development, which is exactly that case.
  const attempted = useRef(false)

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true
    mutate(token, { onSuccess: () => navigate('/', { replace: true }) })
  }, [token, mutate, navigate])

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <div className="rounded-xl border p-6 text-center">
        {!token && <p className="text-sm text-destructive">This link is missing a token.</p>}
        {token && isPending && <p className="text-sm text-muted-foreground">Signing you in…</p>}
        {token && isError && (
          <>
            <p className="font-medium">This link is invalid or expired</p>
            <p className="mt-1.5 mb-4 text-sm text-muted-foreground">Request a new one to sign in.</p>
            <Button asChild>
              <Link to="/sign-in">Back to sign in</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
