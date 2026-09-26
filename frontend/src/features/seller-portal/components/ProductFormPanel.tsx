import { ImageOff, Plus, Trash2, Upload } from 'lucide-react'
import { type ChangeEvent, type FormEvent, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { ProblemDetail } from '@/lib/api/client'
import { Input } from '@/components/ui/input'
import { CategorySelect } from '@/features/reference/components/CategorySelect'
import { apiErrorMessage } from '@/lib/api/transient'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  type SellerProductDetail as SellerProductDetailData,
  type SellerVariant,
  useAddVariant,
  useDeleteImage,
  useDeleteVariant,
  useSellerProduct,
  useUpdateProduct,
  useUpdateVariant,
  useUploadImages,
} from '@/features/seller-portal/api/useSellerProducts'

/**
 * View and edit one of the seller's own products. Two independent save
 * boundaries, matching the two endpoints behind them: the product's own fields,
 * and one variant's price/stock/label/sku. A seller fixing a price shouldn't have
 * to re-submit the description, and a failed variant save shouldn't roll back a
 * title they already saved.
 *
 * Carries no page chrome of its own, because it is rendered in two places: the
 * drawer the products list opens, and the standalone route that drawer's "open
 * full page" button points at. Both get the same form and the same logic.
 */
export function ProductFormPanel({ productId }: { productId: string }) {
  const query = useSellerProduct(productId)

  return (
    <div className="flex flex-col gap-6">
      {query.isLoading && <p className="text-sm text-muted-foreground">Loading product…</p>}

      {query.isError && (
        <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="font-medium">Couldn&apos;t load this product</p>
          <p className="text-sm text-muted-foreground">{apiErrorMessage(query.error)}</p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {query.isSuccess && (
        <>
          <ProductFields productId={productId} product={query.data} />
          <VariantRows productId={productId} variants={query.data.variants} />
          <Images productId={productId} images={query.data.images} />
        </>
      )}
    </div>
  )
}

/** The product's own editable fields - what the query and a save's response both carry. */
type EditableProduct = {
  id: string
  title: string
  brandName?: string | null
  description?: string | null
  category: { slug: string; name: string }
}

function ProductFields({ productId, product }: { productId: string; product: EditableProduct }) {
  const { mutate, isPending, isError, error, isSuccess } = useUpdateProduct(productId)

  const [title, setTitle] = useState(product.title)
  const [brandName, setBrandName] = useState(product.brandName ?? '')
  const [description, setDescription] = useState(product.description ?? '')
  // The selected SLUG, since that is what the selector and the API both deal in.
  const [categorySlug, setCategorySlug] = useState(product.category.slug)

  function seed(next: EditableProduct) {
    setTitle(next.title)
    setBrandName(next.brandName ?? '')
    setDescription(next.description ?? '')
    setCategorySlug(next.category.slug)
  }

  // Re-seed only for a different product, never for a new object describing the
  // same one: a background refetch (window refocus, an invalidation from an image
  // upload) hands back a fresh object with the same id, and re-seeding on that
  // replaced a half-typed title with the server's old one mid-edit. Derived during
  // render rather than in an effect, which would paint the clobbered value once
  // before correcting it. A save gets its own re-seed, from its response.
  const [seededId, setSeededId] = useState(product.id)
  if (product.id !== seededId) {
    setSeededId(product.id)
    seed(product)
  }

  const dirty =
    title !== product.title ||
    brandName !== (product.brandName ?? '') ||
    description !== (product.description ?? '') ||
    categorySlug !== product.category.slug

  function submit(e: FormEvent) {
    e.preventDefault()
    // Only what changed: the API treats an omitted field as untouched, so this
    // keeps a title edit from rewriting the description with its own value.
    mutate(
      {
        ...(title !== product.title ? { title } : {}),
        ...(brandName !== (product.brandName ?? '') ? { brandName } : {}),
        ...(description !== (product.description ?? '') ? { description } : {}),
        ...(categorySlug !== product.category.slug ? { categorySlug } : {}),
      },
      // The one re-seed the identity check above deliberately skips: what came
      // back is what the server stored, so the form shows that and reads clean.
      { onSuccess: seed },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border p-6">
      <h1 className="text-lg font-semibold">Product details</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="title">
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label="Category" htmlFor="category">
          <CategorySelect
            id="category"
            value={categorySlug}
            onChange={setCategorySlug}
            // Already known from the product, so the control shows it straight away
            // instead of a loading placeholder.
            selectedName={categorySlug === product.category.slug ? product.category.name : undefined}
          />
        </Field>
        <Field label="Brand" htmlFor="brandName">
          <Input id="brandName" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
        </Field>
      </div>

      <Field label="Description" htmlFor="description">
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
        />
      </Field>

      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {error.detail ?? error.title}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!dirty || isPending}>
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
        {isSuccess && !dirty && <span className="text-sm text-muted-foreground">Saved</span>}
      </div>
    </form>
  )
}

function VariantRows({ productId, variants }: { productId: string; variants: SellerVariant[] }) {
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Variants</h2>
          <p className="text-sm text-muted-foreground">
            Set stock to 0 to stop selling a variant. Each row saves on its own.
          </p>
        </div>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Add variant
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {variants.map((variant) => (
            <VariantRow
              key={variant.id}
              productId={productId}
              variant={variant}
              // The last variant can't be removed - a product needs one to have a
              // price at all - so the button says why instead of failing on click.
              isOnlyVariant={variants.length <= 1}
            />
          ))}
        </TableBody>
      </Table>

      {adding && (
        <NewVariantForm
          productId={productId}
          onDone={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  )
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

/** Stock 0 is a real answer - it is how a seller stops selling a variant. */
function parseStock(value: string): number | null {
  const parsed = parseNumber(value)
  return parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

const PRICE_ERROR = 'Enter a price above 0.'
const STOCK_ERROR = 'Enter a stock quantity of 0 or more.'

function NewVariantForm({
  productId,
  onDone,
  onCancel,
}: {
  productId: string
  onDone: () => void
  onCancel: () => void
}) {
  const { mutate, isPending, isError, error } = useAddVariant(productId)
  const [label, setLabel] = useState('')
  const [sku, setSku] = useState('')
  const [price, setPrice] = useState('')
  const [stockQty, setStockQty] = useState('')
  const [invalid, setInvalid] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    // Checked here as well as by the inputs' `required`, which a whitespace-only
    // value satisfies and which nothing enforces on a programmatic submit.
    const priceValue = parsePrice(price)
    const stockValue = parseStock(stockQty)
    if (priceValue === null || stockValue === null) {
      setInvalid(priceValue === null ? PRICE_ERROR : STOCK_ERROR)
      return
    }

    setInvalid(null)
    mutate({ label, sku, price: priceValue, stockQty: stockValue }, { onSuccess: onDone })
  }

  // One message at a time, in the slot the API's own errors use: a field the
  // seller can fix now outranks whatever the last request came back with.
  const errorMessage = invalid ?? (isError ? (error.detail ?? error.title) : null)

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border border-dashed p-4">
      <h3 className="text-sm font-medium">New variant</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label"
          aria-label="New variant label"
          required
        />
        <Input
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="SKU"
          aria-label="New variant SKU"
          required
        />
        <Input
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price"
          aria-label="New variant price"
          required
        />
        <Input
          type="number"
          min="0"
          value={stockQty}
          onChange={(e) => setStockQty(e.target.value)}
          placeholder="Stock"
          aria-label="New variant stock"
          required
        />
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Adding…' : 'Add variant'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function VariantRow({
  productId,
  variant,
  isOnlyVariant,
}: {
  productId: string
  variant: SellerVariant
  isOnlyVariant: boolean
}) {
  const { mutate, isPending, isError, error } = useUpdateVariant(productId)
  const remove = useDeleteVariant(productId)

  const [label, setLabel] = useState(variant.label)
  const [sku, setSku] = useState(variant.sku)
  const [price, setPrice] = useState(String(variant.price ?? ''))
  const [stockQty, setStockQty] = useState(String(variant.stockQty))
  const [invalid, setInvalid] = useState<string | null>(null)

  function seed(next: SellerVariant) {
    setLabel(next.label)
    setSku(next.sku)
    setPrice(String(next.price ?? ''))
    setStockQty(String(next.stockQty))
  }

  // Same rule as the product fields above: a new object for the same variant is a
  // refetch, not a different row, and re-seeding on it wiped a price being typed.
  const [seededId, setSeededId] = useState(variant.id)
  if (variant.id !== seededId) {
    setSeededId(variant.id)
    seed(variant)
  }

  const dirty =
    label !== variant.label ||
    sku !== variant.sku ||
    price !== String(variant.price ?? '') ||
    stockQty !== String(variant.stockQty)

  function save() {
    // undefined is "untouched, so not in the PATCH"; null is "edited into
    // something unusable" - an empty price is missing, not $0.00. Only the fields
    // this save actually carries are checked, so a variant the server has no price
    // for can still have its stock saved.
    const priceEdit = price !== String(variant.price ?? '') ? parsePrice(price) : undefined
    const stockEdit = stockQty !== String(variant.stockQty) ? parseStock(stockQty) : undefined
    if (priceEdit === null || stockEdit === null) {
      setInvalid(priceEdit === null ? PRICE_ERROR : STOCK_ERROR)
      return
    }

    setInvalid(null)
    mutate(
      {
        variantId: variant.id,
        body: {
          ...(label !== variant.label ? { label } : {}),
          ...(sku !== variant.sku ? { sku } : {}),
          ...(priceEdit !== undefined ? { price: priceEdit } : {}),
          ...(stockEdit !== undefined ? { stockQty: stockEdit } : {}),
        },
      },
      // The saved row is what the server stored - show that, since the identity
      // check above won't re-seed from the cache update it triggers.
      { onSuccess: seed },
    )
  }

  return (
    <>
      <TableRow>
        <TableCell>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            aria-label={`Label for ${variant.sku}`}
          />
        </TableCell>
        <TableCell>
          <Input value={sku} onChange={(e) => setSku(e.target.value)} aria-label={`SKU for ${variant.sku}`} />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-label={`Price for ${variant.sku}`}
          />
        </TableCell>
        <TableCell>
          <Input
            type="number"
            min="0"
            value={stockQty}
            onChange={(e) => setStockQty(e.target.value)}
            aria-label={`Stock for ${variant.sku}`}
          />
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" disabled={!dirty || isPending} onClick={save}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Remove ${variant.sku}`}
              title={isOnlyVariant ? 'A product needs at least one variant' : undefined}
              disabled={isOnlyVariant || remove.isPending}
              onClick={() => remove.mutate(variant.id)}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {(invalid || isError || remove.isError) && (
        <TableRow>
          <TableCell colSpan={5} className="text-sm text-destructive" role="alert">
            {invalid ??
              (isError
                ? (error.detail ?? error.title)
                : (remove.error?.detail ?? remove.error?.title))}
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function Images({
  productId,
  images,
}: {
  productId: string
  images: SellerProductDetailData['images']
}) {
  const upload = useUploadImages(productId)
  const remove = useDeleteImage(productId)
  const fileInput = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [skipped, setSkipped] = useState(0)

  const MAX_IMAGES = 7
  const atCap = images.length >= MAX_IMAGES
  const remaining = MAX_IMAGES - images.length

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    // Reset first: picking the same files twice in a row fires no change event
    // otherwise, so a failed upload couldn't be retried with the same files.
    e.target.value = ''
    if (picked.length === 0) {
      return
    }

    // Clamped here as well as on the server, which counts PENDING rows toward the
    // cap exactly as this does. Without the clamp the extra files would each
    // presign, get a 409, and read as five failures instead of one clear "that's
    // more than the product can hold".
    const files = picked.slice(0, remaining)
    setSkipped(picked.length - files.length)
    setProgress({ done: 0, total: files.length })

    // Position after the last existing image, so the existing thumbnail stays the
    // thumbnail and the new ones land at the end of the gallery in the order they
    // were picked.
    const startPosition = images.reduce((max, image) => Math.max(max, image.position + 1), 0)
    upload.mutate(
      { files, startPosition, onProgress: (done, total) => setProgress({ done, total }) },
      { onSettled: () => setProgress(null) },
    )
  }

  const failures = upload.data?.failed ?? []

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Images</h2>
          <p className="text-sm text-muted-foreground">
            Up to {MAX_IMAGES}. The first one is the thumbnail buyers see in search.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={atCap || upload.isPending}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="size-4" aria-hidden />
            {upload.isPending
              ? // Counted, because a batch of six over a phone connection is a long
                // enough wait that an unchanging "Uploading…" looks stuck.
                `Uploading ${progress ? `${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : ''}…`
              : 'Add images'}
          </Button>
          {atCap ? (
            <span className="text-xs text-muted-foreground">Remove one to add another</span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {remaining} {remaining === 1 ? 'slot' : 'slots'} left
            </span>
          )}
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label="Add images"
        onChange={pick}
      />

      {skipped > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          {skipped} {skipped === 1 ? 'file was' : 'files were'} left out — a product holds at most{' '}
          {MAX_IMAGES} images.
        </p>
      )}

      {(upload.isError || remove.isError) && (
        <p role="alert" className="text-sm text-destructive">
          {errorText(upload.error) ?? errorText(remove.error) ?? 'Something went wrong'}
        </p>
      )}

      {/* Per file, because a batch can half succeed: the ones that landed are
          already in the gallery below, and these name what to fix and retry. */}
      {failures.length > 0 && (
        <div role="alert" className="text-sm text-destructive">
          <p>
            {failures.length} of {failures.length + (upload.data?.uploaded ?? 0)} images didn't
            upload:
          </p>
          <ul className="mt-1 list-inside list-disc">
            {failures.map((failure) => (
              <li key={failure.fileName}>
                {failure.fileName} — {errorText(failure.error)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {images.length === 0 && <p className="text-sm text-muted-foreground">No images uploaded.</p>}

      {images.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {images.map((image) => (
            <li key={image.id} className="flex flex-col items-center gap-1">
              <div className="flex size-24 items-center justify-center overflow-hidden rounded-md border bg-muted">
                {image.status === 'STORED' ? (
                  <img src={image.url} alt="" className="size-full object-cover" />
                ) : (
                  // PENDING rows are shown rather than hidden: an upload that
                  // never finished is the thing a seller most needs to notice.
                  <ImageOff className="size-5 text-muted-foreground" aria-hidden />
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">
                  {image.status === 'STORED' ? `#${image.position + 1}` : 'Incomplete'}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  aria-label={`Remove image ${image.position + 1}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(image.id)}
                >
                  <Trash2 className="size-3" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The upload path can fail two ways - the API refusing (a ProblemDetail) or the
 * direct PUT to storage failing (a plain Error) - and both have to read as one
 * message. `title` discriminates them: it's required on ProblemDetail and absent
 * on Error, unlike `detail`, which is optional and narrows nothing.
 */
function errorText(error: ProblemDetail | Error | null): string | undefined {
  if (!error) {
    return undefined
  }
  // apiErrorMessage handles the ProblemDetail side and the cold-start wording;
  // a plain Error from the direct-to-storage PUT carries its own message, which
  // apiErrorMessage has no field to read.
  return 'title' in error ? apiErrorMessage(error) : error.message
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  )
}
