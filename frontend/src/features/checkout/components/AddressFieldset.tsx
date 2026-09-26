import type { ReactNode } from 'react'

import { Input } from '@/components/ui/input'
import { CountrySelect } from '@/features/reference/components/CountrySelect'

import type { AddressFormValues, FieldErrors } from '../schema/types'

function Field({
  label,
  id,
  error,
  className,
  children,
}: {
  label: string
  id: string
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function AddressFieldset({
  prefix,
  idPrefix,
  values,
  errors,
  onChange,
}: {
  prefix: 'shippingAddress' | 'billingAddress'
  idPrefix: string
  values: AddressFormValues
  errors: FieldErrors
  onChange: (patch: Partial<AddressFormValues>) => void
}) {
  const errorFor = (field: string) => errors[`${prefix}.${field}`]

  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Full name" id={`${idPrefix}-fullName`} className="col-span-2" error={errorFor('fullName')}>
        <Input
          id={`${idPrefix}-fullName`}
          value={values.fullName}
          onChange={(e) => onChange({ fullName: e.target.value })}
        />
      </Field>
      <Field label="Address line 1" id={`${idPrefix}-line1`} className="col-span-2" error={errorFor('line1')}>
        <Input id={`${idPrefix}-line1`} value={values.line1} onChange={(e) => onChange({ line1: e.target.value })} />
      </Field>
      <Field label="Address line 2 (optional)" id={`${idPrefix}-line2`} className="col-span-2">
        <Input id={`${idPrefix}-line2`} value={values.line2} onChange={(e) => onChange({ line2: e.target.value })} />
      </Field>
      <Field label="City" id={`${idPrefix}-city`} error={errorFor('city')}>
        <Input id={`${idPrefix}-city`} value={values.city} onChange={(e) => onChange({ city: e.target.value })} />
      </Field>
      <Field label="State" id={`${idPrefix}-state`} error={errorFor('state')}>
        <Input id={`${idPrefix}-state`} value={values.state} onChange={(e) => onChange({ state: e.target.value })} />
      </Field>
      <Field label="Postal code" id={`${idPrefix}-postalCode`} error={errorFor('postalCode')}>
        <Input
          id={`${idPrefix}-postalCode`}
          value={values.postalCode}
          onChange={(e) => onChange({ postalCode: e.target.value })}
        />
      </Field>
      {/* A selector, not a text box. Nobody should be typing "UK" and finding out at
          the end that the ISO code is GB - and the backend validates the code either
          way, so a typed field could only ever be a slower route to the same refusal. */}
      <Field label="Country" id={`${idPrefix}-country`} error={errorFor('country')}>
        <CountrySelect
          id={`${idPrefix}-country`}
          value={values.country || null}
          onChange={(code) => onChange({ country: code })}
          invalid={Boolean(errorFor('country'))}
        />
      </Field>
    </div>
  )
}
