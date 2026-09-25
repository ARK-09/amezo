import { ArrowLeft, ImageOff, Plus, Trash2, Upload } from 'lucide-react'
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'

import { Button } from '@/components/ui/button'
import type { ProblemDetail } from '@/lib/api/client'
import { Input } from '@/components/ui/input'
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
  useUploadImage,
} from '@/features/seller-portal/api/useSellerProducts'

/**
 * View and edit one of the seller's own products. Two independent save
 * boundaries, matching the two endpoints behind them: the product's own fields,
 * and one variant's price/stock/label/sku. A seller fixing a price shouldn't have
 * to re-submit the description, and a failed variant save shouldn't roll back a
 * title they already saved.
 */
export function SellerProductDetail() {
  const { productId = '' } = useParams()
  const query = useSellerProduct(productId)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/seller/products">
            <ArrowLeft className="size-4" aria-hidden /> Products
          </Link>
        </Button>
      </div>

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

function ProductFields({
  productId,
  product,
}: {
  productId: string
  product: { title: string; brandName?: string | null; description?: string | null; category: string }
}) {
  const { mutate, isPending, isError, error, isSuccess } = useUpdateProduct(productId)

  const [title, setTitle] = useState(product.title)
  const [brandName, setBrandName] = useState(product.brandName ?? '')
  const [description, setDescription] = useState(product.description ?? '')
  const [category, setCategory] = useState(product.category)

  // Re-seed when the product itself changes (a save's response, or a refetch);
  // without this the form would keep showing the values it mounted with.
  useEffect(() => {
    setTitle(product.title)
    setBrandName(product.brandName ?? '')
    setDescription(product.description ?? '')
    setCategory(product.category)
  }, [product])

  const dirty =
    title !== product.title ||
    brandName !== (product.brandName ?? '') ||
    description !== (product.description ?? '') ||
    category !== product.category

  function submit(e: FormEvent) {
    e.preventDefault()
    // Only what changed: the API treats an omitted field as untouched, so this
    // keeps a title edit from rewriting the description with its own value.
    mutate({
      ...(title !== product.title ? { title } : {}),
      ...(brandName !== (product.brandName ?? '') ? { brandName } : {}),
      ...(description !== (product.description ?? '') ? { description } : {}),
      ...(category !== product.category ? { category } : {}),
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border p-6">
      <h1 className="text-lg font-semibold">Product details</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="title">
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label="Category" htmlFor="category">
          <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} required />
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

  function submit(e: FormEvent) {
    e.preventDefault()
    mutate(
      { label, sku, price: Number(price), stockQty: Number(stockQty) },
      { onSuccess: onDone },
    )
  }

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

      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {error.detail ?? error.title}
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

  useEffect(() => {
    setLabel(variant.label)
    setSku(variant.sku)
    setPrice(String(variant.price ?? ''))
    setStockQty(String(variant.stockQty))
  }, [variant])

  const dirty =
    label !== variant.label ||
    sku !== variant.sku ||
    price !== String(variant.price ?? '') ||
    stockQty !== String(variant.stockQty)

  function save() {
    mutate({
      variantId: variant.id,
      body: {
        ...(label !== variant.label ? { label } : {}),
        ...(sku !== variant.sku ? { sku } : {}),
        ...(price !== String(variant.price ?? '') ? { price: Number(price) } : {}),
        ...(stockQty !== String(variant.stockQty) ? { stockQty: Number(stockQty) } : {}),
      },
    })
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
      {(isError || remove.isError) && (
        <TableRow>
          <TableCell colSpan={5} className="text-sm text-destructive" role="alert">
            {isError
              ? (error.detail ?? error.title)
              : (remove.error?.detail ?? remove.error?.title)}
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
  const upload = useUploadImage(productId)
  const remove = useDeleteImage(productId)
  const fileInput = useRef<HTMLInputElement>(null)

  const MAX_IMAGES = 7
  const atCap = images.length >= MAX_IMAGES

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset first: picking the same file twice in a row fires no change event
    // otherwise, so a failed upload couldn't be retried with the same file.
    e.target.value = ''
    if (!file) {
      return
    }
    // Position after the last existing image, so the first upload stays the
    // thumbnail and new ones land at the end of the gallery.
    const position = images.reduce((max, image) => Math.max(max, image.position + 1), 0)
    upload.mutate({ file, position })
  }

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
            {upload.isPending ? 'Uploading…' : 'Add image'}
          </Button>
          {atCap && (
            <span className="text-xs text-muted-foreground">
              Remove one to add another
            </span>
          )}
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Add image"
        onChange={pick}
      />

      {(upload.isError || remove.isError) && (
        <p role="alert" className="text-sm text-destructive">
          {errorText(upload.error) ?? errorText(remove.error) ?? 'Something went wrong'}
        </p>
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
