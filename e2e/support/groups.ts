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
