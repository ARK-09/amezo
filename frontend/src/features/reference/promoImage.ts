import readyToShip from '@/assets/promo/ready-to-ship.webp'
import clothingModel from '@/assets/promo/clothing-model.webp'
import clothingRack from '@/assets/promo/clothing-rack.webp'

/**
 * The photography behind the landing page's promo panels.
 *
 * <h2>Why this is a written map and categoryImage's is a glob</h2>
 *
 * The category rail's artwork is one picture per slug, so its map can be built
 * from filenames and never mentions a category by name. These panels are not
 * one-to-one: two of them are about the same category from different angles (a
 * rail of garments for the wide EXPLORE card, a worn outfit for the square tile),
 * and one picture can legitimately serve several slugs - "clothing" and "apparel"
 * are the same shelf. Spelling that out is clearer than encoding it in filenames.
 *
 * <h2>Missing is the normal case</h2>
 *
 * Most categories have no photograph, and null is a complete answer: the panels
 * keep the striped treatment they have today. Nothing here decides which category
 * a panel is about - that stays the catalogue's answer - so a category added
 * tomorrow renders correctly today, just without a picture.
 */

/** The wide EXPLORE card beside the hero. Landscape-ish, text down the left. */
const EXPLORE_BY_SLUG: Record<string, string> = {
  clothing: clothingRack,
  apparel: clothingRack,
}

/** The dark square "SHOP THE RANGE" tile. Subject right, text and button left. */
const RANGE_BY_SLUG: Record<string, string> = {
  clothing: clothingModel,
  apparel: clothingModel,
}

export function explorePromoImage(slug: string): string | null {
  return EXPLORE_BY_SLUG[slug] ?? null
}

export function rangePromoImage(slug: string): string | null {
  return RANGE_BY_SLUG[slug] ?? null
}

/**
 * The "READY TO SHIP" tile, which is about the marketplace rather than about a
 * category, so it is one fixed picture. Greyscale on white on purpose: the tile is
 * brand orange, and the photograph is blended into it rather than laid on top, so
 * the panel keeps its colour instead of becoming a photo with an orange border.
 */
export const readyToShipImage = readyToShip
