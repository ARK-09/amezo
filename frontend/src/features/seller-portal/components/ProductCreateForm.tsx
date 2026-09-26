import { ArrowDown, ArrowUp, ImageOff, Plus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CategorySelect } from '@/features/reference/components/CategorySelect'
import {
  MAX_IMAGES,
  TITLE_LIMIT,
  type ProductCreateForm,
  type WritableStatus,
} from '@/features/seller-portal/components/useProductCreateForm'
import { cn } from '@/lib/utils'

/**
 * The design's Active/Draft control: a two-button segmented pill, not a switch.
 * A switch labelled "Active" makes the unchecked state nameless - the seller has
 * to infer that off means draft - and it reads as a setting rather than the
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

/**
 * The fields themselves. No status control and no save button: both belong to
 * whatever chrome this is mounted in - the drawer's header and footer, or the
 * page's - which is what lets one form serve both.
 */
export function ProductCreateFields({ form }: { form: ProductCreateForm }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor="title" className="mb-1.5 block text-sm font-medium">
            Title
          </label>
          <Input
            id="title"
            maxLength={TITLE_LIMIT}
            value={form.title}
            onChange={(e) => form.setTitle(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {form.title.length}/{TITLE_LIMIT} characters
          </p>
        </div>
        <div>
          <label htmlFor="brand" className="mb-1.5 block text-sm font-medium">
            Brand <span className="font-normal text-muted-foreground">Optional</span>
          </label>
          <Input id="brand" value={form.brandName} onChange={(e) => form.setBrandName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="description" className="mb-1.5 block text-sm font-medium">
            Description <span className="font-normal text-muted-foreground">Optional</span>
          </label>
          <textarea
            id="description"
            value={form.description}
            onChange={(e) => form.setDescription(e.target.value)}
            rows={4}
            placeholder="What makes this product worth buying."
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="category" className="mb-1.5 block text-sm font-medium">
            Category
          </label>
          <CategorySelect id="category" value={form.categorySlug} onChange={form.setCategorySlug} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold">Images</span>
          <span className="text-[13px] text-muted-foreground">
            {form.images.length}/{MAX_IMAGES}
          </span>
        </div>
        <p className="mb-3 text-[13px] text-muted-foreground">
          First image is the cover shoppers see in search.
        </p>
        <div className="mb-2 flex items-center justify-end">
          <label className="cursor-pointer">
            <span className="text-sm text-primary underline">Add images</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={form.images.length >= MAX_IMAGES}
              onChange={(e) => {
                form.addImages(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        </div>
        {form.images.length === 0 ? (
          <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            <ImageOff className="mr-2 size-4" aria-hidden />
            No images added
          </div>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {form.images.map((image, index) => (
              <li key={image.id} className="relative w-20">
                <img src={image.previewUrl} alt="" className="size-20 rounded-md border object-cover" />
                {index === 0 && (
                  <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                    Cover
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove image ${index + 1}`}
                  onClick={() => form.removeImage(image.id)}
                  className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                >
                  <X className="size-3" />
                </button>
                <div className="mt-1 flex justify-center gap-1">
                  <button
                    type="button"
                    aria-label={`Move image ${index + 1} earlier`}
                    disabled={index === 0}
                    onClick={() => form.moveImage(index, -1)}
                    className="rounded border p-0.5 disabled:opacity-30"
                  >
                    <ArrowUp className="size-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move image ${index + 1} later`}
                    disabled={index === form.images.length - 1}
                    onClick={() => form.moveImage(index, 1)}
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={form.addVariantRow}
            className="gap-1"
          >
            <Plus className="size-3.5" />
            Add variant
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {form.variants.map((variant, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_100px_90px_auto] items-center gap-2">
              <Input
                aria-label={`Variant ${index + 1} label`}
                placeholder="Label"
                value={variant.label}
                onChange={(e) => form.updateVariant(index, { label: e.target.value })}
              />
              <Input
                aria-label={`Variant ${index + 1} SKU`}
                placeholder="SKU"
                value={variant.sku}
                onChange={(e) => form.updateVariant(index, { sku: e.target.value })}
              />
              <Input
                aria-label={`Variant ${index + 1} price`}
                placeholder="Price"
                type="number"
                min="0"
                step="0.01"
                value={variant.price}
                onChange={(e) => form.updateVariant(index, { price: e.target.value })}
              />
              <Input
                aria-label={`Variant ${index + 1} stock quantity`}
                placeholder="Stock"
                type="number"
                min="0"
                value={variant.stockQty}
                onChange={(e) => form.updateVariant(index, { stockQty: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove variant ${index + 1}`}
                disabled={form.variants.length === 1}
                onClick={() => form.removeVariantRow(index)}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {form.error && (
        <p role="alert" className="text-sm text-destructive">
          {form.error}
        </p>
      )}
      {form.warning && (
        <p role="alert" className="text-sm text-destructive">
          {form.warning}
        </p>
      )}
    </div>
  )
}
