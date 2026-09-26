import { describe, expect, it } from 'vitest'

import { orderAge, stockAlertSummary } from './queueFacts'

const NOW = new Date(2026, 8, 25, 9, 0)

describe('orderAge', () => {
  it('counts calendar days, not 24-hour blocks', () => {
    // Placed at eleven last night: ten hours ago, but anyone looking at the
    // queue this morning would call it a day old.
    expect(orderAge(new Date(2026, 8, 24, 23, 0).toISOString(), NOW)).toEqual({
      label: '1 day',
      overdue: false,
    })
  })

  it('calls today today', () => {
    expect(orderAge(new Date(2026, 8, 25, 2, 0).toISOString(), NOW).label).toBe('Today')
  })

  it('marks an order late once it has sat for three days', () => {
    expect(orderAge(new Date(2026, 8, 23, 9, 0).toISOString(), NOW)).toEqual({
      label: '2 days',
      overdue: false,
    })
    expect(orderAge(new Date(2026, 8, 22, 9, 0).toISOString(), NOW)).toEqual({
      label: '3 days',
      overdue: true,
    })
  })

  it('says nothing at all about a date it cannot read', () => {
    expect(orderAge('not a date', NOW)).toEqual({ label: '', overdue: false })
  })
})

describe('stockAlertSummary', () => {
  it('splits the alerts into out of stock and merely low', () => {
    expect(
      stockAlertSummary([{ totalStock: 0 }, { totalStock: 0 }, { totalStock: 3 }], 3),
    ).toEqual({ total: 3, outOfStock: 2, low: 1, complete: true })
  })

  it('is complete when the page holds every alert, even if all are out', () => {
    expect(stockAlertSummary([{ totalStock: 0 }, { totalStock: 0 }], 2).complete).toBe(true)
  })

  it('is incomplete when the page runs out before the in-stock rows start', () => {
    // Sorted by stock ascending, so the four unseen rows could be either kind.
    expect(stockAlertSummary([{ totalStock: 0 }, { totalStock: 0 }], 6)).toEqual({
      total: 6,
      outOfStock: 2,
      low: 4,
      complete: false,
    })
  })
})
