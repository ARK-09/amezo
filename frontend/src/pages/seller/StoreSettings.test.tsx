import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'

import { StoreSettings } from './StoreSettings'

function renderPage() {
  return render(
    <QueryClientProvider client={createAppQueryClient()}>
      <MemoryRouter>
        <StoreSettings />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('StoreSettings', () => {
  it('loads the saved profile and starts clean', async () => {
    renderPage()

    expect(await screen.findByDisplayValue('Aurora Audio')).toBeInTheDocument()
    expect(screen.getByText('Everything is saved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('slugifies the store URL as it is typed', async () => {
    renderPage()
    const handle = await screen.findByLabelText('Store URL')

    await userEvent.clear(handle)
    await userEvent.type(handle, 'Aurora Audio Shop')

    expect(handle).toHaveValue('aurora-audio-shop')
    expect(screen.getByText('amezo.com/stores/aurora-audio-shop')).toBeInTheDocument()
  })

  it('blocks saving without a name, and says what is missing', async () => {
    renderPage()
    await screen.findByDisplayValue('Aurora Audio')

    await userEvent.clear(screen.getByLabelText('Store name'))

    expect(screen.getByText('Still need a store name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('blocks saving on a malformed support email', async () => {
    renderPage()
    await screen.findByDisplayValue('Aurora Audio')

    const email = screen.getByLabelText('Support email')
    await userEvent.clear(email)
    await userEvent.type(email, 'not-an-email')

    expect(screen.getByText('Still need a valid support email')).toBeInTheDocument()
  })

  it('asks for a note only when vacation mode is on', async () => {
    renderPage()
    await screen.findByDisplayValue('Aurora Audio')

    expect(screen.queryByLabelText('Note to buyers')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch', { name: /Vacation mode/ }))
    expect(screen.getByLabelText('Note to buyers')).toBeInTheDocument()
  })

  it('saves and settles back to clean', async () => {
    renderPage()
    const tagline = await screen.findByLabelText('Tagline')

    await userEvent.clear(tagline)
    await userEvent.type(tagline, 'Repairable audio, built to last')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Everything is saved')).toBeInTheDocument())
  })

  it('reports a handle another store already holds', async () => {
    renderPage()
    const handle = await screen.findByLabelText('Store URL')

    await userEvent.clear(handle)
    await userEvent.type(handle, 'northwind-vinyl')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('That store URL is already taken.')).toBeInTheDocument()
  })
})
