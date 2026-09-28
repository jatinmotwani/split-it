import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';

test('home page renders and is accessible', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoA11yViolations(page);
});
