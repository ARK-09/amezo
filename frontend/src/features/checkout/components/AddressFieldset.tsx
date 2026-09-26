import type { ReactNode } from 'react'

import { Input } from '@/components/ui/input'
import { CountrySelect } from '@/features/reference/components/CountrySelect'

import type { AddressFormValues, FieldErrors } from '../schema/types'
import { RequiredMark } from './RequiredMark'

/**
 * One labelled field.
 *
 * `required` drives the asterisk, `aria-required` and nothing else - the actual rule
 * lives in validateCheckout, which mirrors CheckoutAddressRequest's Bean Validation.
 * Keeping the marker and the rule in step is why this is a flag on the field rather
 * than an asterisk typed into each label string, which is how a form ends up claiming
 * an optional field is required.
 */
function Field({
  label,
  id,
  error,
  required = false,
  className,
  children,
}: {
  label: string
  id: string
  error?: string
  required?: boolean
  className?: string
  children: (aria: { 'aria-invalid'?: true; 'aria-describedby'?: string; 'aria-required'?: true }) => ReactNode
}) {
  const errorId = `${id}-error`
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      {/* The asterisk sits beside the label, not inside it. A label whose text is
          "City *" is a label literally named "City *" - which is what every
          accessible-name lookup, and every test that asks for a field by its label,
          would then have to spell. aria-required on the control carries the meaning;
          this glyph is decoration for sighted readers. */}
      <span className="flex items-center gap-0.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {required && <RequiredMark />}
      </span>
      {children({
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
        'aria-required': required || undefined,
      })}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
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
      <Field label="Full name" id={`${idPrefix}-fullName`} className="col-span-2" error={errorFor('fullName')} required>
        {(aria) => (
          <Input
            id={`${idPrefix}-fullName`}
            value={values.fullName}
            onChange={(e) => onChange({ fullName: e.target.value })}
            {...aria}
          />
        )}
      </Field>
      <Field label="Address line 1" id={`${idPrefix}-line1`} className="col-span-2" error={errorFor('line1')} required>
        {(aria) => (
          <Input
            id={`${idPrefix}-line1`}
            value={values.line1}
            onChange={(e) => onChange({ line1: e.target.value })}
            {...aria}
          />
        )}
      </Field>
      {/* The one genuinely optional field, and the only one with no asterisk -
          CheckoutAddressRequest leaves line2 off its @NotBlank list too. */}
      <Field label="Address line 2" id={`${idPrefix}-line2`} className="col-span-2">
        {(aria) => (
          <Input
            id={`${idPrefix}-line2`}
            value={values.line2}
            onChange={(e) => onChange({ line2: e.target.value })}
            placeholder="Optional"
            {...aria}
          />
        )}
      </Field>
      <Field label="City" id={`${idPrefix}-city`} error={errorFor('city')} required>
        {(aria) => (
          <Input
            id={`${idPrefix}-city`}
            value={values.city}
            onChange={(e) => onChange({ city: e.target.value })}
            {...aria}
          />
        )}
      </Field>
      <Field label="State" id={`${idPrefix}-state`} error={errorFor('state')} required>
        {(aria) => (
          <Input
            id={`${idPrefix}-state`}
            value={values.state}
            onChange={(e) => onChange({ state: e.target.value })}
            {...aria}
          />
        )}
      </Field>
      <Field label="Postal code" id={`${idPrefix}-postalCode`} error={errorFor('postalCode')} required>
        {(aria) => (
          <Input
            id={`${idPrefix}-postalCode`}
            value={values.postalCode}
            onChange={(e) => onChange({ postalCode: e.target.value })}
            {...aria}
          />
        )}
      </Field>
      {/* A selector, not a text box. Nobody should be typing "UK" and finding out at
          the end that the ISO code is GB - and the backend validates the code either
          way, so a typed field could only ever be a slower route to the same refusal. */}
      <Field label="Country" id={`${idPrefix}-country`} error={errorFor('country')} required>
        {() => (
          <CountrySelect
            id={`${idPrefix}-country`}
            value={values.country || null}
            onChange={(code) => onChange({ country: code })}
            invalid={Boolean(errorFor('country'))}
          />
        )}
      </Field>
    </div>
  )
}
