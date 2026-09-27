import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAppQueryClient } from '@/lib/api/queryClient'
import { server } from '@/test/msw/server'
import { signInSellerSession } from '@/test/msw/fixtures/sellerAuth'
import {
  confirmStoreImage,
  patchStoreProfile,
  reserveStoreImage,
} from '@/test/msw/fixtures/storeProfile'

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

/** The storefront preview column, which the design keeps beside the form. */
function preview() {
  return screen.getByRole('complementary', { name: 'Storefront preview' })
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

  /**
   * The save bar's sticky offset and the form's bottom gutter are one fix in two
   * places, and jsdom computes no layout - so this pins the pair that a browser was
   * used to establish rather than pretending to measure them.
   *
   * What was measured, in Chromium at 1280x720 against the real portal shell: a
   * sticky offset is resolved from the SCROLLPORT'S PADDING BOX, and the shell's
   * content well carries 24px of bottom padding. With `bottom-0` the bar stuck 24px
   * above the bottom of the well while `-mb-6` put its resting place at the very
   * bottom, so at the end of the scroll it still covered the last 24px of the form -
   * the Visibility options were clipped by it - with a dead 24px strip visible
   * underneath. `-bottom-6` makes the stuck and resting positions the same place.
   * `pb-6` then restores the gutter `-mb-6` takes from the content, which otherwise
   * ends flush against the bar.
   */
  it('keeps the save bar out of the form it sits under', async () => {
    renderPage()
    const save = await screen.findByRole('button', { name: /Save changes/ })
    const bar = save.closest('div.sticky')

    expect(bar).not.toBeNull()
    // Cancels the well's bottom padding for the stuck position, matching the -mb-6
    // that cancels it for the resting one. bottom-0 is the bug.
    expect(bar).toHaveClass('-bottom-6')
    expect(bar).not.toHaveClass('bottom-0')
    expect(bar).toHaveClass('-mb-6')

    // And the form above it keeps a gutter of its own, because the shell's now sits
    // below the bar rather than between the two.
    expect(bar!.previousElementSibling).toHaveClass('pb-6')
  })

  it('rejects a founded year that is not four digits', async () => {
    renderPage()
    const founded = await screen.findByLabelText('Selling since')

    await userEvent.clear(founded)
    await userEvent.type(founded, '19a9')

    // Non-digits are stripped as typed, so this can never reach the server as NaN.
    expect(founded).toHaveValue('199')
    // Named for the field, under the field - not a general "check your input".
    expect(founded).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter a four-digit year.')).toBeInTheDocument()
    expect(screen.getByText('Still needs a four-digit year.')).toBeInTheDocument()
  })

  it('loads the saved profile and starts clean', async () => {
    renderPage()

    expect(await screen.findByDisplayValue('Aurora Audio')).toBeInTheDocument()
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    // Nothing to put back yet, so no Discard.
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument()
  })

  it('links to the live storefront at the saved handle', async () => {
    renderPage()

    const link = await screen.findByRole('link', { name: 'View live store' })
    expect(link).toHaveAttribute('href', '/stores/aurora-audio')
  })

  it('slugifies the store URL as it is typed', async () => {
    renderPage()
    const handle = await screen.findByLabelText('Store URL')

    await userEvent.clear(handle)
    await userEvent.type(handle, 'Aurora Audio Shop')

    expect(handle).toHaveValue('aurora-audio-shop')
    // The address is previewed in the storefront panel's header, where the
    // seller can read it as one string.
    expect(
      within(preview()).getByText('amezo.com/stores/aurora-audio-shop'),
    ).toBeInTheDocument()
  })

  it('blocks saving without a name, and says what is missing', async () => {
    renderPage()
    await screen.findByDisplayValue('Aurora Audio')

    await userEvent.clear(screen.getByLabelText('Store name'))

    expect(screen.getByText('Enter a store name.')).toBeInTheDocument()
    expect(screen.getByText('Still needs a store name.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  it('blocks saving on a malformed support email', async () => {
    renderPage()
    await screen.findByDisplayValue('Aurora Audio')

    const email = screen.getByLabelText('Support email')
    await userEvent.clear(email)
    await userEvent.type(email, 'not-an-email')

    // The design's own wording, under the field it is about.
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Still needs a valid support email.')).toBeInTheDocument()
  })

  it('asks for a notice only when vacation mode is chosen', async () => {
    renderPage()
    await screen.findByDisplayValue('Aurora Audio')

    expect(screen.queryByLabelText('Notice shown to shoppers')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Vacation mode/ }))

    expect(screen.getByLabelText('Notice shown to shoppers')).toBeInTheDocument()
    // The preview carries the notice a shopper would see.
    expect(
      within(preview()).getByText('This store is not taking orders right now.'),
    ).toBeInTheDocument()
  })

  it('sends VACATION when the vacation card is chosen', async () => {
    renderPage()
    await screen.findByDisplayValue('Aurora Audio')

    let sent: { status?: string } | null = null
    server.use(
      http.patch('http://localhost:8080/api/v1/sellers/me/store', async ({ request }) => {
        sent = (await request.json()) as { status?: string }
        return HttpResponse.json(patchStoreProfile({ status: 'VACATION' }))
      }),
    )

    await userEvent.click(screen.getByRole('radio', { name: /Vacation mode/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(sent).not.toBeNull())
    expect(sent!.status).toBe('VACATION')
  })

  it('saves and settles back to clean', async () => {
    renderPage()
    const tagline = await screen.findByLabelText('Tagline')

    await userEvent.clear(tagline)
    await userEvent.type(tagline, 'Repairable audio, built to last')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(/Storefront updated — changes are live on amezo\.com\/stores\//),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument())
  })

  it('puts the typed values back with Discard', async () => {
    renderPage()
    const tagline = await screen.findByLabelText('Tagline')

    await userEvent.clear(tagline)
    await userEvent.type(tagline, 'Something else entirely')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))

    expect(tagline).toHaveValue('Small-batch listening gear, built to be repaired.')
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument()
  })

  // slugify runs per keystroke, so "Coastal Audio " lands in the box as
  // "coastal-audio-". The contract's StoreHandle refuses a trailing dash, and the
  // preview used to advertise that rejected URL as the store's address.
  it('previews and saves the store URL without its trailing dash', async () => {
    renderPage()
    const handle = await screen.findByLabelText('Store URL')

    await userEvent.clear(handle)
    await userEvent.type(handle, 'Coastal Audio ')

    expect(handle).toHaveValue('coastal-audio-')
    expect(within(preview()).getByText('amezo.com/stores/coastal-audio')).toBeInTheDocument()

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

  /**
   * An emptied "Selling since" box has to REMOVE the year. Sending undefined
   * drops the key from the body, which the API reads as "leave it alone" - so
   * the year could be set and never taken back out.
   */
  it('sends null for a cleared founding year, not an omitted field', async () => {
    renderPage()
    const founded = await screen.findByLabelText('Selling since')

    let sent: Record<string, unknown> | null = null
    server.use(
      http.patch('http://localhost:8080/api/v1/sellers/me/store', async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(patchStoreProfile({ foundedYear: null }))
      }),
    )

    await userEvent.clear(founded)
    expect(within(preview()).getByText('New seller')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(sent).not.toBeNull())
    expect('foundedYear' in sent!).toBe(true)
    expect(sent!.foundedYear).toBeNull()
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

    expect(await screen.findByText(/Storefront updated/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument())
  })

  // The old check only caught an empty box, so a one-character URL passed the
  // client and came back as a server rejection.
  it('will not save a store URL shorter than the contract allows', async () => {
    renderPage()
    const handle = await screen.findByLabelText('Store URL')

    await userEvent.clear(handle)
    await userEvent.type(handle, 'a')

    expect(screen.getByText('Use at least two characters.')).toBeInTheDocument()
    expect(screen.getByText('Still needs a store URL.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  /**
   * The 409 path. The server names the field that collided, and the message has
   * to land on THAT input - a banner saying "conflict" leaves the seller hunting
   * for which of eight boxes is wrong.
   */
  it('marks the store URL field when another store already holds the handle', async () => {
    renderPage()
    const handle = await screen.findByLabelText('Store URL')

    await userEvent.clear(handle)
    await userEvent.type(handle, 'northwind-vinyl')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const message = await screen.findByText('That store URL is already taken.')
    expect(message).toBeInTheDocument()
    await waitFor(() => expect(handle).toHaveAttribute('aria-invalid', 'true'))
    // The field's own error, referenced from the input rather than floating
    // somewhere else on the page.
    expect(handle.closest('div')?.parentElement).toContainElement(message)
    // And no duplicate banner repeating it in general terms.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  /** A 422 naming a different field lands on that field, not on the handle. */
  it('maps a server validation error onto the field it names', async () => {
    server.use(
      http.patch('http://localhost:8080/api/v1/sellers/me/store', () =>
        HttpResponse.json(
          {
            type: 'https://api/errors/validation-error',
            title: 'Validation failed',
            status: 422,
            errors: [{ field: 'supportEmail', reason: 'must be a valid email address' }],
          },
          { status: 422 },
        ),
      ),
    )
    renderPage()
    const tagline = await screen.findByLabelText('Tagline')

    await userEvent.type(tagline, '!')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Must be a valid email address.')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByLabelText('Support email')).toHaveAttribute('aria-invalid', 'true'),
    )
  })

  /** A failure with no field to blame still has to be said out loud. */
  it('shows an unfielded save failure as a banner', async () => {
    server.use(
      http.patch('http://localhost:8080/api/v1/sellers/me/store', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Internal error',
            status: 500,
            detail: 'Something went wrong saving your store.',
          },
          { status: 500 },
        ),
      ),
    )
    renderPage()
    const tagline = await screen.findByLabelText('Tagline')

    await userEvent.type(tagline, '!')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong saving your store.',
    )
  })

  /** Everything the preview column mirrors, and what it says when a field is empty. */
  it('mirrors the draft in the storefront preview, with the design fallbacks', async () => {
    renderPage()
    await screen.findByDisplayValue('Aurora Audio')

    expect(within(preview()).getByText('Aurora Audio')).toBeInTheDocument()
    expect(within(preview()).getByText('Selling since 2019')).toBeInTheDocument()
    expect(within(preview()).getByText('Portland, OR')).toBeInTheDocument()
    expect(within(preview()).getByText('No cover uploaded')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Store name'))
    await userEvent.clear(screen.getByLabelText('Tagline'))
    await userEvent.clear(screen.getByLabelText('Based in'))
    await userEvent.clear(screen.getByLabelText('About the store'))

    expect(within(preview()).getByText('Untitled store')).toBeInTheDocument()
    expect(
      within(preview()).getByText('Add a tagline so shoppers know what you sell.'),
    ).toBeInTheDocument()
    expect(within(preview()).getByText('Your about text appears here.')).toBeInTheDocument()
    expect(within(preview()).getByText('Location not set')).toBeInTheDocument()
  })

  it('counts the tagline and the about text against the design limits', async () => {
    renderPage()
    await screen.findByDisplayValue('Aurora Audio')

    expect(screen.getByText('49/90 characters')).toBeInTheDocument()
    expect(screen.getByText(/\/600 characters$/)).toBeInTheDocument()
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

  it('shows the cover rules and the logo initials before anything is uploaded', async () => {
    renderPage()
    await screen.findByDisplayValue('Aurora Audio')

    expect(screen.getByText('Drop an image or click to upload')).toBeInTheDocument()
    expect(screen.getByText('1600 × 400 or wider · JPG or PNG · up to 5 MB')).toBeInTheDocument()
    expect(
      screen.getByText('No cover yet — shoppers see a plain band above your logo.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Square, at least 512 × 512. Shown as a circle, so keep the mark centred.'),
    ).toBeInTheDocument()
    // The circle falls back to initials rather than sitting empty - in the
    // uploader and in the preview both.
    expect(screen.getAllByText('AA')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Remove cover' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove logo' })).not.toBeInTheDocument()
  })

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

    // The preview is the storefront band's own shape, so what the seller sees here is
    // what shoppers will. At a fixed height it cropped the cover the same way the
    // storefront did, which meant they could not tell from this screen that the top and
    // bottom of their image were being thrown away.
    expect(cover.parentElement!.className).toContain('aspect-[4/1]')

    // The point of the section: the storefront preview carries the same image.
    expect(preview().querySelector('img')?.getAttribute('src')).toBe(cover.getAttribute('src'))
    expect(within(preview()).queryByText('No cover uploaded')).not.toBeInTheDocument()
  })

  it('uploads a logo and drops the initials fallback', async () => {
    stubStoragePut()
    renderPage()
    await screen.findByDisplayValue('Aurora Audio')

    await userEvent.upload(
      screen.getByLabelText('Upload brand logo'),
      new File(['logo-bytes'], 'mark.png', { type: 'image/png' }),
    )

    const logo = await screen.findByAltText('Brand logo')
    expect(screen.queryByText('AA')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove logo' })).toBeInTheDocument()
    // The preview's own circle shows it too.
    expect(preview().querySelector('img')?.getAttribute('src')).toBe(logo.getAttribute('src'))
  })

  /**
   * Uploading a logo must reserve the LOGO slot, and confirm it as the same one.
   * The server refuses a cover confirmed as a logo, so a client that named the
   * slot inconsistently would fail the round trip rather than silently misfile.
   */
  it('names the same slot when reserving and when confirming', async () => {
    stubStoragePut()
    const slots: string[] = []
    server.use(
      http.post('http://localhost:8080/api/v1/sellers/me/store/images', async ({ request }) => {
        const body = (await request.json()) as { slot: string }
        slots.push(`reserve:${body.slot}`)
        return HttpResponse.json(
          { ...reserveStoreImage(body.slot as 'COVER' | 'LOGO'), expiresAt: new Date().toISOString() },
          { status: 201 },
        )
      }),
      http.post(
        'http://localhost:8080/api/v1/sellers/me/store/images/confirm',
        async ({ request }) => {
          const body = (await request.json()) as { id: string; slot: 'COVER' | 'LOGO' }
          slots.push(`confirm:${body.slot}`)
          return HttpResponse.json(confirmStoreImage(body.id, body.slot))
        },
      ),
    )
    renderPage()
    await screen.findByDisplayValue('Aurora Audio')

    await userEvent.upload(
      screen.getByLabelText('Upload brand logo'),
      new File(['logo-bytes'], 'mark.png', { type: 'image/png' }),
    )

    await waitFor(() => expect(slots).toEqual(['reserve:LOGO', 'confirm:LOGO']))
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
    expect((await screen.findAllByText('AA')).length).toBeGreaterThan(0)
    expect(screen.queryByAltText('Brand logo')).not.toBeInTheDocument()
  })

  it('removes a cover by sending null, and the preview goes back to empty', async () => {
    patchStoreProfile({ coverUrl: 'https://mock-s3.local/store/old-cover' })
    let sent: { coverUrl?: string | null } | null = null
    server.use(
      http.patch('http://localhost:8080/api/v1/sellers/me/store', async ({ request }) => {
        sent = (await request.json()) as { coverUrl?: string | null }
        return HttpResponse.json(patchStoreProfile({ coverUrl: null }))
      }),
    )
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Remove cover' }))

    await waitFor(() => expect(sent).not.toBeNull())
    // Explicitly null, which is what the contract marks coverUrl as accepting -
    // an omitted key would read as "leave the cover alone".
    expect('coverUrl' in sent!).toBe(true)
    expect(sent!.coverUrl).toBeNull()
    expect(await within(preview()).findByText('No cover uploaded')).toBeInTheDocument()
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
    expect(preview().querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.local/old-cover.jpg',
    )
  })

  /** A 413 from the per-file cap is the server's version of the browser's check. */
  it('reports the server refusing an upload it could not refuse locally', async () => {
    server.use(
      http.post('http://localhost:8080/api/v1/sellers/me/store/images', () =>
        HttpResponse.json(
          {
            type: 'https://api/errors/file-too-large',
            title: 'File too large',
            status: 413,
            detail: 'Cover is 6.0 MiB, over the 5.0 MiB limit for a store cover image',
          },
          { status: 413 },
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
      'Cover is 6.0 MiB, over the 5.0 MiB limit',
    )
  })
})
