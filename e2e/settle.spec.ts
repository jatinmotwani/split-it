import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';
import { startAsGuest } from './support/auth';
import { addPlaceholder, createGroup, typeAmount } from './support/groups';

test('recording every suggested payment settles everyone', async ({ page }) => {
  await startAsGuest(page, 'Asha');
  await createGroup(page, 'Goa trip');
  await addPlaceholder(page, 'Ravi');
  await addPlaceholder(page, 'Neel');

  const add = async (amount: string, desc: string, payer?: string) => {
    await page.getByRole('link', { name: 'Add an expense' }).click();
    await typeAmount(page, amount);
    await page.getByLabel('Description').fill(desc);
    if (payer) {
      await page.getByRole('button', { name: /Paid by/ }).click();
      await page.getByRole('radio', { name: payer }).click();
    }
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('link', { name: new RegExp(desc) })).toBeVisible();
  };
  await add('900', 'Dinner');
  await add('600', 'Cab', 'Ravi');
  await add('300', 'Snacks', 'Neel');

  await page.getByRole('link', { name: 'Settle up' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settle up' })).toBeVisible();
  await expectNoA11yViolations(page);

  const records = page.getByRole('button', { name: /^Record .* paying/ });
  for (let i = 0; i < 5; i++) {
    const n = await records.count();
    if (n === 0) break;
    await records.first().click();
    await page.getByRole('button', { name: 'Cash' }).click();
    await page.getByRole('button', { name: 'Save payment' }).click();
    // Wait for the suggestions to refetch before tapping the next one.
    await expect(page.getByRole('button', { name: 'Save payment' })).toHaveCount(0);
    await expect.poll(() => records.count()).toBeLessThan(n);
  }
  await expect(page.getByText('Everyone is settled up')).toBeVisible();

  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByText('You’re all settled up')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Balances' })).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: /paid You|paid Ravi|paid Neel/ }).first(),
  ).toBeVisible();
});

test('turning off simplify shows person-to-person payments', async ({ page }) => {
  await startAsGuest(page, 'Asha');
  await createGroup(page, 'Weekend');
  await addPlaceholder(page, 'Ravi');
  await addPlaceholder(page, 'Neel');
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

  await page.getByRole('link', { name: 'Settle up' }).click();
  await expect(page.getByRole('button', { name: /^Record .* paying/ })).toHaveCount(1); // Neel → You ₹600
  await page.getByRole('switch', { name: /Simplify debts/ }).uncheck();
  await expect(page.getByRole('button', { name: /^Record .* paying/ })).toHaveCount(3);
});
