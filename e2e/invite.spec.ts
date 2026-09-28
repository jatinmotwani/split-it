import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';
import { startAsGuest } from './support/auth';
import { createGroup } from './support/groups';
import { expectTapTargets } from './support/tap-targets';

test('friends join through the invite link as guests, or by picking their name', async ({
  page,
  browser,
}) => {
  await startAsGuest(page, 'Asha');
  await createGroup(page, 'Goa trip');

  await page.getByRole('button', { name: 'Invite people' }).click();
  const sheet = page.getByRole('dialog', { name: 'Invite people' });
  await expect(sheet.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\/\?text=/,
  );
  await sheet.getByLabel('Add someone who isn’t here yet').fill('Neel');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet.getByText('not joined yet')).toBeVisible();
  const link = await sheet.getByLabel('Invite link').inputValue();
  expect(link).toMatch(/\/j\/[A-Za-z0-9_-]{22}$/);
  await expectNoA11yViolations(page);

  // Ravi joins with just his name.
  const ravi = await browser.newContext();
  const rp = await ravi.newPage();
  await rp.goto(link);
  await expect(rp.getByText('Goa trip', { exact: true })).toBeVisible();
  await expectNoA11yViolations(rp);
  await expectTapTargets(rp);
  await rp.getByLabel('Or join with your name').fill('Ravi');
  await rp.getByRole('button', { name: 'Join Goa trip' }).click();
  await expect(rp.getByRole('heading', { level: 1, name: 'Goa trip' })).toBeVisible();

  // Neel picks his placeholder.
  const neel = await browser.newContext();
  const np = await neel.newPage();
  await np.goto(link);
  await np.getByRole('button', { name: 'I’m Neel' }).click();
  await expect(np.getByRole('heading', { level: 1, name: 'Goa trip' })).toBeVisible();

  // Back to Asha: both have joined.
  await page.reload();
  await page.getByRole('button', { name: 'Invite people' }).click();
  const people = page.getByRole('dialog', { name: 'Invite people' });
  await expect(people.getByText('Ravi')).toBeVisible();
  await expect(people.getByText('joined as guest')).toHaveCount(2);

  // Visiting the link again when already in the group just opens it.
  await rp.goto(link);
  await expect(rp.getByRole('link', { name: 'You’re in. Open the group' })).toBeVisible();
  await ravi.close();
  await neel.close();
});
