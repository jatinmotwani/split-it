import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';
import { startAsGuest } from './support/auth';
import { createGroup, typeAmount } from './support/groups';

test('the activity feed tells the group what changed, in sentences', async ({ page, browser }) => {
  await startAsGuest(page, 'Asha');
  const gid = await createGroup(page, 'Goa trip');
  await page.getByRole('button', { name: 'Invite people' }).click();
  const invite = await page
    .getByRole('dialog', { name: 'Invite people' })
    .getByLabel('Invite link')
    .inputValue();
  await page
    .getByRole('dialog', { name: 'Invite people' })
    .getByRole('button', { name: 'Close' })
    .click();

  // Ravi joins.
  const ravi = await browser.newContext();
  const rp = await ravi.newPage();
  await rp.goto(invite);
  await rp.getByLabel('Your name').fill('Ravi');
  await rp.getByRole('button', { name: 'Join Goa trip' }).click();
  await expect(rp.getByRole('heading', { level: 1, name: 'Goa trip' })).toBeVisible();

  // Asha adds dinner, then corrects the amount.
  await page.reload();
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await typeAmount(page, '1200');
  await page.getByLabel('Description').fill('Dinner');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: /Dinner/ }).click();
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByRole('status', { name: 'Amount', exact: true })).toHaveText('1200.00');
  for (let i = 0; i < '1200.00'.length; i++)
    await page.getByRole('button', { name: 'delete', exact: true }).click();
  await typeAmount(page, '1500');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('₹1,500.00')).toBeVisible();

  // Ravi reads the feed.
  await rp.goto(`/g/${gid}`);
  await rp.getByRole('link', { name: 'Activity' }).click();
  await expect(rp.getByRole('heading', { level: 1, name: 'Activity' })).toBeVisible();
  const today = rp.getByRole('region', { name: 'Today' });
  await expect(today.getByText('Asha changed Dinner: ₹1,200 → ₹1,500')).toBeVisible();
  await expect(today.getByText('Asha added Dinner: ₹1,200')).toBeVisible();
  await expect(today.getByText('You joined')).toBeVisible();
  await expect(today.getByText('Asha created the group')).toBeVisible();
  await expectNoA11yViolations(rp);

  await today.getByRole('link', { name: /Asha changed Dinner/ }).click();
  await expect(rp).toHaveURL(new RegExp(`/g/${gid}/e/[0-9a-f-]{36}$`));
  await ravi.close();
});
