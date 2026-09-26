import { Link } from 'react-router'

/**
 * The ranked list the dashboard uses for top products and category share: a
 * label, its value, and a bar for the proportion.
 *
 * One hue throughout rather than a colour per row - the bar encodes magnitude,
 * which is a sequential job, and a rainbow here would imply an identity the
 * rows do not have.
 */
export function ShareList({
  rows,
  emptyLabel,
}: {
  rows: { key: string; label: string; value: string; share: number; to?: string }[]
  emptyLabel: string
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            {row.to ? (
              <Link to={row.to} className="min-w-0 truncate text-sm font-medium hover:text-primary">
                {row.label}
              </Link>
            ) : (
              <span className="min-w-0 truncate text-sm font-medium">{row.label}</span>
            )}
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              {row.value}
              <span className="ml-2 text-xs">{Math.round(row.share * 100)}%</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(2, Math.round(row.share * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
