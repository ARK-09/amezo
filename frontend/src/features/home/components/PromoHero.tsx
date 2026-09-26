import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import type { ProductSummary } from '@/features/search/schema/types'
import { formatPrice } from '@/lib/formatPrice'
import { cn } from '@/lib/utils'
import type { Category } from '@/features/reference/api/useCategories'

const SLIDE_COUNT = 4
const ROTATE_MS = 6000

// The design's hero is a merchandising campaign ("iPhone 16 Pro Max, from
// $1,199"). There is no CMS or campaign API behind this app, so rather than
// hard-code an advert for stock the marketplace doesn't carry, each slide is
// a real listing - real title, real price, real link.
const STRIPES =
  'repeating-linear-gradient(45deg,rgba(255,255,255,0.09) 0 9px,rgba(255,255,255,0.02) 9px 18px)'

export function PromoHero({
  products,
  sideCategory,
}: {
  products: ProductSummary[]
  sideCategory?: Category
}) {
  const slides = products.slice(0, SLIDE_COUNT)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  const slideCount = slides.length
  useEffect(() => {
    if (paused || slideCount < 2) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setIndex((i) => (i + 1) % slideCount), ROTATE_MS)
    return () => clearInterval(id)
  }, [paused, slideCount])

  const active = slides[Math.min(index, Math.max(slideCount - 1, 0))]

  return (
    <section aria-label="Featured" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap gap-4">
        <div
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
          className="relative flex min-h-[260px] flex-col justify-center overflow-hidden rounded-lg bg-foreground p-7 sm:min-h-[300px] sm:p-10 [flex:2.05_1_340px]"
        >
          <div
            className="absolute inset-y-0 right-0 hidden w-[52%] items-center justify-center sm:flex"
            style={{ background: STRIPES }}
          >
            {active?.thumbnailUrl && (
              <img src={active.thumbnailUrl} alt="" className="size-full object-cover" />
            )}
          </div>

          {active && (
            <div className="relative max-w-full sm:max-w-[52%]">
              <span className="inline-block rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold tracking-[0.04em] text-primary-foreground">
                IN STOCK NOW
              </span>
              <div className="mt-3.5 text-base font-semibold text-neutral-300">
                {active.brandName}
              </div>
              <div className="mt-0.5 text-[34px] leading-[1.1] font-extrabold tracking-[-0.02em] text-white">
                From {formatPrice(active.priceFrom)}
              </div>
              <p className="mt-3 max-w-[300px] text-[13px] leading-[1.55] text-neutral-400">
                {active.title}
              </p>
              <Link
                to={`/products/${active.id}`}
                className="mt-5 inline-block rounded-lg bg-primary px-[22px] py-2.5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Shop now
              </Link>
            </div>
          )}
        </div>

        {sideCategory && (
          <div className="relative flex min-h-[240px] flex-col justify-center overflow-hidden rounded-lg border bg-muted p-7 [flex:1_1_260px]">
            <div
              className="absolute inset-0"
              style={{
                background:
                  'repeating-linear-gradient(45deg,rgba(0,0,0,0.035) 0 9px,rgba(0,0,0,0) 9px 18px)',
              }}
            />
            <div className="relative">
              <div className="text-[13px] font-bold tracking-[0.08em] text-muted-foreground">
                EXPLORE
              </div>
              <div className="text-[40px] leading-none font-extrabold tracking-[-0.03em] text-primary">
                {sideCategory.name}
              </div>
              <Link
                to={`/search?category=${encodeURIComponent(sideCategory.slug)}`}
                className="mt-[18px] inline-block rounded-lg border border-foreground px-4 py-2 text-xs font-semibold transition-colors hover:bg-accent"
              >
                Browse {sideCategory.name}
              </Link>
            </div>
          </div>
        )}
      </div>

      {slideCount > 1 && (
        <div className="flex justify-center gap-1.5">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show featured product ${i + 1}`}
              aria-current={i === index}
              className={cn(
                'h-[5px] rounded-full transition-all',
                i === index ? 'w-[22px] bg-primary' : 'w-[5px] bg-neutral-300',
              )}
            />
          ))}
        </div>
      )}
    </section>
  )
}
