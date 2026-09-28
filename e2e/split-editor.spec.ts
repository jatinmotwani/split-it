import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';
import { startAsGuest } from './support/auth';
import { addPlaceholder, createGroup, typeAmount } from './support/groups';
import { expectTapTargets } from './support/tap-targets';

test('exact split, category, and two payers', async ({ page }) => {
  await startAsGuest(page, 'Asha');
  await createGroup(page, 'Flat 4B', 'Home');
  await addPlaceholder(page, 'Ravi');

  // Exact: Asha ₹700, Ravi ₹300 of ₹1,000 that Asha paid.
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await typeAmount(page, '1000');
  await page.getByLabel('Description').fill('Electricity');
  await page.getByRole('button', { name: /Split equally/ }).click();
  const split = page.getByRole('dialog', { name: 'Split' });
  await split.getByRole('button', { name: 'Exact' }).click();
  await split.getByLabel('Ravi').fill('300');
  await expect(split.getByText('₹200.00 left to split.')).toBeVisible();
  await expectNoA11yViolations(page);
  await split.getByLabel('You').fill('700');
  await expect(split.getByText('Adds up to ₹1,000.00')).toBeVisible();
  await split.getByRole('button', { name: 'Done' }).click();
  // "Electricity" suggests the category by itself.
  await expect(page.getByRole('button', { name: 'Bills & utilities' })).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: /Electricity/ })).toContainText('₹300');

  // Two payers: Asha ₹400 + Ravi ₹200 of ₹600, split equally → Asha lent ₹100.
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await typeAmount(page, '600');
  await page.getByLabel('Description').fill('Groceries');
  await page.getByRole('button', { name: /Paid by you/ }).click();
  const payers = page.getByRole('dialog', { name: 'Who paid?' });
  await payers.getByRole('button', { name: 'Several people paid' }).click();
  await payers.getByLabel('You').fill('400');
  await expect(payers.getByText('₹200.00 left to assign')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await payers.getByLabel('Ravi').fill('200');
  await payers.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  const row = page.getByRole('link', { name: /Groceries/ });
  await expect(row).toContainText('2 people paid ₹600');
  await expect(row).toContainText('₹100');
  await expect(page.getByText('You’re owed ₹400')).toBeVisible();

  // Adjust: Ravi used ₹100 more of the ₹900 cylinder; the other ₹800 is split equally.
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await typeAmount(page, '900');
  await page.getByLabel('Description').fill('Gas cylinder');
  await page.getByRole('button', { name: /· \d+ (person|people)$/ }).click();
  const adjust = page.getByRole('dialog', { name: 'Split' });
  await adjust.getByRole('button', { name: 'Adjust' }).click();
  await adjust.getByLabel('Ravi adjustment').fill('100');
  await expect(
    adjust.getByText('₹800.00 split equally between 2 people, then adjusted.'),
  ).toBeVisible();
  await expect(adjust.getByRole('checkbox', { name: /Ravi/ })).toContainText('₹500.00');
  await expectNoA11yViolations(page);
  await expectTapTargets(page);
  await adjust.getByRole('button', { name: 'Done' }).click();
  await expect(
    page.getByRole('button', { name: 'Equal with adjustments · 2 people' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: /Gas cylinder/ })).toContainText('₹500');
  await expect(page.getByText('You’re owed ₹900')).toBeVisible();
});
