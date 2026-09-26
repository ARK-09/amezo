import { ArrowDown, ArrowUp, ImageOff, Plus, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { CategorySelect } from '@/features/reference/components/CategorySelect'
import {
  type StagedImageUpload,
  useCreateProduct,
  uploadProductImage,
} from '@/features/seller-portal/api/useSellerProducts'

const MAX_IMAGES = 7

/** The design's own limit; the API sets none. Same field, same count as editing. */
const TITLE_LIMIT = 120

/**
 * The two statuses a new listing can be created with. ARCHIVED is not one of
 * them: it is what deleting a product does.
 */
type WritableStatus = 'ACTIVE' | 'DRAFT'

const STATUS_HINT: Record<WritableStatus, string> = {
  ACTIVE: 'Visible in search and on your store page as soon as you save.',
  DRAFT: 'Saved to your catalogue but hidden from shoppers until you activate it.',
}

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
 * A numeric field's value, or null when the field holds nothing usable. Number('')
 * is 0, which is how a cleared price used to be submitted as a real $0.00 variant,
 * and Number('12px') is NaN, which serialises to null against a number column.
 * Both are a missing value, not a zero.
 */
function parseNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Price has to be above 0. Unlike stock, a zero price is never something a seller
 * means - a free item is a promotion, not a $0.00 offer - and it is exactly what
 * the empty-field bug produced, so accepting a typed 0 would leave that same
 * mispriced listing one stray keystroke away.
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

export function SellerAddProduct() {
  const navigate = useNavigate()
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
  const [imageWarning, setImageWarning] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function updateVariant(index: number, patch: Partial<VariantRow>) {
    setVariants((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addVariantRow() {
    setVariants((rows) => [...rows, emptyVariant()])
  }

  function removeVariantRow(index: number) {
    setVariants((rows) => rows.filter((_, i) => i !== index))
  }

  function addImages(fileList: FileList | null) {
    if (!fileList) return
    const files = Array.from(fileList).slice(0, MAX_IMAGES - images.length)
    const staged = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    setImages((current) => [...current, ...staged])
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

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    setImageWarning(null)

    // A selector can't carry `required` the way the text input it replaced did, and
    // a product has to have a category - the API refuses one without.
    if (!categorySlug) {
      setSubmitError('Choose a category for this product.')
      return
    }

    // Parsed before the request rather than with Number() inside it: an empty
    // price field is missing, not $0.00, and a product listed at zero is one
    // nobody meant to publish. Checked here as well as by the inputs' `required`,
    // which a whitespace-only value satisfies.
    const priced: { label: string; sku: string; price: number; stockQty: number }[] = []
    for (const [index, v] of variants.entries()) {
      const price = parsePrice(v.price)
      const stockQty = parseStock(v.stockQty)
      if (price === null || stockQty === null) {
        setSubmitError(
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

      const failedUploads: string[] = []
      for (const [index, image] of images.entries()) {
        const staged: StagedImageUpload = { file: image.file, position: index }
        try {
          await uploadProductImage(id, staged)
        } catch {
          failedUploads.push(image.file.name)
        }
      }
      if (failedUploads.length > 0) {
        setImageWarning(
          `Product saved, but ${failedUploads.length} image(s) failed to upload: ${failedUploads.join(', ')}`,
        )
      }

      navigate('/seller/products')
    } catch {
      setSubmitError('Could not save the product. Check the fields and try again.')
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Add product</h1>
          <div className="flex items-center gap-2">
            <Switch
              id="status"
              checked={status === 'ACTIVE'}
              onCheckedChange={(on) => setStatus(on ? 'ACTIVE' : 'DRAFT')}
            />
            <Label htmlFor="status">Active</Label>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{STATUS_HINT[status]}</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="title" className="mb-1.5 block text-sm font-medium">
              Title
            </label>
            <Input
              id="title"
              required
              maxLength={TITLE_LIMIT}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {title.length}/{TITLE_LIMIT} characters
            </p>
          </div>
          <div>
            <label htmlFor="brand" className="mb-1.5 block text-sm font-medium">
              Brand
            </label>
            <Input id="brand" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="description" className="mb-1.5 block text-sm font-medium">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="category" className="mb-1.5 block text-sm font-medium">
              Category
            </label>
            <CategorySelect id="category" value={categorySlug} onChange={setCategorySlug} />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold">Images (up to {MAX_IMAGES})</span>
            <label className="cursor-pointer">
              <span className="text-sm text-primary underline">Add images</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={images.length >= MAX_IMAGES}
                onChange={(e) => {
                  addImages(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          {images.length === 0 ? (
            <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              <ImageOff className="mr-2 size-4" aria-hidden />
              No images added
            </div>
          ) : (
            <ul className="flex flex-wrap gap-3">
              {images.map((image, index) => (
                <li key={image.id} className="relative w-20">
                  <img src={image.previewUrl} alt="" className="size-20 rounded-md border object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove image ${index + 1}`}
                    onClick={() => removeImage(image.id)}
                    className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                  >
                    <X className="size-3" />
                  </button>
                  <div className="mt-1 flex justify-center gap-1">
                    <button
                      type="button"
                      aria-label={`Move image ${index + 1} earlier`}
                      disabled={index === 0}
                      onClick={() => moveImage(index, -1)}
                      className="rounded border p-0.5 disabled:opacity-30"
                    >
                      <ArrowUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move image ${index + 1} later`}
                      disabled={index === images.length - 1}
                      onClick={() => moveImage(index, 1)}
                      className="rounded border p-0.5 disabled:opacity-30"
                    >
                      <ArrowDown className="size-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold">Variants</span>
            <Button type="button" variant="outline" size="sm" onClick={addVariantRow} className="gap-1">
              <Plus className="size-3.5" />
              Add variant
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {variants.map((variant, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_100px_90px_auto] items-center gap-2">
                <Input
                  aria-label={`Variant ${index + 1} label`}
                  placeholder="Label"
                  required
                  value={variant.label}
                  onChange={(e) => updateVariant(index, { label: e.target.value })}
                />
                <Input
                  aria-label={`Variant ${index + 1} SKU`}
                  placeholder="SKU"
                  required
                  value={variant.sku}
                  onChange={(e) => updateVariant(index, { sku: e.target.value })}
                />
                <Input
                  aria-label={`Variant ${index + 1} price`}
                  placeholder="Price"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={variant.price}
                  onChange={(e) => updateVariant(index, { price: e.target.value })}
                />
                <Input
                  aria-label={`Variant ${index + 1} stock quantity`}
                  placeholder="Stock"
                  type="number"
                  min="0"
                  required
                  value={variant.stockQty}
                  onChange={(e) => updateVariant(index, { stockQty: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove variant ${index + 1}`}
                  disabled={variants.length === 1}
                  onClick={() => removeVariantRow(index)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {submitError && <p className="text-sm text-destructive">{submitError}</p>}
        {imageWarning && <p className="text-sm text-destructive">{imageWarning}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/seller/products')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
