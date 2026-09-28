import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';
import { startAsGuest } from './support/auth';
import { addPlaceholder, createGroup, typeAmount } from './support/groups';

test('every balance explains itself (the D4 example)', async ({ page }) => {
  await startAsGuest(page, 'Asha');
  const gid = await createGroup(page, 'Goa trip');
  await addPlaceholder(page, 'Ravi');
  await addPlaceholder(page, 'Neel');

  // Asha pays ₹900 dinner for all three; Ravi pays ₹600 cab for Ravi and Neel.
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await typeAmount(page, '900');
  await page.getByLabel('Description').fill('Dinner');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await typeAmount(page, '600');
  await page.getByLabel('Description').fill('Cab');
  await page.getByRole('button', { name: /Paid by/ }).click();
  await page.getByRole('radio', { name: 'Ravi' }).click();
  await page.getByRole('button', { name: /Split equally/ }).click();
  await page.getByRole('dialog', { name: 'Split' }).getByRole('checkbox', { name: /You/ }).click();
  await page.getByRole('dialog', { name: 'Split' }).getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: /Cab/ })).toBeVisible();

  // Simplified view: Neel's ₹600 is explained by his net, routed to Asha.
  await page
    .getByRole('region', { name: 'Balances' })
    .getByRole('button', { name: /Neel/ })
    .click();
  const sheet = page.getByRole('dialog', { name: /Why Neel owes ₹600/ });
  await expect(sheet.getByRole('link', { name: /Dinner/ })).toContainText('-₹300.00');
  await expect(sheet.getByRole('link', { name: /Cab/ })).toContainText('-₹300.00');
  await expect(sheet.locator('p', { hasText: 'Total' })).toContainText('-₹600.00');
  await expect(
    sheet.getByText(/Simplify debts routes Neel’s balance.*Neel pays You ₹600/),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await sheet.getByRole('button', { name: 'Close' }).click();

  // My own balance.
  await page.getByRole('button', { name: 'You’re owed ₹600' }).click();
  const mine = page.getByRole('dialog', { name: /Why you’re owed ₹600/ });
  await expect(mine.getByRole('link', { name: /Dinner/ })).toContainText('+₹600.00');
  await expect(mine.locator('p', { hasText: 'Total' })).toContainText('+₹600.00');
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // Raw view: only the dinner is between Asha and Neel.
  await page.goto(`/g/${gid}/settle`);
  await page.getByRole('switch', { name: /Simplify debts/ }).uncheck();
  await expect(page.getByRole('button', { name: /^Record .* paying/ })).toHaveCount(3);
  await page.goto(`/g/${gid}`);
  await page
    .getByRole('region', { name: 'Balances' })
    .getByRole('button', { name: /Neel/ })
    .click();
  const raw = page.getByRole('dialog', { name: 'You and Neel' });
  await expect(raw.getByRole('link', { name: /Dinner/ })).toContainText('+₹300.00');
  await expect(raw.getByRole('link', { name: /Cab/ })).toHaveCount(0);
  await expect(raw.getByText(/Simplify debts routes/)).toHaveCount(0);
});
