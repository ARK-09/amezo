import { useState } from 'react'

import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'

const ABSOLUTE_MAX = 6000

const PRICE_BANDS: { label: string; min: number | undefined; max: number | undefined }[] = [
  { label: 'Under $50', min: undefined, max: 50 },
  { label: '$50 – $150', min: 50, max: 150 },
  { label: '$150 – $500', min: 150, max: 500 },
  { label: '$500+', min: 500, max: undefined },
]

function toRange(priceMin: number | undefined, priceMax: number | undefined): [number, number] {
  return [priceMin ?? 0, priceMax ?? ABSOLUTE_MAX]
}

export function PriceRangeFilter({
  priceMin,
  priceMax,
  onChange,
}: {
  priceMin: number | undefined
  priceMax: number | undefined
  onChange: (min: number | undefined, max: number | undefined) => void
}) {
  const [local, setLocal] = useState<[number, number]>(() => toRange(priceMin, priceMax))
  const [prevProps, setPrevProps] = useState({ priceMin, priceMax })
  if (prevProps.priceMin !== priceMin || prevProps.priceMax !== priceMax) {
    setPrevProps({ priceMin, priceMax })
    setLocal(toRange(priceMin, priceMax))
  }

  function commit(next: [number, number]) {
    setLocal(next)
    onChange(
      next[0] > 0 ? next[0] : undefined,
      next[1] < ABSOLUTE_MAX ? next[1] : undefined,
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          value={local[0]}
          onChange={(e) => setLocal([Number(e.target.value), local[1]])}
          onBlur={() => commit(local)}
          aria-label="Minimum price"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="number"
          min={0}
          value={local[1]}
          onChange={(e) => setLocal([local[0], Number(e.target.value)])}
          onBlur={() => commit(local)}
          aria-label="Maximum price"
        />
      </div>
      <Slider
        min={0}
        max={ABSOLUTE_MAX}
        step={10}
        value={local}
        onValueChange={(next) => setLocal(next as [number, number])}
        onValueCommit={(next) => commit(next as [number, number])}
      />
      <div className="flex flex-col gap-1.5">
        {PRICE_BANDS.map((band) => {
          const active = priceMin === band.min && priceMax === band.max
          return (
            <button
              key={band.label}
              type="button"
              onClick={() => onChange(active ? undefined : band.min, active ? undefined : band.max)}
              className={`rounded-md border px-3 py-2 text-left text-sm ${
                active ? 'border-primary text-foreground' : 'border-input text-muted-foreground'
              }`}
            >
              {band.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
