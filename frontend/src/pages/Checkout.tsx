import { ArrowLeft } from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useCheckout } from '@/features/checkout/api/useCheckout'
import { useCheckoutCart } from '@/features/checkout/api/useCheckoutCart'
import { useLastCheckoutDetails } from '@/features/checkout/api/useLastCheckoutDetails'
import { useSession } from '@/features/session/api/useSession'
import { setDeliveryCountry, useDeliveryCountry } from '@/features/reference/deliveryCountry'
import { AddressFieldset } from '@/features/checkout/components/AddressFieldset'
import { RequiredMark } from '@/features/checkout/components/RequiredMark'
import { OrderSummary } from '@/features/checkout/components/OrderSummary'
import { EMPTY_ADDRESS, prefilledValues } from '@/features/checkout/schema/types'
import type { CheckoutFormValues, FieldErrors } from '@/features/checkout/schema/types'
import { validateCheckout } from '@/features/checkout/schema/validation'

export function Checkout() {
  const navigate = useNavigate()
  const session = useSession()
  const { rawLines, enrichedLines, total, isLoading, isError, error, clearCart } = useCheckoutCart()
  const checkout = useCheckout()

  // Only a signed-in buyer has anything to prefill; a guest checkout makes no
  // request for it at all.
  const lastDetails = useLastCheckoutDetails(Boolean(session.data))
  const deliveryCountry = useDeliveryCountry()

  const [values, setValues] = useState<CheckoutFormValues>({
    email: '',
    phone: '',
    shippingAddress: EMPTY_ADDRESS,
    sameAsShipping: true,
    billingAddress: EMPTY_ADDRESS,
  })
  const [errors, setErrors] = useState<FieldErrors>({})

  /**
   * Which fields the buyer has edited themselves. A ref, not state: nothing renders
   * from it, and making it state would re-run the prefill effect on every keystroke
   * just to tell it to do nothing.
   *
   * It is what stops prefilled data landing on top of typing. The details arrive
   * asynchronously, so without it a slow response would overwrite an address someone
   * had already started correcting.
   */
  const touched = useRef<Set<string>>(new Set())

  /**
   * Errors appear on the first submit and then track what is typed. Validating from
   * the very first keystroke would mark an empty form red before anyone had a chance
   * to fill it in.
   */
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    setValues((current) =>
      prefilledValues(current, touched.current, {
        email: session.data?.email,
        details: lastDetails.data ?? null,
        // An explicit "Deliver to" choice outranks the country of an old order:
        // it is the more recent statement of where this buyer wants things sent.
        deliveryCountry,
      }),
    )
  }, [session.data, lastDetails.data, deliveryCountry])

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

  /** Records an edit and, once the form has been submitted once, re-checks it. */
  function edit(next: CheckoutFormValues, path?: string) {
    if (path) touched.current.add(path)
    setValues(next)
    if (submitted) setErrors(validateCheckout(next))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    const fieldErrors = validateCheckout(values)
    setErrors(fieldErrors)
    // Nothing is sent while a required field is missing or malformed. The backend
    // checks the same rules again - this only saves a round trip that could only
    // ever come back refused.
    if (Object.keys(fieldErrors).length > 0) {
      document.getElementById(FIRST_INVALID_ANCHOR[Object.keys(fieldErrors)[0]] ?? '')?.focus()
      return
    }

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
        <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col gap-6">
          <p className="text-xs text-muted-foreground">
            Fields marked <span className="text-destructive">*</span> are required.
          </p>

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
                <p className="mt-1 text-muted-foreground">{problem.detail ?? 'Please try again.'}</p>
              )}
            </div>
          )}

          <Card>
            <CardContent className="flex flex-col gap-3 p-5">
              <h2 className="font-semibold">Contact</h2>
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-0.5">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <RequiredMark />
                </span>
                <Input
                  id="email"
                  type="email"
                  value={values.email}
                  aria-required
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  onChange={(e) => edit({ ...values, email: e.target.value }, 'email')}
                />
                {errors.email && (
                  <p id="email-error" className="text-xs text-destructive">
                    {errors.email}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-0.5">
                  <label htmlFor="phone" className="text-sm font-medium">
                    Phone
                  </label>
                  <RequiredMark />
                </span>
                <Input
                  id="phone"
                  type="tel"
                  value={values.phone}
                  aria-required
                  aria-invalid={errors.phone ? true : undefined}
                  aria-describedby={errors.phone ? 'phone-error' : undefined}
                  onChange={(e) => edit({ ...values, phone: e.target.value }, 'phone')}
                />
                {errors.phone && (
                  <p id="phone-error" className="text-xs text-destructive">
                    {errors.phone}
                  </p>
                )}
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
                onChange={(patch) => {
                  // A country chosen here is the same decision as choosing it in the
                  // header, so it updates the shared preference and the header follows.
                  // Only the shipping one: where the card is billed says nothing about
                  // where the parcel goes.
                  if (patch.country) setDeliveryCountry(patch.country)
                  edit(
                    { ...values, shippingAddress: { ...values.shippingAddress, ...patch } },
                    `shippingAddress.${Object.keys(patch)[0]}`,
                  )
                }}
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
                    onChange={(e) => edit({ ...values, sameAsShipping: e.target.checked })}
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
                    edit(
                      { ...values, billingAddress: { ...values.billingAddress, ...patch } },
                      `billingAddress.${Object.keys(patch)[0]}`,
                    )
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
          <OrderSummary
            lines={enrichedLines}
            total={total}
            isLoading={isLoading}
            isError={isError}
            error={error}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Where to put the cursor when a submit is refused, keyed by the error path the
 * validator produces. Landing on the offending field beats a message at the top of a
 * form that may have scrolled out of view.
 */
const FIRST_INVALID_ANCHOR: Record<string, string> = {
  email: 'email',
  phone: 'phone',
  'shippingAddress.fullName': 'shipping-fullName',
  'shippingAddress.line1': 'shipping-line1',
  'shippingAddress.city': 'shipping-city',
  'shippingAddress.state': 'shipping-state',
  'shippingAddress.postalCode': 'shipping-postalCode',
  'shippingAddress.country': 'shipping-country',
  'billingAddress.fullName': 'billing-fullName',
  'billingAddress.line1': 'billing-line1',
  'billingAddress.city': 'billing-city',
  'billingAddress.state': 'billing-state',
  'billingAddress.postalCode': 'billing-postalCode',
  'billingAddress.country': 'billing-country',
}
