import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';
import { startAsGuest } from './support/auth';
import { createGroup, typeAmount } from './support/groups';
import { expectTapTargets } from './support/tap-targets';

/**
 * Phase 1 exit (PROGRESS 1.34): add a friend, record a 1:1 expense, and see the friend balance
 * summed across a shared group and the 1:1 group.
 */
test('a friend balance adds up a shared group and the 1:1 expenses', async ({ page, browser }) => {
  await startAsGuest(page, 'Asha');
  await createGroup(page, 'Flat 4B', 'Home');
  await page.getByRole('button', { name: 'Invite people' }).click();
  const invite = await page
    .getByRole('dialog', { name: 'Invite people' })
    .getByLabel('Invite link')
    .inputValue();

  const ravi = await browser.newContext();
  const rp = await ravi.newPage();
  await rp.goto(invite);
  await rp.getByLabel('Your name').fill('Ravi');
  await rp.getByRole('button', { name: 'Join Flat 4B' }).click();
  await expect(rp.getByRole('heading', { level: 1, name: 'Flat 4B' })).toBeVisible();

  // Flat 4B: Asha pays ₹1,200 WiFi for both → Ravi owes Asha ₹600 there.
  await page.reload();
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await typeAmount(page, '1200');
  await page.getByLabel('Description').fill('WiFi');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'You’re owed ₹600' })).toBeVisible();

  // Asha adds Ravi as a friend (from her groups) and records a 1:1 movie Ravi paid for.
  await page.goto('/');
  await page.getByRole('button', { name: 'Add friend' }).click();
  await page
    .getByRole('dialog', { name: 'Add a friend' })
    .getByRole('button', { name: /Ravi.*Flat 4B/ })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ravi' })).toBeVisible();
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await expect(page.getByText('With Ravi')).toBeVisible();
  await typeAmount(page, '400');
  await page.getByLabel('Description').fill('Movie');
  await page.getByRole('button', { name: /^Paid by/ }).click();
  await page.getByRole('radio', { name: 'Ravi', exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'You owe ₹200' })).toBeVisible();

  // Home: ₹600 − ₹200 = Ravi owes Asha ₹400.
  await page.goto('/');
  const friends = page.getByRole('region', { name: 'Friends' });
  await expect(friends.getByRole('link', { name: /Ravi/ })).toContainText('you’re owed ₹400');
  await friends.getByRole('link', { name: /Ravi/ }).click();
  await expect(page.getByLabel('Your balance with this friend')).toContainText(
    'Ravi owes you ₹400',
  );
  const from = page.getByRole('region', { name: 'Where it comes from' });
  await expect(from.getByRole('link', { name: /Just the two of you/ })).toContainText(
    'You owe Ravi ₹200',
  );
  await expect(from.getByRole('link', { name: /Flat 4B/ })).toContainText('Ravi owes you ₹600');
  await expectNoA11yViolations(page);
  await expectTapTargets(page);

  // Each part explains itself in its group.
  await from.getByRole('link', { name: /Flat 4B/ }).click();
  const why = page.getByRole('dialog', { name: /Why Ravi owes ₹600/ });
  await expect(why.getByRole('link', { name: /WiFi/ })).toBeVisible();

  // Ravi sees the mirror image.
  await rp.goto('/');
  await expect(
    rp.getByRole('region', { name: 'Friends' }).getByRole('link', { name: /Asha/ }),
  ).toContainText('you owe ₹400');
  await rp.getByRole('region', { name: 'Friends' }).getByRole('link', { name: /Asha/ }).click();
  await expect(rp.getByLabel('Your balance with this friend')).toContainText('You owe Asha ₹400');
  await ravi.close();
});
