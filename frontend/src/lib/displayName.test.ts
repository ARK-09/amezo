import { describe, expect, it } from 'vitest'

import { displayNameFor, initialsFor } from './displayName'

describe('initialsFor', () => {
  it('takes the first and last word of a name', () => {
    expect(initialsFor('Ada Lovelace')).toBe('AL')
    expect(initialsFor('Ada Byron King Lovelace')).toBe('AL')
  })

  it('takes two letters from a single word', () => {
    expect(initialsFor('Ada')).toBe('AD')
  })

  /** An email's domain is nobody's initials - "AL", never "A@". */
  it('uses only the local part of an email', () => {
    expect(initialsFor('ada.lovelace@example.com')).toBe('AL')
    expect(initialsFor('ada_lovelace@example.com')).toBe('AL')
    expect(initialsFor('ada-lovelace@example.com')).toBe('AL')
    expect(initialsFor('ada@example.com')).toBe('AD')
  })

  it('never renders empty', () => {
    expect(initialsFor('')).toBe('?')
    expect(initialsFor('  ')).toBe('?')
  })
})

describe('displayNameFor', () => {
  it('leaves a real name alone', () => {
    expect(displayNameFor('Ada Lovelace')).toBe('Ada Lovelace')
  })

  /**
   * A buyer who signed in with a magic link has no name on record yet, so their
   * identity carries the email. Showing "Ada Lovelace" beats showing the address.
   */
  it('turns an email into a readable name', () => {
    expect(displayNameFor('ada.lovelace@example.com')).toBe('Ada Lovelace')
    expect(displayNameFor('ada@example.com')).toBe('Ada')
  })

  it('falls back for a missing name', () => {
    expect(displayNameFor(null)).toBe('Anonymous')
    expect(displayNameFor(undefined)).toBe('Anonymous')
  })
})
