import { describe, expect, it } from 'vitest'

import { errorSentence, mapProblem } from './productFormErrors'
import type { ProblemDetail } from '@/lib/api/client'

function problem(overrides: Partial<ProblemDetail>): ProblemDetail {
  return {
    type: 'https://api/errors/validation-error',
    title: 'Unprocessable Entity',
    status: 422,
    ...overrides,
  }
}

describe('mapProblem', () => {
  it('puts a product field error on that field, named', () => {
    const mapped = mapProblem(problem({ errors: [{ field: 'title', reason: 'must not be blank' }] }))

    expect(mapped.fields).toEqual([{ path: 'title', message: 'Title must not be blank.' }])
    expect(mapped.message).toBeNull()
  })

  it('reaches the category control whether the API calls it category or categorySlug', () => {
    expect(
      mapProblem(problem({ errors: [{ field: 'categorySlug', reason: 'is not a live category' }] }))
        .fields,
    ).toEqual([{ path: 'categorySlug', message: 'Category is not a live category.' }])

    expect(
      mapProblem(problem({ errors: [{ field: 'category', reason: 'is not a live category' }] }))
        .fields,
    ).toEqual([{ path: 'categorySlug', message: 'Category is not a live category.' }])
  })

  it('reads the row out of a nested variant path', () => {
    expect(
      mapProblem(problem({ errors: [{ field: 'variants[1].price', reason: 'must be greater than 0' }] }))
        .fields,
    ).toEqual([{ path: 'variants.1.price', message: 'Price must be greater than 0.' }])
  })

  it('accepts the dotted spelling of the same path', () => {
    expect(
      mapProblem(problem({ errors: [{ field: 'variants.2.sku', reason: 'must not be blank' }] })).fields,
    ).toEqual([{ path: 'variants.2.sku', message: 'SKU must not be blank.' }])
  })

  it('puts a bare variant field on the row the request was for', () => {
    expect(
      mapProblem(problem({ errors: [{ field: 'stockQty', reason: 'must not be negative' }] }), {
        variantIndex: 3,
      }).fields,
    ).toEqual([{ path: 'variants.3.stockQty', message: 'Stock must not be negative.' }])
  })

  it('leaves a field it cannot place as prose rather than dropping it', () => {
    const mapped = mapProblem(problem({ errors: [{ field: 'somethingElse', reason: 'is wrong' }] }))

    expect(mapped.fields).toEqual([])
    expect(mapped.message).toBe('somethingElse is wrong.')
  })

  it('does not double up punctuation the API already wrote', () => {
    expect(
      mapProblem(problem({ errors: [{ field: 'title', reason: 'Pick a shorter title.' }] })).fields[0]
        .message,
    ).toBe('Title Pick a shorter title.')
  })

  it('falls back to the API sentence when nothing is field-shaped', () => {
    expect(
      mapProblem(
        problem({ status: 409, title: 'Conflict', detail: 'That listing is already archived.' }),
      ),
    ).toEqual({ fields: [], message: 'That listing is already archived.' })
  })

  it('uses the status phrase only when there is no detail', () => {
    expect(mapProblem(problem({ status: 500, title: 'Server Error', detail: undefined })).message).toBe(
      'Server Error',
    )
  })

  it('puts a taken SKU on the row that tried to use it', () => {
    const mapped = mapProblem(
      {
        type: 'https://api/errors/sku-taken',
        title: 'SKU already in use',
        status: 409,
        detail: 'SKU AUR-1 belongs to another variant',
      },
      { variantIndex: 1 },
    )

    expect(mapped.fields).toEqual([
      { path: 'variants.1.sku', message: 'SKU AUR-1 belongs to another variant' },
    ])
  })

  it('cannot place a taken SKU when it does not know which row asked', () => {
    const mapped = mapProblem({
      type: 'https://api/errors/sku-taken',
      title: 'SKU already in use',
      status: 409,
      detail: 'SKU AUR-1 belongs to another variant',
    })

    expect(mapped.fields).toEqual([])
    expect(mapped.message).toBe('SKU AUR-1 belongs to another variant')
  })
})

describe('errorSentence', () => {
  it('reads a ProblemDetail', () => {
    expect(errorSentence(problem({ detail: 'Too many images.' }))).toBe('Too many images.')
  })

  it('reads a plain Error, which is what a failed PUT to storage throws', () => {
    expect(errorSentence(new Error('Image upload to storage failed (500)'))).toBe(
      'Image upload to storage failed (500)',
    )
  })

  it('has something to say about a thrown value that is neither', () => {
    expect(errorSentence('nope')).toBe('Something went wrong.')
  })
})
