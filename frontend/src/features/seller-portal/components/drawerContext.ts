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
  expanded: boolean
  /** Undefined when the caller did not opt into expanding. */
  onExpandedChange?: (expanded: boolean) => void
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
