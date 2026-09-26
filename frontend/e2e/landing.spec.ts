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

// The header's delivery picker is a country from GET /countries now, not one of
// a handful of hardcoded cities, and the dev server has no backend behind it -
// so this covers the control being present and labelled, and leaves the
// selection itself to SiteHeader.test.tsx where the list is mocked.
test('header offers a delivery country picker', async ({ page }) => {
  await page.goto('/')
  const picker = page.getByRole('combobox', { name: 'Delivery country' })
  await expect(picker).toBeVisible()
  await expect(picker).toContainText('Select a country')
})
