/** The uppercase heading the expanded order card uses for Delivery, Items and Reviews. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
      {children}
    </h3>
  )
}
