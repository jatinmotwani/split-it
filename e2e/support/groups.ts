import { expect, type Page } from '@playwright/test';

/** From Home, creates a group through the New group sheet and waits on its page. Returns its id. */
export async function createGroup(
  page: Page,
  name: string,
  type: 'Trip' | 'Home' | 'Couple' | 'Other' = 'Trip',
) {
  await page.goto('/');
  const create = page.getByRole('button', { name: 'Create a group' });
  if (await create.isVisible()) await create.click();
  else await page.getByRole('button', { name: 'New group' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: type, exact: true }).click();
  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(page).toHaveURL(/\/g\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return page.url().split('/g/')[1]!;
}

/** Adds a placeholder person through the invite sheet. */
export async function addPlaceholder(page: Page, name: string) {
  await page.getByRole('button', { name: 'Invite people' }).click();
  const sheet = page.getByRole('dialog', { name: 'Invite people' });
  await sheet.getByLabel('Add someone who isn’t here yet').fill(name);
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet.getByText(name, { exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();
}

const KEY_LABELS: Record<string, string> = {
  '+': 'plus',
  '-': 'minus',
  '*': 'times',
  '/': 'divide',
  '.': 'decimal point',
};

/** Types an amount expression on the on-screen keypad, e.g. "450+120". */
export async function typeAmount(page: Page, expr: string) {
  const pad = page.getByRole('group', { name: 'Amount keypad' });
  for (const ch of expr) {
    await pad.getByRole('button', { name: KEY_LABELS[ch] ?? ch, exact: true }).click();
  }
}
