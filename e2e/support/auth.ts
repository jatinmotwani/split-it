import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Reads the latest sign-in code for an address from the dev outbox (ENABLE_DEV_OUTBOX=1). */
export async function readCode(request: APIRequestContext, email: string): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(async () => {
      const res = await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`);
      const { mails } = (await res.json()) as { mails: { text: string }[] };
      code = mails.at(-1)?.text.match(/\b(\d{6})\b/)?.[1];
      return code;
    })
    .toMatch(/^\d{6}$/);
  return code!;
}

/** Starts a guest session from the home page and waits until the app greets them. */
export async function startAsGuest(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Start as a guest' }).click();
  await expect(page.getByText(`Hi, ${name}`)).toBeVisible();
}

export function uniqueEmail(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.in`;
}
