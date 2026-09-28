import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';
import { startAsGuest } from './support/auth';
import { addPlaceholder, createGroup, typeAmount } from './support/groups';
import { expectTapTargets } from './support/tap-targets';

test('the common expense takes three taps from Home: +, amount, Save', async ({ page }) => {
  await startAsGuest(page, 'Asha');
  await createGroup(page, 'Goa trip');
  await addPlaceholder(page, 'Ravi');
  await addPlaceholder(page, 'Neel');

  await page.goto('/');
  let taps = 0;
  await page.getByRole('link', { name: 'Add an expense' }).click(); // tap 1
  taps++;
  await expect(page.getByRole('heading', { level: 1, name: 'Add expense' })).toBeVisible();
  await expectNoA11yViolations(page);
  await expectTapTargets(page);

  await typeAmount(page, '450+120'); // typing the amount
  await expect(page.getByText('= ₹570.00')).toBeVisible();
  await page.getByLabel('Description').fill('Dinner'); // typing
  await expect(page.getByRole('button', { name: /Split equally · 3 people/ })).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click(); // tap 2
  taps++;
  expect(taps).toBeLessThanOrEqual(3);

  await expect(page.getByRole('heading', { level: 1, name: 'Goa trip' })).toBeVisible();
  const row = page.getByRole('link', { name: /Dinner/ });
  await expect(row).toContainText('You paid ₹570');
  await expect(row).toContainText('₹380');
  await expect(page.getByText('You’re owed ₹380')).toBeVisible();
});

test('typing on a physical keyboard works too, and the payer and date can change', async ({
  page,
}) => {
  await startAsGuest(page, 'Asha');
  await createGroup(page, 'Flat 4B', 'Home');
  await addPlaceholder(page, 'Ravi');
  await page.getByRole('link', { name: 'Add an expense' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Add expense' })).toBeVisible();
  // The keydown listener attaches on hydration; retry the first key until it lands.
  await expect(async () => {
    await page.keyboard.press('1');
    await expect(page.getByRole('status', { name: 'Amount', exact: true })).toHaveText('1', {
      timeout: 500,
    });
  }).toPass();
  await page.keyboard.type('200/2');
  await expect(page.getByText('= ₹600.00')).toBeVisible();
  await page.getByRole('button', { name: /Paid by you/ }).click();
  await page.getByRole('radio', { name: 'Ravi' }).click();
  await page.getByRole('button', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Yesterday' }).click();
  await page.getByLabel('Description').fill('Groceries');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Yesterday')).toBeVisible();
  const row = page.getByRole('link', { name: /Groceries/ });
  await expect(row).toContainText('Ravi paid ₹600');
  await expect(row).toContainText('you borrowed');
});

test('the description suggests a category, and a picked one sticks', async ({ page }) => {
  await startAsGuest(page, 'Asha');
  await createGroup(page, 'Goa trip');
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await typeAmount(page, '450');
  const description = page.getByLabel('Description');
  await description.fill('Uber to airport');
  await expect(page.getByRole('button', { name: 'Transport' })).toBeVisible();
  await description.fill('Swiggy');
  await expect(page.getByRole('button', { name: 'Food & drink' })).toBeVisible();

  // Picking one by hand wins over later typing.
  await page.getByRole('button', { name: 'Food & drink' }).click();
  await page.getByRole('radio', { name: 'Groceries' }).click();
  await description.fill('Swiggy Instamart order');
  await expect(page.getByRole('button', { name: 'Groceries' })).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: /Swiggy Instamart/ }).click();
  await expect(page.getByText('Groceries')).toBeVisible();
});
