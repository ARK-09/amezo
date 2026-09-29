import { Link } from 'react-router'

import type { Category } from '@/features/reference/api/useCategories'
import { rangePromoImage, readyToShipImage } from '@/features/reference/promoImage'
import type { PublicStore } from '@/features/store/api/useStorefront'

// The design's three campaign tiles (groceries, a phone launch, a clearance
// push) are merchandising this app has no campaign API to fill. They keep
// their exact treatment - dark, light, brand orange - but point at real
// catalog destinations instead of advertising stock and discounts that
// don't exist.
//
// Each carries a photograph where there is one for it, and the stripes where
// there is not: the stripe pattern was never the design, it was what a panel
// with no artwork behind it fell back to. A tile with a picture keeps its
// colour - the dark one darkens the image towards the text, the orange one
// multiplies a greyscale photograph into the brand colour rather than pasting
// a photo over it - so the row still reads as one set of three.
const DARK_STRIPES =
  'repeating-linear-gradient(45deg,rgba(255,255,255,0.08) 0 10px,rgba(255,255,255,0.01) 10px 20px)'
const LIGHT_STRIPES =
  'repeating-linear-gradient(45deg,rgba(0,0,0,0.035) 0 10px,rgba(0,0,0,0) 10px 20px)'
const ORANGE_STRIPES =
  'repeating-linear-gradient(45deg,rgba(255,255,255,0.14) 0 10px,rgba(255,255,255,0.02) 10px 20px)'

export function PromoTiles({
  category,
  store,
}: {
  category?: Category
  /**
   * The shop the server put forward, whole - name, handle, tagline, cover and logo.
   *
   * It used to be a brand string plus a StoreRef taken from whichever product landed
   * first in a rail, which made "featured" mean "listed most recently" and left the
   * tile with no artwork available to it at any price. GET /api/v1/stores/featured
   * ranks shops by what they have sold and answers with the storefront itself.
   */
  store?: PublicStore
}) {
  if (!category && !store) return null

  return (
    <section
      aria-label="Highlights"
      className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]"
    >
      {category && (
        <div className="relative flex aspect-square flex-col justify-between overflow-hidden rounded-lg bg-foreground p-[26px]">
          {rangePromoImage(category.slug) && (
            <>
              <img
                src={rangePromoImage(category.slug)!}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
              {/* Decorative, so it is alt="" above and the heading carries the
                  meaning. This scrim is what makes the white label and the button
                  legible over a photograph whose left side is not reliably dark. */}
              <div className="absolute inset-0 bg-gradient-to-r from-foreground via-foreground/75 to-foreground/20" />
            </>
          )}
          <div className="absolute inset-0" style={{ background: DARK_STRIPES }} />
          <div className="relative">
            <div className="text-xs font-bold tracking-[0.08em] text-primary">SHOP THE RANGE</div>
            <div className="mt-1 text-3xl leading-[1.1] font-extrabold text-white">{category.name}</div>
          </div>
          <Link
            to={`/search?category=${encodeURIComponent(category.slug)}`}
            className="relative w-fit rounded-lg bg-primary px-[18px] py-2.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Shop now
          </Link>
        </div>
      )}

      {store && (
        <div className="relative flex aspect-square flex-col justify-between overflow-hidden rounded-lg border bg-muted p-[26px]">
          {store.coverUrl && (
            <>
              <img src={store.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/70 to-background/85" />
            </>
          )}
          <div className="absolute inset-0" style={{ background: LIGHT_STRIPES }} />
          <div className="relative text-center">
            <div className="text-xs font-bold tracking-[0.18em] text-muted-foreground">
              FEATURED SELLER
            </div>
            {/* The shop's own logo, at the size the storefront header uses it. A shop
                that has not uploaded one shows its name alone, which is what the
                storefront does too - no generated monogram standing in for a brand. */}
            {store.logoUrl && (
              <img
                src={store.logoUrl}
                alt=""
                className="mx-auto mt-3 size-14 rounded-lg border bg-background object-cover shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
              />
            )}
            <div className="mt-1.5 text-[26px] font-extrabold">{store.name}</div>
            <div className="text-sm font-medium text-muted-foreground">
              {/* The seller's own words where they wrote some. "Visit the storefront"
                  is the fallback, not the headline. */}
              {store.tagline || 'Visit the storefront'}
            </div>
          </div>
          {/* By handle, always: the server answered with one, so there is no
              display-name URL to fall back to and no redirect hop to pay. */}
          <Link
            to={`/stores/${store.handle}`}
            className="relative w-fit rounded-lg border border-foreground px-[18px] py-2.5 text-xs font-semibold transition-colors hover:bg-accent"
          >
            Shop now
          </Link>
        </div>
      )}

      <div className="relative flex aspect-square flex-col justify-between overflow-hidden rounded-lg bg-primary p-[26px]">
        {/* multiply, not a plain image: the photograph is greyscale on white, so
            the white ground takes the orange underneath it and only the boxes
            darken. The tile stays brand orange and gains a subject, instead of
            becoming a photograph with an orange frame. */}
        <img
          src={readyToShipImage}
          alt=""
          className="absolute inset-0 size-full object-cover mix-blend-multiply"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/70 to-transparent" />
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
