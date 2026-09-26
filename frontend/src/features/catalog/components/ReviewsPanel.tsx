import { Star } from 'lucide-react'
import { Link } from 'react-router'
import { useState } from 'react'

import { Avatar } from '@/components/Avatar'
import { displayNameFor } from '@/lib/displayName'
import { Button } from '@/components/ui/button'
import { useProductReviews, useReviewEligibility } from '@/features/reviews/api/useReviews'
import { ReviewForm } from '@/features/reviews/components/ReviewForm'
import { useSession } from '@/features/session/api/useSession'


function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function ReviewsPanel({
  productSlug,
  averageRating,
  reviewCount,
}: {
  /** Reviews are addressed by the product's slug, like the product itself. */
  productSlug: string
  averageRating: number | null
  reviewCount: number
}) {
  const [page, setPage] = useState(0)
  // Survives the eligibility answer flipping to ALREADY_REVIEWED, which is what
  // publishing causes - so the buyer sees a confirmation of what they just did rather
  // than being told they had already done it.
  const [justPublished, setJustPublished] = useState(false)
  const query = useProductReviews(productSlug, page, true)
  const session = useSession()

  // Only a signed-in buyer can review, so only for them is the question worth
  // asking - for anyone else there is no form to offer and no request to make.
  const isBuyer = session.data?.identityType === 'BUYER'
  const eligibility = useReviewEligibility(productSlug, isBuyer)

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

      {/* Three states, and each says something different: sign in, buy it first, or
          here is the form. A visitor who can't review is told why rather than shown a
          form that would be refused. */}
      {!session.isPending && !isBuyer && (
        <p className="mb-5 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          <Link to="/sign-in" className="font-semibold text-foreground underline">
            Sign in
          </Link>{' '}
          to review something you've bought.
        </p>
      )}

      {justPublished && (
        <p role="status" className="mb-5 rounded-lg border bg-muted/40 p-4 text-sm">
          Thanks — your review is published.
        </p>
      )}

      {!justPublished && isBuyer && eligibility.data?.eligible && eligibility.data.orderLineId && (
        <ReviewForm
          orderLineId={eligibility.data.orderLineId}
          onPublished={() => setJustPublished(true)}
        />
      )}

      {!justPublished && isBuyer && eligibility.data?.reason === 'NOT_PURCHASED' && (
        <p className="mb-5 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          Only buyers can review this product.
        </p>
      )}

      {!justPublished && isBuyer && eligibility.data?.reason === 'ALREADY_REVIEWED' && (
        <p className="mb-5 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          You've already reviewed this product.
        </p>
      )}

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
                <Avatar name={review.reviewerName} size="sm" />
                <span className="text-sm font-bold">{displayNameFor(review.reviewerName)}</span>
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
