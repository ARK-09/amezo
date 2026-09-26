import { useMemo, useState } from 'react'

import {
  type StagedImageUpload,
  useCreateProduct,
  uploadProductImage,
} from '@/features/seller-portal/api/useSellerProducts'

/**
 * The new-listing form's state, separate from the fields that render it.
 *
 * The form was previously the whole of SellerAddProduct: a page that navigated
 * away from the list, held its own copy of the form, and put the save button
 * inside the form element. The design opens the same drawer the list already
 * uses and saves from that drawer's FOOTER, which means the form's
 * completeness has to be readable from outside the form. Holding the state in
 * a hook does that without a second copy of the form existing - the standalone
 * /new route and the drawer render the same fields from the same state.
 *
 * In its own module because it is a hook: a file exporting both a hook and
 * components breaks fast refresh (react(only-export-components)), which is why
 * SellerAuthContext.ts sits beside SellerAuthProvider.tsx too.
 */

export const MAX_IMAGES = 7

/** The design's own limit; the API sets none. */
export const TITLE_LIMIT = 120

/**
 * The two statuses a new listing can be created with. ARCHIVED is not one of
 * them: it is what deleting a product does.
 */
export type WritableStatus = 'ACTIVE' | 'DRAFT'

interface VariantRow {
  label: string
  sku: string
  price: string
  stockQty: string
}

interface StagedImage {
  id: string
  file: File
  previewUrl: string
}

function emptyVariant(): VariantRow {
  return { label: '', sku: '', price: '', stockQty: '' }
}

/**
 * A numeric field's value, or null when the field holds nothing usable.
 * Number('') is 0, which is how a cleared price used to be submitted as a real
 * $0.00 variant, and Number('12px') is NaN, which serialises to null against a
 * number column. Both are a missing value, not a zero.
 */
function parseNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Price has to be above 0. Unlike stock, a zero price is never something a
 * seller means - a free item is a promotion, not a $0.00 offer - and it is
 * exactly what the empty-field bug produced.
 */
function parsePrice(value: string): number | null {
  const parsed = parseNumber(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

/** Stock 0 is a real answer - a variant can be listed with nothing on the shelf. */
function parseStock(value: string): number | null {
  const parsed = parseNumber(value)
  return parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

export interface ProductCreateForm {
  title: string
  setTitle: (value: string) => void
  brandName: string
  setBrandName: (value: string) => void
  description: string
  setDescription: (value: string) => void
  categorySlug: string | null
  setCategorySlug: (value: string | null) => void
  status: WritableStatus
  setStatus: (value: WritableStatus) => void
  variants: VariantRow[]
  images: StagedImage[]
  updateVariant: (index: number, patch: Partial<VariantRow>) => void
  addVariantRow: () => void
  removeVariantRow: (index: number) => void
  addImages: (files: FileList | null) => void
  removeImage: (id: string) => void
  moveImage: (index: number, direction: -1 | 1) => void

  /** Complete AND changed - the design gates the save button on both. */
  canSave: boolean
  /** The design's left-hand hint: what is still missing, or whether anything changed. */
  footerNote: string
  saveLabel: string
  isPending: boolean
  error: string | null
  warning: string | null
  submit: () => Promise<void>
}

/**
 * @param onCreated runs after the product (and its images) are saved. The
 * drawer closes and flashes; the standalone page navigates back to the list.
 */
export function useProductCreateForm({
  onCreated,
}: {
  onCreated: (product: { id: string; title: string }) => void
}): ProductCreateForm {
  const { mutateAsync: createProduct, isPending } = useCreateProduct()

  const [title, setTitle] = useState('')
  const [brandName, setBrandName] = useState('')
  const [description, setDescription] = useState('')
  // A listing has to be creatable as a draft: without it the only way to reach
  // DRAFT is to publish the half-finished product first and unpublish it after.
  const [status, setStatus] = useState<WritableStatus>('ACTIVE')
  // A category SLUG chosen from the system list - never typed. null until chosen.
  const [categorySlug, setCategorySlug] = useState<string | null>(null)
  const [variants, setVariants] = useState<VariantRow[]>([emptyVariant()])
  const [images, setImages] = useState<StagedImage[]>([])
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function updateVariant(index: number, patch: Partial<VariantRow>) {
    setVariants((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addVariantRow() {
    setVariants((rows) => [...rows, emptyVariant()])
  }

  function removeVariantRow(index: number) {
    setVariants((rows) => (rows.length === 1 ? rows : rows.filter((_, i) => i !== index)))
  }

  function addImages(fileList: FileList | null) {
    if (!fileList) return
    const files = Array.from(fileList).slice(0, MAX_IMAGES - images.length)
    setImages((current) => [
      ...current,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ])
  }

  function removeImage(id: string) {
    setImages((current) => current.filter((image) => image.id !== id))
  }

  function moveImage(index: number, direction: -1 | 1) {
    setImages((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  // Named, so the footer can say which field is missing rather than only that
  // the button is disabled - the design's "Still needs a title, a category."
  const missing = useMemo(() => {
    const gaps: string[] = []
    if (!title.trim()) gaps.push('a title')
    if (!categorySlug) gaps.push('a category')
    if (
      variants.some(
        (v) =>
          !v.label.trim() || !v.sku.trim() || parsePrice(v.price) === null || parseStock(v.stockQty) === null,
      )
    ) {
      gaps.push('every variant field')
    }
    return gaps
  }, [title, categorySlug, variants])

  const dirty =
    title !== '' ||
    brandName !== '' ||
    description !== '' ||
    categorySlug !== null ||
    status !== 'ACTIVE' ||
    images.length > 0 ||
    variants.some((v) => v.label || v.sku || v.price || v.stockQty)

  const canSave = missing.length === 0 && dirty && !isPending

  const footerNote = missing.length
    ? `Still needs ${missing.join(', ')}.`
    : dirty
      ? 'Unsaved changes'
      : 'No changes yet'

  async function submit() {
    setError(null)
    setWarning(null)
    if (!categorySlug) {
      setError('Choose a category for this product.')
      return
    }

    // Parsed before the request rather than with Number() inside it: an empty
    // price field is missing, not $0.00, and a product listed at zero is one
    // nobody meant to publish.
    const priced: { label: string; sku: string; price: number; stockQty: number }[] = []
    for (const [index, v] of variants.entries()) {
      const price = parsePrice(v.price)
      const stockQty = parseStock(v.stockQty)
      if (price === null || stockQty === null) {
        setError(
          price === null
            ? `Variant ${index + 1} needs a price above 0.`
            : `Variant ${index + 1} needs a stock quantity of 0 or more.`,
        )
        return
      }
      priced.push({ label: v.label, sku: v.sku, price, stockQty })
    }

    try {
      const { id } = await createProduct({
        title,
        brandName: brandName || null,
        description: description || null,
        categorySlug,
        status,
        variants: priced,
      })

      // Sequential, and after the product exists: every presign is checked
      // against the product's 7-image cap and the deployment's storage budget,
      // so firing them at once races both.
      const failed: string[] = []
      for (const [index, image] of images.entries()) {
        const staged: StagedImageUpload = { file: image.file, position: index }
        try {
          await uploadProductImage(id, staged)
        } catch {
          failed.push(image.file.name)
        }
      }
      if (failed.length > 0) {
        setWarning(`Product saved, but ${failed.length} image(s) failed to upload: ${failed.join(', ')}`)
      }

      onCreated({ id, title })
    } catch {
      setError('Could not save the product. Check the fields and try again.')
    }
  }

  return {
    title,
    setTitle,
    brandName,
    setBrandName,
    description,
    setDescription,
    categorySlug,
    setCategorySlug,
    status,
    setStatus,
    variants,
    images,
    updateVariant,
    addVariantRow,
    removeVariantRow,
    addImages,
    removeImage,
    moveImage,
    canSave,
    footerNote,
    saveLabel: 'Publish product',
    isPending,
    error,
    warning,
    submit,
  }
}

