import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAddToCart } from '@/features/catalog/api/useAddToCart'

import { type CartActions, useCartActions, useCartState } from './CartContext'
import { CartProvider } from './CartProvider'

/**
 * The reason state and actions are two contexts rather than one. It was
 * documented in a comment and relied on by useAddToCart, but nothing held it
 * in place: merging the two - or dropping the useMemo that keeps the actions
 * object stable - would re-render every product card on every quantity change
 * and pass every test in the suite.
 *
 * These assert renders relative to a recorded baseline rather than absolute
 * counts, so they say the same thing under StrictMode's double render as
 * without it.
 */

let actionRenders = 0
let stateRenders = 0
let tileRenders = 0
const actionIdentities = new Set<CartActions>()

/** A dispatch-only consumer: the Add-to-cart button on a product card. */
function ActionsOnly() {
  actionRenders++
  const actions = useCartActions()
  actionIdentities.add(actions)
  return (
    <button type="button" onClick={() => actions.addLine('v1', 1, 10)}>
      Add
    </button>
  )
}

/** The same thing one layer up, through the hook a real card actually calls. */
function ProductTile() {
  tileRenders++
  const { addToCart } = useAddToCart()
  return (
    <button type="button" onClick={() => addToCart('v2', 1, 25)}>
      Add v2
    </button>
  )
}

/** A reader: the cart badge in the header. */
function StateOnly() {
  stateRenders++
  const { itemCount, isOpen } = useCartState()
  return <p>{`${itemCount} items, ${isOpen ? 'open' : 'closed'}`}</p>
}

/** Its own consumer, so opening the drawer is not itself a state read. */
function OpenButton() {
  const { open } = useCartActions()
  return (
    <button type="button" onClick={open}>
      Open
    </button>
  )
}

function renderTree() {
  return render(
    <CartProvider>
      <ActionsOnly />
      <ProductTile />
      <OpenButton />
      <StateOnly />
    </CartProvider>,
  )
}

beforeEach(() => {
  actionRenders = 0
  stateRenders = 0
  tileRenders = 0
  actionIdentities.clear()
  localStorage.clear()
})

describe('cart context subscriptions', () => {
  it('does not re-render a dispatch-only consumer when the cart changes', async () => {
    renderTree()
    const actionsBefore = actionRenders
    const tilesBefore = tileRenders
    const stateBefore = stateRenders

    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('1 items, closed')).toBeInTheDocument()
    // The reader saw the change; the two dispatchers did not.
    expect(stateRenders).toBeGreaterThan(stateBefore)
    expect(actionRenders).toBe(actionsBefore)
    expect(tileRenders).toBe(tilesBefore)
  })

  it('does not re-render a dispatch-only consumer when the drawer opens', async () => {
    renderTree()
    const actionsBefore = actionRenders
    const tilesBefore = tileRenders

    await userEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(await screen.findByText('0 items, open')).toBeInTheDocument()
    expect(actionRenders).toBe(actionsBefore)
    expect(tileRenders).toBe(tilesBefore)
  })

  it('hands out one actions object for the life of the provider', async () => {
    renderTree()

    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add v2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await screen.findByText('2 items, open')

    // One identity across every state change: what makes the bail-out above
    // possible in the first place.
    expect(actionIdentities.size).toBe(1)
  })
})
