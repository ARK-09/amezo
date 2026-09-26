import { ImageOff, Plus, Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import { Button } from '@/components/ui/button'
import { PaginationBar } from '@/components/ui/pagination'
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
  type SellerProductRow,
} from '@/features/seller-portal/api/useSellerCatalog'
import { useDeleteProduct } from '@/features/seller-portal/api/useSellerProducts'
import {
  Drawer,
  DrawerBody,
  DrawerEyebrow,
  DrawerFooter,
  DrawerHeader,
  DrawerSubline,
  DrawerTitle,
} from '@/features/seller-portal/components/Drawer'
import {
  ProductCreateFields,
  StatusSegmented,
} from '@/features/seller-portal/components/ProductCreateForm'
import { useProductCreateForm } from '@/features/seller-portal/components/useProductCreateForm'
import { ProductFormPanel } from '@/features/seller-portal/components/ProductFormPanel'
import { ProductViewPanel } from '@/features/seller-portal/components/ProductViewPanel'
import { StatusBadge } from '@/features/seller-portal/components/StatusBadge'
import { formatPrice } from '@/lib/formatPrice'

/** The design's own default; below this the stock cell warns. */
const LOW_STOCK = 10

/** The sizes the design's Per page select offers, and the one it opens on. */
const PAGE_SIZES = [5, 10, 20, 50] as const
const DEFAULT_SIZE = 5

/**
 * The four orderings the design offers. The endpoint supports three more
 * (oldest, title_desc, price_desc); they are not listed because the design's
 * select does not offer them, and an option nobody designed a label for is a
 * guess.
 */
const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'title_asc', label: 'Title A–Z' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'stock_asc', label: 'Stock: low to high' },
] as const

/** How long the design leaves a save/delete confirmation on screen. */
const FLASH_MS = 3200

/**
 * ?page=abc, ?page=-5 and ?page=1.7 used to go straight into the request and
 * into "Page NaN of 1". A page number is a whole one, zero or above, or it is 0.
 */
function pageParam(raw: string | null) {
  const parsed = Number(raw ?? 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

/**
 * Same treatment for ?size=: junk is the default, and ?size=10000 is a request
 * for the whole catalogue in one response. Only the offered sizes count.
 */
function sizeParam(raw: string | null) {
  const parsed = Number(raw)
  return PAGE_SIZES.some((size) => size === parsed) ? parsed : DEFAULT_SIZE
}

/**
 * What the drawer is showing. One piece of state rather than three booleans, so
 * "viewing" and "editing" cannot both be true - they are two drawers the design
 * swaps between, not a drawer with a tab.
 */
type DrawerState =
  | { mode: 'view'; id: string; row: SellerProductRow | null }
  | { mode: 'edit'; id: string; row: SellerProductRow | null }
  | { mode: 'add' }
  | null

export function SellerProducts() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [drawer, setDrawer] = useState<DrawerState>(null)
  // The design confirms a row delete inline in the cell rather than in a modal.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  // Expanding is a property of the drawer session, not of the mode: swapping
  // view -> edit while expanded should stay expanded.
  const [expanded, setExpanded] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const categories = useCategories()
  const deleteProduct = useDeleteProduct()

  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? 'all'
  const categorySlug = searchParams.get('category') ?? 'all'
  const sort = searchParams.get('sort') ?? 'newest'
  const page = pageParam(searchParams.get('page'))
  const size = sizeParam(searchParams.get('size'))

  // The box is controlled so it can never disagree with the list: "Clear
  // filters" and the Back button both rewrite ?q= underneath it, and a
  // defaultValue input went on showing the term it was mounted with. Re-seeded
  // during render rather than from an effect - react(set-state-in-effect).
  const [term, setTerm] = useState(q)
  const [seededFrom, setSeededFrom] = useState(q)
  if (seededFrom !== q) {
    setSeededFrom(q)
    setTerm(q)
  }

  const filters = useMemo<SellerProductFilters>(
    () => ({
      q: q || undefined,
      status: status === 'all' ? undefined : (status as SellerProductFilters['status']),
      categorySlug: categorySlug === 'all' ? undefined : categorySlug,
      sort: sort as SellerProductFilters['sort'],
      page,
      size,
    }),
    [q, status, categorySlug, sort, page, size],
  )

  const query = useSellerProductRows(filters)
  const counts = useCatalogueCounts()

  // setTimeout rather than an effect: react(set-state-in-effect) is a lint
  // error here, and the flash is caused by an action, not by a render.
  function showFlash(message: string) {
    setFlash(message)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS)
  }

  // `replace` swaps the current history entry instead of pushing a new one.
  function patch(next: Record<string, string | undefined>, replace = false) {
    const params = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== 'all') params.set(key, value)
      else params.delete(key)
    }
    if (!('page' in next)) params.delete('page')
    setSearchParams(params, { replace })
  }

  // A filter, a sort or a page is a navigation the seller may want to undo
  // with Back; a keystroke is not. The first character pushes the one entry that
  // Back escapes the search by, and every character after it replaces that entry
  // - typing "laptop" used to leave six entries to press Back through.
  function patchTerm(value: string) {
    setTerm(value)
    patch({ q: value }, Boolean(q))
  }

  function closeDrawer() {
    setDrawer(null)
    setExpanded(false)
  }

  const rows = query.data?.content ?? []
  const total = query.data?.totalElements ?? 0
  const totalPages = query.data?.totalPages ?? 1
  // A ?page= past the end comes back empty; don't also print a page number that
  // doesn't exist, and let Previous walk back into the range that does.
  const shownPage = Math.min(page, totalPages - 1)
  const hasFilters = Boolean(q) || status !== 'all' || categorySlug !== 'all' || sort !== 'newest'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {counts.isLoading ? 'Loading…' : `${counts.total} products · ${counts.active} active`}
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setDrawer({ mode: 'add' })}>
          <Plus className="size-4" aria-hidden />
          Add product
        </Button>
      </div>

      {flash && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-sm font-medium text-[#b8560a]">
          {flash}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative max-w-[360px] min-w-[220px] flex-1">
          <Search
            className="absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={term}
            onChange={(e) => patchTerm(e.target.value)}
            placeholder="Search title, brand or SKU"
            aria-label="Search products"
            className="h-9 w-full rounded-md border bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {/* ACTIVE and DRAFT only. ARCHIVED was offered here and could never
            match: nothing in the system writes it - DELETE hard-deletes, and the
            update endpoint refuses it - so the option was a filter for an empty
            set. The design's own select offers these two. */}
        <Select value={status} onValueChange={(value) => patch({ status: value })}>
          <SelectTrigger aria-label="Filter by status" className="h-9 w-[150px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
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
          <SelectTrigger aria-label="Sort products" className="h-9 w-[180px] text-[13px]">
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

      {/* The confirm popover closes as soon as the request settles, so a delete
          that failed used to leave the row sitting there looking untouched. */}
      {deleteProduct.isError && (
        <p role="alert" className="text-sm text-destructive">
          {deleteProduct.error.detail ?? deleteProduct.error.title}
        </p>
      )}

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
          <p className="font-medium">
            {hasFilters ? 'No products match those filters' : 'No products here'}
          </p>
          <p className="text-sm text-muted-foreground">
            {hasFilters
              ? 'Clear the search or pick a different status.'
              : 'Add your first listing to start selling.'}
          </p>
          {hasFilters ? (
            <Button variant="outline" onClick={() => setSearchParams(new URLSearchParams())}>
              Clear filters
            </Button>
          ) : (
            <Button onClick={() => setDrawer({ mode: 'add' })}>Add product</Button>
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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  // The whole row opens the record, as the design has it.
                  // Keyboard reaches the same thing through the Edit button and
                  // the title, so this is a shortcut rather than the only way in.
                  onClick={() => setDrawer({ mode: 'view', id: row.id, row })}
                  className="cursor-pointer"
                >
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
                        {/* The design's row meta: brand and image count. */}
                        <p className="truncate text-xs text-muted-foreground">
                          {[row.brandName, `${row.imageCount ?? 0} images`].filter(Boolean).join(' · ')}
                        </p>
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
                    <StockCell total={row.totalStock} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Every button here stops propagation: without it the row's
                        own click fires too and the view drawer opens on top of
                        whatever was just pressed. */}
                    {confirmingId === row.id ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-[13px] font-semibold text-[#b42318]">Delete?</span>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deleteProduct.isPending}
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteProduct.mutate(row.id, {
                              onSuccess: () => showFlash(`Deleted ${row.title}.`),
                              onSettled: () => setConfirmingId(null),
                            })
                          }}
                        >
                          Yes
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmingId(null)
                          }}
                        >
                          No
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDrawer({ mode: 'edit', id: row.id, row })
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${row.title}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmingId(row.id)
                          }}
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

      {/* Shown whenever there are rows, not only past page one: Per page is how
          you get back from 50 to 5, and at 50 there is often only one page. */}
      {rows.length > 0 && (
        <PaginationBar
          page={shownPage}
          totalPages={totalPages}
          onPageChange={(next) => patch({ page: String(next) })}
          range={{
            totalElements: total,
            pageSize: size,
            sizes: PAGE_SIZES,
            // A new page size makes the old offset meaningless, so patch drops
            // ?page= with it - as it does for any other filter change.
            onSizeChange: (next) =>
              patch({ size: next === DEFAULT_SIZE ? undefined : String(next) }),
          }}
        />
      )}

      <Drawer
        open={drawer !== null}
        onOpenChange={(next) => {
          if (!next) closeDrawer()
        }}
        mode={drawer?.mode ?? 'view'}
        ariaLabel={drawer?.mode === 'view' ? 'Product details' : 'Product form'}
        // The design's two widths: 520 to read a record, 620 to edit one.
        width={drawer?.mode === 'view' ? 520 : 620}
        expanded={expanded}
        onExpandedChange={setExpanded}
      >
        {drawer?.mode === 'view' && (
          <ViewDrawerContent
            id={drawer.id}
            row={drawer.row}
            onEdit={() => setDrawer({ mode: 'edit', id: drawer.id, row: drawer.row })}
            onDeleted={(title) => {
              closeDrawer()
              showFlash(`Deleted ${title}.`)
            }}
          />
        )}

        {drawer?.mode === 'edit' && <EditDrawerContent row={drawer.row} id={drawer.id} onDone={closeDrawer} />}

        {drawer?.mode === 'add' && (
          <AddDrawerContent
            onCreated={(title) => {
              closeDrawer()
              showFlash(`Added ${title}.`)
            }}
            onCancel={closeDrawer}
          />
        )}
      </Drawer>
    </div>
  )
}

/**
 * The catalogue's own totals, for the "N products · N active" line. Two
 * deliberately tiny reads (size=1, so a count and one row) rather than a number
 * derived from the current page: the line describes the seller's whole
 * catalogue, and the list on screen is a filtered slice of it. They are keyed on
 * their own filters, so changing a filter or a page does not refetch them.
 */
function useCatalogueCounts() {
  const all = useSellerProductRows({ page: 0, size: 1 })
  const active = useSellerProductRows({ page: 0, size: 1, status: 'ACTIVE' })
  return {
    isLoading: all.isLoading || active.isLoading,
    total: all.data?.totalElements ?? 0,
    active: active.data?.totalElements ?? 0,
  }
}

/** The design's three stock states: out, low, and a plain count. */
function StockCell({ total }: { total: number }) {
  if (total === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-[#b42318]/10 px-2.5 py-0.5 text-xs font-semibold text-[#b42318]">
        Out of stock
      </span>
    )
  }
  if (total <= LOW_STOCK) {
    return (
      <span className="inline-flex items-center rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-semibold text-[#a8500a]">
        {total} in stock
      </span>
    )
  }
  return <span className="text-sm text-muted-foreground tabular-nums">{total} in stock</span>
}

function ViewDrawerContent({
  id,
  row,
  onEdit,
  onDeleted,
}: {
  id: string
  row: SellerProductRow | null
  onEdit: () => void
  onDeleted: (title: string) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const deleteProduct = useDeleteProduct()

  return (
    <>
      <DrawerHeader>
        <DrawerEyebrow>
          {row && <StatusBadge status={row.status} />}
          <span className="text-xs text-muted-foreground">{row?.category.name}</span>
        </DrawerEyebrow>
        <DrawerTitle>{row?.title ?? 'Product'}</DrawerTitle>
        <DrawerSubline>{row?.brandName || 'No brand set'}</DrawerSubline>
      </DrawerHeader>

      <DrawerBody>
        <ProductViewPanel productId={id} />
      </DrawerBody>

      <DrawerFooter className="justify-start">
        <Button className="flex-1" onClick={onEdit}>
          Edit product
        </Button>
        {confirming ? (
          <>
            <Button
              variant="destructive"
              disabled={deleteProduct.isPending}
              onClick={() =>
                deleteProduct.mutate(id, {
                  onSuccess: () => onDeleted(row?.title ?? 'product'),
                  onSettled: () => setConfirming(false),
                })
              }
            >
              Confirm delete
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )}
      </DrawerFooter>
    </>
  )
}

function EditDrawerContent({
  id,
  row,
  onDone,
}: {
  id: string
  row: SellerProductRow | null
  onDone: () => void
}) {
  return (
    <>
      <DrawerHeader>
        <DrawerTitle>Edit product</DrawerTitle>
        <DrawerSubline>
          {row ? `${row.title} · ${row.category.name}` : 'Editing this listing'}
        </DrawerSubline>
      </DrawerHeader>

      <DrawerBody>
        <ProductFormPanel productId={id} />
      </DrawerBody>

      {/* ProductFormPanel still owns its own saves - see the note in the report:
          its variants and images are separate endpoints, so unifying them behind
          one footer button is a rewrite of that panel, not a wiring change. The
          note says so rather than leaving a dead Save here. */}
      <DrawerFooter note="Each section above saves on its own.">
        <Button variant="outline" onClick={onDone}>
          Done
        </Button>
      </DrawerFooter>
    </>
  )
}

function AddDrawerContent({
  onCreated,
  onCancel,
}: {
  onCreated: (title: string) => void
  onCancel: () => void
}) {
  // Lives here, above both the body and the footer, so the footer can read
  // whether the form is complete - and so expanding to full page, which only
  // changes the panel's classes, never unmounts it and never loses a keystroke.
  const form = useProductCreateForm({ onCreated: ({ title }) => onCreated(title) })

  return (
    <>
      <DrawerHeader>
        <DrawerTitle>Add product</DrawerTitle>
        <DrawerSubline>Publishes to your store.</DrawerSubline>
        <div className="mt-2">
          <StatusSegmented value={form.status} onChange={form.setStatus} />
        </div>
      </DrawerHeader>

      <DrawerBody>
        <ProductCreateFields form={form} />
      </DrawerBody>

      <DrawerFooter note={form.footerNote}>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!form.canSave} onClick={() => void form.submit()}>
          {form.isPending ? 'Saving…' : form.saveLabel}
        </Button>
      </DrawerFooter>
    </>
  )
}
