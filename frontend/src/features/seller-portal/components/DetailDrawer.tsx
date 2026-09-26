import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

/**
 * The seller portal's default way of opening a record: a side drawer over the
 * list, with the same panel the standalone route renders.
 *
 * `fullPageTo` is the design's "full page" affordance. It opens that route in a
 * new tab rather than replacing the drawer, so the list - and whatever filter
 * and page the seller was on - is still there behind it.
 */
export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  fullPageTo,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  fullPageTo: string
  children: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[640px]">
        <SheetHeader className="gap-1 border-b px-6 py-4">
          <div className="flex items-start justify-between gap-4 pr-6">
            <div className="min-w-0">
              <SheetTitle className="truncate text-base">{title}</SheetTitle>
              {description && (
                <SheetDescription className="truncate text-[13px]">{description}</SheetDescription>
              )}
            </div>
            <Link
              to={fullPageTo}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:border-primary hover:text-primary"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              Full page
            </Link>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
