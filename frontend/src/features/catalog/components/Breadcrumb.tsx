import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

import type { Category } from '@/features/reference/api/useCategories'
import type { components } from '@/lib/api/schema'

type StoreRef = components['schemas']['StoreRef']

/**
 * Where the store crumb points. By handle when the product names its store; without
 * one it falls back to the display name, which /stores resolves and redirects. The
 * handle is the server's to mint, so a slugified guess at it would be a dead link.
 */
function storePath(brandName: string, store: StoreRef | null | undefined): string {
  return store ? `/stores/${store.handle}` : `/stores/${encodeURIComponent(brandName)}`
}

export function Breadcrumb({
  category,
  brandName,
  store,
  title,
}: {
  category: Category
  /** Null for a product with no brand - the crumb is simply left out. */
  brandName: string | null
  /** The store that lists the product. Optional in the contract, so the link copes. */
  store?: StoreRef | null
  title: string
}) {
  const crumbs = [
    { label: 'Home', to: '/' },
    // The crumb reads as the category's name and navigates by its slug.
    { label: category.name, to: `/search?category=${encodeURIComponent(category.slug)}` },
    // Same shape for the store: it reads as the display name and navigates by handle.
    ...(brandName ? [{ label: brandName, to: storePath(brandName, store) }] : []),
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
