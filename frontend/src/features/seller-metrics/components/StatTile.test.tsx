import { render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'

import { StatTile } from './StatTile'

function renderTile(props: Partial<ComponentProps<typeof StatTile>>) {
  const label = props.label ?? 'Orders'
  render(<StatTile label={label} value="42" current={42} {...props} />)
  return screen.getByRole('group', { name: label })
}

describe('StatTile change line', () => {
  it('reads a move off a zero window as an increase, not as flat', () => {
    const tile = renderTile({ current: 42, previous: 0 })

    expect(within(tile).queryByText('Flat')).not.toBeInTheDocument()
    // A percentage here would be a division by zero, so a word carries it.
    const line = within(tile).getByText('New')
    expect(line).toHaveClass('text-[#1f7a45]')
    expect(line.textContent).not.toMatch(/Infinity|NaN/)
    // Direction is never colour alone: the word comes with an arrow.
    expect(line.querySelector('svg')).not.toBeNull()
  })

  it('says there is nothing to compare against when there is no previous window', () => {
    const tile = renderTile({ current: 42, previous: null })

    expect(within(tile).queryByText('Flat')).not.toBeInTheDocument()
    expect(within(tile).queryByText('vs prev')).not.toBeInTheDocument()
    expect(within(tile).getByText('No prior data')).toBeInTheDocument()
  })

  it('is flat only when both windows are zero', () => {
    const tile = renderTile({ value: '0', current: 0, previous: 0 })

    expect(within(tile).getByText('Flat')).toHaveClass('text-muted-foreground')
    expect(within(tile).getByText('vs prev')).toBeInTheDocument()
  })

  it('keeps the percentage when the previous window is non-zero', () => {
    const tile = renderTile({ value: '150', current: 150, previous: 100 })

    expect(within(tile).getByText('+50.0%')).toHaveClass('text-[#1f7a45]')
  })

  it('inverts the tone for measures where up is bad', () => {
    const tile = renderTile({ label: 'Refunds', value: '150', current: 150, previous: 100, invertTone: true })

    expect(within(tile).getByText('+50.0%')).toHaveClass('text-[#b42318]')
  })

  it('inverts the tone off a zero window too', () => {
    const tile = renderTile({ label: 'Refunds', value: '5', current: 5, previous: 0, invertTone: true })

    expect(within(tile).getByText('New')).toHaveClass('text-[#b42318]')
  })

  it('states an untracked measure as untracked, not as a zero or a missing window', () => {
    const tile = renderTile({
      label: 'Conversion rate',
      value: undefined,
      current: undefined,
      unavailable: 'Not tracked yet',
    })

    expect(within(tile).getByText('Not tracked yet')).toBeInTheDocument()
    // Three different facts, three different words. "No prior data" is about a
    // missing previous window and "Flat" about two measured windows - neither
    // is what "nothing measures this" means.
    expect(within(tile).queryByText('No prior data')).not.toBeInTheDocument()
    expect(within(tile).queryByText('Flat')).not.toBeInTheDocument()
    expect(within(tile).queryByText('vs prev')).not.toBeInTheDocument()
    // The dash is a shape; the fact reaches a screen reader as words.
    expect(within(tile).getByText('Not available')).toBeInTheDocument()
  })
})
