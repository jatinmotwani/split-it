import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './support/a11y';
import { startAsGuest } from './support/auth';
import { addPlaceholder, createGroup, typeAmount } from './support/groups';
import { expectTapTargets } from './support/tap-targets';

test('a claim link binds a fresh guest to a placeholder spot', async ({ page, browser }) => {
  await startAsGuest(page, 'Asha');
  const gid = await createGroup(page, 'Flat 4B', 'Home');
  await addPlaceholder(page, 'Ravi');

  // First expense: the guest is offered to save their account. It never blocks.
  await expect(page.getByRole('region', { name: 'Save your account' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Add an expense' }).click();
  await typeAmount(page, '1200');
  await page.getByLabel('Description').fill('WiFi');
  await page.getByRole('button', { name: 'Save' }).click();
  const card = page.getByRole('region', { name: 'Save your account' });
  await expect(card).toContainText('this group can’t be recovered');
  await expect(card.getByRole('link', { name: 'Save account' })).toHaveAttribute(
    'href',
    `/sign-in?next=${encodeURIComponent(`/g/${gid}`)}`,
  );
  await expect(page.getByRole('link', { name: /WiFi/ })).toBeVisible();
  await card.getByRole('button', { name: 'Not now' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('link', { name: /WiFi/ })).toBeVisible();
  await expect(card).toHaveCount(0);

  // "Ravi — not joined yet · Send claim link".
  await page.getByRole('button', { name: 'Invite people' }).click();
  const sheet = page.getByRole('dialog', { name: 'Invite people' });
  await sheet.getByRole('button', { name: 'Send claim link to Ravi' }).click();
  const input = sheet.getByLabel('Claim link for Ravi');
  await expect(input).toHaveValue(/\/c\/[A-Za-z0-9_-]{43}$/);
  const link = await input.inputValue();
  await expect(sheet.getByRole('link', { name: 'WhatsApp' }).last()).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\/\?text=Ravi/,
  );
  await expectNoA11yViolations(page);

  // Ravi opens it on his phone, no account needed.
  const ravi = await browser.newContext();
  const rp = await ravi.newPage();
  await rp.goto(link);
  await expect(rp.getByText('This spot is for Ravi')).toBeVisible();
  await expectNoA11yViolations(rp);
  await expectTapTargets(rp);
  await rp.getByRole('button', { name: 'Continue as Ravi' }).click();
  await expect(rp.getByRole('heading', { level: 1, name: 'Flat 4B' })).toBeVisible();
  await expect(rp.getByRole('button', { name: 'You owe ₹600' })).toBeVisible();

  // The link worked once.
  const other = await browser.newContext();
  const op = await other.newPage();
  await op.goto(link);
  await expect(op.getByText(/already been used or replaced/)).toBeVisible();

  // Asha sees Ravi as joined; the card mentions recovery through friends now.
  await page.reload();
  await page.getByRole('button', { name: 'Invite people' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Invite people' }).getByText('joined as guest'),
  ).toBeVisible();
  await ravi.close();
  await other.close();
});
