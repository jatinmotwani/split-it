import { expect, test, type Page } from '@playwright/test';

test('serves an installable web manifest', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.display).toBe('standalone');
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  }
});

/** True once the worker controls the page and has precached the offline page. */
function offlineReady(page: Page) {
  return page.evaluate(async () => {
    if (!navigator.serviceWorker.controller) return false;
    // Precache keys carry a revision query, so match on the pathname.
    for (const name of await caches.keys()) {
      const keys = await (await caches.open(name)).keys();
      if (keys.some((r) => new URL(r.url).pathname === '/offline')) return true;
    }
    return false;
  });
}

test('shows the offline page when a navigation fails', async ({ page, context }) => {
  await page.goto('/');
  await expect.poll(() => offlineReady(page), { timeout: 30_000 }).toBe(true);

  await context.setOffline(true);
  await page.goto('/sign-in').catch(() => {});
  await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();
  await context.setOffline(false);
});
