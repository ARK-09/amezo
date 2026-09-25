import { ArrowLeft, ImageOff } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  type SellerVariant,
  useSellerProduct,
  useUpdateProduct,
  useUpdateVariant,
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
          <p className="text-sm text-muted-foreground">{query.error.detail ?? query.error.title}</p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {query.isSuccess && (
        <>
          <ProductFields productId={productId} product={query.data} />
          <VariantRows productId={productId} variants={query.data.variants} />
          <Images images={query.data.images} />
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
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-6">
      <div>
        <h2 className="text-lg font-semibold">Variants</h2>
        <p className="text-sm text-muted-foreground">
          Set stock to 0 to stop selling a variant. Each row saves on its own.
        </p>
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
            <VariantRow key={variant.id} productId={productId} variant={variant} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function VariantRow({ productId, variant }: { productId: string; variant: SellerVariant }) {
  const { mutate, isPending, isError, error } = useUpdateVariant(productId)

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
          <Button size="sm" variant="outline" disabled={!dirty || isPending} onClick={save}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </TableCell>
      </TableRow>
      {isError && (
        <TableRow>
          <TableCell colSpan={5} className="text-sm text-destructive" role="alert">
            {error.detail ?? error.title}
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function Images({
  images,
}: {
  images: { id: string; url: string; position: number; status: string }[]
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-6">
      <div>
        <h2 className="text-lg font-semibold">Images</h2>
        <p className="text-sm text-muted-foreground">
          {/* PENDING rows are shown rather than hidden: an upload that never
              finished is the thing a seller most needs to notice here. */}
          Adding and removing images isn&apos;t available yet — images are set when the product is
          created.
        </p>
      </div>

      {images.length === 0 && <p className="text-sm text-muted-foreground">No images uploaded.</p>}

      {images.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {images.map((image) => (
            <li key={image.id} className="flex flex-col items-center gap-1">
              <div className="flex size-24 items-center justify-center overflow-hidden rounded-md border bg-muted">
                {image.status === 'STORED' ? (
                  <img src={image.url} alt="" className="size-full object-cover" />
                ) : (
                  <ImageOff className="size-5 text-muted-foreground" aria-hidden />
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {image.status === 'STORED' ? `#${image.position + 1}` : 'Upload incomplete'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
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
