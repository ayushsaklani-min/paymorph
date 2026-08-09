import { expect, test } from '@playwright/test';

test('shows the evidence-first testnet product promise', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'Loading PayMorph' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading PayMorph' })).toBeHidden({
    timeout: 5_000,
  });
  await expect(page.getByRole('heading', { name: /Pay with XRP.*Settle on Flare/i })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /A wallet says SENT.*merchant actually paid/i }),
  ).toBeVisible();
  await expect(page.getByRole('note')).toContainText('no real monetary value');
  await expect(
    page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link'),
  ).toHaveCount(1);
  await expect(page.getByRole('img', { name: /Interactive 3D smartphone/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'PaymentSettled' })).toBeAttached();
  await expect(page.getByLabel('Illustrative PayMorph evidence receipt')).toContainText(
    'PayMorphRouter.PaymentSettled',
  );
  await expect(page.getByRole('link', { name: /WooCommerce/i })).toBeAttached();
});

test('reveals the payment story as each section enters the viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'Loading PayMorph' })).toBeHidden({
    timeout: 5_000,
  });

  const productCard = page.locator('.pm-home-product-card').first();
  await expect(productCard).not.toHaveAttribute('data-revealed', 'true');

  await productCard.scrollIntoViewIfNeeded();
  await expect(productCard).toHaveAttribute('data-revealed', 'true');
  await expect(productCard).toHaveCSS('opacity', '1');
});

test('builds the hero promise progressively from scroll position', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'Loading PayMorph' })).toBeHidden({
    timeout: 5_000,
  });

  const storyLines = page.locator('[data-hero-line]');
  await expect(storyLines).toHaveCount(3);
  await expect
    .poll(() => storyLines.nth(2).evaluate((line) => Number(getComputedStyle(line).opacity)))
    .toBeLessThan(0.3);

  await page.evaluate(() => {
    const hero = document.querySelector<HTMLElement>('[data-hero-story]');
    if (!hero) throw new Error('Hero story was not found');
    const scrollRange = Math.max(hero.offsetHeight - window.innerHeight, 1);
    window.scrollTo({ top: hero.offsetTop + scrollRange * 0.9, behavior: 'instant' });
  });

  await expect
    .poll(() => storyLines.nth(2).evaluate((line) => Number(getComputedStyle(line).opacity)))
    .toBeGreaterThan(0.95);
});

test('takes the merchant from the landing page to wallet sign-in', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Try Testnet Checkout/i }).click();

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

test('removes known extension attributes during the hydration window', async ({ page }) => {
  await page.goto('/');
  const main = page.locator('main');

  await main.evaluate((element) => {
    element.setAttribute('bis_skin_checked', '1');
    element.setAttribute('bis_register', 'injected');
  });

  await expect(main).not.toHaveAttribute('bis_skin_checked');
  await expect(main).not.toHaveAttribute('bis_register');
});
