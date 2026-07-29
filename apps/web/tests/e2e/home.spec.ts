import { expect, test } from '@playwright/test';

test('shows the testnet product promise', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Pay in XRP/i })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('no real monetary value');
});
