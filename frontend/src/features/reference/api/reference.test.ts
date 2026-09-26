import { describe, expect, it } from 'vitest'

import { categoryName, filterCategories } from './useCategories'
import { countryName, filterCountries } from './useCountries'

const CATEGORIES = [
  { slug: 'electronics', name: 'Electronics' },
  { slug: 'apparel', name: 'Apparel' },
  { slug: 'home-garden', name: 'Home & Garden' },
  { slug: 'kitchen', name: 'Kitchen' },
]

const COUNTRIES = [
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
]

describe('category search', () => {
  it('returns everything for an empty query', () => {
    expect(filterCategories(CATEGORIES, '')).toEqual(CATEGORIES)
    expect(filterCategories(CATEGORIES, '   ')).toEqual(CATEGORIES)
  })

  it('matches part of a name, ignoring case', () => {
    expect(filterCategories(CATEGORIES, 'kitc')).toEqual([{ slug: 'kitchen', name: 'Kitchen' }])
    expect(filterCategories(CATEGORIES, 'ELECTRO')).toEqual([
      { slug: 'electronics', name: 'Electronics' },
    ])
  })

  it('matches in the middle of a name, not just the start', () => {
    expect(filterCategories(CATEGORIES, 'garden')).toEqual([
      { slug: 'home-garden', name: 'Home & Garden' },
    ])
  })

  /**
   * Someone who knows the slug - from a URL they were sent - should find the category
   * by typing it, even though the name has an ampersand in it.
   */
  it('matches the slug too', () => {
    expect(filterCategories(CATEGORIES, 'home-garden')).toEqual([
      { slug: 'home-garden', name: 'Home & Garden' },
    ])
  })

  it('returns nothing for a query that matches nothing', () => {
    expect(filterCategories(CATEGORIES, 'zzz')).toEqual([])
  })

  it('resolves a slug to its display name, and falls back to the slug', () => {
    expect(categoryName(CATEGORIES, 'kitchen')).toBe('Kitchen')
    // A product filed under a category that has since been retired still shows
    // something rather than a blank.
    expect(categoryName(CATEGORIES, 'discontinued')).toBe('discontinued')
  })
})

describe('country search', () => {
  it('returns everything for an empty query', () => {
    expect(filterCountries(COUNTRIES, '')).toEqual(COUNTRIES)
  })

  it('matches part of a name, ignoring case', () => {
    expect(filterCountries(COUNTRIES, 'united').map((c) => c.code)).toEqual(['AE', 'GB', 'US'])
    expect(filterCountries(COUNTRIES, 'KINGDOM').map((c) => c.code)).toEqual(['GB'])
  })

  /**
   * A two-letter query is compared against the code from the START, not anywhere
   * inside a name: typing "in" should find India and Indonesia, and must not drag in
   * every country whose name merely contains those letters ("United Kingdom").
   */
  it('matches a code from the start rather than letters inside a name', () => {
    expect(filterCountries(COUNTRIES, 'in').map((c) => c.code)).toEqual(['IN', 'ID'])
    expect(filterCountries(COUNTRIES, 'gb').map((c) => c.code)).toEqual(['GB'])
  })

  /** "UK" is not an ISO code, so it finds nothing - as it should. */
  it('finds nothing for UK, because the code is GB', () => {
    expect(filterCountries(COUNTRIES, 'uk')).toEqual([])
  })

  it('resolves a code to its name, and falls back to the code', () => {
    expect(countryName(COUNTRIES, 'GB')).toBe('United Kingdom')
    expect(countryName(COUNTRIES, 'ZZ')).toBe('ZZ')
  })
})
