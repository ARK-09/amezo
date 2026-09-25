import { Link } from 'react-router'

// The design's three campaign tiles (groceries, a phone launch, a clearance
// push) are merchandising this app has no campaign API to fill. They keep
// their exact treatment - dark, light, brand orange - but point at real
// catalog destinations instead of advertising stock and discounts that
// don't exist.
const DARK_STRIPES =
  'repeating-linear-gradient(45deg,rgba(255,255,255,0.08) 0 10px,rgba(255,255,255,0.01) 10px 20px)'
const LIGHT_STRIPES =
  'repeating-linear-gradient(45deg,rgba(0,0,0,0.035) 0 10px,rgba(0,0,0,0) 10px 20px)'
const ORANGE_STRIPES =
  'repeating-linear-gradient(45deg,rgba(255,255,255,0.14) 0 10px,rgba(255,255,255,0.02) 10px 20px)'

export function PromoTiles({ category, brand }: { category?: string; brand?: string }) {
  if (!category && !brand) return null

  return (
    <section
      aria-label="Highlights"
      className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]"
    >
      {category && (
        <div className="relative flex aspect-square flex-col justify-between overflow-hidden rounded-lg bg-foreground p-[26px]">
          <div className="absolute inset-0" style={{ background: DARK_STRIPES }} />
          <div className="relative">
            <div className="text-xs font-bold tracking-[0.08em] text-primary">SHOP THE RANGE</div>
            <div className="mt-1 text-3xl leading-[1.1] font-extrabold text-white">{category}</div>
          </div>
          <Link
            to={`/search?category=${encodeURIComponent(category)}`}
            className="relative w-fit rounded-lg bg-primary px-[18px] py-2.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Shop now
          </Link>
        </div>
      )}

      {brand && (
        <div className="relative flex aspect-square flex-col justify-between overflow-hidden rounded-lg border bg-muted p-[26px]">
          <div className="absolute inset-0" style={{ background: LIGHT_STRIPES }} />
          <div className="relative text-center">
            <div className="text-xs font-bold tracking-[0.18em] text-muted-foreground">
              FEATURED SELLER
            </div>
            <div className="mt-1.5 text-[26px] font-extrabold">{brand}</div>
            <div className="text-sm font-medium text-muted-foreground">Visit the storefront</div>
          </div>
          <Link
            to={`/stores/${encodeURIComponent(brand)}`}
            className="relative w-fit rounded-lg border border-foreground px-[18px] py-2.5 text-xs font-semibold transition-colors hover:bg-accent"
          >
            Shop now
          </Link>
        </div>
      )}

      <div className="relative flex aspect-square flex-col justify-between overflow-hidden rounded-lg bg-primary p-[26px]">
        <div className="absolute inset-0" style={{ background: ORANGE_STRIPES }} />
        <div className="relative">
          <div className="text-xs font-bold tracking-[0.08em] text-primary-foreground">
            READY TO SHIP
          </div>
          <div className="mt-1 text-3xl leading-[1.1] font-extrabold text-primary-foreground">
            Everything
            <br />
            in stock today
          </div>
        </div>
        <Link
          to="/search?inStockOnly=true"
          className="relative w-fit rounded-lg bg-background px-[18px] py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-background/90"
        >
          Shop now
        </Link>
      </div>
    </section>
  )
}
