import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router'

/**
 * The URL is the source of truth for which record is open, and in what mode.
 *
 * ONE pattern for every table in the app - Seller Products, Seller Orders, Seller
 * Refunds, buyer My Orders - rather than a different pair of parameters per feature:
 *
 *     /seller/products?id=123&mode=view
 *     /seller/products?id=123&mode=edit
 *     /seller/products?id=new&mode=create
 *
 * so a refresh, a pasted link, and Back/Forward all land on the same record in the same
 * mode. Before this, every one of those pages held the open record in useState: a
 * refresh closed the drawer, a link shared the list and not the record, and Back left
 * the drawer open over a table that had changed underneath it.
 *
 * <h2>?id= and not ?productId=</h2>
 *
 * The record parameter is the same word on every screen, because the alternative is
 * four spellings for one idea. It is also deliberately NOT ?productId=: that name is
 * already a FILTER on the seller order list (orders containing this product), and one
 * parameter cannot mean both the filter and the open record.
 *
 * <h2>What it never touches</h2>
 *
 * Only `id` and `mode`. Every other parameter - q, status, group, sort, page, size -
 * is the table's state and is carried through untouched, so opening a record cannot
 * reset a search and closing one returns the reader to exactly the page they were on.
 */

export type DrawerMode = 'view' | 'edit' | 'create'

/**
 * What `?id=` says while a create drawer is open. The record has no id yet, and an
 * absent id would make `mode=create` the only trace of an open drawer - so the two
 * parameters would no longer describe the state together.
 */
export const NEW_RECORD = 'new'

const MODES: DrawerMode[] = ['view', 'edit', 'create']

export type RecordDrawer = {
  /** The open record's id, `NEW_RECORD` for a create drawer, or null when closed. */
  id: string | null
  /** Null when no drawer is open. */
  mode: DrawerMode | null
  isOpen: boolean
  /** The id of the open record, or null while creating one - what a detail query takes. */
  recordId: string | null
  /** Opens a record. Pushes a history entry, so Back closes the drawer. */
  open: (id: string, mode?: DrawerMode) => void
  /** Opens the create drawer, which is `?id=new&mode=create`. */
  openCreate: () => void
  /** Same record, different mode - view to edit, without losing the record. */
  setMode: (mode: DrawerMode) => void
  /** Removes only the drawer's own parameters. */
  close: () => void
}

/**
 * An unknown `?mode=` beside a real id opens the record in view rather than refusing
 * to open anything: a typo or a retired mode in a bookmark should still show the reader
 * the record they asked for. An id with no mode at all means the same thing.
 */
function parseMode(raw: string | null, id: string | null): DrawerMode | null {
  const mode = MODES.find((candidate) => candidate === raw) ?? null
  if (mode === 'create') return 'create'
  // A mode with nothing to show is not an open drawer. create is the exception above,
  // because it has no record yet by definition.
  if (!id) return null
  return mode ?? 'view'
}

export function useRecordDrawer(): RecordDrawer {
  const [searchParams, setSearchParams] = useSearchParams()

  const rawId = searchParams.get('id')
  const id = rawId && rawId.trim() ? rawId.trim() : null
  const mode = parseMode(searchParams.get('mode'), id)

  /**
   * Every write goes through here so that exactly two parameters can change and the
   * rest of the query string is carried over verbatim. The updater form of
   * setSearchParams reads the live params rather than the ones this render closed over,
   * which matters when a filter change and a drawer open land in the same tick.
   */
  const write = useCallback(
    (nextId: string | null, nextMode: DrawerMode | null) => {
      setSearchParams((previous) => {
        const params = new URLSearchParams(previous)
        if (nextId) params.set('id', nextId)
        else params.delete('id')
        if (nextMode) params.set('mode', nextMode)
        else params.delete('mode')
        return params
      })
      // Pushed, not replaced: opening a record, changing its mode and closing it are
      // each a place the reader can come back to with Back.
    },
    [setSearchParams],
  )

  const open = useCallback(
    (recordId: string, nextMode: DrawerMode = 'view') => write(recordId, nextMode),
    [write],
  )
  const openCreate = useCallback(() => write(NEW_RECORD, 'create'), [write])
  const setMode = useCallback(
    (nextMode: DrawerMode) => write(nextMode === 'create' ? NEW_RECORD : id, nextMode),
    [write, id],
  )
  const close = useCallback(() => write(null, null), [write])

  return {
    id,
    mode,
    isOpen: mode !== null,
    // `new` is a sentinel and not an id: a detail query must not be fired for it.
    recordId: id === NEW_RECORD ? null : id,
    open,
    openCreate,
    setMode,
    close,
  }
}

/**
 * A query string with the table's own state cleared and the drawer's kept - what
 * "Clear filters" should leave behind.
 *
 * Clearing a search is a table action and closing a drawer is not, so wiping the whole
 * query string would shut the open record as a side effect of tidying the list.
 */
export function drawerParamsOnly(searchParams: URLSearchParams): URLSearchParams {
  const kept = new URLSearchParams()
  for (const key of ['id', 'mode']) {
    const value = searchParams.get(key)
    if (value) kept.set(key, value)
  }
  return kept
}

/**
 * The row the drawer draws itself from, held onto while the drawer is open.
 *
 * Acting on a record usually moves it out of the bucket being viewed - packing an order
 * takes it out of "To pack", archiving a product takes it out of the active filter - and
 * a drawer derived only from the current page slams shut the instant the action
 * succeeds, before the reader sees the result. So the last row seen for the open id is
 * kept.
 *
 * It is NOT a second copy of the drawer's state: which record is open, and in what mode,
 * comes only from the URL. This remembers the row's DATA for an id the URL already
 * names, and is dropped the moment the URL names a different one - so it cannot show
 * the wrong record after Back, Forward, or a hand-edited id.
 *
 * Derived during render against a tracked previous value rather than in an effect,
 * which is the house pattern (react(set-state-in-effect) is a lint error here); see
 * MyOrders.tsx and SellerOrders.tsx for the same shape applied to a search box.
 */
export function useRecordSnapshot<T extends { id: string }>(
  openId: string | null,
  rows: readonly T[],
): T | null {
  const [snapshot, setSnapshot] = useState<T | null>(null)
  const [snapshotFor, setSnapshotFor] = useState<string | null>(null)

  const onThisPage = openId ? (rows.find((row) => row.id === openId) ?? null) : null

  // Two reasons to re-seed: the URL now names a different record (or none), or the list
  // has a fresher copy of the one it already named. Nothing re-seeds when the row simply
  // leaves the page, which is the case this exists for.
  if (openId !== snapshotFor || (onThisPage !== null && onThisPage !== snapshot)) {
    setSnapshotFor(openId)
    setSnapshot(onThisPage)
  }

  return onThisPage ?? (snapshotFor === openId ? snapshot : null)
}
