import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { panelDragProps } from '@/features/seller-metrics/panelOrder'

/**
 * The two buttons that move a panel one place earlier or later.
 *
 * Buttons rather than only a drag handle: a drag is a mouse gesture, and the
 * seller who most wants their queue at the top of the page may be driving the
 * dashboard from the keyboard. Each button names its own panel, so a screen
 * reader hears "Move Low stock earlier" rather than the fourth identical
 * "Move widget earlier" on the page.
 */
export function PanelReorder({
  title,
  index,
  count,
  onMove,
}: {
  /** The panel's heading, which the buttons borrow for their labels. */
  title: string
  index: number
  count: number
  onMove: (from: number, to: number) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7 [&_svg]:size-3.5"
        aria-label={`Move ${title} earlier`}
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
      >
        <ChevronLeft />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7 [&_svg]:size-3.5"
        aria-label={`Move ${title} later`}
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
      >
        <ChevronRight />
      </Button>
    </div>
  )
}

/**
 * The drag affordance beside the heading. Hidden from assistive tech on
 * purpose: it does nothing the two buttons above do not already do, and
 * announcing a handle that cannot be operated from the keyboard is worse than
 * saying nothing. Only the handle is draggable, not the whole panel, so the
 * numbers inside a panel can still be selected and copied.
 */
export function PanelGrip({ group, index }: { group: string; index: number }) {
  return (
    <span
      {...panelDragProps(group, index)}
      title="Drag to reorder"
      aria-hidden
      className="flex shrink-0 cursor-grab text-muted-foreground/60"
    >
      <GripVertical className="size-3.5" />
    </span>
  )
}
