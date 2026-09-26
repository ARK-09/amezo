import { Maximize2, Minimize2, X } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'

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
 * - the panel, the scroll boundary, the expand/collapse pair, the dialog
 * semantics - and the caller composes the rest.
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
 * ## Why expanding does not remount
 *
 * "Full page" used to open a new browser tab, which loses everything typed into
 * the drawer and gives no way back. Here it is one panel that changes size: the
 * Radix dialog stays mounted and only its classes change, so `children` keep
 * their position in the React tree and every piece of in-progress form state
 * survives both directions. Rendering the body in a different container when
 * expanded would look identical and silently remount the form.
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
  /** Panel width in px when not expanded. The design uses 520 to view, 620 to edit. */
  width?: number
  /** Controlled expand state. Omit both to hide the expand control entirely. */
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  children: ReactNode
}

const DEFAULT_WIDTH = 520

export function Drawer({
  open,
  onOpenChange,
  mode = 'view',
  ariaLabel,
  width = DEFAULT_WIDTH,
  expanded = false,
  onExpandedChange,
  children,
}: DrawerProps) {
  // Memoised so the context value is a new object only when something in it
  // actually changed. The drawer is shared, and a fresh object every render
  // would re-render every consumer of useDrawer on any parent render.
  const value = useMemo<DrawerContextValue>(
    () => ({ mode, expanded, onExpandedChange, close: () => onOpenChange(false) }),
    [mode, expanded, onExpandedChange, onOpenChange],
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
          style={expanded ? undefined : { maxWidth: `min(${width}px, 96vw)` }}
          className={cn(
            'flex w-full flex-col gap-0 p-0 [&>button:last-child]:hidden',
            // Expanded is the same panel filling the viewport, NOT a different
            // container - see the note above on why that matters.
            expanded && 'max-w-none border-l-0 sm:max-w-none',
          )}
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
 * The header slot. Lays out whatever the caller puts in it on the left, and the
 * drawer's own controls - expand/collapse, then close - on the right, so every
 * drawer in the portal puts them in the same place.
 */
export function DrawerHeader({ children, className }: { children: ReactNode; className?: string }) {
  const { expanded, onExpandedChange, close } = useDrawer()

  return (
    <div className={cn('flex items-start justify-between gap-3 border-b px-5 py-4', className)}>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex shrink-0 items-center gap-1.5">
        {onExpandedChange && (
          <button
            type="button"
            onClick={() => onExpandedChange(!expanded)}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:border-primary hover:text-primary"
          >
            {expanded ? (
              <>
                <Minimize2 className="size-3.5" aria-hidden />
                Back to panel
              </>
            ) : (
              <>
                <Maximize2 className="size-3.5" aria-hidden />
                Full page
              </>
            )}
          </button>
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

/** The small row above the title - a status pill and a category, in the design. */
export function DrawerEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-1.5 flex items-center gap-2', className)}>{children}</div>
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
  const { expanded } = useDrawer()
  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-5', className)}>
      {/* Expanded, the panel is as wide as the window; a form stretched to
          1900px is unreadable, so the content keeps a column and centres. */}
      <div className={cn(expanded && 'mx-auto w-full max-w-[860px]')}>{children}</div>
    </div>
  )
}

/**
 * The action bar. `note` is the design's left-hand hint - which fields are still
 * missing, or whether there is anything to save - and the children are the
 * buttons.
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
      {note ? <p className="text-[13px] text-muted-foreground">{note}</p> : <span />}
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

/**
 * Also attached to Drawer, for callers who prefer `<Drawer.Header>`. The same
 * functions as the flat exports above - one implementation, two spellings.
 */
Drawer.Header = DrawerHeader
Drawer.Eyebrow = DrawerEyebrow
Drawer.Title = DrawerTitle
Drawer.Subline = DrawerSubline
Drawer.Body = DrawerBody
Drawer.Footer = DrawerFooter
