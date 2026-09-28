import { expect, test } from '@playwright/test';
import { startAsGuest } from './support/auth';
import { addPlaceholder, createGroup, typeAmount } from './support/groups';

test('a new expense shows at once; Home totals and the global + follow the latest write', async ({
  page,
}) => {
  await startAsGuest(page, 'Asha');
  const goa = await createGroup(page, 'Goa trip');
  await addPlaceholder(page, 'Ravi');
  const flat = await createGroup(page, 'Flat 4B', 'Home');
  await addPlaceholder(page, 'Neel');

  // Hold the server's answer: the expense must show before it arrives.
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/api/v1/groups/*/entries/*', async (route) => {
    if (route.request().method() === 'PUT') await held;
    await route.continue();
  });
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await typeAmount(page, '1000');
  await page.getByLabel('Description').fill('Groceries');
  await page.getByRole('button', { name: 'Save' }).click();
  const row = page.getByRole('link', { name: /Groceries/ });
  await expect(row).toContainText('Saving…');
  release();
  await expect(row).not.toContainText('Saving…');
  await expect(page.getByRole('button', { name: 'You’re owed ₹500' })).toBeVisible();
  await page.unrouteAll();

  // Home totals include it; "+" goes to the group of my latest expense.
  await page.getByRole('link', { name: 'Back to groups' }).click();
  await expect(page.getByLabel('Overall balance')).toContainText('You’re owed ₹500');
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${flat}/add$`));

  // An expense in the other group moves "+" there and adds to the totals.
  await page.goto(`/g/${goa}/add`);
  await typeAmount(page, '300');
  await page.getByLabel('Description').fill('Snacks');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: /Snacks/ })).not.toContainText('Saving…');
  await page.getByRole('link', { name: 'Back to groups' }).click();
  await expect(page.getByLabel('Overall balance')).toContainText('You’re owed ₹650');
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${goa}/add$`));
});
