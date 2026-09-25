import { ImageOff, PackageCheck, Search, ShieldCheck, Truck } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { RatingBadge } from '@/components/RatingBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { ProductSummary } from '@/features/search/schema/types'
import { formatPrice } from '@/lib/formatPrice'

const TRUST_POINTS = [
  { icon: PackageCheck, label: 'Live stock counts' },
  { icon: Truck, label: 'Tracked delivery' },
  { icon: ShieldCheck, label: 'Buyer protection' },
]

export function HomeHero({ spotlight }: { spotlight?: ProductSummary }) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    const term = value.trim()
    navigate(term ? `/search?q=${encodeURIComponent(term)}` : '/search')
  }

  return (
    <section className="border-b bg-primary/5">
      <div className="mx-auto grid max-w-[1320px] items-center gap-10 px-7 py-14 lg:grid-cols-[1.15fr_1fr] lg:py-20">
        <div className="flex flex-col items-start gap-5">
          <Badge variant="outline" className="border-primary/40 bg-background text-primary">
            Thousands of products from independent sellers
          </Badge>

          <h1 className="max-w-[16ch] text-4xl leading-[1.1] font-bold text-balance sm:text-5xl">
            Everything you need, from sellers you can check.
          </h1>

          <p className="max-w-[52ch] text-base leading-relaxed text-muted-foreground">
            Search the whole marketplace at once. Filter by price, rating and what is genuinely in
            stock right now — then check out in a couple of taps.
          </p>

          <form
            onSubmit={submit}
            role="search"
            aria-label="Marketplace search"
            className="flex w-full max-w-lg items-center gap-1 rounded-full border-[1.5px] border-primary bg-background py-1 pr-1 pl-5"
          >
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Try “wireless headphones”"
              aria-label="Search the marketplace"
              className="h-9 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
            <Button type="submit" className="gap-1.5 rounded-full">
              <Search className="size-4" />
              Search
            </Button>
          </form>

          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {TRUST_POINTS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Icon className="size-4 text-primary" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>

        {/* Pulled from the live catalog rather than hard-coded artwork, so the
            hero never advertises something the marketplace no longer sells. */}
        {spotlight ? (
          <section aria-labelledby="hero-spotlight" className="w-full">
            <Card className="overflow-hidden py-0 shadow-sm">
              <Link
                to={`/products/${spotlight.id}`}
                className="flex aspect-[4/3] items-center justify-center bg-muted"
              >
                {spotlight.thumbnailUrl ? (
                  <img src={spotlight.thumbnailUrl} alt={spotlight.title} className="size-full object-cover" />
                ) : (
                  <ImageOff className="size-10 text-muted-foreground" aria-hidden />
                )}
              </Link>
              <CardContent className="flex flex-col items-start gap-2 px-5 pt-1 pb-5">
                <span id="hero-spotlight" className="text-xs font-semibold tracking-wide text-primary uppercase">
                  Top rated right now
                </span>
                <Link to={`/products/${spotlight.id}`} className="text-lg font-semibold hover:underline">
                  {spotlight.title}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold">{formatPrice(spotlight.priceFrom)}</span>
                  {spotlight.avgRating != null && <RatingBadge rating={spotlight.avgRating} />}
                </div>
                <Button asChild className="mt-1">
                  <Link to={`/products/${spotlight.id}`}>View product</Link>
                </Button>
              </CardContent>
            </Card>
          </section>
        ) : (
          <div
            aria-hidden
            className="hidden aspect-[4/3] w-full animate-pulse rounded-lg border bg-muted/60 lg:block"
          />
        )}
      </div>
    </section>
  )
}
