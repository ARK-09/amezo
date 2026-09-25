import { BadgeCheck, PackageCheck, ShieldCheck, Undo2 } from 'lucide-react'

const VALUE_PROPS = [
  {
    icon: PackageCheck,
    title: 'Stock you can trust',
    body: 'Every listing shows the live count per variant, so “add to cart” never turns into a cancellation email.',
  },
  {
    icon: BadgeCheck,
    title: 'Verified sellers',
    body: 'Sellers are checked before their first listing goes live, and their ratings follow them across the marketplace.',
  },
  {
    icon: ShieldCheck,
    title: 'Protected checkout',
    body: 'Prices are re-confirmed the moment you place an order — you are never charged more than you agreed to.',
  },
  {
    icon: Undo2,
    title: 'Straightforward returns',
    body: 'Thirty days to change your mind on anything that arrives not as described.',
  },
]

export function ValueProps() {
  return (
    <section aria-labelledby="why-amezo" className="mx-auto w-full max-w-[1320px] px-7 pt-16">
      <h2 id="why-amezo" className="mb-1 text-lg font-bold">
        Why buy on Amezo
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        A marketplace of independent sellers, with the guardrails of a single storefront.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex flex-col gap-2 rounded-lg border bg-card p-5">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="size-4.5" aria-hidden />
            </span>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
