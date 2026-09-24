import { Search, ShoppingBag } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function SearchTopBar({
  q,
  onSearch,
}: {
  q: string
  onSearch: (q: string) => void
}) {
  const [value, setValue] = useState(q)
  const [prevQ, setPrevQ] = useState(q)
  if (q !== prevQ) {
    setPrevQ(q)
    setValue(q)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    onSearch(value)
  }

  return (
    <header className="sticky top-0 z-20 border-b bg-background">
      <div className="mx-auto flex max-w-[1320px] items-center gap-7 px-7 py-3">
        <div className="flex items-center gap-2.5 whitespace-nowrap">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ShoppingBag className="size-4" />
          </span>
          <span className="text-lg font-bold">Marketplace</span>
        </div>

        <form
          onSubmit={submit}
          className="mx-auto flex w-full max-w-xl items-center gap-1 rounded-full border-[1.5px] border-primary py-0.5 pr-0.5 pl-4"
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Search products"
            aria-label="Search products"
            className="h-8 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
          <Button type="submit" size="sm" className="gap-1.5 rounded-full">
            <Search className="size-3.5" />
            Search
          </Button>
        </form>
      </div>
    </header>
  )
}
