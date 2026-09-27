import { createContext, useContext } from 'react'

/**
 * The drawer's context, in its own module.
 *
 * Split out from Drawer.tsx for the same reason SellerAuthContext.ts is split
 * from SellerAuthProvider.tsx: a file that exports both components and a hook
 * breaks fast refresh, which react(only-export-components) is there to catch.
 * The parts that are components live in Drawer.tsx; this is what they share.
 */

export type DrawerMode = 'view' | 'edit' | 'add'

export interface DrawerContextValue {
  mode: DrawerMode
  /**
   * The route of the dedicated page for whatever the drawer is showing, or
   * undefined when there is no such page. The header turns it into the "Full
   * page" control, which opens it in a new tab - so it is a route, not a
   * callback: there is no state to hand over.
   */
  fullPageTo?: string
  close: () => void
}

export const DrawerContext = createContext<DrawerContextValue | null>(null)

/**
 * Lets a consumer's own sub-component read the drawer's mode without being
 * passed it - the reason the context exists rather than prop-drilling.
 */
export function useDrawer() {
  const context = useContext(DrawerContext)
  if (!context) {
    throw new Error('useDrawer must be used within a <Drawer />')
  }
  return context
}
