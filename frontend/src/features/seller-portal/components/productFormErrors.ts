import type { ProblemDetail } from '@/lib/api/client'

/**
 * Turning what the API refused into something that lands on the field the
 * seller has to fix.
 *
 * The API answers RFC7807 and a validation failure carries `errors[]`, each
 * entry a `{ field, reason }` pair named after the request body's own property
 * - `title`, `categorySlug`, `price`, or `variants[0].sku` for a nested one.
 * Those names are the request's, not the form's, so they are translated here
 * once rather than at each of the six call sites that can raise them.
 *
 * A message like "Validation failed" under a Save button tells a seller
 * nothing. Every path below ends either at a field, with the field's own name
 * in front of the server's reason, or at a single sentence that says what the
 * server actually refused.
 */

/** Product-level fields, keyed by the request property the API names them by. */
const PRODUCT_FIELDS: Record<string, string> = {
  title: 'Title',
  brandName: 'Brand',
  description: 'Description',
  categorySlug: 'Category',
  category: 'Category',
  status: 'Status',
}

/** Variant fields, shared by the create body's nested rows and the variant PATCH. */
const VARIANT_FIELDS: Record<string, string> = {
  label: 'Label',
  sku: 'SKU',
  price: 'Price',
  stockQty: 'Stock',
}

/** `variants[0].price` and `variants.0.price` both reach the same row. */
const NESTED_VARIANT = /^variants[[.](\d+)[\].]\.?(\w+)$/

export interface FieldMessage {
  /** A react-hook-form path into ProductFormValues. */
  path: string
  message: string
}

export interface MappedProblem {
  fields: FieldMessage[]
  /** What could not be pinned to a field. Null when everything landed. */
  message: string | null
}

/**
 * "must not be blank" on its own reads like a fragment. Prefixed with the
 * field's name it is a sentence a seller can act on without hunting for which
 * box it belongs to - and the box is highlighted as well.
 */
function sentence(label: string, reason: string): string {
  const trimmed = reason.trim()
  const body = trimmed.length > 0 ? trimmed : 'is not valid'
  const punctuated = /[.!?]$/.test(body) ? body : `${body}.`
  return `${label} ${punctuated}`
}

/**
 * Problem types the API raises that name no field but plainly belong to one.
 * Read from `type`, which is the API's own identifier for the failure - not
 * guessed from the wording of `detail`, which is free text.
 */
function typedField(problem: ProblemDetail, variantIndex: number | undefined): FieldMessage | null {
  const detail = problem.detail ?? problem.title
  if (problem.type.endsWith('/sku-taken') && variantIndex !== undefined) {
    return { path: `variants.${variantIndex}.sku`, message: detail }
  }
  return null
}

/**
 * @param variantIndex which row a variant request belongs to, so `price` from a
 * PATCH /variants/{id} lands on that row rather than nowhere.
 */
export function mapProblem(
  problem: ProblemDetail,
  { variantIndex }: { variantIndex?: number } = {},
): MappedProblem {
  const fields: FieldMessage[] = []
  const leftover: string[] = []

  for (const entry of problem.errors ?? []) {
    const nested = NESTED_VARIANT.exec(entry.field)
    if (nested && VARIANT_FIELDS[nested[2]]) {
      fields.push({
        path: `variants.${nested[1]}.${nested[2]}`,
        message: sentence(VARIANT_FIELDS[nested[2]], entry.reason),
      })
      continue
    }
    if (PRODUCT_FIELDS[entry.field]) {
      // `category` and `categorySlug` are the same control to the seller.
      const path = entry.field === 'category' ? 'categorySlug' : entry.field
      fields.push({ path, message: sentence(PRODUCT_FIELDS[entry.field], entry.reason) })
      continue
    }
    if (variantIndex !== undefined && VARIANT_FIELDS[entry.field]) {
      fields.push({
        path: `variants.${variantIndex}.${entry.field}`,
        message: sentence(VARIANT_FIELDS[entry.field], entry.reason),
      })
      continue
    }
    leftover.push(sentence(entry.field, entry.reason))
  }

  if (fields.length === 0) {
    const typed = typedField(problem, variantIndex)
    if (typed) {
      return { fields: [typed], message: leftover.length > 0 ? leftover.join(' ') : null }
    }
  }

  if (leftover.length > 0) {
    return { fields, message: leftover.join(' ') }
  }
  if (fields.length > 0) {
    return { fields, message: null }
  }
  // Nothing field-shaped came back, so the API's own sentence is the best there
  // is - `detail` first, because `title` is the status phrase.
  return { fields: [], message: problem.detail ?? problem.title }
}

/**
 * The upload path can fail two ways - the API refusing (a ProblemDetail) or the
 * direct PUT to storage failing (a plain Error) - and both have to read as one
 * message. `title` discriminates them: it is required on ProblemDetail and
 * absent on Error, unlike `detail`, which is optional and narrows nothing.
 */
export function isProblemDetail(error: unknown): error is ProblemDetail {
  return typeof error === 'object' && error !== null && 'title' in error && 'status' in error
}

export function errorSentence(error: unknown): string {
  if (isProblemDetail(error)) return error.detail ?? error.title
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}
