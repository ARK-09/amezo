import type { components } from '@/lib/api/schema'

type Address = components['schemas']['Address']

/** The postal block the order panels print, one line per row. */
export function formatAddressLines(address: Address): string[] {
  return [
    address.fullName,
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(', '),
    address.postalCode,
    address.country,
  ].filter((line): line is string => Boolean(line && line.trim()))
}
