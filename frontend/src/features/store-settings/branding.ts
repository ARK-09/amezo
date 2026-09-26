/**
 * The rules the Branding section advertises, kept next to each other so the
 * hint under the drop-zone and the check that enforces it cannot drift apart.
 */

/** "up to 5 MB", as the hint puts it. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * The hint promises "JPG or PNG". The endpoint itself takes any image/*, but a
 * rejection the browser can make is one the seller does not wait for - and
 * accepting a format the hint never offered would make the hint a lie.
 */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png']
export const ACCEPTED_IMAGE_ACCEPT = ACCEPTED_IMAGE_TYPES.join(',')

/** Why this file cannot be uploaded, or null when it can. */
export function rejectionFor(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return `${file.name} is not a JPG or PNG.`
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const size = (file.size / 1024 / 1024).toFixed(1)
    return `${file.name} is ${size} MB — the limit is 5 MB.`
  }
  return null
}

/** The logo's fallback: up to two initials, so an empty circle still reads as the store. */
export function initialsFrom(name: string): string {
  return (name.trim() || 'Store')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}
