import { createContext, useContext, type ReactNode } from 'react'
import type * as React from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Whether a table is being rendered inside a TableContainer.
 *
 * Deliberately not exported: a file in `components/ui` that exports anything but
 * components trips react(only-export-components), and nothing outside this file
 * needs it. Table and TableHeader read it to hand their scroll boundary and
 * their sticky behaviour over to the container - see TableContainer.
 */
const InTableContainer = createContext(false)

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  const contained = useContext(InTableContainer)
  const table = (
    <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
  )

  // Inside a container the container is the scroll boundary, and a second one
  // here would break the sticky header: sticky resolves against the nearest
  // scroll container, and this wrapper has no height of its own to stick to.
  if (contained) return table

  return <div className="relative w-full overflow-x-auto">{table}</div>
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  const contained = useContext(InTableContainer)
  return (
    <thead
      data-slot="table-header"
      className={cn(
        '[&_tr]:border-b',
        // The container scrolls its rows, so a header that scrolled with them
        // would leave the columns unlabelled. bg-muted, not a translucent tint:
        // rows pass underneath it, and it is the header fill the designs draw.
        contained && 'sticky top-0 z-10 bg-muted',
        className,
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('border-b transition-colors hover:bg-muted/50', className)}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-3 text-left align-middle text-sm font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return <td data-slot="table-cell" className={cn('p-3 align-middle', className)} {...props} />
}

/* --- Composed on top of the official component above ---------------------- */

/**
 * One bordered box holding a table and its pagination footer.
 *
 * Every list in the designs draws this: a rounded, bordered container whose last
 * row is the pagination bar, separated by a rule and sat on a tint, so the two
 * read as one control rather than a table with a detached bar floating under it.
 * Five lists had the table in a border and the pager outside it.
 *
 * ## The scroll boundary
 *
 * The container is a flex column: the table scrolls inside it and the footer is
 * pinned below, so paging controls stay reachable however many rows are on
 * screen. `fill` is what opts into that. Without it the container is as tall as
 * its rows and nothing scrolls internally - the behaviour every current caller
 * has. With it the container will shrink below its content and scroll instead,
 * which is what keeps a long table from growing the page.
 *
 * `fill` needs a height to fill: the page under it must be a flex column with a
 * definite height (`flex h-full flex-col`), and the container's siblings in that
 * column must be `shrink-0` so the table is the one thing that gives way. In the
 * seller portal that height comes from the shell, which is already
 * `h-screen overflow-hidden` with one scrolling well - so nothing here adds a
 * second scroll container or a page height of its own.
 *
 * Deliberately not a `max-height`: a table cannot know how much room the page
 * above it took, and every guess at one is wrong at some viewport.
 */
function TableContainer({
  footer,
  fill = false,
  className,
  children,
}: {
  /** The pagination bar, pinned inside the container's bottom edge. */
  footer?: ReactNode
  /** Take the height the page has left, scrolling rows rather than the page. */
  fill?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <InTableContainer.Provider value={true}>
      <div
        data-slot="table-container"
        className={cn(
          'flex flex-col overflow-hidden rounded-xl border',
          // min-h-0 is what lets a flex item shrink below its content, and so
          // what makes the scroll below possible at all.
          fill && 'min-h-0',
          className,
        )}
      >
        <div
          data-slot="table-scroll"
          // Both axes: wide tables scroll sideways inside the border, as the
          // designs have it, and `fill` adds the vertical scroll.
          className={cn('min-w-0 overflow-auto', fill && 'min-h-0')}
        >
          {children}
        </div>
        {footer != null && (
          <div
            data-slot="table-footer-bar"
            className="shrink-0 border-t bg-muted/40 px-4 py-3"
          >
            {footer}
          </div>
        )}
      </div>
    </InTableContainer.Provider>
  )
}

/**
 * A row's action button, at the designs' size.
 *
 * Products' "Edit", Orders' "View" and Refunds' "Review" and "View" are the same
 * control in the mocks - 13px, semibold, roomy - and `size="sm"` renders it two
 * sizes too small and too narrow to read as a target. The min-width is what
 * makes it one column of buttons down the list rather than one width per verb,
 * which is the only reason a row action needs a component instead of a class.
 */
function TableAction({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      size="sm"
      className={cn('h-8 min-w-[4.5rem] px-4 text-[13px]', className)}
      {...props}
    />
  )
}

export {
  Table,
  TableAction,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
}
