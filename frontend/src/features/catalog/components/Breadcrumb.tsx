import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

export function Breadcrumb({
  category,
  brandName,
  title,
}: {
  category: string
  brandName: string
  title: string
}) {
  const crumbs = [
    { label: 'Home', to: '/' },
    { label: category, to: `/search?category=${encodeURIComponent(category)}` },
    { label: brandName, to: `/search?q=${encodeURIComponent(brandName)}` },
  ]

  return (
    <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {crumbs.map((crumb) => (
        <span key={crumb.label} className="flex items-center gap-2">
          <Link to={crumb.to} className="hover:text-primary">
            {crumb.label}
          </Link>
          <ChevronRight className="size-3.5" />
        </span>
      ))}
      <span className="text-foreground">{title}</span>
    </nav>
  )
}
