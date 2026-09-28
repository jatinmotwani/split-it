import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';
import { expectTapTargets } from './support/tap-targets';

test('home page renders, is accessible and has large tap targets', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoA11yViolations(page);
  await expectTapTargets(page);
});

test('sign-in page is accessible', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await expectNoA11yViolations(page);
  await expectTapTargets(page);
});

test('theme toggle switches to dark and remembers it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);
  await page.getByRole('button', { name: /Theme: System/ }).click(); // -> light
  await page.getByRole('button', { name: /Theme: Light/ }).click(); // -> dark
  await expect(html).toHaveClass(/dark/);
  await expectNoA11yViolations(page);
  await page.reload();
  await expect(html).toHaveClass(/dark/);
});
