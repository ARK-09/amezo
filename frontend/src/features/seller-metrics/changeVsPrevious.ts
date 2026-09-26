/**
 * How a measure moved against the window immediately before it.
 *
 * The dashboard states this in two places - the KPI tiles and the Top products
 * table - and the awkward cases (no previous window at all, a previous window
 * of zero) are easy to get subtly different in two implementations. Both read
 * them from here so a seller meets one vocabulary.
 */
export type ChangeKind =
  /** No previous figure was supplied. Nothing was measured, so nothing is claimed. */
  | 'unknown'
  /** The previous window was a measured zero: a move off nothing. */
  | 'fromZero'
  | 'flat'
  | 'percent'

export interface ChangeVsPrevious {
  kind: ChangeKind
  /** Rising, before `invertTone` decides whether rising is good news. */
  up: boolean
  /** What to print. Somewhere too narrow for `unknown`'s words may shorten it. */
  label: string
}

export function changeVsPrevious(current: number, previous?: number | null): ChangeVsPrevious {
  // "There is no previous window" and "the previous window was zero" are
  // different facts. Treating both as flat reported the biggest movement a
  // seller can have - nothing to something - as no change at all.
  if (previous == null) return { kind: 'unknown', up: false, label: 'No prior data' }

  // A percentage against zero is a division by zero, so a move off zero shows
  // its direction with a word rather than Infinity or an invented figure.
  if (previous === 0 && current !== 0) return { kind: 'fromZero', up: current > 0, label: 'New' }

  const change = previous === 0 ? 0 : ((current - previous) / previous) * 100
  if (Math.abs(change) < 0.05) return { kind: 'flat', up: false, label: 'Flat' }

  // A tenth of a percent is noise once something has more than doubled, and
  // dropping it keeps the longest figure inside the table's fixed delta column.
  const digits = Math.abs(change) >= 100 ? 0 : 1
  // A rise has no ceiling - $8 last window against $999 this one is +12,387% -
  // and a figure that long spills out of that column. A fall cannot pass
  // -100%, so only this end needs the bound, and it is stated as a bound
  // rather than rounded down to a number we did not measure.
  const label = change >= 999.5 ? '>999%' : `${change > 0 ? '+' : ''}${change.toFixed(digits)}%`
  return { kind: 'percent', up: change > 0, label }
}
