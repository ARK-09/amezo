import { MapPin } from 'lucide-react'

import { SearchableSelect } from '@/components/ui/searchable-select'
import { filterCountries, useCountries } from '@/features/reference/api/useCountries'
import { setDeliveryCountry, useDeliveryCountry } from '@/features/reference/deliveryCountry'

/**
 * The header's "Deliver to" picker.
 *
 * It used to offer five hardcoded Gulf cities with Dubai as a silent default, which
 * made the marketplace look like a UAE-only shop and had nothing to do with the
 * countries checkout would actually accept. It now picks a country from the same
 * server list checkout validates against (GET /countries), so what is chosen here is
 * always something an order can be placed to.
 *
 * The choice is shared, not local: it prefills checkout's country field, and changing
 * it in checkout changes it here. See deliveryCountry.ts for the store behind that.
 *
 * There is no default country. Guessing one for a worldwide marketplace is how "Dubai"
 * ended up in the header for everybody, and a wrong prefilled country is worse than an
 * empty one - it is the kind of field people skim past and never correct.
 */
export function DeliveryLocation() {
  const countries = useCountries()
  const selected = useDeliveryCountry()

  return (
    <div className="relative hidden lg:block">
      <SearchableSelect
        items={countries.data ?? []}
        value={selected}
        onChange={setDeliveryCountry}
        getKey={(country) => country.code}
        getLabel={(country) => country.name}
        filter={filterCountries}
        label="Delivery country"
        searchPlaceholder="Search countries"
        emptyMessage="No country matches that"
        disabled={countries.isPending || (countries.data?.length ?? 0) === 0}
        triggerClassName="flex items-center gap-[7px] rounded-md px-1.5 py-1 text-left hover:bg-accent"
        // Wider than the compact trigger, or the country list would be squeezed into
        // a two-line label's width.
        panelClassName="w-64"
        renderTrigger={(label) => (
          <>
            <MapPin className="size-[15px] shrink-0 text-muted-foreground" aria-hidden />
            <span className="leading-[1.25]">
              <span className="block max-w-[16ch] truncate text-[11px] text-muted-foreground">
                {label ? `Deliver to ${label}` : 'Deliver to'}
              </span>
              <span className="block text-xs font-semibold">
                {label ? 'Update location' : 'Select a country'}
              </span>
            </span>
          </>
        )}
      />
    </div>
  )
}
