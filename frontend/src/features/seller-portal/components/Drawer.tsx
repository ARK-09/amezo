import { Maximize2, X } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  DrawerContext,
  useDrawer,
  type DrawerContextValue,
  type DrawerMode,
} from '@/features/seller-portal/components/drawerContext'
import { cn } from '@/lib/utils'

/**
 * The seller portal's side drawer, as a set of slots rather than a fixed shape.
 *
 * It replaces a six-prop wrapper that could only ever render one layout: a
 * title, an optional sub-line, a body, and a hardcoded "Full page" link. Every
 * screen that wanted anything else - a status pill beside the title, a footer
 * with a save button, a wider panel for a form, a drawer that shows a record
 * before offering to edit it - had nowhere to put it.
 *
 * ## Why a compound component
 *
 * The parts vary independently. A view drawer has a status pill, three stat
 * tiles and an action bar; a form drawer has a segmented status control and a
 * save footer; an order drawer has neither. Expressed as props that is a
 * growing list of optional ReactNodes (`headerExtra`, `footerNote`,
 * `footerActions`, `eyebrow`...), each one a decision the drawer has to make on
 * the caller's behalf. As slots, the drawer owns only what is genuinely common
 * - the panel, the scroll boundary, the header controls, the dialog semantics -
 * and the caller composes the rest.
 *
 * ## Why flat named exports, not dot notation
 *
 * A repo-wide search finds no dot-notation compound component here. Every
 * shadcn primitive in `components/ui` (sheet, dialog, tabs) exports its parts
 * flat, and `chart.tsx` is the closest existing idiom: a `createContext` shared
 * between sibling sub-components, all exported flat. This follows that, so the
 * parts tree-shake and read like the primitives they are built on. The `Drawer`
 * function also carries the parts as properties (`Drawer.Header`) for callers
 * who prefer that spelling - the same object either way, not a second
 * implementation.
 *
 * ## Why "Full page" opens a new tab
 *
 * It used to expand the panel in place - one dialog whose classes changed, so
 * that a half-typed form survived the trip. That is gone. "Full page" is now a
 * link to the dedicated route, opened in a new tab, in every mode: the list
 * behind the drawer keeps the filter, the page and the scroll position the
 * seller was on, and the record gets a URL that can be bookmarked, shared or
 * opened twice side by side. An in-place expand could do none of that, and the
 * state it protected is the state of a form the seller is choosing to leave.
 *
 * Because the drawer no longer changes size, nothing here is stateful: the
 * three modes differ only in what the caller composes into the slots.
 *
 * Shared on purpose: SellerOrders and SellerRefunds pair the old drawer with a
 * panel component in exactly this shape and can move onto it unchanged.
 */

export interface DrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * What the drawer is for. The drawer itself only reports it; callers switch
   * on it, and it is what makes "edit" a different drawer rather than a tab.
   */
  mode?: DrawerMode
  /**
   * The dialog's accessible name. Required, because a drawer whose name is
   * derived from its title announces "Aurora One Wireless Headphones" when what
   * a screen reader user needs to hear is "Product details".
   */
  ariaLabel: string
  /** Panel width in px. The design uses 520 to view, 620 to edit or add. */
  width?: number
  /**
   * The dedicated page for what this drawer is showing - `/seller/products/p1`,
   * `/seller/products/new`. The header renders it as "Full page" in all three
   * modes and opens it in a new tab. Omit it only where no such route exists;
   * a drawer with no dedicated page shows no control rather than a dead link.
   */
  fullPageTo?: string
  children: ReactNode
}

const DEFAULT_WIDTH = 520

export function Drawer({
  open,
  onOpenChange,
  mode = 'view',
  ariaLabel,
  width = DEFAULT_WIDTH,
  fullPageTo,
  children,
}: DrawerProps) {
  // Memoised so the context value is a new object only when something in it
  // actually changed. The drawer is shared, and a fresh object every render
  // would re-render every consumer of useDrawer on any parent render.
  const value = useMemo<DrawerContextValue>(
    () => ({ mode, fullPageTo, close: () => onOpenChange(false) }),
    [mode, fullPageTo, onOpenChange],
  )

  return (
    <DrawerContext.Provider value={value}>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          // Radix looks for a description and warns when there is none. These
          // drawers are described by their own contents.
          aria-describedby={undefined}
          // Inline, not a Tailwind class: the width is a number the caller
          // chooses per drawer, and a class name cannot be built from one at
          // runtime without a safelist.
          style={{ maxWidth: `min(${width}px, 96vw)` }}
          className="flex w-full flex-col gap-0 p-0 [&>button:last-child]:hidden"
        >
          {/* Radix names the dialog from its Title, and aria-labelledby beats
              aria-label - so the name has to come from a Title or it is ignored.
              This carries the name ("Product details"), and DrawerTitle renders
              the visible heading, which is the product's own name. Announcing
              "Aurora One Wireless Headphones" as the dialog's name would say
              what is in it, not what it is. */}
          <SheetTitle className="sr-only">{ariaLabel}</SheetTitle>
          {children}
        </SheetContent>
      </Sheet>
    </DrawerContext.Provider>
  )
}

/**
 * The header slot.
 *
 * `status` is the design's status pill and `meta` the muted chip beside it: a
 * named slot each, rather than a row the caller composes, because five screens
 * put a pill in this header and they must all put it in the same place. The
 * drawer knows nothing about what the pill says - it is given a node and told
 * where it goes.
 *
 * `children` is the title and sub-line under that row, and the drawer's own
 * controls - "Full page", then close - always sit on the right.
 *
 * `actions` is the one slot on that right-hand side. The design puts the
 * product form's Active/Draft control there, inline with "Full page", because
 * in edit and add mode the listing's status is a control rather than a badge -
 * and a control belongs with the other controls, not above the title where the
 * `status` pill goes. Anything passed here renders before "Full page"; drawers
 * that have no such control pass nothing and are unchanged.
 */
export function DrawerHeader({
  status,
  meta,
  actions,
  children,
  className,
}: {
  status?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  const { fullPageTo, close } = useDrawer()

  return (
    <div className={cn('flex items-start justify-between gap-3 border-b px-5 py-4', className)}>
      <div className="min-w-0 flex-1">
        {(status != null || meta != null) && (
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {status}
            {meta != null && <span className="text-xs text-muted-foreground">{meta}</span>}
          </div>
        )}
        {children}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {actions}
        {fullPageTo && (
          // target=_blank, so the list behind the drawer - and the filter, page
          // and scroll position the seller was on - is still there afterwards.
          <Link
            to={fullPageTo}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:border-primary hover:text-primary"
          >
            <Maximize2 className="size-3.5" aria-hidden />
            Full page
          </Link>
        )}
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-[18px]" aria-hidden />
        </button>
      </div>
    </div>
  )
}

/**
 * The visible heading. A plain h2, not the dialog's Title: the Title above
 * carries the drawer's accessible name, and a second one would rename the
 * dialog after whichever record happens to be open.
 */
export function DrawerTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-[17px] leading-snug font-bold', className)}>{children}</h2>
}

/** The muted line under the title. */
export function DrawerSubline({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('mt-1 text-[13px] text-muted-foreground', className)}>{children}</p>
}

/**
 * The scrolling middle. The only scroll container in the drawer, so the header
 * and footer stay put while the body moves - which is what makes a footer save
 * reachable without scrolling to the bottom of a long form.
 */
export function DrawerBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-5', className)}>{children}</div>
}

/**
 * The action bar: the drawer's primary Save/Cancel pair, and the design's
 * left-hand hint beside it.
 *
 * `note` is that hint - which fields are still missing, or whether there is
 * anything to save - and the children are the buttons, in the design's order
 * (Cancel, then the primary). The note is allowed to wrap and the buttons are
 * not: a form whose note grows to "Title, price and one variant are still
 * missing" must not squash Save off the edge, and a disabled Save has to stay
 * where an enabled one was so it is visibly the same control.
 */
export function DrawerFooter({
  note,
  children,
  className,
}: {
  note?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3.5',
        className,
      )}
    >
      {note ? <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">{note}</p> : <span />}
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

/**
 * Also attached to Drawer, for callers who prefer `<Drawer.Header>`. The same
 * functions as the flat exports above - one implementation, two spellings.
 */
Drawer.Header = DrawerHeader
Drawer.Title = DrawerTitle
Drawer.Subline = DrawerSubline
Drawer.Body = DrawerBody
Drawer.Footer = DrawerFooter
