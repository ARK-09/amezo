import { Star } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

import { useProductReviews } from '../api/useProductReviews'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function ReviewsPanel({
  productId,
  averageRating,
  reviewCount,
}: {
  productId: string
  averageRating: number | null
  reviewCount: number
}) {
  const [page, setPage] = useState(0)
  const query = useProductReviews(productId, page, true)

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start gap-8 rounded-lg border p-5">
        <div className="min-w-[116px]">
          <div className="text-4xl font-bold">{averageRating?.toFixed(1) ?? '—'}</div>
          <div className="my-1.5 flex gap-0.5 text-[#ffc53d]">
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className="size-3.5"
                fill={averageRating != null && i < Math.round(averageRating) ? 'currentColor' : 'none'}
              />
            ))}
          </div>
          <div className="text-xs text-muted-foreground">{reviewCount} reviews</div>
        </div>
      </div>

      {query.isLoading && <p className="text-sm text-muted-foreground">Loading reviews…</p>}

      {query.isError && (
        <p className="text-sm text-muted-foreground">Couldn't load reviews. Try again later.</p>
      )}

      {query.isSuccess && query.data.content.length === 0 && (
        <p className="text-sm text-muted-foreground">No reviews yet.</p>
      )}

      {query.isSuccess && query.data.content.length > 0 && (
        <div className="flex flex-col">
          {query.data.content.map((review) => (
            <div key={review.id} className="border-b py-4.5">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <span className="size-8 shrink-0 rounded-full bg-muted" aria-hidden />
                <span className="text-sm font-bold">{review.reviewerFirstName}</span>
                <span className="flex gap-0.5 text-[#ffc53d]">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} className="size-3" fill={i < review.rating ? 'currentColor' : 'none'} />
                  ))}
                </span>
                <span className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</span>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  {review.variantLabel}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{review.body}</p>
            </div>
          ))}

          {query.data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {query.data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= query.data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
