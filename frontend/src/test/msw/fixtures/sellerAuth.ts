// In-memory mock state for the seller magic-link flow. Not a database - just
// enough bookkeeping for MSW to behave like the real backend (issue a random
// token, accept it exactly once) while giving tests a way to "read the
// email" without a real inbox: import issuedMagicLinkTokens and look up the
// token by email, exactly like the backend test captures the EmailSender call.
export const issuedMagicLinkTokens = new Map<string, string>() // token -> email
const sellerIdsByEmail = new Map<string, string>()

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
  return { sellerId, email }
}
