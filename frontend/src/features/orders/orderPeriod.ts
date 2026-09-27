/**
 * The date window the My Orders select offers: two rolling windows and the last
 * two calendar years, exactly the four the design lists.
 *
 * The years are derived from today rather than written down, so the select does
 * not still offer 2025 and 2026 in 2028. The design hardcodes them because a mock
 * has a fixed "today".
 */

export const DEFAULT_PERIOD = '12m'

export interface PeriodOption {
  value: string
  label: string
}

function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function periodOptions(today: Date = new Date()): PeriodOption[] {
  const year = today.getFullYear()
  return [
    { value: '3m', label: 'Past 3 months' },
    { value: DEFAULT_PERIOD, label: 'Past 12 months' },
    { value: String(year), label: String(year) },
    { value: String(year - 1), label: String(year - 1) },
  ]
}

/**
 * A ?period= the select does not offer is not honoured - it would otherwise
 * reach the request as a window nothing agreed on, and the tab counts (which
 * take the token itself) would describe a different window from the list.
 */
export function normalisePeriod(raw: string | null, today: Date = new Date()): string {
  return periodOptions(today).some((option) => option.value === raw) ? raw! : DEFAULT_PERIOD
}

export function periodLabel(period: string, today: Date = new Date()): string {
  return periodOptions(today).find((option) => option.value === period)?.label ?? period
}

/**
 * "2 orders in past 12 months" / "2 orders in 2025" - the rolling windows read
 * as a phrase, a year reads as itself.
 */
export function periodPhrase(period: string, today: Date = new Date()): string {
  const label = periodLabel(period, today)
  return label.startsWith('Past') ? label.toLowerCase() : label
}

/**
 * The window as the list endpoint takes it. Rolling windows are open-ended at
 * the top - an order placed today is in "past 3 months" - so only a year sends
 * a `to`. Counted in whole months, like the design, rather than in 90 or 365
 * days: a day count drifts against the calendar the select is named after.
 */
export function periodRange(
  period: string,
  today: Date = new Date(),
): { from?: string; to?: string } {
  if (/^\d{4}$/.test(period)) return { from: `${period}-01-01`, to: `${period}-12-31` }
  const months = period === '3m' ? 3 : 12
  const from = new Date(today)
  from.setMonth(from.getMonth() - months)
  return { from: iso(from) }
}
