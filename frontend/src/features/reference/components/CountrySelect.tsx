import { SearchableSelect } from '@/components/ui/searchable-select'

import { filterCountries, useCountries } from '../api/useCountries'

/**
 * Checkout's country field. Searchable because the list is the whole ISO registry -
 * scrolling 249 options to reach Zimbabwe is not a control anyone would use - and a
 * selector rather than a text box because the stored value has to be a real code,
 * which the backend enforces either way.
 */
export function CountrySelect({
  value,
  onChange,
  id,
  invalid,
}: {
  /** The selected ISO 3166-1 alpha-2 code, or null. */
  value: string | null
  onChange: (code: string) => void
  id?: string
  invalid?: boolean
}) {
  const countries = useCountries()

  return (
    <SearchableSelect
      id={id}
      items={countries.data ?? []}
      value={value}
      onChange={onChange}
      getKey={(country) => country.code}
      getLabel={(country) => country.name}
      filter={filterCountries}
      label="Country"
      placeholder={countries.isPending ? 'Loading countries…' : 'Select a country'}
      searchPlaceholder="Search countries"
      emptyMessage="No country matches that"
      disabled={countries.isPending || (countries.data?.length ?? 0) === 0}
      invalid={invalid}
    />
  )
}
