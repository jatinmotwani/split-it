import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';
import { startAsGuest } from './support/auth';
import { createGroup } from './support/groups';
import { expectTapTargets } from './support/tap-targets';

test('a new guest creates a group and lands in it', async ({ page }) => {
  await startAsGuest(page, 'Asha');
  await expect(page.getByText('No groups yet')).toBeVisible();
  await expectNoA11yViolations(page);

  await createGroup(page, 'Goa trip');
  await expect(page.getByText('You’re all settled up')).toBeVisible();
  await expect(page.getByText('No expenses yet')).toBeVisible();
  await expectNoA11yViolations(page);
  await expectTapTargets(page);

  await page.goto('/');
  const row = page.getByRole('link', { name: /Goa trip/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('settled up');
  await expect(page.getByText('You’re all settled up')).toBeVisible();
  await expectNoA11yViolations(page);
  await expectTapTargets(page);
});
