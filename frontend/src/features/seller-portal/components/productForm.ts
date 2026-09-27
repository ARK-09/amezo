import { z } from 'zod'

import type { SellerProductDetail } from '@/features/seller-portal/api/useSellerProducts'

/**
 * The shape of the product form, and the rules it is judged by.
 *
 * Kept apart from the hook that runs it and the fields that render it because
 * all three of those need it: the drawer and the dedicated page both mount the
 * same form, and the footer that gates Save has to be able to say *why* it is
 * disabled without reaching into the inputs.
 *
 * Everything the seller types is held as a STRING, including price and stock.
 * A number input hands back '' for a cleared field, and Number('') is 0 - which
 * is how a cleared price used to be submitted as a real $0.00 listing. The
 * strings are parsed once, at the edge, by parsePrice/parseStock.
 */

/** The product's image cap. The API enforces the same number. */
export const MAX_IMAGES = 7

/** The design's own limit; the API sets none. */
export const TITLE_LIMIT = 120

/**
 * The two statuses a seller picks between. ARCHIVED is deliberately not one of
 * them: it is what deleting a product does, and a control that could reach it
 * would be a quieter second way to take a listing down for good.
 */
export type WritableStatus = 'ACTIVE' | 'DRAFT'

/**
 * An image in the form. Either one the server already has, or one picked in
 * this session and not uploaded yet. Both are reordered, removed and counted
 * identically, which is why they share one list rather than sitting in two.
 */
export type FormImage =
  | { kind: 'existing'; id: string; url: string; status: 'PENDING' | 'STORED' }
  | { kind: 'staged'; id: string; file: File; previewUrl: string }

/**
 * A numeric field's value, or null when the field holds nothing usable.
 * Number('') is 0 and Number('12px') is NaN; both are a missing value, not a
 * zero.
 */
function parseNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Price has to be above 0. Unlike stock, a zero price is never something a
 * seller means - a free item is a promotion, not a $0.00 offer.
 */
export function parsePrice(value: string): number | null {
  const parsed = parseNumber(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

/** Stock 0 is a real answer - it is how a seller stops selling a variant. */
export function parseStock(value: string): number | null {
  const parsed = parseNumber(value)
  return parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

/**
 * `.refine` rather than `.trim().min(1)`: a transform would make the schema's
 * output type differ from what the inputs are bound to, and the resolver hands
 * the output back to the form.
 */
const variantSchema = z.object({
  /** Absent means a row that does not exist on the server yet. */
  id: z.string().optional(),
  label: z.string().refine((value) => value.trim().length > 0, {
    message: 'Give this variant a name buyers will recognise.',
  }),
  sku: z.string().refine((value) => value.trim().length > 0, {
    message: 'Give this variant a SKU.',
  }),
  price: z.string().refine((value) => parsePrice(value) !== null, {
    message: 'Enter a price above 0.',
  }),
  stockQty: z.string().refine((value) => parseStock(value) !== null, {
    message: 'Enter a whole number of units, 0 or more.',
  }),
})

export const productFormSchema = z.object({
  title: z
    .string()
    .refine((value) => value.trim().length > 0, { message: 'Give this product a title.' })
    .refine((value) => value.trim().length <= TITLE_LIMIT, {
      message: `Keep the title to ${TITLE_LIMIT} characters or fewer.`,
    }),
  brandName: z.string(),
  description: z.string(),
  categorySlug: z.string().min(1, { message: 'Choose the category shoppers will find this under.' }),
  status: z.enum(['ACTIVE', 'DRAFT']),
  variants: z.array(variantSchema).min(1, { message: 'A product needs at least one variant.' }),
  images: z.array(z.custom<FormImage>()).max(MAX_IMAGES, {
    message: `A product holds at most ${MAX_IMAGES} images.`,
  }),
})

export type ProductFormValues = z.infer<typeof productFormSchema>
export type VariantFormValues = ProductFormValues['variants'][number]

/** A brand-new listing, as the form opens it. */
export function blankFormValues(): ProductFormValues {
  return {
    title: '',
    brandName: '',
    description: '',
    categorySlug: '',
    status: 'ACTIVE',
    variants: [{ label: '', sku: '', price: '', stockQty: '' }],
    images: [],
  }
}

/** The saved product, as form values. Also the baseline every diff is taken against. */
export function toFormValues(product: SellerProductDetail): ProductFormValues {
  return {
    title: product.title,
    brandName: product.brandName ?? '',
    description: product.description ?? '',
    categorySlug: product.category.slug,
    // No status means ACTIVE - the same default the create endpoint applies.
    status: product.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE',
    variants: product.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      sku: variant.sku,
      price: String(variant.price ?? ''),
      stockQty: String(variant.stockQty),
    })),
    images: product.images.map((image) => ({
      kind: 'existing' as const,
      id: image.id,
      url: image.url,
      status: image.status,
    })),
  }
}

/**
 * A stable string for "is this form the same as that one". Trimmed, because a
 * trailing space in a title is not a change the seller meant to make, and keyed
 * on image ids rather than the File objects behind them, which are never equal
 * to each other.
 */
export function formSignature(values: ProductFormValues): string {
  return JSON.stringify({
    title: values.title.trim(),
    brandName: values.brandName.trim(),
    description: values.description.trim(),
    categorySlug: values.categorySlug,
    status: values.status,
    variants: values.variants.map((variant) => ({
      id: variant.id ?? null,
      label: variant.label.trim(),
      sku: variant.sku.trim(),
      price: variant.price.trim(),
      stockQty: variant.stockQty.trim(),
    })),
    images: values.images.map((image) => image.id),
  })
}

/**
 * What the listing is still missing, in the design's own words. Named rather
 * than reduced to a boolean so the footer can say which field is empty instead
 * of only that the button is off.
 */
export function missingFields(values: ProductFormValues): string[] {
  const gaps: string[] = []
  if (!values.title.trim()) gaps.push('a title')
  if (!values.categorySlug) gaps.push('a category')
  if (
    values.variants.some(
      (variant) =>
        !variant.label.trim() ||
        !variant.sku.trim() ||
        parsePrice(variant.price) === null ||
        parseStock(variant.stockQty) === null,
    )
  ) {
    gaps.push('every variant field')
  }
  return gaps
}

/** The design's left-hand hint beside the footer's actions. */
export function footerNoteFor(missing: string[], dirty: boolean): string {
  if (missing.length > 0) return `Still needs ${missing.join(', ')}.`
  return dirty ? 'Unsaved changes' : 'No changes yet'
}

/** The totals the Variants card closes with, from what is typed rather than saved. */
export function variantTotals(variants: VariantFormValues[]) {
  const prices = variants
    .map((variant) => parsePrice(variant.price))
    .filter((price): price is number => price !== null)
  const stock = variants.reduce((sum, variant) => sum + (parseStock(variant.stockQty) ?? 0), 0)
  return {
    count: variants.length,
    stock,
    low: prices.length > 0 ? Math.min(...prices) : null,
    high: prices.length > 0 ? Math.max(...prices) : null,
  }
}
