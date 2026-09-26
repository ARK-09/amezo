import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import {
  Drawer,
  DrawerBody,
  DrawerEyebrow,
  DrawerFooter,
  DrawerHeader,
  DrawerSubline,
  DrawerTitle,
} from './Drawer'
import { useDrawer, type DrawerMode } from './drawerContext'

/**
 * A stand-in for the panels real callers put in the body. It holds state, which
 * is the whole point of the expand test: if expanding remounts the tree, this
 * input goes back to empty.
 */
function BodyWithState() {
  const [value, setValue] = useState('')
  return (
    <input aria-label="Notes" value={value} onChange={(e) => setValue(e.target.value)} />
  )
}

function ModeReadout() {
  const { mode } = useDrawer()
  return <span>mode: {mode}</span>
}

function Harness({
  mode = 'view',
  ariaLabel = 'Product details',
  expandable = true,
}: {
  mode?: DrawerMode
  ariaLabel?: string
  expandable?: boolean
}) {
  const [open, setOpen] = useState(true)
  const [expanded, setExpanded] = useState(false)

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      mode={mode}
      ariaLabel={ariaLabel}
      width={520}
      expanded={expandable ? expanded : undefined}
      onExpandedChange={expandable ? setExpanded : undefined}
    >
      <DrawerHeader>
        <DrawerEyebrow>
          <span>Electronics</span>
        </DrawerEyebrow>
        <DrawerTitle>Aurora One Wireless Headphones</DrawerTitle>
        <DrawerSubline>Aurora Audio</DrawerSubline>
      </DrawerHeader>
      <DrawerBody>
        <ModeReadout />
        <BodyWithState />
      </DrawerBody>
      <DrawerFooter note="Unsaved changes">
        <button type="button">Save</button>
      </DrawerFooter>
    </Drawer>
  )
}

/**
 * shadcn's SheetContent always renders a close button of its own, pinned to the
 * top-right corner - where the drawer's expand control sits. The drawer hides it
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
    expect(within(drawer).getByRole('heading', { name: 'Aurora One Wireless Headphones' })).toBeInTheDocument()
  })

  it('renders the header, body and footer slots it is given', async () => {
    render(<Harness />)

    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('Electronics')).toBeInTheDocument()
    expect(within(drawer).getByText('Aurora Audio')).toBeInTheDocument()
    expect(within(drawer).getByText('Unsaved changes')).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it.each(['view', 'edit', 'add'] as const)('reports its mode (%s) to whatever is inside it', async (mode) => {
    render(<Harness mode={mode} />)

    expect(await screen.findByText(`mode: ${mode}`)).toBeInTheDocument()
  })

  /**
   * The reason this component exists rather than the wrapper it replaced, whose
   * "Full page" opened a new browser tab and lost everything typed so far.
   */
  it('keeps in-progress form state when expanding to full page and back', async () => {
    render(<Harness />)

    const drawer = await screen.findByRole('dialog')
    await userEvent.type(within(drawer).getByLabelText('Notes'), 'half typed')

    await userEvent.click(within(drawer).getByRole('button', { name: /Full page/ }))
    expect(within(drawer).getByLabelText('Notes')).toHaveValue('half typed')

    await userEvent.click(within(drawer).getByRole('button', { name: /Back to panel/ }))
    expect(within(drawer).getByLabelText('Notes')).toHaveValue('half typed')
  })

  it('offers no expand control when the caller did not opt into one', async () => {
    render(<Harness expandable={false} />)

    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).queryByRole('button', { name: /Full page/ })).not.toBeInTheDocument()
    // Closing is always available.
    expect(headerClose(drawer)).toBeInTheDocument()
  })

  it('closes from its own close button', async () => {
    render(<Harness />)

    const drawer = await screen.findByRole('dialog')
    await userEvent.click(headerClose(drawer))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
