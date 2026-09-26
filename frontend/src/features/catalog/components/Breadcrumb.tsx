import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

import type { Category } from '@/features/reference/api/useCategories'

export function Breadcrumb({
  category,
  brandName,
  title,
}: {
  category: Category
  /** Null for a product with no brand - the crumb is simply left out. */
  brandName: string | null
  title: string
}) {
  const crumbs = [
    { label: 'Home', to: '/' },
    // The crumb reads as the category's name and navigates by its slug.
    { label: category.name, to: `/search?category=${encodeURIComponent(category.slug)}` },
    ...(brandName ? [{ label: brandName, to: `/stores/${encodeURIComponent(brandName)}` }] : []),
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
