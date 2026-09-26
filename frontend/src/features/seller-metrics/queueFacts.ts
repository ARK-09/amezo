const DAY_MS = 86_400_000

/** Past this many days in the queue an order is late, not merely waiting. */
const OVERDUE_DAYS = 3

/**
 * How long an order has been sitting in the ship queue, in the words a seller
 * would use, and whether that counts as late.
 *
 * Whole calendar days rather than 24-hour blocks: an order placed at eleven
 * last night is "1 day" this morning, not "0 days", which is how anyone
 * looking at the queue would describe it.
 */
export function orderAge(placedAt: string, now: Date = new Date()): {
  label: string
  overdue: boolean
} {
  const placed = new Date(placedAt)
  if (Number.isNaN(placed.getTime())) return { label: '', overdue: false }

  const days = Math.round((midnight(now) - midnight(placed)) / DAY_MS)
  if (days <= 0) return { label: 'Today', overdue: false }
  return { label: days === 1 ? '1 day' : `${days} days`, overdue: days >= OVERDUE_DAYS }
}

function midnight(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * The stock-alert headline, split into the two numbers the tile prints.
 *
 * Only the first page of the low-stock list is on the client, so the
 * out-of-stock count can only be read off it when that page reaches the first
 * product that still has stock. It is sorted by stock ascending, so every
 * zero-stock product comes first: if the page runs out while they are still
 * coming, all we honestly know is "at least this many", and `complete` says so
 * rather than the tile stating a number it cannot see.
 */
export function stockAlertSummary(rows: { totalStock: number }[], total: number) {
  const outOfStock = rows.filter((row) => row.totalStock === 0).length
  const complete = outOfStock < rows.length || total <= rows.length
  return { total, outOfStock, low: total - outOfStock, complete }
}
