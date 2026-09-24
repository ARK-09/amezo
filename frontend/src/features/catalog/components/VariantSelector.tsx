import { cn } from '@/lib/utils'

import type { ProductVariant } from '../schema/types'

export function VariantSelector({
  variants,
  selectedId,
  onSelect,
}: {
  variants: ProductVariant[]
  selectedId: string
  onSelect: (variantId: string) => void
}) {
  if (variants.length <= 1) return null

  return (
    <div className="mb-6">
      <div className="mb-2.5 text-sm font-bold">Variant</div>
      <div className="flex flex-wrap gap-3">
        {variants.map((variant) => {
          const active = variant.id === selectedId
          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => onSelect(variant.id)}
              disabled={variant.stockQty === 0}
              aria-pressed={active}
              className={cn(
                'rounded-md border-[1.5px] px-4 py-2.5 text-sm',
                active ? 'border-primary font-bold' : 'border-input text-muted-foreground',
                variant.stockQty === 0 && 'cursor-not-allowed opacity-50',
              )}
            >
              {variant.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
