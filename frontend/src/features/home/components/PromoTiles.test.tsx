import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import type { PublicStore } from '@/features/store/api/useStorefront'
import { categoryBySlug } from '@/test/msw/fixtures/categories'

import { PromoTiles } from './PromoTiles'

/** Only the fields the tile reads; the contract's other twenty are irrelevant here. */
function store(overrides: Partial<PublicStore> = {}): PublicStore {
  return {
    id: 'store-1',
    name: 'Aurora Audio',
    handle: 'aurora-audio',
    status: 'OPEN',
    productCount: 4,
    ...overrides,
  } as PublicStore
}

function renderTiles(categorySlug: string, featured: PublicStore | undefined = store()) {
  render(
    <MemoryRouter>
      <PromoTiles category={categoryBySlug(categorySlug)} store={featured} />
    </MemoryRouter>,
  )
  const region = screen.getByRole('region', { name: 'Highlights' })
  return { region, ...within(region) }
}

/**
 * The three panels used to be CSS stripes and nothing else - no <img> anywhere on
 * the landing page below the hero. They take photography now where there is any.
 *
 * What these pin is the FALLBACK, which is the part that quietly breaks: every
 * category except a couple has no artwork, and those panels have to keep the
 * striped treatment rather than render a broken image or borrow another
 * category's picture. Getting that wrong would put a rack of shirts behind the
 * word "Electronics".
 */
describe('PromoTiles artwork', () => {
  it('shows the category photograph when there is one for that slug', () => {
    const tiles = renderTiles('clothing')

    // Decorative: the headings carry the meaning, so the images are alt="" and
    // are counted rather than queried by name.
    const images = tiles.region.querySelectorAll('img')
    // The category tile's photograph, plus the ready-to-ship one that is always there.
    expect(images).toHaveLength(2)
  })

  it('falls back to the striped treatment for a category with no artwork', () => {
    const tiles = renderTiles('electronics')

    // Only the ready-to-ship tile, which is about the marketplace rather than
    // about a category and so is the same picture whatever is on screen.
    expect(tiles.region.querySelectorAll('img')).toHaveLength(1)
    expect(tiles.getByText('Electronics')).toBeInTheDocument()
  })

  /** Whatever it is wearing, the tile is still a link to that category's search. */
  it('keeps linking to the category whether or not it has a picture', () => {
    const tiles = renderTiles('clothing')

    const [categoryLink] = tiles.getAllByRole('link', { name: 'Shop now' })
    expect(categoryLink).toHaveAttribute('href', '/search?category=clothing')
  })

  /**
   * The featured tile is the store the SERVER chose, rendered with the store's own
   * fields - which is the whole point of asking for it. The panel used to be built
   * from a product's brandName and a StoreRef, so it had a name and a link and
   * nothing else: no cover, no logo, no tagline, because a product carries none of
   * them.
   */
  it("shows the featured store's own artwork and words", () => {
    const tiles = renderTiles(
      'electronics',
      store({
        coverUrl: 'https://cdn.example.com/cover.webp',
        logoUrl: 'https://cdn.example.com/logo.webp',
        tagline: 'Small-batch listening gear.',
      }),
    )

    expect(tiles.getByText('Aurora Audio')).toBeInTheDocument()
    expect(tiles.getByText('Small-batch listening gear.')).toBeInTheDocument()
    const sources = [...tiles.region.querySelectorAll('img')].map((img) => img.getAttribute('src'))
    expect(sources).toContain('https://cdn.example.com/cover.webp')
    expect(sources).toContain('https://cdn.example.com/logo.webp')
  })

  /**
   * A shop that has uploaded nothing is not an error and gets no stand-in: no
   * generated monogram, no other shop's picture. It reads as the storefront itself
   * reads, which is the name alone over the striped ground.
   */
  it('falls back to the name alone for a store with no artwork', () => {
    const tiles = renderTiles('electronics', store())

    expect(tiles.getByText('Aurora Audio')).toBeInTheDocument()
    expect(tiles.getByText('Visit the storefront')).toBeInTheDocument()
    // Only the ready-to-ship picture, which is not a store's.
    expect(tiles.region.querySelectorAll('img')).toHaveLength(1)
  })

  /**
   * No featured store at all: the tile is absent rather than empty.
   *
   * Rendered directly rather than through the helper, whose default argument would
   * substitute a store for the `undefined` this test is about.
   */
  it('drops the featured tile when the server named no store', () => {
    render(
      <MemoryRouter>
        <PromoTiles category={categoryBySlug('electronics')} />
      </MemoryRouter>,
    )
    const tiles = within(screen.getByRole('region', { name: 'Highlights' }))

    expect(tiles.queryByText('FEATURED SELLER')).not.toBeInTheDocument()
    expect(tiles.getByText('Electronics')).toBeInTheDocument()
  })
})
