import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { apiErrorMessage } from '@/lib/api/transient'

import { useCreateReview } from '../api/useReviews'
import { RatingStars } from './RatingStars'

/**
 * Writing a review. Only rendered when the server has said this buyer may - the
 * purchase check lives there, and this form is what a positive answer unlocks.
 */
export function ReviewForm({
  orderLineId,
  onPublished,
}: {
  orderLineId: string
  /**
   * Called once the review is written. The confirmation lives in the panel, not here:
   * publishing makes this buyer ineligible, so the panel re-renders without the form
   * - and a "thanks" message owned by the form would vanish with it.
   */
  onPublished: () => void
}) {
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const create = useCreateReview()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (rating === 0) return
    create.mutate({ orderLineId, rating, body }, { onSuccess: onPublished })
  }

  return (
    <form onSubmit={submit} className="mb-5 flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-bold">Write a review</h3>

      <RatingStars
        name="rating"
        legend="Your rating"
        legendClassName="mb-1.5 text-sm text-muted-foreground"
        value={rating}
        onChange={setRating}
        className="flex items-center gap-1"
        starClassName="size-6 text-[#ffc53d]"
      />

      <div>
        <label htmlFor="review-body" className="mb-1.5 block text-sm font-medium">
          Your review <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="review-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          maxLength={4000}
          className="w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="What did you think?"
        />
      </div>

      {create.isError && (
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(create.error)}
        </p>
      )}

      <Button type="submit" className="w-fit" disabled={rating === 0 || create.isPending}>
        {create.isPending ? 'Publishing…' : 'Publish review'}
      </Button>
    </form>
  )
}
