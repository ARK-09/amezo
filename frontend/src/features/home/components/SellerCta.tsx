import { ArrowRight, Store } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

export function SellerCta() {
  return (
    <section aria-labelledby="sell-on-amezo" className="mx-auto w-full max-w-[1320px] px-7 pt-16">
      <div className="flex flex-col items-start gap-5 rounded-xl border border-primary/30 bg-primary/5 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
        <div className="flex items-start gap-4">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground sm:flex">
            <Store className="size-5" aria-hidden />
          </span>
          <div>
            <h2 id="sell-on-amezo" className="text-xl font-bold">
              Have something to sell?
            </h2>
            <p className="mt-1 max-w-[56ch] text-sm leading-relaxed text-muted-foreground">
              List your catalog, manage stock per variant and ship orders from one place. No monthly
              fee to get started.
            </p>
          </div>
        </div>
        <Button asChild size="lg" className="shrink-0 gap-1.5">
          <Link to="/seller/sign-in">
            Start selling
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  )
}
