import type { components } from '@/lib/api/schema'

type ProductAttribute = components['schemas']['ProductAttribute']

/**
 * The specification table under the Details tab: "Battery life / 30 hours".
 *
 * Two columns on a wide screen, one when there is no room, each row a labelled
 * pair on a rule - the design's shape. A listing with no attributes renders
 * nothing rather than an empty table, because a marketplace spanning categories
 * that share no attribute vocabulary will always have listings without them.
 */
export function ProductSpecs({ attributes }: { attributes: ProductAttribute[] }) {
  if (attributes.length === 0) return null

  return (
    <div>
      <h2 className="sr-only">Specifications</h2>
      <dl className="grid max-w-[760px] gap-x-8 gap-y-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        {attributes.map((attribute) => (
          <div
            key={attribute.label}
            className="flex justify-between gap-4 border-b pb-2.5 text-sm"
          >
            <dt className="text-muted-foreground">{attribute.label}</dt>
            <dd className="m-0 text-right font-medium">{attribute.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
