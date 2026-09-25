import { expect, test } from '@playwright/test'

// The dev server runs without MSW and without a backend, so these cover the
// chrome and routing only - rails, the hero carousel and the storefront are
// asserted in the unit tests, where the catalog is mocked.
test('landing page is served at the root', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Amezo')
  await expect(page.getByRole('contentinfo')).toContainText('Amezo')
})

test('banner search hands off to the search page', async ({ page }) => {
  await page.goto('/')
  const banner = page.getByRole('search', { name: 'Catalog search' })
  await banner.getByLabel('Search every seller').fill('laptop')
  await banner.getByRole('button', { name: 'Search' }).click()
  await expect(page).toHaveURL(/\/search\?q=laptop$/)
})

test('header search is available on a non-search page', async ({ page }) => {
  await page.goto('/checkout')
  await page.getByPlaceholder('Search products').fill('keyboard')
  await page.getByRole('search', { name: 'Site search' }).getByRole('button', { name: 'Search' }).click()
  await expect(page).toHaveURL(/\/search\?q=keyboard$/)
})

test('delivery city persists across a reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Deliver to Dubai/ }).click()
  await page.getByRole('option', { name: 'Doha' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: /Deliver to Doha/ })).toBeVisible()
})
