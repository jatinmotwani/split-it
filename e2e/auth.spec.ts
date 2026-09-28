import { expect, test } from '@playwright/test';
import { readCode, startAsGuest, uniqueEmail } from './support/auth';

test('a guest starts with just a name and stays signed in', async ({ page }) => {
  await startAsGuest(page, 'Asha');
  await page.reload();
  await expect(page.getByText('Hi, Asha')).toBeVisible();
});

test('signs in with an email code, then signs out', async ({ page, request }) => {
  const email = uniqueEmail();
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByLabel('Code')).toBeVisible();

  await page.getByLabel('Code').fill(await readCode(request, email));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(/^Hi, /)).toBeVisible();

  await page.getByRole('link', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Start as a guest' })).toBeVisible();
});

test('a wrong code shows an error', async ({ page, request }) => {
  const email = uniqueEmail();
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  const real = await readCode(request, email);
  await page.getByLabel('Code').fill(real === '111111' ? '222222' : '111111');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});
