import * as React from "react"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex items-center gap-0.5", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, "size"> &
  React.ComponentProps<"a">

function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  return (
    <Button
      asChild
      variant={isActive ? "outline" : "ghost"}
      size={size}
      className={cn(className)}
    >
      <a
        aria-current={isActive ? "page" : undefined}
        data-slot="pagination-link"
        data-active={isActive}
        {...props}
      />
    </Button>
  )
}

function PaginationPrevious({
  className,
  text = "Previous",
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={cn("pl-1.5!", className)}
      {...props}
    >
      <ChevronLeftIcon data-icon="inline-start" />
      <span className="hidden sm:block">{text}</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  text = "Next",
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={cn("pr-1.5!", className)}
      {...props}
    >
      <span className="hidden sm:block">{text}</span>
      <ChevronRightIcon data-icon="inline-end" />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon
      />
      <span className="sr-only">More pages</span>
    </span>
  )
}

/* --- Composed on top of the official component above ---------------------- */

/**
 * The stock PaginationLink is an <a>: these lists page by rewriting a ?page=
 * search param, not by following an href, and an anchor can't be `disabled`,
 * which Prev and Next are at the ends of the range. Same Button styling, button
 * semantics. Current page is filled, as in the designs.
 */
function PaginationButton({
  className,
  isActive,
  size = 'icon-sm',
  ...props
}: React.ComponentProps<typeof Button> & { isActive?: boolean }) {
  return (
    <Button
      type="button"
      variant={isActive ? 'default' : 'outline'}
      size={size}
      aria-current={isActive ? 'page' : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn('text-[13px]', className)}
      {...props}
    />
  )
}

/** A page index, or `null` where a run of pages is left out. */
type PageSlot = number | null

/**
 * First page, last page and the current page's neighbours; the runs between
 * them collapse to an ellipsis, so fifty pages still fit on one line. Seven
 * slots once it starts eliding, so the row doesn't change width as you page.
 */
function pageWindow(page: number, totalPages: number): PageSlot[] {
  const all = Array.from({ length: totalPages }, (_, i) => i)
  if (totalPages <= 7) return all
  if (page <= 3) return [...all.slice(0, 5), null, totalPages - 1]
  if (page >= totalPages - 4) return [0, null, ...all.slice(totalPages - 5)]
  return [0, null, page - 1, page, page + 1, null, totalPages - 1]
}

/**
 * The designs' list footer: "Showing 1–5 of 8", a Per page select, and
 * Prev · 1 2 3 · Next. Shared by every paged list so the five pagers stay one
 * control rather than five.
 *
 * `page` is 0-based, like the API and the ?page= param; the buttons are
 * labelled from 1. Leave `range` out where a list has no page size to offer;
 * every list in the app passes one, so the bar normally carries the range label
 * and the Per page select together.
 */
function PaginationBar({
  page,
  totalPages,
  onPageChange,
  range,
  className,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  range?: {
    totalElements: number
    pageSize: number
    /** The sizes offered; anything else in ?size= is not honoured. */
    sizes: readonly number[]
    onSizeChange: (size: number) => void
    /** Noun for the count, as in "of 8 orders". */
    unit?: string
  }
  className?: string
}) {
  const pages = Math.max(1, totalPages)
  const current = Math.min(Math.max(page, 0), pages - 1)

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3',
        // Without a range there is nothing on the left to balance against, so
        // the buttons centre rather than sitting against the right edge.
        range ? 'justify-between' : 'justify-center',
        className,
      )}
    >
      {range && (
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
          <p>{rangeLabel(current, range.pageSize, range.totalElements, range.unit)}</p>
          {/* A span, not a label: the trigger is a button, which a label
              cannot be attached to - hence the aria-label on it. */}
          <span className="flex items-center gap-2">
            Per page
            <Select
              value={String(range.pageSize)}
              onValueChange={(value) => range.onSizeChange(Number(value))}
            >
              <SelectTrigger aria-label="Rows per page" className="h-8 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {range.sizes.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
        </div>
      )}

      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent className="gap-1.5">
          <PaginationItem>
            <PaginationButton
              size="sm"
              aria-label="Previous page"
              disabled={current === 0}
              onClick={() => onPageChange(current - 1)}
            >
              <ChevronLeftIcon />
              Prev
            </PaginationButton>
          </PaginationItem>

          {pageWindow(current, pages).map((slot, i) =>
            slot === null ? (
              // Keyed by position: the gaps have no page of their own.
              <PaginationItem key={`gap-${i}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={slot}>
                <PaginationButton
                  isActive={slot === current}
                  onClick={() => onPageChange(slot)}
                >
                  {slot + 1}
                </PaginationButton>
              </PaginationItem>
            ),
          )}

          <PaginationItem>
            <PaginationButton
              size="sm"
              aria-label="Next page"
              disabled={current + 1 >= pages}
              onClick={() => onPageChange(current + 1)}
            >
              Next
              <ChevronRightIcon />
            </PaginationButton>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}

/** "Showing 1–5 of 8": the last page is short, so the end is the count itself. */
function rangeLabel(page: number, pageSize: number, total: number, unit?: string) {
  if (total === 0) return 'No results'
  const start = page * pageSize + 1
  const end = Math.min(start + pageSize - 1, total)
  return `Showing ${start}–${end} of ${total}${unit ? ` ${unit}` : ''}`
}

export {
  Pagination,
  PaginationBar,
  PaginationButton,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
