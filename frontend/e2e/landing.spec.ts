import { expect, test } from '@playwright/test'

// The dev server runs without MSW and without a backend, so these cover the
// chrome and routing only - product rails are asserted in the unit tests,
// where the catalog is mocked.
test('landing page is served at the root', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Everything you need')
  await expect(page.getByRole('contentinfo')).toContainText('All rights reserved')
})

test('hero search hands off to the search page', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Search the marketplace').fill('laptop')
  await page.getByRole('search', { name: 'Marketplace search' }).getByRole('button').click()
  await expect(page).toHaveURL(/\/search\?q=laptop$/)
})

test('header search is available on a non-search page', async ({ page }) => {
  await page.goto('/checkout')
  await page.getByPlaceholder('Search products').fill('keyboard')
  await page.getByRole('search', { name: 'Site search' }).getByRole('button', { name: 'Search' }).click()
  await expect(page).toHaveURL(/\/search\?q=keyboard$/)
})
