import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import { server } from '@/test/msw/server'
import { signInSellerSession } from '@/test/msw/fixtures/sellerAuth'
import { patchStoreProfile } from '@/test/msw/fixtures/storeProfile'

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

  // Save trims, so this one comes back from the server identical to what was
  // already on screen. Nothing about the saved values changed, and the form
  // still has to settle - otherwise it advertises unsaved changes it just saved.
  it('settles clean when the save only trimmed what was typed', async () => {
    renderPage()
    const name = await screen.findByLabelText('Store name')

    await userEvent.type(name, ' ')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Everything is saved')).toBeInTheDocument())
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

const STORAGE_PREFIX = 'https://mock-s3.local/store/'

/**
 * The presigned PUT goes straight to storage, which the shared handlers
 * deliberately leave alone, so it is answered here. The File never reaches
 * fetch: vitest's jsdom Blob shim throws on any Blob or File used as a fetch
 * body in this environment, so the bytes are swapped for a placeholder and the
 * request itself still goes out and is served by MSW - same as ProductFormPanel's
 * image tests do for the product-scoped flow.
 */
function stubStoragePut(): string[] {
  const realFetch = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
    return url.startsWith(STORAGE_PREFIX)
      ? realFetch(url, { ...init, body: 'image-bytes' })
      : realFetch(input, init)
  })

  const puts: string[] = []
  server.use(
    http.put(`${STORAGE_PREFIX}:id`, ({ request }) => {
      puts.push(request.url)
      return new HttpResponse(null, { status: 200 })
    }),
  )
  return puts
}

/**
 * Branding. The store-image endpoints are seller-scoped, so these arrive with a
 * session the way the rest of the portal does.
 */
describe('StoreSettings branding', () => {
  beforeEach(() => {
    signInSellerSession({
      sellerId: '11111111-1111-1111-1111-111111111111',
      email: 'seller@amezo.test',
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('uploads a cover and previews it', async () => {
    const puts = stubStoragePut()
    renderPage()
    await screen.findByDisplayValue('Aurora Audio')

    await userEvent.upload(
      screen.getByLabelText('Upload cover image'),
      new File(['cover-bytes'], 'storefront.png', { type: 'image/png' }),
    )

    const cover = await screen.findByAltText('Store cover')
    // Reserved, PUT, confirmed - and the confirmed profile is what the page shows.
    expect(puts).toEqual([cover.getAttribute('src')])
    expect(screen.getByText(/storefront\.png · shown at the top/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove cover' })).toBeInTheDocument()

    // The point of the section: the storefront preview carries the same image.
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(preview.querySelector('img')?.getAttribute('src')).toBe(cover.getAttribute('src'))
  })

  // Both checks are worth a round trip only if they cannot be made here.
  it('refuses an oversized or non-image file without asking the server', async () => {
    let reserved = 0
    server.use(
      http.post('http://localhost:8080/api/v1/sellers/me/store/images', () => {
        reserved += 1
        return new HttpResponse(null, { status: 500 })
      }),
    )
    renderPage()
    await screen.findByDisplayValue('Aurora Audio')

    await userEvent.upload(
      screen.getByLabelText('Upload cover image'),
      new File([new Uint8Array(6 * 1024 * 1024)], 'huge.png', { type: 'image/png' }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('huge.png is 6.0 MB — the limit is 5 MB.')

    // Dispatched rather than picked: the accept attribute filters the file
    // picker, not a drop, so the check cannot lean on it.
    fireEvent.change(screen.getByLabelText('Upload brand logo'), {
      target: { files: [new File(['%PDF'], 'catalogue.pdf', { type: 'application/pdf' })] },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('catalogue.pdf is not a JPG or PNG.')

    expect(reserved).toBe(0)
  })

  it('removes a logo by sending null, and falls back to the initials', async () => {
    patchStoreProfile({ logoUrl: 'https://mock-s3.local/store/old-logo' })
    let sent: { logoUrl?: string | null } | null = null
    server.use(
      http.patch('http://localhost:8080/api/v1/sellers/me/store', async ({ request }) => {
        sent = (await request.json()) as { logoUrl?: string | null }
        return HttpResponse.json(patchStoreProfile({ logoUrl: null }))
      }),
    )
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Remove logo' }))

    await waitFor(() => expect(sent).not.toBeNull())
    expect(sent!.logoUrl).toBeNull()
    expect(await screen.findByText('AA')).toBeInTheDocument()
    expect(screen.queryByAltText('Brand logo')).not.toBeInTheDocument()
  })

  // Confirm is what puts the image on the storefront, so a confirm that fails
  // has changed nothing - and saying nothing would leave the seller believing
  // the new cover is live.
  it('surfaces a failed confirm and keeps the cover it had', async () => {
    patchStoreProfile({ coverUrl: 'https://cdn.local/old-cover.jpg' })
    stubStoragePut()
    server.use(
      http.post('http://localhost:8080/api/v1/sellers/me/store/images/confirm', () =>
        HttpResponse.json(
          {
            type: 'https://api/errors/validation',
            title: 'Validation failed',
            status: 422,
            detail: 'That upload expired before it was confirmed.',
          },
          { status: 422 },
        ),
      ),
    )
    renderPage()
    await screen.findByDisplayValue('Aurora Audio')

    await userEvent.upload(
      screen.getByLabelText('Upload cover image'),
      new File(['cover-bytes'], 'storefront.png', { type: 'image/png' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That upload expired before it was confirmed.',
    )
    expect(screen.getByAltText('Store cover')).toHaveAttribute(
      'src',
      'https://cdn.local/old-cover.jpg',
    )
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(preview.querySelector('img')?.getAttribute('src')).toBe('https://cdn.local/old-cover.jpg')
  })
})
