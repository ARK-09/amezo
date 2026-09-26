import { usePublicStore } from '@/features/store/api/useStorefront'
import type { ProductVariant } from '@/features/catalog/schema/types'

/**
 * The SKU / Delivery / Returns list under the variant picker.
 *
 * The design fills Delivery and Returns with fixed marketing copy - "Free,
 * arrives in 2-4 days", "30-day free returns". Printing that on every listing
 * would promise terms the platform does not set and this seller may not offer,
 * so both come from the store's own policies instead, the same ones the
 * storefront prints. A policy the seller never wrote is left out rather than
 * invented, which is why rows are filtered rather than defaulted.
 *
 * The store query is shared with the storefront page and cached, so arriving
 * here from a store costs nothing.
 */
export function ProductFacts({
  variant,
  storeHandle,
}: {
  variant: ProductVariant
  storeHandle: string | undefined
}) {
  const store = usePublicStore(storeHandle)

  const rows = [
    { label: 'SKU', value: variant.sku },
    { label: 'Delivery', value: store.data?.policies?.shipping },
    { label: 'Returns', value: store.data?.policies?.returns },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value))

  if (rows.length === 0) return null

  return (
    <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="m-0 font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
