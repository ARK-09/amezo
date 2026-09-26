/**
 * Turning an identity into something fit to show.
 *
 * A file of its own rather than living beside the Avatar component: these are plain
 * string helpers with their own tests, and several places need the name without the
 * avatar (a review's byline, the header's label).
 */

/**
 * Two initials from a name, one word's first two letters from a single word, and for
 * an email the local part only - "ada.lovelace@example.com" reads as AL, never A@.
 */
export function initialsFor(nameOrEmail: string): string {
  const source = nameOrEmail.includes('@') ? nameOrEmail.split('@')[0] : nameOrEmail
  const words = source.split(/[\s._-]+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/**
 * A name fit to show. An email is trimmed to its local part with separators turned
 * into spaces, because a buyer who signed in with a magic link has no name on record
 * yet and "Ada Lovelace" beats the whole address on a review.
 */
export function displayNameFor(nameOrEmail: string | null | undefined): string {
  if (!nameOrEmail) return 'Anonymous'
  if (!nameOrEmail.includes('@')) return nameOrEmail
  return nameOrEmail
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}
