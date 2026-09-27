import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import {
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerSubline,
  DrawerTitle,
} from './Drawer'
import { useDrawer, type DrawerMode } from './drawerContext'

function ModeReadout() {
  const { mode } = useDrawer()
  return <span>mode: {mode}</span>
}

function Harness({
  mode = 'view',
  ariaLabel = 'Product details',
  fullPageTo = '/seller/products/p1',
  canSave = true,
}: {
  mode?: DrawerMode
  ariaLabel?: string
  /** null for a drawer whose record has no page of its own. */
  fullPageTo?: string | null
  canSave?: boolean
}) {
  const [open, setOpen] = useState(true)

  return (
    <MemoryRouter>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        mode={mode}
        ariaLabel={ariaLabel}
        width={520}
        fullPageTo={fullPageTo ?? undefined}
      >
        <DrawerHeader status={<span>Active</span>} meta="Electronics">
          <DrawerTitle>Aurora One Wireless Headphones</DrawerTitle>
          <DrawerSubline>Aurora Audio</DrawerSubline>
        </DrawerHeader>
        <DrawerBody>
          <ModeReadout />
        </DrawerBody>
        <DrawerFooter note="Unsaved changes">
          <button type="button">Cancel</button>
          <button type="button" disabled={!canSave}>
            Save
          </button>
        </DrawerFooter>
      </Drawer>
    </MemoryRouter>
  )
}

/**
 * shadcn's SheetContent always renders a close button of its own, pinned to the
 * top-right corner - where the drawer's own controls sit. The drawer hides it
 * with a CSS rule and lays out its own in the header instead, so a real browser
 * shows and announces exactly one. jsdom compiles no Tailwind, so both are still
 * in the tree here; the header's is first, and it is the one under test.
 */
function headerClose(drawer: HTMLElement) {
  return within(drawer).getAllByRole('button', { name: 'Close' })[0]
}

describe('Drawer', () => {
  it('is named by ariaLabel, not by the record it happens to be showing', async () => {
    render(<Harness ariaLabel="Product details" />)

    const drawer = await screen.findByRole('dialog', { name: 'Product details' })
    // The product's own name is the visible heading, and must not become the
    // dialog's accessible name - "what is in it" is not "what it is".
    expect(
      within(drawer).getByRole('heading', { name: 'Aurora One Wireless Headphones' }),
    ).toBeInTheDocument()
  })

  it('renders the header, body and footer slots it is given', async () => {
    render(<Harness />)

    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('Electronics')).toBeInTheDocument()
    expect(within(drawer).getByText('Aurora Audio')).toBeInTheDocument()
    expect(within(drawer).getByText('Unsaved changes')).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  /**
   * The status pill is a named slot rather than something the caller composes
   * into the header, so five screens cannot put their pill in five places. It
   * belongs above the title, which is what this pins down.
   */
  it('puts the status slot in the header, ahead of the title', async () => {
    render(<Harness />)

    const drawer = await screen.findByRole('dialog')
    const pill = within(drawer).getByText('Active')
    const title = within(drawer).getByRole('heading', { name: 'Aurora One Wireless Headphones' })

    expect(pill.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Same row as the muted meta chip, as the design draws it.
    expect(pill.parentElement).toContainElement(within(drawer).getByText('Electronics'))
  })

  it.each(['view', 'edit', 'add'] as const)(
    'reports its mode (%s) to whatever is inside it',
    async (mode) => {
      render(<Harness mode={mode} />)

      expect(await screen.findByText(`mode: ${mode}`)).toBeInTheDocument()
    },
  )

  /**
   * "Full page" is a link to the dedicated route, opened in a new tab, and it is
   * offered in every mode - the seller decides from any of the three that the
   * panel is too small. It used to expand the panel in place, which kept the
   * list out of reach and gave the record no URL.
   */
  it.each(['view', 'edit', 'add'] as const)(
    'offers Full page in %s mode, opening the dedicated page in a new tab',
    async (mode) => {
      render(<Harness mode={mode} fullPageTo="/seller/products/p1" />)

      const drawer = await screen.findByRole('dialog')
      const link = within(drawer).getByRole('link', { name: 'Full page' })

      expect(link).toHaveAttribute('href', '/seller/products/p1')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noreferrer')
    },
  )

  it('has no in-place expand left to collapse', async () => {
    render(<Harness />)

    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).queryByRole('button', { name: /Full page/ })).not.toBeInTheDocument()
    expect(within(drawer).queryByText(/Back to panel/)).not.toBeInTheDocument()
  })

  it('offers no Full page control where there is no page to open', async () => {
    render(<Harness fullPageTo={null} />)

    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).queryByRole('link', { name: /Full page/ })).not.toBeInTheDocument()
    // Closing is always available.
    expect(headerClose(drawer)).toBeInTheDocument()
  })

  /**
   * The edit and add forms move their save into this footer, so a primary that
   * cannot be pressed yet has to be visibly the same control as one that can.
   */
  it('carries a note beside the actions and a primary that can be disabled', async () => {
    const view = render(<Harness canSave={false} />)

    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('Unsaved changes')).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Cancel' })).toBeEnabled()
    expect(within(drawer).getByRole('button', { name: 'Save' })).toBeDisabled()

    view.unmount()
    render(<Harness canSave />)
    expect(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save' }),
    ).toBeEnabled()
  })

  it('closes from its own close button', async () => {
    render(<Harness />)

    const drawer = await screen.findByRole('dialog')
    await userEvent.click(headerClose(drawer))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
