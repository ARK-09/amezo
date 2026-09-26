import { describe, expect, it } from 'vitest'

import { formatDeliveryDate, formatMediumDate, formatShortDate } from './formatDate'

describe('formatDate', () => {
  it('is day-first with a three-letter month, as the designs are', () => {
    expect(formatShortDate('2026-09-17T09:00:00Z')).toBe('17 Sep')
    expect(formatMediumDate('2026-09-17T09:00:00Z')).toBe('17 Sep 2026')
  })

  // en-GB renders September as "Sept", en-US reorders to "Sep 17" - neither is
  // what the designs show, which is why this is written out rather than Intl.
  it('abbreviates September to three letters', () => {
    expect(formatShortDate('2026-09-01T12:00:00Z')).toBe('1 Sep')
  })

  it('spells delivery estimates out with a weekday', () => {
    expect(formatDeliveryDate('2026-09-28T09:00:00Z')).toBe('Monday 28 September')
  })

  it('renders a missing date as a dash rather than "Invalid Date"', () => {
    expect(formatShortDate(null)).toBe('—')
    expect(formatMediumDate(undefined)).toBe('—')
    expect(formatDeliveryDate('not-a-date')).toBe('—')
  })
})
