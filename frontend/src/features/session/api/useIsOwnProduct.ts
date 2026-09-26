import { useSession } from './useSession'

/**
 * Whether the person viewing is the seller of this product.
 *
 * Reads the session rather than the seller portal's local context: the question is
 * about the signed-in identity, which the session already answers app-wide, and a
 * buyer-facing card has no business depending on the portal. One shared query, so a
 * grid of sixteen cards asks nothing extra.
 */
export function useIsOwnProduct(sellerId: string | undefined): boolean {
  const session = useSession()
  const identity = session.data
  if (!identity || identity.identityType !== 'SELLER' || !sellerId) return false
  return identity.identityId === sellerId
}
