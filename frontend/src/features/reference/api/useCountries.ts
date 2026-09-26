import { useQuery } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

export type Country = components['schemas']['Country']

export const countryKeys = {
  all: ['countries'] as const,
}

/**
 * The system country list (ISO 3166-1 alpha-2), from the same source the backend
 * validates against - so the selector cannot offer a code checkout will reject.
 *
 * Roughly 250 rows, fetched once per session. Large enough that the selector has to
 * be searchable, small enough that searching it in the browser beats a request per
 * keystroke.
 */
export function useCountries() {
  return useQuery<Country[], ProblemDetail>({
    queryKey: countryKeys.all,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/countries', { signal })
      if (error) throw error
      return data
    },
    staleTime: 24 * 60 * 60 * 1000,
  })
}

/**
 * Matches on name and on code, so both "united k" and "GB" find the same country.
 *
 * Short queries are treated differently on purpose. Someone typing one or two
 * characters is starting a name or typing a code, so those match a code prefix or the
 * start of a WORD in the name - matching anywhere inside the name would return
 * "United Kingdom" for "in" (k-in-gdom), burying India and Indonesia in noise. From
 * three characters on, a substring match is what people expect ("king" should find
 * United Kingdom).
 */
const SHORT_QUERY = 2

export function filterCountries(countries: Country[], query: string): Country[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return countries

  return countries.filter((country) => {
    if (country.code.toLowerCase().startsWith(needle)) return true
    const name = country.name.toLowerCase()
    return needle.length <= SHORT_QUERY
      ? name.split(/[\s-]+/).some((word) => word.startsWith(needle))
      : name.includes(needle)
  })
}

export function countryName(countries: Country[], code: string): string {
  return countries.find((country) => country.code === code)?.name ?? code
}
