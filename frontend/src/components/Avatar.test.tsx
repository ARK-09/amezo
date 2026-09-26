import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Avatar } from './Avatar'

describe('Avatar', () => {
  /** No avatar image exists anywhere yet, so initials ARE the fallback. */
  it('renders initials when there is no image', () => {
    render(<Avatar name="Ada Lovelace" />)
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  it('renders an image when one is given, labelled with the name', () => {
    render(<Avatar name="Ada Lovelace" src="https://cdn.example/ada.jpg" />)
    const image = screen.getByRole('img', { name: 'Ada Lovelace' })
    expect(image).toHaveAttribute('src', 'https://cdn.example/ada.jpg')
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
