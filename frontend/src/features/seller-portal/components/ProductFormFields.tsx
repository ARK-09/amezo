import { ChevronLeft, ChevronRight, Copy, ImageOff, Plus, X } from 'lucide-react'
import { useRef } from 'react'
import { Controller } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CategorySelect } from '@/features/reference/components/CategorySelect'
import { MAX_IMAGES, TITLE_LIMIT, variantTotals, type WritableStatus } from './productForm'
import type { ProductFormController } from './useProductForm'
import { formatPrice } from '@/lib/formatPrice'
import { cn } from '@/lib/utils'

/**
 * The design's Product Form: three cards - Basics, Images, Variants - and no
 * chrome of its own.
 *
 * No save button and no status control live here, deliberately. Both belong to
 * whatever this is mounted in - the drawer's header and footer, or the
 * dedicated page's - which is what lets one form serve the drawer and the page
 * in both add and edit mode without a second copy existing.
 */

/**
 * The design's Active/Draft control: a two-button segmented pill, not a switch.
 * A switch labelled "Active" makes the unchecked state nameless - the seller
 * has to infer that off means draft - and it reads as a setting rather than the
 * choice between two publication states that it is.
 */
export function StatusSegmented({
  value,
  onChange,
}: {
  value: WritableStatus
  onChange: (value: WritableStatus) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Listing status"
      className="inline-flex items-center gap-0.5 rounded-full border p-0.5"
    >
      {(['ACTIVE', 'DRAFT'] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-bold transition-colors',
            value === option
              ? option === 'ACTIVE'
                ? 'bg-primary text-primary-foreground'
                : 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option === 'ACTIVE' ? 'Active' : 'Draft'}
        </button>
      ))}
    </div>
  )
}

export function ProductFormFields({ controller }: { controller: ProductFormController }) {
  const { form, values } = controller
  const { register, formState } = form
  const errors = formState.errors

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <section className="rounded-xl border p-5">
        <h2 className="mb-4 text-[15px] font-bold">Basics</h2>
        <div className="flex flex-col gap-3.5">
          <Field
            label="Title"
            htmlFor="pf-title"
            hint={`${values.title.length}/${TITLE_LIMIT} characters`}
            error={errors.title?.message}
          >
            <Input
              id="pf-title"
              placeholder="Aurora One Wireless Headphones"
              // The design caps the title at the source rather than letting it
              // run over and be refused; the schema still holds the same limit
              // for anything that reaches submit another way.
              maxLength={TITLE_LIMIT}
              aria-invalid={Boolean(errors.title)}
              {...register('title')}
            />
          </Field>

          <div className="flex flex-wrap gap-3.5">
            <div className="min-w-[160px] flex-1 basis-[200px]">
              <Field label="Brand" htmlFor="pf-brand" optional error={errors.brandName?.message}>
                <Input id="pf-brand" {...register('brandName')} />
              </Field>
            </div>
            <div className="min-w-[160px] flex-1 basis-[200px]">
              <Field label="Category" htmlFor="pf-category" error={errors.categorySlug?.message}>
                <Controller
                  control={form.control}
                  name="categorySlug"
                  render={({ field }) => (
                    <CategorySelect
                      id="pf-category"
                      value={field.value || null}
                      onChange={(slug) => field.onChange(slug)}
                      invalid={Boolean(errors.categorySlug)}
                      // Already known from the product, so the control shows it
                      // straight away instead of a loading placeholder.
                      selectedName={
                        controller.product && field.value === controller.product.category.slug
                          ? controller.product.category.name
                          : undefined
                      }
                    />
                  )}
                />
              </Field>
            </div>
          </div>

          <Field label="Description" htmlFor="pf-description" optional>
            <textarea
              id="pf-description"
              rows={4}
              placeholder="What makes this product worth buying."
              className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register('description')}
            />
          </Field>
        </div>
      </section>

      <ImagesCard controller={controller} />
      <VariantsCard controller={controller} />
    </div>
  )
}

function ImagesCard({ controller }: { controller: ProductFormController }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const images = controller.images
  const error = controller.form.formState.errors.images?.message

  return (
    <section className="rounded-xl border p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold">Images</h2>
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {images.length}/{MAX_IMAGES}
        </span>
      </div>
      <p className="mb-3.5 text-[13px] text-muted-foreground">
        First image is the cover shoppers see in search.
      </p>

      <div className="flex flex-wrap gap-3">
        {images.map((image, index) => (
          <div key={image.id} className="w-[84px]">
            <div className="relative flex size-[84px] items-center justify-center overflow-visible rounded-lg border bg-muted text-muted-foreground">
              {image.kind === 'staged' || image.status === 'STORED' ? (
                <img
                  src={image.kind === 'staged' ? image.previewUrl : image.url}
                  alt=""
                  className="size-full rounded-lg object-cover"
                />
              ) : (
                // A row the upload never finished is shown rather than hidden:
                // it is the thing a seller most needs to notice.
                <ImageOff className="size-5" aria-hidden />
              )}
              {index === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 py-px text-[11px] font-bold text-primary-foreground">
                  Cover
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove image ${index + 1}`}
                onClick={() => controller.removeImage(index)}
                className="absolute -top-[7px] -right-[7px] flex size-5 items-center justify-center rounded-full bg-destructive text-white"
              >
                <X className="size-[11px]" strokeWidth={3} aria-hidden />
              </button>
            </div>
            <div className="mt-1.5 flex justify-center gap-1">
              <button
                type="button"
                aria-label={`Move image ${index + 1} earlier`}
                disabled={index === 0}
                onClick={() => controller.moveImage(index, -1)}
                className="rounded border px-1.5 py-0.5 transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronLeft className="size-3" strokeWidth={2.4} aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`Move image ${index + 1} later`}
                disabled={index === images.length - 1}
                onClick={() => controller.moveImage(index, 1)}
                className="rounded border px-1.5 py-0.5 transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronRight className="size-3" strokeWidth={2.4} aria-hidden />
              </button>
            </div>
          </div>
        ))}

        {/* The design's trailing dashed tile. Inside the card and in line with
            the gallery, so "one more" is the same gesture as looking at what is
            already there. */}
        {images.length < MAX_IMAGES && (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            // The tile says "Add"; the name says what of. The visible word is
            // inside the accessible name, so the two do not disagree.
            aria-label="Add image"
            className="flex size-[84px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="size-4" strokeWidth={2.2} aria-hidden />
            Add
          </button>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        aria-label="Add images"
        className="hidden"
        onChange={(e) => {
          controller.addImages(e.target.files)
          // Reset first: picking the same files twice in a row fires no change
          // event otherwise, so a failed upload couldn't be retried with them.
          e.target.value = ''
        }}
      />

      {controller.skippedImages > 0 && (
        <p role="status" className="mt-3 text-[13px] text-muted-foreground">
          {controller.skippedImages} {controller.skippedImages === 1 ? 'file was' : 'files were'} left
          out — a product holds at most {MAX_IMAGES} images.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}

function VariantsCard({ controller }: { controller: ProductFormController }) {
  const { form, values } = controller
  const { register, formState } = form
  const rows = formState.errors.variants
  const totals = variantTotals(values.variants)
  const priceRange =
    totals.low === null || totals.high === null
      ? '—'
      : totals.low === totals.high
        ? formatPrice(totals.low)
        : `${formatPrice(totals.low)} – ${formatPrice(totals.high)}`

  return (
    <section className="rounded-xl border p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold">Variants</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {totals.count} {totals.count === 1 ? 'variant' : 'variants'} · {totals.stock} in stock
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={controller.addVariant}>
          <Plus className="size-3.5" aria-hidden />
          Add variant
        </Button>
      </div>

      <div className="flex flex-col gap-2.5">
        {controller.variantFields.map((field, index) => (
          <div
            key={field.id}
            className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-2.5"
          >
            <VariantCell
              className="min-w-[120px] flex-1 basis-[150px]"
              label="Label"
              showLabel={index === 0}
              error={rows?.[index]?.label?.message}
            >
              <Input
                placeholder="Midnight"
                aria-label={`Variant ${index + 1} label`}
                aria-invalid={Boolean(rows?.[index]?.label)}
                {...register(`variants.${index}.label`)}
              />
            </VariantCell>
            <VariantCell
              className="min-w-[110px] flex-1 basis-[130px]"
              label="SKU"
              showLabel={index === 0}
              error={rows?.[index]?.sku?.message}
            >
              <Input
                placeholder="AUR-1-MDN"
                aria-label={`Variant ${index + 1} SKU`}
                aria-invalid={Boolean(rows?.[index]?.sku)}
                className="tabular-nums"
                {...register(`variants.${index}.sku`)}
              />
            </VariantCell>
            <VariantCell
              className="min-w-[84px] grow-0 basis-[96px]"
              label="Price"
              showLabel={index === 0}
              error={rows?.[index]?.price?.message}
            >
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                aria-label={`Variant ${index + 1} price`}
                aria-invalid={Boolean(rows?.[index]?.price)}
                {...register(`variants.${index}.price`)}
              />
            </VariantCell>
            <VariantCell
              className="min-w-[76px] grow-0 basis-[84px]"
              label="Stock"
              showLabel={index === 0}
              error={rows?.[index]?.stockQty?.message}
            >
              <Input
                type="number"
                min="0"
                placeholder="0"
                aria-label={`Variant ${index + 1} stock quantity`}
                aria-invalid={Boolean(rows?.[index]?.stockQty)}
                {...register(`variants.${index}.stockQty`)}
              />
            </VariantCell>
            <div className="flex shrink-0 justify-end gap-1">
              <button
                type="button"
                aria-label={`Duplicate variant ${index + 1}`}
                onClick={() => controller.duplicateVariant(index)}
                className="rounded-md border p-[7px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <Copy className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`Remove variant ${index + 1}`}
                // A product needs one variant to have a price at all, so the
                // last row's button says why instead of failing on click.
                title={
                  controller.variantFields.length === 1
                    ? 'A product needs at least one variant'
                    : undefined
                }
                disabled={controller.variantFields.length === 1}
                onClick={() => controller.removeVariant(index)}
                className="rounded-md border p-[7px] text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>

      {formState.errors.variants?.root?.message && (
        <p role="alert" className="mt-3 text-[13px] text-destructive">
          {formState.errors.variants.root.message}
        </p>
      )}

      {/* What the listing adds up to, from what is typed - the numbers a seller
          checks before publishing are the ones the shop is about to show. */}
      <div className="mt-4 flex flex-wrap gap-5 border-t pt-3.5">
        <SummaryCell label="Price range" value={priceRange} />
        <SummaryCell label="Total stock" value={String(totals.stock)} />
        <SummaryCell label="Images" value={`${controller.images.length}/${MAX_IMAGES}`} />
      </div>
    </section>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  optional,
  error,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  optional?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-semibold">
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground">Optional</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

function VariantCell({
  label,
  showLabel,
  error,
  className,
  children,
}: {
  label: string
  showLabel: boolean
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      {showLabel && (
        <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      )}
      {children}
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-bold">{value}</p>
    </div>
  )
}
