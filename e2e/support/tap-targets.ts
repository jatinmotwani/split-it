import { expect, type Page } from '@playwright/test';

/** SPEC §10: every button and form control is at least 44 px tall and wide. */
export async function expectTapTargets(page: Page, min = 44) {
  const small = await page.evaluate((minSize) => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, input:not([type=hidden]), select, [role=button]',
      ),
    );
    return els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        return visible && (r.height < minSize - 0.5 || r.width < minSize - 0.5);
      })
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}[${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30)}]`,
      );
  }, min);
  expect(small, 'controls smaller than 44px').toEqual([]);
}
