import { expect, test } from '@playwright/test'

test('search results page loads', async ({ page }) => {
  await page.goto('/search')
  await expect(page.getByPlaceholder('Search products')).toBeVisible()
  await expect(page.getByText('Filter')).toBeVisible()
})
