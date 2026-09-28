import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';
import { startAsGuest } from './support/auth';
import { typeAmount } from './support/groups';
import { expectTapTargets } from './support/tap-targets';

test('add a friend by name, split ₹300 1:1, and send them a link', async ({ page, browser }) => {
  await startAsGuest(page, 'Asha');
  await page.getByRole('button', { name: 'Add friend' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a friend' });
  await sheet.getByLabel('Their name').fill('Kiran');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Kiran' })).toBeVisible();
  await expectNoA11yViolations(page);
  await expectTapTargets(page);

  // ₹300 that I paid, split equally between the two of us.
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await expect(page.getByText('With Kiran')).toBeVisible();
  await typeAmount(page, '300');
  await page.getByLabel('Description').fill('Movie tickets');
  await expect(page.getByRole('button', { name: 'Entertainment' })).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'You’re owed ₹150' })).toBeVisible();

  // Home: Kiran is a friend (not a group), and the total includes the ₹150.
  await page.getByRole('link', { name: 'Back to groups' }).click();
  const friends = page.getByRole('region', { name: 'Friends' });
  await expect(friends.getByRole('link', { name: /Kiran/ })).toContainText('you’re owed ₹150');
  await expect(page.getByLabel('Overall balance')).toContainText('You’re owed ₹150');
  await expect(page.getByText('No groups yet')).toBeVisible();

  // Send Kiran a link; Kiran opens it on their phone and sees the same balance.
  await friends.getByRole('link', { name: /Kiran/ }).click();
  await page.getByRole('button', { name: 'Send Kiran a link' }).click();
  const linkSheet = page.getByRole('dialog', { name: 'Send Kiran a link' });
  await linkSheet.getByRole('button', { name: 'Send claim link to Kiran' }).click();
  const link = await linkSheet.getByLabel('Claim link for Kiran').inputValue();
  await expect(linkSheet.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
    'href',
    /Kiran%2C%20Asha%20is%20splitting%20expenses%20with%20you/,
  );

  const kiran = await browser.newContext();
  const kp = await kiran.newPage();
  await kp.goto(link);
  await kp.getByRole('button', { name: 'Continue as Kiran' }).click();
  await expect(kp.getByRole('heading', { level: 1, name: 'Asha' })).toBeVisible();
  await expect(kp.getByRole('button', { name: 'You owe ₹150' })).toBeVisible();
  await kp.goto('/');
  await expect(
    kp.getByRole('region', { name: 'Friends' }).getByRole('link', { name: /Asha/ }),
  ).toContainText('you owe ₹150');
  await kiran.close();
});
