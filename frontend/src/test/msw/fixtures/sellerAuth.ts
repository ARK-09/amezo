// In-memory mock state for the seller magic-link flow. Not a database - just
// enough bookkeeping for MSW to behave like the real backend (issue a random
// token, accept it exactly once) while giving tests a way to "read the
// email" without a real inbox: import issuedMagicLinkTokens and look up the
// token by email, exactly like the backend test captures the EmailSender call.
export const issuedMagicLinkTokens = new Map<string, string>() // token -> email
const sellerIdsByEmail = new Map<string, string>()
const buyerIdsByEmail = new Map<string, string>()

export interface SessionIdentityFixture {
  /** The door they signed in through, not the list of things they may do. */
  identityType: 'SELLER' | 'BUYER'
  identityId: string
  email: string
  fullName: string | null
  expiresAt: string
  /**
   * Every identity the address owns, which is what the real backend resolves and
   * what the handlers below authorise against. One email can hold both halves of
   * an account, so these are two questions and not one - see
   * identity/AccountIdentities.java.
   */
  buyerIdentityId: string | null
  sellerId: string | null
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Stands in for the mp_session cookie: what GET /sessions/current answers with.
 * Verify sets it, sign-out clears it, and a test that wants an already-signed-in
 * seller sets it with signInSellerSession - the mock equivalent of arriving with
 * a valid cookie. Without it the mock API answers 401, which is exactly what the
 * real one does for a stale localStorage flag and no cookie.
 */
let currentSession: SessionIdentityFixture | null = null

export function currentSessionIdentity(): SessionIdentityFixture | null {
  return currentSession
}

export function signInSellerSession(identity: {
  sellerId: string
  email: string
  /**
   * Set false for a SELLER-ONLY session: one whose address has no buyer_identity row.
   * A sign-in cannot produce that any more - verify ensures the row - so it stands for
   * a session minted before it did, which is the only state in which a signed-in
   * person is not a buyer. The screens still have to answer for it.
   */
  withBuyerIdentity?: boolean
}): SessionIdentityFixture {
  sellerIdsByEmail.set(identity.email, identity.sellerId)
  // Verifying as a seller ensures the buyer half too, exactly as
  // SellerAuthService.verify does: a seller is a person and people buy things, and
  // without the row their own My Orders would answer 403 rather than "nothing yet".
  if (identity.withBuyerIdentity === false) {
    buyerIdsByEmail.delete(identity.email)
  } else if (!buyerIdsByEmail.has(identity.email)) {
    buyerIdsByEmail.set(identity.email, crypto.randomUUID())
  }
  currentSession = {
    identityType: 'SELLER',
    identityId: identity.sellerId,
    email: identity.email,
    fullName: null,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    buyerIdentityId: buyerIdsByEmail.get(identity.email) ?? null,
    sellerId: identity.sellerId,
  }
  return currentSession
}

/**
 * A signed-in BUYER, which is what a review needs. Same mock cookie as the seller
 * one - the real system uses one session table and one cookie.
 *
 * The seller half is carried too WHERE THE ADDRESS ALREADY HAS ONE, which is the
 * real join: a buyer sign-in never mints a seller row (selling is opted into, not
 * granted by signing in), but signing in on an address that already sells resolves
 * both. Pass `sellerId` to set that up explicitly.
 */
export function signInBuyerSession(identity: {
  buyerIdentityId: string
  email: string
  fullName?: string | null
  sellerId?: string
}): SessionIdentityFixture {
  buyerIdsByEmail.set(identity.email, identity.buyerIdentityId)
  if (identity.sellerId) sellerIdsByEmail.set(identity.email, identity.sellerId)
  currentSession = {
    identityType: 'BUYER',
    identityId: identity.buyerIdentityId,
    email: identity.email,
    fullName: identity.fullName ?? null,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    buyerIdentityId: identity.buyerIdentityId,
    sellerId: sellerIdsByEmail.get(identity.email) ?? null,
  }
  return currentSession
}

export function clearSellerSession() {
  currentSession = null
  sellerIdsByEmail.clear()
  buyerIdsByEmail.clear()
  demoEmail = null
}

/**
 * The address the mock treats as the demo account, mirroring the backend's
 * DEMO_EMAIL / identity.DemoAccount. Mutable so a test can turn the behaviour on for
 * itself and off again, which is also how the mock stays faithful to "unset by
 * default, so there is no demo address at all".
 */
let demoEmail: string | null = null

export function setDemoEmail(email: string | null) {
  demoEmail = email == null ? null : email.trim().toLowerCase()
}

/**
 * The token to put in a magic-link response: the real one for the demo address, null
 * for everybody else - the exact shape the backend answers with, and an EXACT address
 * match, never a domain or a pattern.
 */
export function demoTokenFor(email: string, token: string): string | null {
  return demoEmail !== null && demoEmail === email.trim().toLowerCase() ? token : null
}

export function issueMagicLinkToken(email: string): string {
  const token = `mock-token-${crypto.randomUUID()}`
  issuedMagicLinkTokens.set(token, email)
  return token
}

export function consumeMagicLinkToken(token: string): { sellerId: string; email: string } | null {
  const email = issuedMagicLinkTokens.get(token)
  if (!email) return null
  issuedMagicLinkTokens.delete(token)

  let sellerId = sellerIdsByEmail.get(email)
  if (!sellerId) {
    sellerId = crypto.randomUUID()
    sellerIdsByEmail.set(email, sellerId)
  }
  // Consuming the token is what establishes the session on the real backend too
  // (it sets the cookie), so the mock's "cookie" starts existing here.
  signInSellerSession({ sellerId, email })
  return { sellerId, email }
}
