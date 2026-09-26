import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Avatar } from './Avatar'

describe('Avatar', () => {
  /** No avatar image exists anywhere yet, so initials ARE the fallback. */
  it('renders initials when there is no image', () => {
    render(<Avatar name="Ada Lovelace" />)
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  /**
   * shadcn's Avatar holds the image back until it has actually loaded, which is the
   * point of using it: no flash of a broken image, and no layout shift when a slow
   * avatar arrives. jsdom never loads images, so the fallback is what renders here -
   * asserting an <img> would be asserting behaviour the primitive deliberately does
   * not have.
   */
  it('keeps showing initials until a supplied image has loaded', () => {
    render(<Avatar name="Ada Lovelace" src="https://cdn.example/ada.jpg" />)
    expect(screen.getByText('AL')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  /** The same person is the same colour on every page, and between visits. */
  it('gives one identity a stable colour', () => {
    const first = render(<Avatar name="Ada Lovelace" />)
    const firstClass = screen.getByText('AL').className
    first.unmount()

    render(<Avatar name="Ada Lovelace" />)
    expect(screen.getByText('AL').className).toBe(firstClass)
  })

  it('shows something for an unknown identity rather than breaking', () => {
    render(<Avatar name={null} />)
    expect(screen.getByText('AN')).toBeInTheDocument()
  })
})
