import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { CategoryRail } from '@/features/home/components/CategoryRail'
import { systemCategories } from '@/test/msw/fixtures/categories'

function renderRail() {
  return render(
    <MemoryRouter>
      <CategoryRail categories={systemCategories} isLoading={false} />
    </MemoryRouter>,
  )
}

describe('CategoryRail scrolling', () => {
  it('hides its own scrollbar while staying scrollable', () => {
    renderRail()

    const strip = screen.getByRole('link', { name: /Electronics/ }).parentElement!
    expect(strip).toHaveClass('rail-no-scrollbar')
    // Hiding the bar must not stop the scrolling underneath it.
    expect(strip).toHaveClass('overflow-x-auto')
  })

  /**
   * The bug this guards against, from the side a test can actually see.
   *
   * The shadcn registry's CommandList ships `no-scrollbar` among its own classes,
   * expecting radix-nova's starter CSS to define it. Here that class is undefined,
   * so dropdowns keep their scrollbars - until something defines a generic
   * `no-scrollbar` utility, which then silently hides the scrollbar in every
   * combobox and menu in the app rather than just this rail.
   *
   * classList holds whole tokens, so this fails the moment the rail is switched
   * back to the bare name that collides. The other half - nobody re-adding
   * `@utility no-scrollbar` to index.css - is guarded by the comment there:
   * jsdom does not apply Tailwind, and the app tsconfig deliberately exposes no
   * node types to read the stylesheet with.
   */
  it('uses a rail-scoped class name the registry cannot collide with', () => {
    renderRail()

    const strip = screen.getByRole('link', { name: /Electronics/ }).parentElement!
    expect([...strip.classList]).not.toContain('no-scrollbar')
  })
})
