import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

import { storeLabel, storePath, type StoreRef } from '@/features/catalog/storeLink'
import type { Category } from '@/features/reference/api/useCategories'

export function Breadcrumb({
  category,
  brandName,
  store,
  title,
}: {
  category: Category
  /** The product's brand. Only the fallback name for the shop crumb - see storeLink. */
  brandName: string | null
  /** The store that lists the product. Optional in the contract, so the crumb copes. */
  store?: StoreRef | null
  title: string
}) {
  // The crumb names the shop and navigates to it, which is what the design's crumb
  // does - it links to the storefront. `to` is null for a store that has no handle
  // yet, and the crumb then reads as text rather than as a link to nowhere.
  const shop = storeLabel(store, brandName)
  const crumbs: { label: string; to: string | null }[] = [
    { label: 'Home', to: '/' },
    // The crumb reads as the category's name and navigates by its slug.
    { label: category.name, to: `/search?category=${encodeURIComponent(category.slug)}` },
    ...(shop ? [{ label: shop, to: storePath(store, brandName) }] : []),
  ]

  return (
    <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {crumbs.map((crumb) => (
        <span key={crumb.label} className="flex items-center gap-2">
          {crumb.to ? (
            <Link to={crumb.to} className="hover:text-primary">
              {crumb.label}
            </Link>
          ) : (
            <span>{crumb.label}</span>
          )}
          <ChevronRight className="size-3.5" />
        </span>
      ))}
      <span className="text-foreground">{title}</span>
    </nav>
  )
}
