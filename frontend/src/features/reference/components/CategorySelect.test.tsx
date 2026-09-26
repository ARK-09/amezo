import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import { server } from '@/test/msw/server'

import { CategorySelect } from './CategorySelect'

function Harness({ initial = null }: { initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <>
      <CategorySelect value={value} onChange={setValue} />
      <span data-testid="chosen">{value ?? '(none)'}</span>
    </>
  )
}

function renderSelect(initial: string | null = null) {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  )
}

describe('CategorySelect', () => {
  it('offers the system categories by name', async () => {
    renderSelect()

    await userEvent.click(await screen.findByRole('combobox', { name: 'Category' }))

    expect(screen.getByRole('option', { name: 'Electronics' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Outdoor' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Beauty' })).toBeInTheDocument()
  })

  /** The whole point: the value that leaves here is a slug, not typed text. */
  it('reports the chosen category as a slug', async () => {
    renderSelect()

    await userEvent.click(await screen.findByRole('combobox', { name: 'Category' }))
    await userEvent.click(screen.getByRole('option', { name: 'Outdoor' }))

    expect(screen.getByTestId('chosen')).toHaveTextContent('outdoor')
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Outdoor')
  })

  it('filters the list as you type', async () => {
    renderSelect()
    await userEvent.click(await screen.findByRole('combobox', { name: 'Category' }))

    await userEvent.type(screen.getByRole('combobox', { name: 'Search category' }), 'foot')

    expect(screen.getByRole('option', { name: 'Footwear' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Electronics' })).not.toBeInTheDocument()
  })

  it('says so when nothing matches, rather than showing an empty list', async () => {
    renderSelect()
    await userEvent.click(await screen.findByRole('combobox', { name: 'Category' }))

    await userEvent.type(screen.getByRole('combobox', { name: 'Search category' }), 'zzzz')

    expect(screen.getByText('No category matches that')).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  /** Reachable by tab, and openable without a pointer. */
  it('opens on ArrowDown once tabbed to', async () => {
    renderSelect()
    await screen.findByRole('combobox', { name: 'Category' })

    await userEvent.tab()
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')

    expect(screen.getByRole('listbox', { name: 'Category' })).toBeInTheDocument()
  })

  it('moves through the options with the arrows and chooses with Enter', async () => {
    renderSelect()
    await userEvent.click(await screen.findByRole('combobox', { name: 'Category' }))

    // Electronics is highlighted first; one step down is Apparel.
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(screen.getByTestId('chosen')).toHaveTextContent('apparel')
  })

  it('wraps from the first option back to the last', async () => {
    renderSelect()
    await userEvent.click(await screen.findByRole('combobox', { name: 'Category' }))

    await userEvent.keyboard('{ArrowUp}{Enter}')

    // The last system category.
    expect(screen.getByTestId('chosen')).toHaveTextContent('automotive')
  })

  it('closes on Escape without choosing anything', async () => {
    renderSelect()
    await userEvent.click(await screen.findByRole('combobox', { name: 'Category' }))

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByTestId('chosen')).toHaveTextContent('(none)')
  })

  it('marks the current choice as selected when reopened', async () => {
    renderSelect('kitchen')

    await userEvent.click(await screen.findByRole('combobox', { name: 'Category' }))

    // aria-selected tracks the HIGHLIGHTED option under cmdk, not the chosen value -
    // the chosen one is the one carrying the check mark.
    expect(screen.getByRole('option', { name: 'Kitchen' })).toHaveClass('font-semibold')
    expect(screen.getByRole('option', { name: 'Outdoor' })).not.toHaveClass('font-semibold')
  })

  /** Nothing to choose from is a dead control, not an empty list to puzzle over. */
  it('is disabled when the list cannot be loaded', async () => {
    server.use(http.get('http://localhost:8080/categories', () => HttpResponse.json([])))
    renderSelect()

    const control = await screen.findByRole('combobox', { name: 'Category' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(control).toBeDisabled()
  })
})
