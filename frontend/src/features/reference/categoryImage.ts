/**
 * The artwork for a category, looked up by the server's own slug.
 *
 * This is the only place in the frontend that knows anything category-specific,
 * and it deliberately holds no list of categories. The map is built from the
 * filenames in assets/categories at build time, so adding a category's artwork
 * means dropping `<slug>.webp` in that folder and nothing else - there is no
 * second roster of categories here to drift out of step with the database.
 *
 * Which categories exist, what they are called and what order they appear in all
 * stay the server's answer (GET /categories). This only answers "is there a
 * picture for this slug", and `null` is a perfectly good answer: the rail falls
 * back rather than breaking, so a category added tomorrow renders today.
 */
const IMAGES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../../assets/categories/*.webp', {
      eager: true,
      import: 'default',
      query: '?url',
    }),
  ).map(([path, url]) => [path.split('/').pop()!.replace(/\.webp$/, ''), url]),
)

/** The image URL for a category slug, or null when none has been drawn yet. */
export function categoryImage(slug: string): string | null {
  return IMAGES[slug] ?? null
}

/** Which slugs have artwork. Exported for tests; nothing renders from it. */
export function categoryImageSlugs(): string[] {
  return Object.keys(IMAGES).sort()
}
