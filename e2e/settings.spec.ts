import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';
import { startAsGuest } from './support/auth';
import { addPlaceholder, createGroup, typeAmount } from './support/groups';

test('group settings: edit details, reset the invite, remove people and leave', async ({
  page,
}) => {
  await startAsGuest(page, 'Asha');
  const gid = await createGroup(page, 'Goa trip');
  await addPlaceholder(page, 'Ravi');
  await addPlaceholder(page, 'Kiran');
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await typeAmount(page, '600');
  await page.getByLabel('Description').fill('Dinner');
  await page.getByRole('button', { name: /Split equally/ }).click();
  const split = page.getByRole('dialog', { name: 'Split' });
  await split.getByRole('checkbox', { name: /Kiran/ }).click();
  await split.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: /Dinner/ })).toBeVisible();

  await page.getByRole('link', { name: 'Group settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Group settings' })).toBeVisible();
  await expectNoA11yViolations(page);

  // Details.
  await page.getByLabel('Name').fill('Goa 2026');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByLabel('Default currency').selectOption('USD');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();

  // Invite link reset.
  const invite = page.getByRole('textbox', { name: 'Invite link' });
  const before = await invite.inputValue();
  await page.getByRole('button', { name: 'Reset invite link' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset link' }).click();
  await expect(invite).not.toHaveValue(before);

  // Removing someone with a balance is blocked and says how much.
  await page.getByRole('button', { name: 'Remove Ravi' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove Ravi?' });
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Ravi owes ₹300');
  await expect(dialog.getByRole('alert')).toContainText('Settle Ravi’s balance before removing');
  await expect(dialog.getByRole('button', { name: 'Remove' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // Kiran has no balance: removed.
  await page.getByRole('button', { name: 'Remove Kiran' }).click();
  await page
    .getByRole('dialog', { name: 'Remove Kiran?' })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(page.getByRole('button', { name: 'Remove Kiran' })).toHaveCount(0);
  await expect(page.getByText('People (2)')).toBeVisible();

  // Leaving is blocked while I'm owed money.
  await page.getByRole('button', { name: 'Leave group' }).click();
  const leave = page.getByRole('dialog', { name: 'Leave this group?' });
  await leave.getByRole('button', { name: 'Leave group' }).click();
  await expect(leave.getByRole('alert')).toContainText('You’re owed ₹300');
  await leave.getByRole('link', { name: 'Settle up' }).click();
  await page.getByRole('button', { name: /^Record Ravi paying/ }).click();
  await page.getByRole('button', { name: 'Save payment' }).click();
  await expect(page.getByText('Everyone is settled up')).toBeVisible();

  // Settled: now I can leave, and the group is gone from Home.
  await page.goto(`/g/${gid}/settings`);
  await expect(page.getByLabel('Name')).toHaveValue('Goa 2026');
  await page.getByRole('button', { name: 'Leave group' }).click();
  await page
    .getByRole('dialog', { name: 'Leave this group?' })
    .getByRole('button', { name: 'Leave group' })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Goa 2026')).toHaveCount(0);
});
