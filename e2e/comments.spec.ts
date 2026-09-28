import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';
import { startAsGuest } from './support/auth';
import { addPlaceholder, createGroup, typeAmount } from './support/groups';

test('post a comment on an expense, see it after a reload, and delete it', async ({ page }) => {
  await startAsGuest(page, 'Asha');
  await createGroup(page, 'Goa trip');
  await addPlaceholder(page, 'Ravi');
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await typeAmount(page, '1200');
  await page.getByLabel('Description').fill('Dinner');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: /Dinner/ }).click();

  const comments = page.getByRole('region', { name: 'Comments' });
  await comments.getByLabel('Add a comment').fill('Includes the 10% tip');
  await comments.getByRole('button', { name: 'Post' }).click();
  await expect(comments.getByText('Includes the 10% tip')).toBeVisible();
  await expect(comments.getByLabel('Add a comment')).toHaveValue('');
  await expect(comments.getByText('Sending…')).toHaveCount(0);
  await expectNoA11yViolations(page);

  await page.reload();
  await expect(comments.getByText('Includes the 10% tip')).toBeVisible();
  await expect(comments.getByText('You', { exact: true })).toBeVisible();

  await comments.getByRole('button', { name: 'Delete comment' }).click();
  await expect(comments.getByText('Includes the 10% tip')).toHaveCount(0);
  await page.reload();
  await expect(comments.getByText('Includes the 10% tip')).toHaveCount(0);
});
