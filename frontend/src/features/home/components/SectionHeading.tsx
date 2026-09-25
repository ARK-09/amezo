import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

export function SectionHeading({
  id,
  title,
  viewAllTo,
}: {
  id: string
  title: string
  viewAllTo: string
}) {
  return (
    <div className="mb-[18px] flex items-center justify-between gap-4">
      <h2 id={id} className="text-xl font-bold tracking-[-0.01em]">
        {title}
      </h2>
      <Link
        to={viewAllTo}
        className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
      >
        View all
        <ChevronRight className="size-3" aria-hidden />
      </Link>
    </div>
  )
}
