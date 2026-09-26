/*
 * Upstream uses Tailwind's bare `data-open:` / `data-active:` / `data-horizontal:`
 * variants. Those compile to attribute-presence selectors ([data-open]), but the
 * Radix primitives emit data-state="open" and data-orientation="horizontal", so
 * the rules never matched: dialogs had no transition and the selected tab looked
 * like the rest. Only the variant selectors are changed; the classes are as
 * shipped.
 */
"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Separator as SeparatorPrimitive } from "radix-ui"

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
