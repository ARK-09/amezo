import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Facet } from '@/features/seller-portal/api/useSellerFacets'
import { formatPrice } from '@/lib/formatPrice'

type FacetTabsProps = {
  /** Names the tablist; the strip carries no visible heading of its own. */
  label: string
  /** Each `value` is the key both the facets response and the list filter use. */
  tabs: readonly { value: string; label: string }[]
  value: string
  onValueChange: (value: string) => void
  facets: Facet[] | undefined
  /** True only before the first response - a refetch keeps the old numbers. */
  isPending: boolean
}

/**
 * The design's bucket strip: every tab carries its own count, and its own money
 * where the endpoint has one to give. The numbers are a second request, so the
 * strip has three states and stays usable in all of them - the tabs themselves
 * never wait on the counts.
 */
export function FacetTabs({ label, tabs, value, onValueChange, facets, isPending }: FacetTabsProps) {
  const byKey = new Map((facets ?? []).map((facet) => [facet.key, facet]))

  return (
    <Tabs value={value} onValueChange={onValueChange}>
      {/* h-auto! beats the list's own rule, a flat h-8 written as a group-data
          variant: two lines per tab, and a second row once they wrap, both
          overflow it. */}
      <TabsList aria-label={label} className="h-auto! w-full flex-wrap justify-start gap-1 p-1">
        {tabs.map((tab) => {
          const facet = byKey.get(tab.value)
          return (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              // grow + a 7.5rem basis rather than flex-none: the tabs share
              // the strip's full width, and each row still fills when they
              // wrap. No min-w-0, so a long label like "Ready for pickup"
              // wraps the strip instead of being squashed.
              className="h-auto grow basis-[7.5rem] flex-col items-start gap-1 px-2.5 py-1.5"
            >
              <span className="text-[13px] leading-none">{tab.label}</span>
              {/* Keeps its height whether the numbers are loading, there, or
                  never coming, so the strip does not jump under the pointer. */}
              <span className="flex h-3.5 items-center gap-1 text-xs leading-none font-normal tabular-nums text-muted-foreground">
                {isPending ? (
                  // Toned off the text, not bg-muted: the list behind it is
                  // bg-muted, so the default skeleton was invisible on every
                  // tab but the selected one.
                  <Skeleton className="h-3 w-7 bg-foreground/10" />
                ) : facets ? (
                  <>
                    {/* A bucket the response left out is a bucket with nothing
                        in it - the endpoint describes them all. An empty slot
                        is reserved for "the counts never arrived". */}
                    <span>{facet?.count ?? 0}</span>
                    {facet?.value != null && <span>· {formatPrice(facet.value)}</span>}
                  </>
                ) : null}
              </span>
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
