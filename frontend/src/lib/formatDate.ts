/**
 * Date formatting for order and refund screens.
 *
 * Written out rather than handed to Intl: the designs are day-first with
 * three-letter months ("17 Sep", "Monday 28 September"), and no locale gives
 * exactly that - en-US reorders to "Sep 17", en-GB abbreviates September to
 * "Sept". Spelling the format out also means it cannot shift under a different
 * ICU build.
 */

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** A date with no time, as the metrics series and the API's `format: date` use. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null
  // A date-only string parses as UTC midnight, but everything below reads it
  // back with local getters - so west of UTC "2026-09-01" rendered as 31 Aug,
  // and every axis tick and range caption was a day early. Anchoring at local
  // noon makes the calendar day the one that was written down. A full
  // timestamp is a real instant and stays as it is.
  const date = new Date(DATE_ONLY.test(iso) ? `${iso}T12:00:00` : iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "17 Sep" — timeline steps and dense table cells. */
export function formatShortDate(iso: string | null | undefined): string {
  const date = parse(iso)
  if (!date) return '—'
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`
}

/** "17 Sep 2026" — anything that can be older than this year. */
export function formatMediumDate(iso: string | null | undefined): string {
  const date = parse(iso)
  if (!date) return '—'
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`
}

/** "Monday 28 September" — delivery estimates, which read as a promise. */
export function formatDeliveryDate(iso: string | null | undefined): string {
  const date = parse(iso)
  if (!date) return '—'
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS_LONG[date.getMonth()]}`
}
