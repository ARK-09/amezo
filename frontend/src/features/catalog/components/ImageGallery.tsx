import { ImageOff } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import type { ProductImage } from '../schema/types'

export function ImageGallery({
  images,
  title,
}: {
  images: ProductImage[]
  title: string
}) {
  const sorted = [...images].sort((a, b) => a.position - b.position)
  const [selected, setSelected] = useState(0)
  const active = sorted[selected]

  return (
    <div className="w-full max-w-[380px] shrink-0">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-muted">
        {active ? (
          <img src={active.url} alt={title} className="size-full object-cover" />
        ) : (
          <ImageOff className="size-10 text-muted-foreground" aria-hidden />
        )}
      </div>
      {sorted.length > 1 && (
        <div className="mt-3.5 grid grid-cols-4 gap-3">
          {sorted.map((image, i) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setSelected(i)}
              aria-label={`Show image ${i + 1}`}
              aria-pressed={i === selected}
              className={cn(
                'aspect-square overflow-hidden rounded-md border-[1.5px] bg-muted',
                i === selected ? 'border-primary' : 'border-transparent',
              )}
            >
              <img src={image.url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
