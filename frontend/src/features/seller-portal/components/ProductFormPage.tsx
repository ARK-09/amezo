import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ProductFormFields, StatusSegmented } from './ProductFormFields'
import type { ProductFormController } from './useProductForm'
import { apiErrorMessage } from '@/lib/api/transient'

/**
 * The dedicated page behind the drawer's "Full page", for both adding and
 * editing.
 *
 * It is the same form the drawer shows, in the page's own chrome: the design's
 * back link, an h1 with the listing's name under it, the Active/Draft control
 * in the page header, an 860px column, and a footer pinned to the bottom of the
 * viewport carrying the same note and the same single Save.
 *
 * There is no "Back to panel" control. The drawer no longer expands in place -
 * "Full page" opens this route in a new tab - so there is no panel behind this
 * page to go back to, and a button claiming otherwise would be a dead end.
 *
 * The negative margins on the footer are deliberate: the portal shell owns the
 * page gutter and is the only scroll container, so a footer that is to sit flush
 * against the bottom of the content area has to reach back through that gutter
 * rather than the page growing one of its own.
 */
export function ProductFormPage({
  controller,
  heading,
  meta,
  onCancel,
  notices = [],
}: {
  controller: ProductFormController
  heading: string
  meta?: string
  onCancel: () => void
  /**
   * Failures carried in from somewhere else - the add page hands its image
   * upload failures to the edit page the new listing lands on, so they are not
   * lost in the navigation between them.
   */
  notices?: string[]
}) {
  return (
    // h-full, and the middle the only thing that gives way: the shell hands
    // this page a definite height, so the footer can sit on the bottom edge of
    // the content area instead of floating above a strip of scrolling form.
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[860px] pb-6">
          <div className="mb-3">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="-ml-2 h-auto gap-1.5 px-2 py-1 text-[13px] font-semibold text-muted-foreground"
            >
              <Link to="/seller/products">
                <ChevronLeft className="size-3.5" aria-hidden />
                Products
              </Link>
            </Button>
          </div>

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight">{heading}</h1>
              {meta && <p className="mt-1 text-sm text-muted-foreground">{meta}</p>}
            </div>
            <StatusSegmented value={controller.status} onChange={controller.setStatus} />
          </div>

          {controller.isLoading && (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-52 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          )}

          {controller.loadError && (
            <div className="flex flex-col items-start gap-3 rounded-xl border p-6">
              <p className="font-medium">Couldn&apos;t load this product</p>
              <p className="text-sm text-muted-foreground">
                {apiErrorMessage(controller.loadError)}
              </p>
              <Button variant="outline" onClick={controller.reloadProduct}>
                Try again
              </Button>
            </div>
          )}

          {!controller.isLoading && !controller.loadError && (
            <ProductFormFields controller={controller} />
          )}

          <SaveFailures
            failures={controller.failures.length > 0 ? controller.failures : notices}
          />
        </div>
      </div>

      {/* Reaches back through the gutter the portal shell owns, so the bar runs
          the full width of the content area as the design draws it. */}
      <div className="-mx-6 -mb-6 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-background px-6 py-3.5">
        <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">{controller.footerNote}</p>
        <div className="flex shrink-0 items-center gap-2">
          <ProductFormActions controller={controller} onCancel={onCancel} />
        </div>
      </div>
    </div>
  )
}

/**
 * Cancel and the one Save, shared by the page's footer and the drawer's so the
 * two cannot disagree about when saving is possible or what the button says.
 *
 * The disabled Save is grey rather than a faded orange: the design gives it its
 * own colour, and a half-opacity primary reads as a button that is loading
 * rather than one that is waiting for a field.
 */
export function ProductFormActions({
  controller,
  onCancel,
}: {
  controller: ProductFormController
  onCancel: () => void
}) {
  return (
    <>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        type="button"
        disabled={!controller.canSave}
        onClick={controller.submit}
        className="disabled:bg-border disabled:text-[oklch(60%_0_0)] disabled:opacity-100"
      >
        {controller.isSaving ? 'Saving…' : controller.saveLabel}
      </Button>
    </>
  )
}

/**
 * What a save could not do. Listed one line per failed step rather than reduced
 * to "something went wrong": the steps are separate endpoints, one can fail
 * while the rest land, and the seller has to know which half of their listing
 * is still outstanding. Fields the API named are highlighted in the form itself.
 */
export function SaveFailures({ failures }: { failures: string[] }) {
  if (failures.length === 0) return null
  return (
    <div
      role="alert"
      className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3.5 py-3 text-[13px] text-destructive"
    >
      <p className="font-semibold">
        {failures.length === 1 ? 'One part of this listing was not saved' : `${failures.length} parts of this listing were not saved`}
      </p>
      <ul className="mt-1 list-inside list-disc">
        {failures.map((failure) => (
          <li key={failure}>{failure}</li>
        ))}
      </ul>
    </div>
  )
}
