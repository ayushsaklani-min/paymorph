import { expect, test } from '@playwright/test';

test('shows the evidence-first testnet product promise', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Payment clarity/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /One payment. Four proofs./i })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('no real monetary value');
});

test('takes the merchant from the landing page to wallet sign-in', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Create a test invoice/i }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: /Welcome to the console/i })).toBeVisible();
  await expect(page.getByText(/never asks for your private key/i)).toBeVisible();
});
