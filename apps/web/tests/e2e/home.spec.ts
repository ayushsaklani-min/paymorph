import { expect, test } from '@playwright/test';

test('shows the evidence-first testnet product promise', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Payment clarity/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /One payment. Four proofs./i })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('no real monetary value');
  await expect(page.getByLabel('Public community payment reports')).toContainText(
    'Community report',
  );
  await expect(page.getByLabel('Public community payment reports')).toContainText(
    'PayMorph response',
  );
  await expect(
    page
      .getByLabel('Public-chain protocol facts')
      .getByRole('link', { name: /Source: XRPL Ledger Structure/i }),
  ).toHaveAttribute('href', 'https://xrpl.org/docs/concepts/ledgers/ledger-structure');
});

test('takes the merchant from the landing page to wallet sign-in', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Create a test invoice/i }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: /Welcome to the console/i })).toBeVisible();
  await expect(page.getByText(/never asks for your private key/i)).toBeVisible();
});

test('offers a keyboard path that skips directly to the primary content landmark', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('main')).toHaveAttribute('id', 'main-content');

  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skipLink).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
});
