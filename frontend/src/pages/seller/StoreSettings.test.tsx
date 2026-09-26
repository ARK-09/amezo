import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import { server } from '@/test/msw/server'

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
  // The loading guard used to sit in front of the error branch. An errored
  // query has isLoading false and no data, so the form sat on its skeleton
  // forever and the retry was unreachable.
  it('shows the failure and a retry rather than an endless skeleton', async () => {
    server.use(
      http.get('http://localhost:8080/api/v1/sellers/me/store', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Internal error', status: 500 },
          { status: 500 },
        ),
      ),
    )
    renderPage()

    expect(
      await screen.findByText("Couldn't load your store", {}, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('rejects a founded year that is not four digits', async () => {
    renderPage()
    const founded = await screen.findByLabelText('Founded')

    await userEvent.clear(founded)
    await userEvent.type(founded, '19a9')

    // Non-digits are stripped as typed, so this can never reach the server as NaN.
    expect(founded).toHaveValue('199')
    expect(screen.getByText('Still need a four-digit year')).toBeInTheDocument()
  })

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

  // slugify runs per keystroke, so "Coastal Audio " lands in the box as
  // "coastal-audio-". The contract's StoreHandle refuses a trailing dash, and the
  // hint used to advertise that rejected URL as the store's address.
  it('previews and saves the store URL without its trailing dash', async () => {
    renderPage()
    const handle = await screen.findByLabelText('Store URL')

    await userEvent.clear(handle)
    await userEvent.type(handle, 'Coastal Audio ')

    expect(handle).toHaveValue('coastal-audio-')
    expect(screen.getByText('amezo.com/stores/coastal-audio')).toBeInTheDocument()

    let sent: { handle?: string } | null = null
    server.use(
      http.patch('http://localhost:8080/api/v1/sellers/me/store', async ({ request }) => {
        sent = (await request.json()) as { handle?: string }
        return HttpResponse.json({
          id: '00000000-0000-0000-0000-000000000001',
          name: 'Coastal Audio',
          handle: sent.handle,
          status: 'OPEN',
          updatedAt: new Date().toISOString(),
        })
      }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(sent).not.toBeNull())
    expect(sent!.handle).toBe('coastal-audio')
  })

  // The old check only caught an empty box, so a one-character URL passed the
  // client and came back as a server rejection.
  it('will not save a store URL shorter than the contract allows', async () => {
    renderPage()
    const handle = await screen.findByLabelText('Store URL')

    await userEvent.clear(handle)
    await userEvent.type(handle, 'a')

    expect(screen.getByText(/Still need a store URL of at least two characters/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
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
