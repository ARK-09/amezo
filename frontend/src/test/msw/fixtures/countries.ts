import type { components } from '@/lib/api/schema'

type Country = components['schemas']['Country']

/**
 * A representative slice of the ISO list, not all 249 rows: enough to exercise
 * searching (several names starting with "United"), selecting, and the
 * plausible-but-wrong "UK" that must not appear.
 */
export const mockCountries: Country[] = [
  { code: 'AU', name: 'Australia' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'DE', name: 'Germany' },
  { code: 'IN', name: 'India' },
  { code: 'JP', name: 'Japan' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
]
