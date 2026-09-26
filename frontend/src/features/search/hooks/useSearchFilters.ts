import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import type { SearchFilters, SortOption } from '../schema/types'
import { DEFAULT_FILTERS } from '../schema/types'

/**
 * ?page=abc, ?page=-5 and ?page=1.7 used to reach the request as NaN or as an
 * offset that answers with nothing. A page number is a whole one, zero or
 * above, or it is 0 - the same reading the seller and buyer lists give it.
 */
function pageParam(raw: string | null) {
  const parsed = Number(raw ?? 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : DEFAULT_FILTERS.page
}

function parseFilters(params: URLSearchParams): SearchFilters {
  const priceMin = params.get('priceMin')
  const priceMax = params.get('priceMax')
  const page = params.get('page')
  const sort = params.get('sort')

  return {
    q: params.get('q') ?? DEFAULT_FILTERS.q,
    category: params.get('category') ?? DEFAULT_FILTERS.category,
    priceMin: priceMin ? Number(priceMin) : undefined,
    priceMax: priceMax ? Number(priceMax) : undefined,
    inStockOnly: params.get('inStockOnly') === 'true',
    sort: (sort as SortOption | null) ?? DEFAULT_FILTERS.sort,
    page: pageParam(page),
  }
}

function toParams(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.category) params.set('category', filters.category)
  if (filters.priceMin !== undefined) params.set('priceMin', String(filters.priceMin))
  if (filters.priceMax !== undefined) params.set('priceMax', String(filters.priceMax))
  if (filters.inStockOnly) params.set('inStockOnly', 'true')
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set('sort', filters.sort)
  if (filters.page > 0) params.set('page', String(filters.page))
  return params
}

export function useSearchFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo(() => parseFilters(searchParams), [searchParams])

  const update = useCallback(
    (patch: Partial<SearchFilters>, opts: { resetPage?: boolean } = {}) => {
      const next: SearchFilters = {
        ...filters,
        ...patch,
        page: opts.resetPage === false ? (patch.page ?? filters.page) : 0,
      }
      setSearchParams(toParams(next))
    },
    [filters, setSearchParams],
  )

  const setPage = useCallback(
    (page: number) => update({ page }, { resetPage: false }),
    [update],
  )

  const removeFilter = useCallback(
    (key: 'q' | 'category' | 'price' | 'inStockOnly') => {
      if (key === 'price') {
        update({ priceMin: undefined, priceMax: undefined })
      } else if (key === 'inStockOnly') {
        update({ inStockOnly: false })
      } else {
        update({ [key]: '' })
      }
    },
    [update],
  )

  const clearAll = useCallback(() => setSearchParams(new URLSearchParams()), [setSearchParams])

  return { filters, update, setPage, removeFilter, clearAll }
}
