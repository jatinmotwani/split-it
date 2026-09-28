import { expect, test } from '@playwright/test';
import { startAsGuest } from './support/auth';
import { addPlaceholder, createGroup, typeAmount } from './support/groups';

test('a USD expense in an INR group gets its own balance line, never merged', async ({ page }) => {
  await startAsGuest(page, 'Asha');
  await createGroup(page, 'Bali trip');
  await addPlaceholder(page, 'Ravi');

  await page.getByRole('link', { name: 'Add an expense' }).click();
  await typeAmount(page, '1000');
  await page.getByLabel('Description').fill('Villa deposit');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('You’re owed ₹500')).toBeVisible();

  await page.getByRole('link', { name: 'Add an expense' }).click();
  await typeAmount(page, '80');
  await page.getByLabel('Description').fill('Surf lesson');
  await page.getByRole('button', { name: 'INR' }).click();
  await page.getByRole('dialog', { name: 'Currency' }).getByRole('combobox').selectOption('USD');
  await page
    .getByRole('dialog', { name: 'Currency' })
    .getByRole('button', { name: 'Done' })
    .click();
  await expect(page.getByText('$80.00')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();

  const mine = page.getByLabel('Your balance in this group');
  await expect(mine.getByText('You’re owed ₹500')).toBeVisible();
  await expect(mine.getByText('You’re owed $40')).toBeVisible();
  await expect(page.getByRole('link', { name: /Surf lesson/ })).toContainText('$40');

  await page.goto('/');
  const overall = page.getByLabel('Overall balance');
  await expect(overall.getByText('You’re owed ₹500', { exact: true })).toBeVisible();
  await expect(overall.getByText('You’re owed $40', { exact: true })).toBeVisible();
});
