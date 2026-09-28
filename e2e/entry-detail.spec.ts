import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';
import { startAsGuest } from './support/auth';
import { addPlaceholder, createGroup, typeAmount } from './support/groups';

test('edit, see history, restore the earlier version, delete and undo', async ({ page }) => {
  await startAsGuest(page, 'Asha');
  await createGroup(page, 'Goa trip');
  await addPlaceholder(page, 'Ravi');

  await page.getByRole('link', { name: 'Add an expense' }).click();
  await typeAmount(page, '100');
  await page.getByLabel('Description').fill('Cab');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('link', { name: /Cab/ }).click();
  await expect(page.getByRole('heading', { name: 'Cab' })).toBeVisible();
  await expectNoA11yViolations(page);

  // Edit: ₹100 → ₹250 and a new description.
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Edit expense' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Amount', exact: true })).toHaveText('100.00');
  for (let i = 0; i < 6; i++)
    await page.getByRole('button', { name: 'delete', exact: true }).click();
  await typeAmount(page, '250');
  await page.getByLabel('Description').fill('Cab + tolls');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('heading', { name: 'Cab + tolls' })).toBeVisible();
  await expect(page.getByText('₹250.00').first()).toBeVisible();
  const history = page
    .getByRole('region', { name: 'History' })
    .or(page.locator('section', { has: page.getByRole('heading', { name: 'History' }) }));
  await expect(history.getByText('Amount ₹100.00 → ₹250.00')).toBeVisible();

  // Undo the edit: back to ₹100 "Cab" as version 3.
  await page.getByRole('button', { name: 'Undo this change' }).click();
  await expect(page.getByRole('heading', { name: 'Cab', exact: true })).toBeVisible();
  await expect(history.getByText('Restored by You')).toBeVisible();

  // Delete, then Undo from the toast.
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Goa trip' })).toBeVisible();
  await expect(page.getByText('Deleted “Cab”')).toBeVisible();
  await expect(page.getByRole('link', { name: /Cab/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('link', { name: /Cab/ })).toBeVisible();
});
