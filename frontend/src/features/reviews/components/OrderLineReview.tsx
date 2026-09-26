import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { apiErrorMessage } from '@/lib/api/transient'
import { formatMediumDate } from '@/lib/formatDate'

import { useCreateReview, useUpdateReview, type Review } from '../api/useReviews'
import { RatingStars } from './RatingStars'

/** The design's limit for the inline editor, and what the counter counts against. */
const MAX_BODY = 500

/**
 * One product's review, inline inside an expanded order: idle (a star row and a
 * hint), editing (textarea, submit, cancel, counter) or published (the text and
 * Edit review).
 *
 * There is no "reviewed" flag on an order line, so whether this line has been
 * reviewed comes from `existingReview` - the eligibility answer for this product,
 * fetched by the section above. It is also where the id an edit needs comes from.
 */
export function OrderLineReview({
  orderLineId,
  productTitle,
  existingReview,
}: {
  /**
   * This order's line, not the one eligibility names. The server derives the product
   * from the line, and this is the purchase the block is sitting under.
   */
  orderLineId: string
  productTitle: string
  existingReview: Review | null
}) {
  // A draft is what "editing" means: null is idle or published, depending on
  // whether a review already exists. Opened by picking a star or by Edit review,
  // and closed by the mutation succeeding or by Cancel - never by an effect.
  const [draft, setDraft] = useState<{ rating: number; body: string } | null>(null)
  // What this card just wrote. The eligibility answer it came from is invalidated
  // by the write and takes a round trip to come back, and without this the card
  // would drop through "Not rated · pick a rating" on the way to showing it.
  const [written, setWritten] = useState<Review | null>(null)
  const create = useCreateReview()
  const update = useUpdateReview()

  const published = written ?? existingReview
  const pending = create.isPending || update.isPending
  const failure = create.isError ? create.error : update.isError ? update.error : null
  const rating = draft?.rating ?? published?.rating ?? 0

  function pickRating(value: number) {
    setDraft((current) => ({ rating: value, body: current?.body ?? published?.body ?? '' }))
  }

  function close() {
    setDraft(null)
    // Otherwise a refusal from the last attempt outlives the editor that caused it.
    create.reset()
    update.reset()
  }

  function submit() {
    if (!draft || draft.rating === 0) return
    const done = {
      onSuccess: (review: Review) => {
        setWritten(review)
        setDraft(null)
      },
    }
    if (published) {
      update.mutate({ reviewId: published.id, rating: draft.rating, body: draft.body }, done)
    } else {
      create.mutate({ orderLineId, rating: draft.rating, body: draft.body }, done)
    }
  }

  return (
    <div className="rounded-[10px] border bg-background p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <p className="min-w-0 flex-1 basis-[200px] text-sm font-semibold text-pretty">
          {productTitle}
        </p>
        <div className="flex items-center">
          <RatingStars
            name={`review-rating-${orderLineId}`}
            legend={`Your rating of ${productTitle}`}
            legendClassName="sr-only"
            value={rating}
            onChange={pickRating}
            className="flex items-center gap-0.5"
            starClassName="size-5 text-primary"
            offStarClassName="text-[#d4d4d4]"
          />
          <span className="ml-1.5 text-[13px] whitespace-nowrap text-muted-foreground">
            {rating ? `${rating} of 5` : 'Not rated'}
          </span>
        </div>
      </div>

      {!draft && !published && (
        <p className="mt-2 text-[13px] text-muted-foreground">Pick a rating to write a review.</p>
      )}

      {draft && (
        <div className="mt-2.5">
          <Textarea
            rows={3}
            value={draft.body}
            maxLength={MAX_BODY}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            aria-label={`Your review of ${productTitle}`}
            placeholder="What stood out — sound, fit, build, value?"
            className="field-sizing-fixed min-h-0 resize-y px-3 py-2.5 text-sm leading-[1.55]"
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={submit}
              disabled={pending}
              className="h-auto rounded-full px-[18px] py-[9px] text-[13px]"
            >
              {published ? 'Update review' : 'Post review'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              className="h-auto rounded-full px-4 py-[9px] text-[13px] hover:border-primary hover:bg-background hover:text-primary"
            >
              Cancel
            </Button>
            <p className="text-xs text-muted-foreground">
              {draft.body.length}/{MAX_BODY}
            </p>
          </div>
        </div>
      )}

      {!draft && published && (
        <div className="mt-2.5">
          {published.body && (
            <p className="text-sm leading-[1.6] text-[#333333] text-pretty">{published.body}</p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            {/* "Posted", never "Updated": a Review carries only createdAt, so an
                edited one has no date of its own to print. */}
            <p className="text-xs text-muted-foreground">
              Posted {formatMediumDate(published.createdAt)}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDraft({ rating: published.rating, body: published.body ?? '' })}
              className="h-auto rounded-full px-3.5 py-[7px] text-[13px] hover:border-primary hover:bg-background hover:text-primary"
            >
              Edit review
            </Button>
          </div>
        </div>
      )}

      {failure && (
        <p role="alert" className="mt-2.5 text-[13px] text-destructive">
          {apiErrorMessage(failure)}
        </p>
      )}
    </div>
  )
}
