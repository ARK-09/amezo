import { useQuery } from '@tanstack/react-query'

import { apiClient, type ProblemDetail } from '@/lib/api/client'
import type { components } from '@/lib/api/schema'

export type SellerMetrics = components['schemas']['SellerMetrics']
export type MetricPoint = components['schemas']['MetricPoint']
export type MetricTotals = components['schemas']['MetricTotals']
export type TopProduct = components['schemas']['TopProduct']
export type CategoryShare = components['schemas']['CategoryShare']

export interface MetricsRange {
  from: string
  to: string
}

export const metricsKeys = {
  all: ['seller', 'metrics'] as const,
  summary: (range: MetricsRange) => [...metricsKeys.all, 'summary', range] as const,
  topProducts: (range: MetricsRange) => [...metricsKeys.all, 'top-products', range] as const,
  categories: (range: MetricsRange) => [...metricsKeys.all, 'categories', range] as const,
}

export function useSellerMetrics(range: MetricsRange) {
  return useQuery<SellerMetrics, ProblemDetail>({
    queryKey: metricsKeys.summary(range),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/sellers/me/metrics', {
        signal,
        params: { query: { from: range.from, to: range.to, interval: 'day' } },
      })
      if (error) throw error
      return data
    },
  })
}

export function useSellerTopProducts(range: MetricsRange, limit = 5) {
  return useQuery<TopProduct[], ProblemDetail>({
    queryKey: [...metricsKeys.topProducts(range), limit],
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/sellers/me/metrics/top-products', {
        signal,
        params: { query: { from: range.from, to: range.to, limit } },
      })
      if (error) throw error
      return data
    },
  })
}

export function useSellerCategoryBreakdown(range: MetricsRange) {
  return useQuery<CategoryShare[], ProblemDetail>({
    queryKey: metricsKeys.categories(range),
    queryFn: async ({ signal }) => {
      const { data, error } = await apiClient.GET('/api/v1/sellers/me/metrics/category-breakdown', {
        signal,
        params: { query: { from: range.from, to: range.to } },
      })
      if (error) throw error
      return data
    },
  })
}
