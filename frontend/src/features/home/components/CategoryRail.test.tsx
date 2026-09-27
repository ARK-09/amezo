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

  /**
   * Scrolling that settles rather than teleports.
   *
   * snap-x is PROXIMITY snapping in Tailwind unless told otherwise, which is the
   * point: it catches a swipe that lands near a tile edge and leaves a reader who
   * stopped deliberately between two tiles alone. snap-mandatory would fight them,
   * so its absence is asserted too.
   */
  it('snaps to tiles and animates the scrolls something else drives', () => {
    renderRail()

    const strip = screen.getByRole('link', { name: /Electronics/ }).parentElement!
    expect(strip).toHaveClass('snap-x')
    expect(strip).toHaveClass('scroll-smooth')
    // A swipe past the end of the rail must not become the browser's back gesture.
    expect(strip).toHaveClass('overscroll-x-contain')
    expect([...strip.classList]).not.toContain('snap-mandatory')
    // Each tile is a snap target, at its own leading edge.
    expect(screen.getByRole('link', { name: /Electronics/ })).toHaveClass('snap-start')
  })

  /**
   * The rail sits inside the page's container like every other section.
   *
   * It used to negate the landing page's 28px padding so tiles could scroll out into
   * the gutter - which made this the one section whose content did not stop where the
   * grids above and below it stop, most visibly under 1320px where the tiles reached
   * the window edge. A negative margin here is the regression to catch.
   */
  it('keeps the same horizontal inset as the sections around it', () => {
    renderRail()

    const strip = screen.getByRole('link', { name: /Electronics/ }).parentElement!
    expect([...strip.classList].filter((name) => name.startsWith('-mx-'))).toEqual([])
    expect([...strip.classList].filter((name) => name.startsWith('px-'))).toEqual([])
  })

  /** The skeleton occupies the same box, so nothing slides sideways when data lands. */
  it('lays the loading skeleton out like the rail it becomes', () => {
    render(
      <MemoryRouter>
        <CategoryRail categories={[]} isLoading />
      </MemoryRouter>,
    )

    const strip = document.querySelector('section > div.flex')!
    expect([...strip.classList].filter((name) => name.startsWith('-mx-'))).toEqual([])
    expect(strip).toHaveClass('gap-4')
  })
})
