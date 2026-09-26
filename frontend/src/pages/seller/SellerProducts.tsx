import { ImageOff, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCategories } from '@/features/reference/api/useCategories'
import {
  useSellerProductRows,
  type SellerProductFilters,
} from '@/features/seller-portal/api/useSellerCatalog'
import { useDeleteProduct } from '@/features/seller-portal/api/useSellerProducts'
import { DetailDrawer } from '@/features/seller-portal/components/DetailDrawer'
import { ProductFormPanel } from '@/features/seller-portal/components/ProductFormPanel'
import { StatusBadge } from '@/features/seller-portal/components/StatusBadge'
import { formatMediumDate } from '@/lib/formatDate'
import { formatPrice } from '@/lib/formatPrice'
import { cn } from '@/lib/utils'

/** The design's own default; below this the stock cell warns. */
const LOW_STOCK = 10
const PAGE_SIZE = 10

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title_asc', label: 'Title A–Z' },
  { value: 'stock_asc', label: 'Lowest stock' },
  { value: 'price_desc', label: 'Highest price' },
] as const

export function SellerProducts() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(null)
  // The design confirms a delete inline on the row rather than in a modal.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const categories = useCategories()
  const deleteProduct = useDeleteProduct()

  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? 'all'
  const categorySlug = searchParams.get('category') ?? 'all'
  const sort = searchParams.get('sort') ?? 'newest'
  const page = Number(searchParams.get('page') ?? 0)

  const filters = useMemo<SellerProductFilters>(
    () => ({
      q: q || undefined,
      status: status === 'all' ? undefined : (status as SellerProductFilters['status']),
      categorySlug: categorySlug === 'all' ? undefined : categorySlug,
      sort: sort as SellerProductFilters['sort'],
      page,
      size: PAGE_SIZE,
    }),
    [q, status, categorySlug, sort, page],
  )

  const query = useSellerProductRows(filters)

  function patch(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== 'all') params.set(key, value)
      else params.delete(key)
    }
    if (!('page' in next)) params.delete('page')
    setSearchParams(params)
  }

  const rows = query.data?.content ?? []
  const total = query.data?.totalElements ?? 0
  const totalPages = query.data?.totalPages ?? 1
  const hasFilters = Boolean(q) || status !== 'all' || categorySlug !== 'all' || sort !== 'newest'
  const openRow = rows.find((row) => row.id === openId)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {query.isLoading ? 'Loading…' : `${total} listing${total === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button asChild className="gap-1.5">
          <Link to="/seller/products/new">
            <Plus className="size-4" aria-hidden />
            Add product
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative max-w-[360px] min-w-[220px] flex-1">
          <Search
            className="absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            defaultValue={q}
            onChange={(e) => patch({ q: e.target.value })}
            placeholder="Search title, brand or SKU"
            aria-label="Search products"
            className="h-9 w-full rounded-md border bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <Select value={status} onValueChange={(value) => patch({ status: value })}>
          <SelectTrigger aria-label="Filter by status" className="h-9 w-[150px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categorySlug} onValueChange={(value) => patch({ category: value })}>
          <SelectTrigger aria-label="Filter by category" className="h-9 w-[170px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(categories.data ?? []).map((category) => (
              <SelectItem key={category.slug} value={category.slug}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(value) => patch({ sort: value })}>
          <SelectTrigger aria-label="Sort products" className="h-9 w-[160px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => setSearchParams(new URLSearchParams())}>
            Clear filters
          </Button>
        )}
      </div>

      {query.isError && (
        <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="font-medium">Couldn't load your products</p>
          <p className="text-sm text-muted-foreground">
            {query.error?.detail ?? 'Something went wrong. Try again.'}
          </p>
          <Button variant="outline" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {query.isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {query.isSuccess && rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border py-16 text-center">
          <p className="font-medium">No products here</p>
          <p className="text-sm text-muted-foreground">
            {hasFilters ? 'Try a different search or filter.' : 'Add your first listing to start selling.'}
          </p>
          {hasFilters ? (
            <Button variant="outline" onClick={() => setSearchParams(new URLSearchParams())}>
              Clear filters
            </Button>
          ) : (
            <Button asChild>
              <Link to="/seller/products/new">Add product</Link>
            </Button>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Variants</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                        {row.thumbnailUrl ? (
                          <img src={row.thumbnailUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <ImageOff className="size-4 text-muted-foreground" aria-hidden />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{row.title}</p>
                        {row.brandName && (
                          <p className="truncate text-xs text-muted-foreground">{row.brandName}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.category.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.variantCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {/* A draft with no variants yet has no price to show. */}
                    {row.priceFrom == null
                      ? '—'
                      : row.priceFrom === row.priceTo
                        ? formatPrice(row.priceFrom)
                        : `${formatPrice(row.priceFrom)}–${formatPrice(row.priceTo ?? row.priceFrom)}`}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        'tabular-nums',
                        row.totalStock === 0 && 'font-semibold text-[#b42318]',
                        row.totalStock > 0 && row.totalStock < LOW_STOCK && 'font-semibold text-[#8a5a00]',
                      )}
                    >
                      {row.totalStock === 0 ? 'Out of stock' : row.totalStock}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatMediumDate(row.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {confirmingId === row.id ? (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmingId(null)}
                        >
                          Keep
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deleteProduct.isPending}
                          onClick={() =>
                            deleteProduct.mutate(row.id, { onSettled: () => setConfirmingId(null) })
                          }
                        >
                          Confirm delete
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => setOpenId(row.id)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${row.title}`}
                          onClick={() => setConfirmingId(row.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => patch({ page: String(page - 1) })}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => patch({ page: String(page + 1) })}
          >
            Next
          </Button>
        </div>
      )}

      <DetailDrawer
        open={Boolean(openRow)}
        onOpenChange={(next) => !next && setOpenId(null)}
        title={openRow?.title ?? 'Edit product'}
        description={openRow ? `${openRow.category.name} · ${openRow.variantCount} variants` : undefined}
        fullPageTo={`/seller/products/${openRow?.id ?? ''}`}
      >
        {openRow && <ProductFormPanel productId={openRow.id} />}
      </DetailDrawer>
    </div>
  )
}
