import { ArrowLeft } from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useCheckout } from '@/features/checkout/api/useCheckout'
import { useCheckoutCart } from '@/features/checkout/api/useCheckoutCart'
import { useSession } from '@/features/checkout/api/useSession'
import { AddressFieldset } from '@/features/checkout/components/AddressFieldset'
import { OrderSummary } from '@/features/checkout/components/OrderSummary'
import { EMPTY_ADDRESS } from '@/features/checkout/schema/types'
import type { CheckoutFormValues, FieldErrors } from '@/features/checkout/schema/types'
import { validateCheckout } from '@/features/checkout/schema/validation'

export function Checkout() {
  const navigate = useNavigate()
  const session = useSession()
  const { rawLines, enrichedLines, total, isLoading, isError, clearCart } = useCheckoutCart()
  const checkout = useCheckout()

  const [values, setValues] = useState<CheckoutFormValues>({
    email: '',
    phone: '',
    shippingAddress: EMPTY_ADDRESS,
    sameAsShipping: true,
    billingAddress: EMPTY_ADDRESS,
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [emailTouched, setEmailTouched] = useState(false)

  // Pre-fill from a magic-link session, but never overwrite something the
  // buyer already typed.
  useEffect(() => {
    if (session.data?.email && !emailTouched) {
      setValues((v) => ({ ...v, email: session.data!.email }))
    }
  }, [session.data, emailTouched])

  if (rawLines.length === 0) {
    return (
      <div className="mx-auto flex max-w-[600px] flex-1 flex-col items-center justify-center gap-3 px-7 py-16 text-center">
        <p className="font-medium">Your cart is empty</p>
        <p className="text-sm text-muted-foreground">Add something to your cart before checking out.</p>
        <Link to="/search" className="text-sm underline">
          Continue shopping
        </Link>
      </div>
    )
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const fieldErrors = validateCheckout(values)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    checkout.mutate(
      {
        values,
        lines: enrichedLines.map(({ line }) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          expectedUnitPrice: line.priceWhenAdded,
        })),
      },
      {
        onSuccess: (order) => {
          clearCart()
          navigate(`/orders/${order.id}/confirmation`, { state: { order } })
        },
      },
    )
  }

  const problem = checkout.error
  const isStockError = problem?.type === 'https://api/errors/out-of-stock'
  const isPriceError = problem?.type === 'https://api/errors/price-changed'
  const itemizedErrors = (isStockError || isPriceError) && problem?.errors ? problem.errors : null

  return (
    <div className="mx-auto w-full max-w-[1100px] flex-1 px-7 py-6">
      <Link to="/search" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-3.5" aria-hidden />
        Continue shopping
      </Link>

      <div className="flex flex-col-reverse gap-6 lg:flex-row lg:items-start">
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6">
          {problem && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm" role="alert">
              <p className="font-medium text-destructive">
                {isStockError
                  ? 'Some items are no longer available'
                  : isPriceError
                    ? 'Prices have changed'
                    : 'Something went wrong'}
              </p>
              {itemizedErrors ? (
                <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                  {itemizedErrors.map((err, i) => (
                    <li key={i}>{err.reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  {problem.detail ?? 'Please try again.'}
                </p>
              )}
            </div>
          )}

          <Card>
            <CardContent className="flex flex-col gap-3 p-5">
              <h2 className="font-semibold">Contact</h2>
              <div className="flex flex-col gap-1">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={values.email}
                  onChange={(e) => {
                    setEmailTouched(true)
                    setValues((v) => ({ ...v, email: e.target.value }))
                  }}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="phone" className="text-sm font-medium">
                  Phone
                </label>
                <Input
                  id="phone"
                  type="tel"
                  value={values.phone}
                  onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
                />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 p-5">
              <h2 className="font-semibold">Shipping address</h2>
              <AddressFieldset
                prefix="shippingAddress"
                idPrefix="shipping"
                values={values.shippingAddress}
                errors={errors}
                onChange={(patch) =>
                  setValues((v) => ({ ...v, shippingAddress: { ...v.shippingAddress, ...patch } }))
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Billing address</h2>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={values.sameAsShipping}
                    onChange={(e) => setValues((v) => ({ ...v, sameAsShipping: e.target.checked }))}
                  />
                  Same as shipping
                </label>
              </div>
              {!values.sameAsShipping && (
                <AddressFieldset
                  prefix="billingAddress"
                  idPrefix="billing"
                  values={values.billingAddress}
                  errors={errors}
                  onChange={(patch) =>
                    setValues((v) => ({ ...v, billingAddress: { ...v.billingAddress, ...patch } }))
                  }
                />
              )}
            </CardContent>
          </Card>

          <Button type="submit" size="lg" disabled={checkout.isPending || isLoading || isError}>
            {checkout.isPending ? 'Placing order…' : 'Place order'}
          </Button>
        </form>

        <div className="w-full lg:w-[380px] lg:shrink-0">
          <OrderSummary lines={enrichedLines} total={total} isLoading={isLoading} isError={isError} />
        </div>
      </div>
    </div>
  )
}
