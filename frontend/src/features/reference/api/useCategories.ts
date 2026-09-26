import { useQuery } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

export type Category = components['schemas']['Category']

export const categoryKeys = {
  all: ['categories'] as const,
}

/**
 * The system category list - the single source for the seller's selector, the
 * search filter and the buyer-facing category navigation.
 *
 * Fetched once and held for the session. It is a dozen rows that change about
 * never, so a long staleTime turns what used to be several derived lookups (search
 * results were sampled to guess the category list) into one request for the whole
 * visit. The selector filters this cached list in memory rather than asking the
 * server per keystroke.
 */
export function useCategories() {
  return useQuery<Category[], ProblemDetail>({
    queryKey: categoryKeys.all,
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/categories', { signal })
      if (error) throw error
      return data
    },
    staleTime: 60 * 60 * 1000,
  })
}

/**
 * Case-insensitive substring match on the display name, plus the slug so that
 * typing "home-garden" finds "Home & Garden". Exported separately from the hook so
 * the filtering is testable without rendering anything.
 */
export function filterCategories(categories: Category[], query: string): Category[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return categories
  return categories.filter(
    (category) =>
      category.name.toLowerCase().includes(needle) || category.slug.includes(needle),
  )
}

/** The display name for a slug, falling back to the slug itself if it's unknown. */
export function categoryName(categories: Category[], slug: string): string {
  return categories.find((category) => category.slug === slug)?.name ?? slug
}
